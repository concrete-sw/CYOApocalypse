// Generates and validates the hidden world truth. A reply cut off at the
// model's output limit is continued in a follow-up call and stitched together;
// invalid worlds are regenerated with the validation errors fed back.

import { buildWorldGenerationPrompt, pickSeed } from '../prompts/worldGeneration.js';
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

/**
 * Generate and validate a world. settings carries the player's choices
 * (apocalypse, difficulty, lengthDays, startDay, homePlace, customBackground...);
 * a variety seed and a variant of the apocalypse are drawn here unless given.
 * continuation describes the previous chapter when the story moves on.
 */
export async function generateWorld({ provider, apiKey, model, baseUrl, settings, survivor, onProgress, maxAttempts = 3, signal, continuation = null }) {
  const seed = settings.seed || pickSeed();
  const variant = settings.variant ?? variantFor(settings.apocalypseId);
  const prompt = buildWorldGenerationPrompt({ ...settings, survivor, seed, variant, continuation });
  const system = 'You are a meticulous designer of survival-fiction worlds who outputs only valid JSON: no markdown fences, no commentary, no comments inside the JSON.';
  let lastProblems = [];
  let lastText = '';
  let truncated = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    onProgress?.(`Building the world (attempt ${attempt} of ${maxAttempts})...`, 0);
    const messages = [{ role: 'user', content: prompt }];
    if (attempt > 1 && lastProblems.length) {
      messages[0].content += `\n\nYOUR PREVIOUS ATTEMPT FAILED VALIDATION. Fix every problem below and output the complete corrected JSON:\n- ${lastProblems.join('\n- ')}`;
    }
    let chars = 0;
    try {
      const opts = { apiKey, model, baseUrl, json: true, maxTokens: 32000, temperature: 0.9, effort: 'medium', signal, system };
      let { text, finishReason } = await completeWithMeta(provider, { ...opts, messages }, (chunk, t) => { chars = t.length; onProgress?.(`Building the world (attempt ${attempt})... ${chars} chars`, chars); });
      if (finishReason === 'refusal') throw new Error('The model declined to write this world. Try another apocalypse or model.');
      // Continue a reply that stopped at the output limit.
      for (let c = 0; c < MAX_CONTINUATIONS && (finishReason === 'length' || (finishReason == null && looksTruncated(text))); c++) {
        onProgress?.(`The reply was cut off at ${chars} chars; asking the model to continue (${c + 1} of ${MAX_CONTINUATIONS})...`, chars);
        const cont = await completeWithMeta(provider, {
          ...opts, json: false,
          messages: [...messages, { role: 'assistant', content: text }, { role: 'user', content: 'Your output was cut off before the JSON ended. Continue EXACTLY from where it stopped, starting with the very next character. Output only the remaining JSON: do not repeat anything already written, do not restart the object, no fences, no commentary.' }]
        }, (chunk, t) => { onProgress?.(`Continuing the world... ${chars + t.length} chars`, chars + t.length); });
        // A model that restarts the whole document instead of continuing it is taken at its word.
        text = /^\s*\{\s*"title"\s*:/.test(cont.text) ? cont.text : stitch(text, cont.text);
        chars = text.length;
        finishReason = cont.finishReason;
      }
      lastText = text;
      truncated = finishReason === 'length' || looksTruncated(text);
      const parsed = deepClean(extractJSON(text));
      lastProblems = validateWorld(parsed, { startDay: settings.startDay, custom: survivor?.background === 'custom' });
      if (lastProblems.length === 0) { parsed.seed = seed; parsed.variant = variant || null; return normalizeWorld(parsed, settings); }
      if (truncated) lastProblems.unshift('Your output was cut off at the output token limit: write a more compact world (shorter descriptions, no padding) so the whole JSON fits.');
      onProgress?.(`Validation failed: ${lastProblems.slice(0, 3).join('; ')}`, chars);
    } catch (err) {
      if (signal?.aborted) throw err;
      if (/declined/.test(err.message)) throw err;
      const tail = lastText ? ` The reply ended with: …${lastText.slice(-120).replace(/\s+/g, ' ')}` : '';
      lastProblems = [truncated || looksTruncated(lastText)
        ? 'Your output was cut off at the output token limit and could not be parsed: write a more compact world (shorter descriptions, no padding) so the whole JSON fits.'
        : `Output was not parseable JSON (${err.message}).${tail} Output the whole object as valid JSON with no comments, fences or trailing text.`];
      onProgress?.(`Attempt ${attempt} failed: ${err.message}`, chars);
    }
  }
  const hint = truncated || looksTruncated(lastText)
    ? ' The model\'s output limit is too small for a world of this size: pick a model with a larger output limit, or a shorter game.'
    : ' The model is not producing valid JSON; a stronger model (Claude Sonnet, GPT-4.1, Gemini 2.5 Flash, DeepSeek) usually fixes this.';
  const error = new Error(`Could not build a valid world after ${maxAttempts} attempts. Last problems: ${lastProblems.join('; ')}${hint}`);
  error.raw = lastText;
  throw error;
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