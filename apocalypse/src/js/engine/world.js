// Read-only helpers over the world truth plus the per-location mutable state.

export const getLocation = (s, id) => (s.truth?.locations || []).find(l => l.id === id) || null;
export const getNpc = (s, id) => (s.truth?.npcs || []).find(n => n.id === id) || null;
export const getFaction = (s, id) => (s.truth?.factions || []).find(f => f.id === id) || null;
export const getClue = (s, id) => (s.truth?.ending?.clues || []).find(c => c.id === id) || null;

/** Mutable per-location state (resources deplete, areas get searched, holders change). */
export function locState(state, id) {
  if (!state.locationState[id]) {
    const loc = getLocation(state, id);
    state.locationState[id] = { resources: { food: 0, water: 0, medical: 0, fuel: 0, materials: 0, weapons: 0, ...(loc?.resources || {}) }, searched: [], visits: 0, scouted: false, hiddenFound: [], dangerMod: 0 };
  }
  return state.locationState[id];
}
export function effectiveDanger(state, id) {
  const loc = getLocation(state, id); const ls = state.locationState[id];
  return Math.max(0, Math.min(5, (loc?.danger || 0) + (ls?.dangerMod || 0) + (state.threat?.local?.[id] || 0) * 0.5));
}
export function isKnown(state, id) { return state.discovered.locations.includes(id); }
export function revealLocation(state, id) {
  if (getLocation(state, id) && !isKnown(state, id)) { state.discovered.locations.push(id); return true; }
  return false;
}
export function knownLocations(state) { return state.discovered.locations.map(id => getLocation(state, id)).filter(Boolean); }

/** Loose lookup by id, exact name, prefix, substring, or a word prefix. */
export function fuzzyFind(list, q, nameKey = 'name') {
  if (!q) return null;
  const ql = String(q).toLowerCase().trim();
  const name = x => String(x[nameKey] || '').toLowerCase();
  return list.find(x => String(x.id).toLowerCase() === ql) || list.find(x => name(x) === ql) || list.find(x => name(x).startsWith(ql))
    || list.find(x => name(x).includes(ql)) || list.find(x => name(x).split(/\s+/).some(w => w.startsWith(ql))) || null;
}
