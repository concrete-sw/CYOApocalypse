// The region map: known locations plotted by their truth coordinates, with
// dashed routes from where the survivor stands. Zoom with the wheel, pinch
// or the buttons; pan by dragging or with the arrow keys. Labels and markers
// keep a constant size on screen whatever the zoom, like a real map.

import { h } from './dom.js';
import { getLocation, effectiveDanger } from '../engine/world.js';
import { distance } from '../engine/encounters.js';
import { holderOf } from '../engine/factions.js';
import { clamp } from '../engine/util.js';

const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}, text) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); if (text != null) e.textContent = text; return e; }

const MIN_W = 10, MAX_W = 220;

/** A view that shows every known location with some air around it. */
export function fitView(state, aspect = 1.6) {
  const locs = state.discovered.locations.map(id => getLocation(state, id)).filter(Boolean);
  const xs = locs.map(l => l.x), ys = locs.map(l => l.y);
  const minX = locs.length ? Math.min(...xs) : 0, maxX = locs.length ? Math.max(...xs) : 100;
  const minY = locs.length ? Math.min(...ys) : 0, maxY = locs.length ? Math.max(...ys) : 100;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const w = clamp(Math.max((maxX - minX) * 1.3 + 14, ((maxY - minY) * 1.3 + 16) * aspect), 36, MAX_W);
  return { x: cx - w / 2, y: cy - (w / aspect) / 2, w, h: w / aspect, fitted: true };
}

