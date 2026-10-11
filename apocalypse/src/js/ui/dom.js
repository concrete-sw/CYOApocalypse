// Tiny DOM helpers.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Append children, skipping null/false (Element.append(null) would render the text "null"). */
export function append(el, ...kids) {
  for (const k of kids.flat(Infinity)) { if (k == null || k === false) continue; el.append(k instanceof Node ? k : document.createTextNode(String(k))); }
  return el;
}

export function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }

let toastRoot;
export function toast(text, kind = '', ms = 5000) {
  toastRoot = toastRoot || $('#toasts');
  const t = h('div', { class: `toast ${kind}`, role: 'status' }, text);
  toastRoot.append(t);
  setTimeout(() => t.remove(), ms);
}

export function modal(content, { buttons = [{ label: 'OK', value: true }], title } = {}) {
  const dlg = $('#modal');
  const body = clear($('#modalBody'));
  if (title) body.append(h('h2', {}, title));
  body.append(typeof content === 'string' ? h('div', { class: 'narr' }, content) : content);
  return new Promise(resolve => {
    const row = h('div', { class: 'row' });
    for (const b of buttons) row.append(h('button', { class: `btn ${b.primary ? 'primary' : 'ghost'} ${b.danger ? 'danger' : ''}`, type: 'button', onClick: () => { dlg.close(); resolve(b.value); } }, b.label));
    body.append(row);
    dlg.addEventListener('cancel', () => resolve(null), { once: true });
    dlg.showModal();
    row.querySelector('button')?.focus();
  });
}

export function fmtMins(at, startISO) {
  const d = new Date(startISO); d.setMinutes(d.getMinutes() + at);
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
