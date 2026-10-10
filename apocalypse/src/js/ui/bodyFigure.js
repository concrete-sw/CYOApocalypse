// The survivor's body as an SVG silhouette. Regions are tinted by the worst
// injury they carry, pulse when infected, and are dashed when treated.

import { REGIONS, REGION_LABEL, regionStatus } from '../engine/body.js';

const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; }

// Front view. The survivor's LEFT side is drawn on the viewer's right.
const SHAPES = {
  head: () => el('ellipse', { cx: 50, cy: 22, rx: 13, ry: 16 }),
  neck: () => el('rect', { x: 44, y: 37, width: 12, height: 11, rx: 2 }),
  torso: () => el('polygon', { points: '30,48 70,48 72,96 28,96' }),
  abdomen: () => el('polygon', { points: '28,96 72,96 69,126 31,126' }),
  rightArm: () => el('polygon', { points: '13,53 29,49 29,101 16,104' }),
  leftArm: () => el('polygon', { points: '71,49 87,53 84,104 71,101' }),
  rightHand: () => el('ellipse', { cx: 15, cy: 114, rx: 7, ry: 9 }),
  leftHand: () => el('ellipse', { cx: 85, cy: 114, rx: 7, ry: 9 }),
  rightLeg: () => el('polygon', { points: '31,126 50,126 48,196 32,196' }),
  leftLeg: () => el('polygon', { points: '50,126 69,126 68,196 52,196' }),
  rightFoot: () => el('polygon', { points: '32,196 48,196 50,209 26,209' }),
  leftFoot: () => el('polygon', { points: '52,196 68,196 74,209 50,209' })
};

export function renderBody(state, { selected = null, onSelect } = {}) {
  const svg = el('svg', { viewBox: '0 0 100 215', role: 'img', 'aria-label': 'Body diagram' });
  const status = regionStatus(state);
  // outline silhouette behind the regions
  svg.append(el('path', { class: 'outline', d: 'M50,6 c-8,0 -13,7 -13,16 c0,7 3,12 7,14 l0,10 l-15,3 l-16,4 l3,51 l12,-3 l0,27 l3,-2 l0,70 l-6,13 l24,0 l-2,-13 l0,-70 l0,70 l-2,13 l24,0 l-6,-13 l0,-70 l3,2 l0,-27 l12,3 l3,-51 l-16,-4 l-15,-3 l0,-10 c4,-2 7,-7 7,-14 c0,-9 -5,-16 -13,-16 z' }));
  for (const r of REGIONS) {
    const shape = SHAPES[r]();
    shape.classList.add('region');
    shape.dataset.region = r;
    const s = status[r];
    if (s) { shape.classList.add(`sev${s.severity}`); if (s.infected) shape.classList.add('infected'); if (s.treated) shape.classList.add('treated'); }
    if (selected === r) shape.classList.add('sel');
    const title = el('title');
    title.textContent = `${REGION_LABEL[r]}${s ? `: ${s.count} injur${s.count > 1 ? 'ies' : 'y'}, severity ${s.severity}${s.infected ? ', INFECTED' : ''}${s.treated ? ', treated' : ''}` : ': unhurt'}`;
    shape.append(title);
    shape.setAttribute('tabindex', '0');
    shape.setAttribute('role', 'button');
    shape.setAttribute('aria-label', title.textContent);
    shape.addEventListener('click', () => onSelect?.(r));
    shape.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect?.(r); } });
    svg.append(shape);
  }
  return svg;
}
