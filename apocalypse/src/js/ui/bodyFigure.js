// The survivor's body as a clean anatomical silhouette, front view, in the
// style of a medical body chart. Regions are tinted by the worst injury they
// carry, pulse when infected, and are dashed when treated.

import { REGIONS, REGION_LABEL, regionStatus } from '../engine/body.js';

const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs = {}) { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; }
const mirror = d => d.replace(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g, (m, x, y) => `${(100 - parseFloat(x)).toFixed(1)},${y}`);

// Viewer's left is the survivor's RIGHT. Shapes are drawn for the survivor's right side and mirrored.
const RIGHT_ARM = 'M31,46.5 C24.5,48 19.5,53 17.5,60 L12.5,99 L21.5,100.5 L25.5,70 C26.5,63 28.5,57 31.5,55 Z';
const RIGHT_LEG = 'M31.5,111 L50,113 L49,152 C48,166 47,183 46.5,199 L36,199 C35,183 33,166 32,152 Z';
const RIGHT_FOOT = 'M35.5,199 L47,199 L48.5,205.5 L45,210.5 L29.5,210.5 L30.5,205 Z';
const SHAPES = {
  head: () => el('path', { d: 'M50,5.5 C57.5,5.5 62.5,12 62.5,21 C62.5,30.5 57,36.5 50,36.5 C43,36.5 37.5,30.5 37.5,21 C37.5,12 42.5,5.5 50,5.5 Z' }),
  neck: () => el('path', { d: 'M45.5,35 L54.5,35 L56,44 L44,44 Z' }),
  torso: () => el('path', { d: 'M32,46 C39,42.5 61,42.5 68,46 L71.5,52 C72.5,62 71.5,72 70,82 L30,82 C28.5,72 27.5,62 28.5,52 Z' }),
  abdomen: () => el('path', { d: 'M30,82 L70,82 C70,91 69,101 66.5,109.5 C58.5,113.5 41.5,113.5 33.5,109.5 C31,101 30,91 30,82 Z' }),
  rightArm: () => el('path', { d: RIGHT_ARM }),
  leftArm: () => el('path', { d: mirror(RIGHT_ARM) }),
  rightHand: () => el('path', { d: 'M12,101 L22,102.5 L21.5,113 C21,118 13,118 12.5,113 Z' }),
  leftHand: () => el('path', { d: mirror('M12,101 L22,102.5 L21.5,113 C21,118 13,118 12.5,113 Z') }),
  rightLeg: () => el('path', { d: RIGHT_LEG }),
  leftLeg: () => el('path', { d: mirror(RIGHT_LEG) }),
  rightFoot: () => el('path', { d: RIGHT_FOOT }),
  leftFoot: () => el('path', { d: mirror(RIGHT_FOOT) })
};

export function renderBody(state, { selected = null, onSelect } = {}) {
  const svg = el('svg', { viewBox: '0 0 100 215', role: 'img', 'aria-label': 'Body diagram' });
  const status = regionStatus(state);
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
  // Faint anatomical contours: clavicles and the midline.
  for (const d of ['M37,47.5 Q50,52.5 63,47.5', 'M50,53 L50,110', 'M43,82 Q50,85 57,82']) svg.append(el('path', { class: 'contour', d }));
  return svg;
}
