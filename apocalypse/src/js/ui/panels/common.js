// Shared bits for panels.

import { h } from '../dom.js';
import { formatTime } from '../../engine/clock.js';

export const tag = (txt, cls = '') => h('span', { class: `tag ${cls}` }, txt);
export const timeOf = at => formatTime(at);

export function vitalBar(label, value, { inverse = false, suffix = '%', max = 100 } = {}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const level = inverse ? (pct > 80 ? 'bad' : pct > 50 ? 'warn' : '') : (pct < 25 ? 'bad' : pct < 50 ? 'warn' : '');
  return h('div', { class: 'vital' }, h('span', { class: 'lbl' }, label), h('div', { class: `bar ${level} ${inverse ? 'hazard' : ''}`, role: 'meter', 'aria-label': label, 'aria-valuenow': Math.round(value), 'aria-valuemin': '0', 'aria-valuemax': String(max) }, h('i', { style: `width:${pct}%` })), h('span', { class: 'val' }, `${Math.round(value)}${suffix}`));
}
export function meter(value, max = 100, cls = '') {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return h('div', { class: 'meter' }, h('div', { class: `bar thin ${cls}` }, h('i', { style: `width:${pct}%` })), h('span', { class: 'muted small' }, `${Math.round(value)}/${max}`));
}
export function kv(pairs) {
  return h('dl', { class: 'kv' }, pairs.filter(p => p && p[1] != null && p[1] !== '').map(([k, v]) => [h('dt', {}, k), h('dd', {}, v)]));
}
/** A selectable list. items: [{ id, title: Node|string, meta: Node|string, tags: Node[] }]. */
export function pickList(items, { selectedId, onSelect, empty = 'Nothing here.' }) {
  const ul = h('ul', { class: 'list' });
  if (!items.length) ul.append(h('li', { class: 'muted' }, empty));
  for (const it of items) {
    const pick = () => onSelect(it.id);
    ul.append(h('li', { class: `clickable ${selectedId === it.id ? 'sel' : ''}`, tabindex: '0', role: 'button', onClick: pick, onKeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } } },
      h('div', {}, it.title, ...(it.tags || [])), it.meta ? h('div', { class: 'meta' }, it.meta) : null));
  }
  return ul;
}
export function section(title, ...kids) { return h('div', {}, h('h3', {}, title), ...kids); }
export function btn(label, onClick, cls = 'small') { return h('button', { class: `btn ${cls}`, type: 'button', onClick }, label); }