export function renderMap(state, { selected = null, onSelect, view = null, onView } = {}) {
  const v = view || fitView(state);
  const svg = el('svg', { role: 'img', 'aria-label': 'Region map. Scroll to zoom, drag to pan, arrow keys to move.', tabindex: '0' });
  let aspect = 1.6;
  const nodes = [];
  const apply = () => {
    const r = svg.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) aspect = r.width / r.height;
    v.h = v.w / aspect;
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    const ppu = (r.width || 800) / v.w;          // screen pixels per map unit
    svg.style.setProperty('--ppu', String(ppu));
    svg.classList.toggle('dense', ppu < 5);
    for (const n of nodes) n.circle.setAttribute('r', String(n.big ? 6 / ppu : 4.5 / ppu));
    for (const n of nodes) { n.label.setAttribute('y', String(n.loc.y + 14 / ppu)); n.dist?.setAttribute('y', String(n.loc.y + 25 / ppu)); }
    onView?.(v);
  };

  const grid = el('g', { class: 'grid' });
  for (let i = -40; i <= 140; i += 10) { grid.append(el('line', { x1: i, y1: -40, x2: i, y2: 140 })); grid.append(el('line', { x1: -40, y1: i, x2: 140, y2: i })); }
  svg.append(grid);
  const here = getLocation(state, state.location);
  const known = state.discovered.locations.map(id => getLocation(state, id)).filter(Boolean);
  for (const loc of known) {
    if (!here || loc.id === here.id) continue;
    svg.append(el('line', { class: `edge ${selected === loc.id ? 'sel' : ''}`, x1: here.x, y1: here.y, x2: loc.x, y2: loc.y }));
  }
  let moved = false;
  for (const loc of known) {
    const ls = state.locationState[loc.id];
    const visited = (ls?.visits || 0) > 0 || ls?.scouted;
    const holder = holderOf(state, loc.id);
    const hostile = holder && visited && (state.factions[holder.id]?.standing ?? 0) < 0;
    const isShelter = state.shelter?.locationId === loc.id;
    const g = el('g', { class: `node ${loc.id === state.location ? 'here' : ''} ${isShelter ? 'shelter' : ''} ${hostile ? 'hostile' : ''} ${visited ? '' : 'unknown'} ${selected === loc.id ? 'sel' : ''}`, tabindex: '0', role: 'button' });
    const circle = el('circle', { cx: loc.x, cy: loc.y, r: 1.5 });
    const label = el('text', { x: loc.x, y: loc.y + 4, 'text-anchor': 'middle' }, loc.name);
    let dist = null;
    if (here && loc.id !== here.id) dist = el('text', { class: 'dist', x: loc.x, y: loc.y + 7, 'text-anchor': 'middle' }, `${Math.round(distance(here, loc))} km${visited ? ` · danger ${Math.round(effectiveDanger(state, loc.id))}` : ' · unvisited'}`);
    else if (visited) dist = el('text', { class: 'dist', x: loc.x, y: loc.y + 7, 'text-anchor': 'middle' }, `you are here · danger ${Math.round(effectiveDanger(state, loc.id))}`);
    g.append(circle, label); if (dist) g.append(dist);
    const title = el('title', {}, `${loc.name}${visited ? '' : ' (not yet visited)'}`);
    g.append(title);
    g.setAttribute('aria-label', title.textContent);
    g.addEventListener('click', () => { if (!moved) onSelect?.(loc.id); });
    g.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); onSelect?.(loc.id); } });
    svg.append(g);
    nodes.push({ loc, circle, label, dist, big: isShelter || loc.id === state.location });
  }

  // ---- zoom and pan
  const toSvg = (clientX, clientY) => { const r = svg.getBoundingClientRect(); return { x: v.x + (clientX - r.left) / r.width * v.w, y: v.y + (clientY - r.top) / r.height * v.h }; };
  const zoomAt = (factor, px, py) => {
    const nw = clamp(v.w * factor, MIN_W, MAX_W); const ratio = nw / v.w;
    v.x = px - (px - v.x) * ratio; v.y = py - (py - v.y) * ratio; v.w = nw; v.fitted = false; apply();
  };
  const zoomCenter = factor => zoomAt(factor, v.x + v.w / 2, v.y + v.h / 2);
  const fit = () => { Object.assign(v, fitView(state, aspect)); apply(); };
  const centerOn = loc => { if (!loc) return; v.x = loc.x - v.w / 2; v.y = loc.y - v.h / 2; v.fitted = false; apply(); };
  svg.addEventListener('wheel', e => { e.preventDefault(); const p = toSvg(e.clientX, e.clientY); zoomAt(e.deltaY > 0 ? 1.2 : 1 / 1.2, p.x, p.y); }, { passive: false });
  const pointers = new Map(); let drag = null; let pinch = null;
  svg.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    svg.setPointerCapture(e.pointerId);
    if (pointers.size === 1) { drag = { x: e.clientX, y: e.clientY, vx: v.x, vy: v.y }; moved = false; }
    else if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), w: v.w, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 }; drag = null; }
  });
  svg.addEventListener('pointermove', e => {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const r = svg.getBoundingClientRect();
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      const target = clamp(pinch.w * (pinch.d / d), MIN_W, MAX_W);
      const c = toSvg(pinch.cx, pinch.cy);
      zoomAt(target / v.w, c.x, c.y); moved = true; return;
    }
    if (drag) {
      if (Math.abs(e.clientX - drag.x) + Math.abs(e.clientY - drag.y) > 3) moved = true;
      v.x = drag.vx - (e.clientX - drag.x) / r.width * v.w;
      v.y = drag.vy - (e.clientY - drag.y) / r.height * v.h;
      v.fitted = false; apply();
    }
  });
  const up = e => { pointers.delete(e.pointerId); if (pointers.size < 2) pinch = null; if (pointers.size === 0) drag = null; };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  svg.addEventListener('keydown', e => {
    const step = v.w * 0.1; const k = e.key;
    if (k === 'ArrowLeft') { v.x -= step; } else if (k === 'ArrowRight') { v.x += step; }
    else if (k === 'ArrowUp') { v.y -= step; } else if (k === 'ArrowDown') { v.y += step; }
    else if (k === '+' || k === '=') { zoomCenter(1 / 1.25); return e.preventDefault(); } else if (k === '-' || k === '_') { zoomCenter(1.25); return e.preventDefault(); }
    else if (k === '0') { fit(); return e.preventDefault(); } else return;
    v.fitted = false; apply(); e.preventDefault();
  });
  // Re-fit the view to the box whenever the box changes size (first attach, window resize, maximize).
  let lastW = 0, lastH = 0;
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => {
    const r = svg.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || (Math.abs(r.width - lastW) < 1 && Math.abs(r.height - lastH) < 1)) return;
    lastW = r.width; lastH = r.height;
    if (v.fitted) Object.assign(v, fitView(state, r.width / r.height));
    apply();
  }).observe(svg);

  const btn = (label, title, fn) => h('button', { class: 'btn small ghost', type: 'button', title, 'aria-label': title, onClick: fn }, label);
  const bar = h('div', { class: 'map-tools' },
    btn('+', 'Zoom in', () => zoomCenter(1 / 1.4)), btn('−', 'Zoom out', () => zoomCenter(1.4)), btn('Fit', 'Show every known place', fit), btn('Here', 'Centre on where you are', () => centerOn(here)),
    h('span', { class: 'muted small' }, 'scroll to zoom · drag to pan · arrows move · click a place'));
  apply();
  return h('div', { class: 'map' }, bar, svg);
}
