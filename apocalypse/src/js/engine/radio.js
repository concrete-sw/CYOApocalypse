// The radio: tuning, scanning, schedules and the log of everything heard.

import { pick } from './util.js';
import { dayOf, hourOf } from './clock.js';
import { skillCount, away } from './companions.js';
import { getLocation, getNpc, getFaction, locState } from './world.js';
import { distance } from './encounters.js';

export function normalizeFreq(s) {
  const t = String(s ?? '').toLowerCase().replace(/mhz|khz|hz|\bfm\b|\bam\b|channel|ch\.?/g, '').replace(',', '.').trim();
  const n = parseFloat(t);
  return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null;
}
export function freqLabel(n) { return n == null ? '?' : n >= 500 ? `${Math.round(n)} kHz` : `${n.toFixed(3)} MHz`; }

export function channelFor(state, freq) {
  const n = normalizeFreq(freq); if (n == null) return null;
  return (state.truth.radio?.channels || []).find(c => { const f = normalizeFreq(c.freq); return f != null && Math.abs(f - n) < 0.0051; }) || null;
}
export function isActive(ch, state) {
  const day = dayOf(state.clock.minutes); const h = hourOf(state.clock.minutes); const sc = ch.schedule || {};
  if (sc.fromDay != null && day < Number(sc.fromDay)) return false;
  if (sc.toDay != null && day > Number(sc.toDay)) return false;
  if (Array.isArray(sc.hours) && sc.hours.length && !sc.hours.map(Number).includes(h)) return false;
  return true;
}
export function scheduleText(ch) {
  const sc = ch.schedule || {}; const parts = [];
  if (sc.fromDay != null || sc.toDay != null) parts.push(`days ${sc.fromDay ?? 0}–${sc.toDay ?? 'onward'}`);
  if (Array.isArray(sc.hours) && sc.hours.length) parts.push(`hours ${sc.hours.join(', ')}`);
  return parts.join(', ') || 'irregular';
}
export function pickMessage(ch, day) {
  const msgs = (ch.messages || []).filter(m => Number(m.fromDay ?? 0) <= day);
  return msgs.length ? msgs[msgs.length - 1] : null;
}
export function knowFreq(state, n) {
  const f = normalizeFreq(n); if (f == null) return;
  if (!state.radio.knownFreqs.some(x => Math.abs(x - f) < 0.0051)) state.radio.knownFreqs.push(f);
}
export function tune(state, freq) {
  const n = normalizeFreq(freq);
  if (n == null) return { kind: 'invalid' };
  const ch = channelFor(state, n);
  if (!ch) return { kind: 'static', freq: n };
  knowFreq(state, n);
  if (!isActive(ch, state)) return { kind: 'carrier', freq: n, channel: ch };
  const msg = pickMessage(ch, dayOf(state.clock.minutes));
  if (!msg) return { kind: 'carrier', freq: n, channel: ch };
  return { kind: 'broadcast', freq: n, channel: ch, message: msg };
}
export function scan(state, rnd = Math.random) {
  const day = dayOf(state.clock.minutes);
  const active = (state.truth.radio?.channels || []).filter(c => isActive(c, state) && pickMessage(c, day));
  if (!active.length) return null;
  const unknown = active.filter(c => !state.radio.knownFreqs.some(x => Math.abs(x - normalizeFreq(c.freq)) < 0.0051));
  const chance = 0.5 + 0.2 * skillCount(state, 'electronics');
  if (rnd() > chance) return null;
  return pick(unknown.length ? unknown : active, rnd);
}
export function logRadio(state, entry) {
  state.radio.log.push({ at: state.clock.minutes, ...entry });
  if (state.radio.log.length > 200) state.radio.log.splice(0, state.radio.log.length - 200);
}


// ------------------------------------------------------------ walkie-talkies
const BUILT_UP = /residence|store|hospital|government|industrial|checkpoint|religious|transport/;
/** Who a walkie-talkie call can reach from where the survivor stands. Short range: a few kilometres, less among buildings. */
export function walkieReach(state, rnd = Math.random) {
  const here = getLocation(state, state.location);
  const rangeKm = here && BUILT_UP.test(here.type) ? 3 : 8;
  const near = id => { const l = getLocation(state, id); return l ? distance(here, l) : Infinity; };
  const companions = away(state).filter(id => state.companions[id].hasWalkie).map(id => { const loc = state.companions[id].assignment?.locationId; const d = loc ? near(loc) : 0; return { id, name: getNpc(state, id)?.name || id, locationName: getLocation(state, loc)?.name || 'nearby', distance: Math.round(d) }; }).filter(c => c.distance <= rangeKm);
  const factions = (state.truth.factions || []).filter(f => (state.factions[f.id]?.standing ?? 0) > -60).filter(f => {
    if (near(f.baseLocationId) <= rangeKm) return true;
    return (state.truth.locations || []).some(l => (locState(state, l.id).heldBy ?? l.heldBy) === f.id && near(l.id) <= rangeKm);
  }).map(f => ({ id: f.id, name: f.name }));
  return { rangeKm, companions, factions, stranger: rnd() < 0.15 };
}