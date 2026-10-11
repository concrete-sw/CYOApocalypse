// Generates and validates the hidden world truth. A reply cut off at the
// model's output limit is continued in a follow-up call and stitched together;
// invalid worlds are regenerated with the validation errors fed back.

import { buildWorldGenerationPrompt, buildWorldPartPrompt, pickSeed, WORLD_PARTS } from '../prompts/worldGeneration.js';
import { buildTimelineExtensionPrompt } from '../prompts/extension.js';
import { variantFor } from './apocalypses.js';
import { validateWorld, normalizeWorld, deepClean, stripStamp, hourFromText, UTILITIES } from './schema.js';
import { extractJSON, looksTruncated } from './json.js';
import { completeWithMeta } from '../providers/index.js';
import { asArray, num, str } from './util.js';
import { dayOf } from './clock.js';
import { normalizeFreq } from './radio.js';
import { getLocation, getNpc, getFaction } from './world.js';

const MAX_CONTINUATIONS = 2;
const SYSTEM = 'You are a meticulous designer of survival-fiction worlds who outputs only valid JSON: no markdown fences, no commentary, no comments inside the JSON.';
// Models that cannot write the whole world in one reply write it in parts.
const PARTS_BELOW_CAP = 16384;

/**
 * Generate and validate a world. settings carries the player's choices
 * (apocalypse, difficulty, lengthDays, startDay, homePlace, customBackground...);
 * a variety seed and a variant of the apocalypse are drawn here unless given.
 * continuation describes the previous chapter when the story moves on.
 *
 * Two strategies: one call for the whole document (models with large output
 * limits), or three parts (setting, people, plot), each seeing the parts
 * written before it, for models with small output limits or when a one-shot
 * reply is cut off. settings.generation may force 'single' or 'parts'.
 */
export async function generateWorld({ provider, apiKey, model, baseUrl, settings, survivor, onProgress, maxAttempts = 3, signal, continuation = null }) {
  const seed = settings.seed || pickSeed();
  const variant = settings.variant ?? variantFor(settings.apocalypseId);
  const args = { ...settings, survivor, seed, variant, continuation };
  const opts = { apiKey, model, baseUrl, json: true, maxTokens: 32000, temperature: 0.9, effort: 'medium', signal, system: SYSTEM };
  const vopts = { startDay: settings.startDay, custom: survivor?.background === 'custom' };
  const cap = typeof provider.outputCap === 'function' ? provider.outputCap(model) : Infinity;
  const strategy = settings.generation && settings.generation !== 'auto' ? settings.generation : (provider.worldInParts || cap <= PARTS_BELOW_CAP) ? 'parts' : 'single';
  const thinking = /reason|think|\bo[1-9]\b|gpt-5|\br1\b/i.test(String(model || provider.defaultModel || ''));
  const note = thinking ? ' (a thinking model works in silence for a while before any text appears)' : '';
  const finish = parsed => { parsed.seed = seed; parsed.variant = variant || null; return normalizeWorld(parsed, settings); };
  if (strategy === 'single') {
    const r = await generateSingle({ provider, opts, args, vopts, onProgress, maxAttempts, signal, note });
    if (r.world) return finish(r.world);
    if (!r.truncated) throw r.error;
    onProgress?.('The whole world does not fit this model\'s output limit; building it in three parts instead...');
  }
  const r = await generateInParts({ provider, opts, args, vopts, onProgress, maxRounds: maxAttempts, signal, note });
  if (r.world) return finish(r.world);
  throw r.error;
}

/** One request, continued and stitched if the model's output limit cuts it off. */
async function callWithContinuation({ provider, opts, messages, firstKey, onProgress, label }) {
  let chars = 0;
  let { text, finishReason } = await completeWithMeta(provider, { ...opts, messages }, (chunk, t) => { chars = t.length; onProgress?.(`${label}... ${chars} chars`); });
  if (finishReason === 'refusal') throw new Error('The model declined to write this world. Try another apocalypse or model.');
  for (let c = 0; c < MAX_CONTINUATIONS && (finishReason === 'length' || (finishReason == null && looksTruncated(text))); c++) {
    onProgress?.(`${label}: the reply was cut off at ${chars} chars; asking the model to continue (${c + 1} of ${MAX_CONTINUATIONS})...`);
    const tail = text.slice(-160).replace(/\s+/g, ' ');
    const cont = await completeWithMeta(provider, {
      ...opts, json: false,
      messages: [...messages, { role: 'assistant', content: text }, { role: 'user', content: `Your output was cut off before the JSON ended. It currently ends with: ${tail}\nContinue EXACTLY from where it stopped, starting with the very next character after that. Output only the remaining JSON: do not repeat anything already written, do not restart the object, no fences, no commentary.` }]
    }, (chunk, t) => { onProgress?.(`${label}: continuing... ${chars + t.length} chars`); });
    // A model that restarts the whole document instead of continuing it is taken at its word.
    const restart = new RegExp(`^\\s*(?:\`\`\`(?:json)?\\s*)?\\{\\s*"${firstKey}"\\s*:`);
    text = restart.test(cont.text) ? cont.text : stitch(text, cont.text);
    chars = text.length;
    finishReason = cont.finishReason;
  }
  return { text, finishReason, truncated: finishReason === 'length' || looksTruncated(text) };
}

