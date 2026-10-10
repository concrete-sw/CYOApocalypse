// Faction standing and who holds which place.

import { clamp } from './util.js';
import { getFaction, getLocation } from './world.js';

export function standingLabel(n) { return n >= 60 ? 'allied' : n >= 20 ? 'friendly' : n > -20 ? 'neutral' : n > -60 ? 'hostile' : 'enemy'; }
export function factionState(state, id) { return state.factions[id] || (state.factions[id] = { known: false, standing: 0, contacts: 0 }); }
export function meetFaction(state, id) {
  const f = factionState(state, id);
  if (!f.known) { f.known = true; f.metAt = state.clock.minutes; return true; }
  return false;
}
export function adjustStanding(state, id, d) {
  const f = factionState(state, id);
  f.standing = clamp(f.standing + d, -100, 100);
  f.contacts++;
  f.lastContactAt = state.clock.minutes;
}
export function hostileFactions(state) {
  return Object.entries(state.factions).filter(([, f]) => f.known && f.standing <= -30).map(([id]) => id);
}
/** The faction holding a location now (timeline captures override the truth's initial holder). */
export function holderOf(state, locationId) {
  const ls = state.locationState?.[locationId];
  const loc = getLocation(state, locationId);
  const id = ls && ls.heldBy !== undefined ? ls.heldBy : (loc?.heldBy || null);
  return id ? getFaction(state, id) : null;
}
/** Multiplier on how hostile a faction's people are to the survivor. */
export function hostilityMod(state, factionId) {
  const f = getFaction(state, factionId);
  const att = { hostile: 1.4, wary: 1.1, neutral: 1.0, welcoming: 0.7 }[String(f?.attitudeToStrangers || 'wary').toLowerCase()] || 1;
  const standing = state.factions[factionId]?.standing || 0;
  return Math.max(0.3, att - (standing / 100) * 0.6);
}
