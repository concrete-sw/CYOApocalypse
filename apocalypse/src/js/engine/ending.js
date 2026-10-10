// The debrief: deterministic statistics plus an AI-written reckoning, with the code having the last word.

import { buildDebriefPrompt } from '../prompts/debrief.js';
import { extractJSON } from './json.js';
import { complete } from '../providers/index.js';
import { computeScore, ratingFor } from './state.js';
import { dayOf } from './clock.js';
import { getNpc, getLocation } from './world.js';
import { standingLabel } from './factions.js';
import { asArray, str } from './util.js';

export function computeStats(state) {
  const t = state.truth; const e = state.ended || { kind: 'retired' };
  const clues = asArray(t.ending?.clues);
  const hopes = asArray(t.ending?.falseHopes);
  const total = t.locations.reduce((a, l) => a + asArray(l.hidden).length, 0);
  const found = Object.values(state.locationState).reduce((a, ls) => a + (ls.hiddenFound?.length || 0), 0);
  return {
    ending: e.kind, deathCause: e.cause || null, daysSurvived: dayOf(state.clock.minutes), deadlineDay: state.clock.deadlineDay,
    cluesFound: clues.filter(c => state.clues.includes(c.id)).map(c => c.text),
    cluesMissed: clues.filter(c => !state.clues.includes(c.id)).map(c => c.text),
    cluesTotal: clues.length,
    falseHopesPursued: hopes.filter(h => state.flags.includes(`pursued_${h.id}`)).map(h => h.promise),
    companions: Object.entries(state.companions).map(([id, c]) => ({ name: getNpc(state, id)?.name || id, status: c.status, loyalty: c.loyalty })),
    factions: Object.entries(state.factions).filter(([, f]) => f.known).map(([id, f]) => ({ name: state.truth.factions.find(x => x.id === id)?.name || id, standing: standingLabel(f.standing) })),
    locationsVisited: Object.values(state.locationState).filter(ls => ls.visits > 0).length, locationsTotal: t.locations.length,
    hiddenFound: found, hiddenTotal: total,
    itemsFound: state.stats.itemsFound, encounters: state.stats.encounters, kills: state.stats.kills, hints: state.hints, nightsOutside: state.stats.nightsOutside,
    shelter: state.shelter ? getLocation(state, state.shelter.locationId)?.name : null, flags: state.flags, facts: state.facts.length,
    finalVitals: { ...state.vitals }
  };
}

export async function runDebrief({ state, provider, apiKey, model, baseUrl, onStatus, signal }) {
  const stats = computeStats(state);
  const prompt = buildDebriefPrompt({ state, stats });
  let d = null;
  for (let attempt = 1; attempt <= 2 && !d; attempt++) {
    onStatus?.(attempt === 1 ? 'Compiling the record...' : 'Re-requesting the record...');
    try {
      const raw = await complete(provider, { apiKey, model, baseUrl, json: true, system: 'You write honest, vivid, factual debriefs for a survival story. Output only JSON.', messages: [{ role: 'user', content: prompt }], maxTokens: 8000, temperature: 0.6, effort: 'low', signal });
      d = extractJSON(raw);
      if (typeof d !== 'object') d = null;
    } catch (err) {
      if (signal?.aborted) throw err;
      if (attempt === 2) d = fallbackDebrief(state, stats);
    }
  }
  if (!d) d = fallbackDebrief(state, stats);
  return finalizeDebrief(state, d, stats);
}

export function finalizeDebrief(state, d, stats = computeStats(state)) {
  const t = state.truth;
  d.score = computeScore(state);
  d.rating = ratingFor(d.score, state.ended?.kind);
  d.stats = stats;
  d.outcome = state.ended?.kind || 'retired';
  d.trueCause = str(t.apocalypse?.trueCause);
  d.publicBelief = str(t.apocalypse?.publicBelief);
  d.wayOut = t.ending?.trueWayOut || null;
  d.timeline = asArray(t.timeline).map((e, i) => ({ day: e.day, event: e.event, visible: e.visible !== false, fired: state.events.fired.includes(i) }));
  d.falseHopeDetails = asArray(t.ending?.falseHopes);
  d.npcSecrets = asArray(t.npcs).map(n => ({ name: n.name, secret: n.secret, betrayal: n.betrayal?.will ? n.betrayal.how : null, met: state.npcsMet.includes(n.id) }));
  d.factionSecrets = asArray(t.factions).map(f => ({ name: f.name, secret: f.secret, goal: f.goal }));
  for (const k of ['gotRight', 'missed', 'falseHopes', 'companionFates']) d[k] = asArray(d[k]).map(x => (typeof x === 'string' ? x : JSON.stringify(x)));
  for (const k of ['epitaph', 'verdict', 'whatReallyHappened', 'regionAfter', 'ifYouHad']) d[k] = str(d[k]);
  return d;
}

export function fallbackDebrief(state, stats) {
  const t = state.truth; const e = state.ended || { kind: 'retired' };
  const wo = t.ending?.trueWayOut;
  return {
    epitaph: e.kind === 'escape' ? `${state.survivor.name} got out. Few did.` : e.kind === 'death' ? `${state.survivor.name} lasted ${stats.daysSurvived} days. ${e.cause || ''}`.trim() : `${state.survivor.name} was still alive when the record ends.`,
    verdict: '(The record could not be compiled by the Game Master; this summary was produced by the game.)',
    whatReallyHappened: `${t.apocalypse?.trueCause || ''}\n\nThe way out: ${wo?.what || ''} at ${getLocation(state, wo?.where)?.name || '?'} between day ${wo?.windowStartDay} and day ${wo?.windowEndDay}. ${wo?.howItPlaysOut || ''}`,
    gotRight: stats.cluesFound.map(c => `Found the clue: ${c}`),
    missed: stats.cluesMissed.map(c => `Never learned: ${c}`),
    falseHopes: asArray(t.ending?.falseHopes).map(h => `${h.promise}: ${h.whatReallyHappens}`),
    companionFates: stats.companions.map(c => `${c.name}: ${c.status}`),
    regionAfter: '',
    ifYouHad: ''
  };
}