async function generateSingle({ provider, opts, args, vopts, onProgress, maxAttempts, signal, note }) {
  const prompt = buildWorldGenerationPrompt(args);
  let lastProblems = [], lastText = '', truncated = false, everTruncated = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const label = `Building the world (attempt ${attempt} of ${maxAttempts})${note}`;
    onProgress?.(`${label}...`);
    const messages = [{ role: 'user', content: prompt }];
    if (attempt > 1 && lastProblems.length) messages[0].content += `\n\nYOUR PREVIOUS ATTEMPT FAILED VALIDATION. Fix every problem below and output the complete corrected JSON:\n- ${lastProblems.join('\n- ')}`;
    try {
      const r = await callWithContinuation({ provider, opts, messages, firstKey: 'title', onProgress, label });
      lastText = r.text; truncated = r.truncated; everTruncated = everTruncated || truncated;
      const parsed = deepClean(extractJSON(r.text));
      lastProblems = validateWorld(parsed, vopts);
      if (lastProblems.length === 0) return { world: parsed };
      if (truncated) break;   // a cut-off document cannot be fixed by asking for more of it
      onProgress?.(`Validation failed: ${lastProblems.slice(0, 3).join('; ')}`);
    } catch (err) {
      if (signal?.aborted || /declined/.test(err.message)) throw err;
      if (truncated || looksTruncated(lastText)) { everTruncated = true; lastProblems = ['Your output was cut off at the output token limit and could not be parsed.']; break; }
      const tail = lastText ? ` The reply ended with: …${lastText.slice(-120).replace(/\s+/g, ' ')}` : '';
      lastProblems = [`Output was not parseable JSON (${err.message}).${tail} Output the whole object as valid JSON with no comments, fences or trailing text.`];
      onProgress?.(`Attempt ${attempt} failed: ${err.message}`);
    }
  }
  const error = new Error(`Could not build a valid world after ${maxAttempts} attempts. Last problems: ${lastProblems.join('; ')} A stronger model (Claude Sonnet, GPT-4.1, Gemini 2.5 Flash, DeepSeek) usually fixes this.`);
  error.raw = lastText;
  return { error, truncated: everTruncated };
}

/** The world in three parts, each validated for shape, the whole validated together, failing parts rewritten with the errors fed back. */
async function generateInParts({ provider, opts, args, vopts, onProgress, maxRounds, signal, note }) {
  const parts = {};
  const pending = Object.fromEntries(WORLD_PARTS.map(p => [p.id, []]));
  let lastProblems = [], lastText = '', truncated = false;
  const written = exclude => { const o = {}; let any = false; for (const p of WORLD_PARTS) if (p.id !== exclude && parts[p.id]) { Object.assign(o, parts[p.id]); any = true; } return any ? o : null; };
  for (let round = 1; round <= maxRounds; round++) {
    for (const part of WORLD_PARTS) {
      if (parts[part.id] && !pending[part.id].length) continue;
      const n = WORLD_PARTS.indexOf(part) + 1;
      const label = `Building the world: part ${n} of ${WORLD_PARTS.length}${round > 1 ? ` (round ${round})` : ''}${note}`;
      onProgress?.(`${label}...`);
      const messages = [{ role: 'user', content: buildWorldPartPrompt(args, { part, soFar: written(part.id), problems: pending[part.id] }) }];
      let r;
      try { r = await callWithContinuation({ provider, opts, messages, firstKey: part.keys[0], onProgress, label }); }
      catch (err) { if (signal?.aborted || /declined/.test(err.message)) throw err; pending[part.id] = [`The request failed (${err.message}); write the part again.`]; lastProblems = pending[part.id]; continue; }
      lastText = r.text; truncated = r.truncated;
      let obj = null;
      try { obj = deepClean(extractJSON(r.text)); } catch (err) { pending[part.id] = [r.truncated ? 'Your output was cut off at the output token limit and could not be parsed: write this part more compactly (shorter descriptions, no padding).' : `Output was not parseable JSON (${err.message}). Output the whole part as valid JSON.`]; }
      if (!pending[part.id].length || parts[part.id] === undefined) {
        if (obj && typeof obj === 'object') {
          const problems = [...part.keys.filter(k => obj[k] === undefined).map(k => `missing top-level key "${k}"`), ...structuralProblems(part, obj)];
          if (problems.length) pending[part.id] = problems;
          else { const picked = {}; for (const k of part.keys) picked[k] = obj[k]; parts[part.id] = picked; pending[part.id] = []; continue; }
        } else if (!pending[part.id].length) pending[part.id] = ['Output was not a JSON object.'];
      }
      lastProblems = pending[part.id];
      onProgress?.(`Part ${n} needs another pass: ${pending[part.id][0]}`);
    }
    if (WORLD_PARTS.some(p => !parts[p.id])) continue;
    const merged = Object.assign({}, ...WORLD_PARTS.map(p => parts[p.id]));
    lastProblems = validateWorld(merged, vopts);
    if (!lastProblems.length) return { world: merged };
    for (const p of WORLD_PARTS) pending[p.id] = [];
    for (const prob of lastProblems) pending[partFor(prob)].push(prob);
    onProgress?.(`Validation failed: ${lastProblems.slice(0, 3).join('; ')}`);
  }
  const error = new Error(`Could not build a valid world after ${maxRounds} rounds. Last problems: ${lastProblems.join('; ')}${truncated ? ' Even one part of the world did not fit this model\'s output limit: pick a model with a larger output limit.' : ' A stronger model (Claude Sonnet, GPT-4.1, Gemini 2.5 Flash, DeepSeek) usually fixes this.'}`);
  error.raw = lastText;
  return { error };
}

