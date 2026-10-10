// The region map: known locations plotted by their truth coordinates, with
// dashed routes from where the survivor stands.

import { getLocation, locState, effectiveDanger } from '../engine/world.js';
import { distance } from '../engine/encounters.js';
import { holderOf } from '../engine/factions.js';

const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, text) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; }

export function renderMap(state, { selected = null, onSelect } = {}) {
  const svg = el('svg', { viewBox: '-4 -4 108 112', role: 'img', 'aria-label': 'Region map' });
  const grid = el('g', { class: 'grid' });
  for (let i = 0; i <= 100; i += 10) { grid.append(el('line', { x1: i, y1: 0, x2: i, y2: 100 })); grid.append(el('line', { x1: 0, y1: i, x2: 100, y2: i })); }
  svg.append(grid);
  const here = getLocation(state, state.location);
  const known = state.discovered.locations.map(id => getLocation(state, id)).filter(Boolean);
  for (const loc of known) {
    if (!here || loc.id === here.id) continue;
    const e = el('line', { class: `edge ${selected === loc.id ? 'sel' : ''}`, x1: here.x, y1: here.y, x2: loc.x, y2: loc.y });
    svg.append(e);
  }
  for (const loc of known) {
    const ls = state.locationState[loc.id];
    const visited = (ls?.visits || 0) > 0 || ls?.scouted;
    const holder = holderOf(state, loc.id);
    const hostile = holder && visited && (state.factions[holder.id]?.standing ?? 0) < 0;
    const g = el('g', { class: `node ${loc.id === state.location ? 'here' : ''} ${state.shelter?.locationId === loc.id ? 'shelter' : ''} ${hostile ? 'hostile' : ''} ${selected === loc.id ? 'sel' : ''}`, tabindex: '0', role: 'button' });
    g.append(el('circle', { cx: loc.x, cy: loc.y, r: state.shelter?.locationId === loc.id ? 2.4 : 1.8 }));
    g.append(el('text', { x: loc.x, y: loc.y + 4.6, 'text-anchor': 'middle' }, loc.name.length > 24 ? loc.name.slice(0, 23) + '…' : loc.name));
    if (here && loc.id !== here.id) g.append(el('text', { class: 'dist', x: loc.x, y: loc.y + 7.2, 'text-anchor': 'middle' }, `${Math.round(distance(here, loc))} km${visited ? ` · danger ${Math.round(effectiveDanger(state, loc.id))}` : ''}`));
    else if (visited) g.append(el('text', { class: 'dist', x: loc.x, y: loc.y + 7.2, 'text-anchor': 'middle' }, `you are here · danger ${Math.round(effectiveDanger(state, loc.id))}`));
    const title = el('title', {}, `${loc.name}${visited ? '' : ' (not yet visited)'}`);
    g.append(title);
    g.setAttribute('aria-label', title.textContent);
    g.addEventListener('click', () => onSelect?.(loc.id));
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(loc.id); } });
    svg.append(g);
  }
  return svg;
}