/** Cheap shape checks for a part before the whole world is validated, so an obviously short part is rewritten at once. */
function structuralProblems(part, obj) {
  const out = [];
  if (part.id === 'setting') {
    const locs = asArray(obj.locations);
    if (locs.length < 8 || locs.length > 12) out.push(`need 8-12 locations, got ${locs.length}`);
    if (!locs.some(l => asArray(l?.hidden).some(h => h && h.clueId))) out.push('at least one location needs a hidden entry with clueId "c1" (the clue found by searching; the clue itself is written in part 3)');
    if (!str(obj.prologue?.theMoment)) out.push('prologue.theMoment missing');
  } else if (part.id === 'people') {
    const f = asArray(obj.factions).length, n = asArray(obj.npcs).length;
    if (f < 2 || f > 3) out.push(`need 2-3 factions, got ${f}`);
    if (n < 6 || n > 8) out.push(`need 6-8 npcs, got ${n}`);
  } else {
    if (asArray(obj.timeline).length < 10) out.push(`timeline needs at least 10 entries, got ${asArray(obj.timeline).length}`);
    if (!obj.ending?.trueWayOut) out.push('ending.trueWayOut missing');
    if (asArray(obj.radio?.channels).length < 4) out.push(`radio.channels needs at least 4 entries, got ${asArray(obj.radio?.channels).length}`);
  }
  return out;
}

/** Which part a validation problem belongs to, so only that part is rewritten. */
export function partFor(problem) {
  const p = String(problem).toLowerCase();
  if (/heldby unknown faction/.test(p)) return 'setting';
  if (/clue|ending|way ?out|window|requirement|timeline|radio|channel|false ?hope|contact|doom|inciting|frequency|hidden entry/.test(p)) return 'plot';
  if (/npc|faction|betray|knowntosurvivor/.test(p)) return 'people';
  return 'setting';
}

/** Join a cut-off reply and its continuation, dropping any overlap the model repeated. */
export function stitch(head, tail) {
  let t = String(tail || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const max = Math.min(400, head.length, t.length);
  for (let k = max; k >= 3; k--) {
    if (head.endsWith(t.slice(0, k))) return head + t.slice(k);
  }
  return head + t;
}


// ------------------------------------------------------------ extension
/**
 * The scripted timeline has run out (open-ended play, or play after the
 * deadline): ask the model for the next weeks of this world and splice them
 * in. Returns { added, messages, newWayOut } or throws.
 */
export async function extendTimeline({ provider, apiKey, model, baseUrl, state, onProgress, signal }) {
  onProgress?.('The world keeps moving...');
  const prompt = buildTimelineExtensionPrompt({ state });
  const system = 'You are a meticulous designer of survival-fiction worlds who outputs only valid JSON: no markdown fences, no commentary.';
  const { text, finishReason } = await completeWithMeta(provider, { apiKey, model, baseUrl, json: true, maxTokens: 8000, temperature: 0.9, effort: 'low', signal, system, messages: [{ role: 'user', content: prompt }] });
  if (finishReason === 'refusal') throw new Error('The model declined to continue the world.');
  const parsed = deepClean(extractJSON(text));
  const r = applyExtension(state, parsed);
  if (!r.added) throw new Error('The continuation held no usable events.');
  return r;
}

/** Validate a timeline extension against the truth and append what survives. Pure apart from mutating state.truth. */
export function applyExtension(state, parsed) {
  const t = state.truth; const today = dayOf(state.clock.minutes);
  const entries = [];
  for (const e of asArray(parsed?.timeline).slice(0, 12)) {
    const day = Math.round(num(e?.day, NaN)); const event = stripStamp(str(e?.event));
    if (!Number.isFinite(day) || day <= today || day > today + 60 || event.length < 10) continue;
    const fx = e.effects && typeof e.effects === 'object' ? e.effects : {};
    const effects = {};
    if (fx.threatDelta) effects.threatDelta = Math.max(-2, Math.min(2, Math.round(num(fx.threatDelta, 0))));
    if (fx.locationId && getLocation(state, fx.locationId)) {
      effects.locationId = fx.locationId;
      if (fx.capturedBy && getFaction(state, fx.capturedBy)) effects.capturedBy = fx.capturedBy;
      else if (fx.capturedBy === null && fx.liberated) { effects.capturedBy = null; effects.liberated = true; }
      if (fx.dangerDelta) effects.dangerDelta = Math.max(-3, Math.min(3, Math.round(num(fx.dangerDelta, 0))));
    }
    if (fx.revealLocationId && getLocation(state, fx.revealLocationId)) effects.revealLocationId = fx.revealLocationId;
    if (fx.radioFreq && normalizeFreq(fx.radioFreq) != null) effects.radioFreq = String(fx.radioFreq);
    if (fx.utilities && typeof fx.utilities === 'object') { const u = {}; for (const k of UTILITIES) if (typeof fx.utilities[k] === 'boolean') u[k] = fx.utilities[k]; if (Object.keys(u).length) effects.utilities = u; }
    entries.push({ day, hour: Math.max(0, Math.min(23, Math.round(hourFromText(event) ?? num(e.hour, 9)))), event, doom: Math.max(1, Math.min(5, Math.round(num(e.doom, state.doom)))), visible: e.visible !== false, contact: !!e.contact, effects, extension: true });
  }
  entries.sort((a, b) => (a.day * 24 + a.hour) - (b.day * 24 + b.hour));
  // Appended, never re-sorted with the originals: fired events are tracked by index.
  t.timeline = [...asArray(t.timeline), ...entries];
  let messages = 0;
  for (const m of asArray(parsed?.radioMessages).slice(0, 8)) {
    const f = normalizeFreq(m?.freq); const fromDay = Math.round(num(m?.fromDay, NaN)); const text = stripStamp(str(m?.text));
    const ch = f == null ? null : asArray(t.radio?.channels).find(c => Math.abs(normalizeFreq(c.freq) - f) < 0.0051);
    if (!ch || !Number.isFinite(fromDay) || fromDay <= today || text.length < 6) continue;
    ch.messages.push({ fromDay, text, truthful: m.truthful !== false });
    if (ch.schedule && ch.schedule.toDay != null && ch.schedule.toDay < fromDay) ch.schedule.toDay = null;
    messages++;
  }
  let newWayOut = null;
  const wo = parsed?.nextWayOut;
  if (wo && typeof wo === 'object' && str(wo.what) && getLocation(state, wo.where)) {
    const ws = Math.round(num(wo.windowStartDay, NaN)), we = Math.round(num(wo.windowEndDay, NaN));
    if (Number.isFinite(ws) && Number.isFinite(we) && ws >= today + 3 && we >= ws) {
      const reqs = asArray(wo.requirements).filter(r => r && /^[a-z0-9_]+$/.test(str(r.flag)) && str(r.description)).slice(0, 3).map(r => ({ flag: r.flag, description: str(r.description), howToObtain: str(r.howToObtain) }));
      t.ending = t.ending || {};
      t.ending.previousWayOuts = [...asArray(t.ending.previousWayOuts), t.ending.trueWayOut].filter(Boolean);
      t.ending.trueWayOut = { what: str(wo.what), where: wo.where, windowStartDay: ws, windowEndDay: we, requirements: reqs, description: str(wo.description), howItPlaysOut: str(wo.howItPlaysOut) };
      t.ending.clues = asArray(t.ending.clues);
      let n = t.ending.clues.length;
      for (const c of asArray(wo.clues).slice(0, 3)) {
        const kind = c?.source?.kind; const sid = c?.source?.id;
        const ok = kind === 'npc' ? !!getNpc(state, sid) : kind === 'radio' ? asArray(t.radio?.channels).some(ch => normalizeFreq(ch.freq) != null && normalizeFreq(ch.freq) === normalizeFreq(sid)) : false;
        if (!ok || str(c.text).length < 10) continue;
        t.ending.clues.push({ id: `x${++n}`, text: str(c.text), source: { kind, id: String(sid) } });
      }
      newWayOut = t.ending.trueWayOut;
      if (state.clock.deadlineDay != null && state.clock.deadlineDay < we) state.clock.deadlineDay = we;
    }
  }
  return { added: entries.length, messages, newWayOut };
}