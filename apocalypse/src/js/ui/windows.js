// A small window manager for the desktop: open, close, focus, drag, resize,
// maximize, remembered geometry, a dock of buttons, and tiling. Each window
// has a render(body) function that fully redraws its content from state.

import { h, clear, $ } from './dom.js';

export class WindowManager {
  constructor(area, dock, { geometry = {}, onGeometry = null } = {}) {
    this.area = area;
    this.dock = dock;
    this.defs = new Map();
    this.open = new Map();   // id -> { el, body, def, restore }
    this.z = 10;
    this.cascade = 0;
    this.geometry = geometry;      // id -> { x, y, w, h } remembered across sessions
    this.onGeometry = onGeometry;
  }

  register(def) { this.defs.set(def.id, def); }

  /** order: panel ids, '---' separators, or action ids present in `actions`. */
  buildDock(order, actions = {}) {
    clear(this.dock);
    for (const id of order) {
      if (id === '---') { this.dock.append(h('div', { class: 'sep' })); continue; }
      if (actions[id]) {
        this.dock.append(h('button', { type: 'button', class: 'action', title: actions[id].title, 'aria-label': actions[id].title, onClick: actions[id].run },
          h('span', { class: 'ico', 'aria-hidden': 'true' }, actions[id].icon), h('span', { class: 'lbl' }, actions[id].title)));
        continue;
      }
      const def = this.defs.get(id);
      if (!def) continue;
      const btn = h('button', { type: 'button', dataset: { win: id }, title: def.title, 'aria-label': def.title, onClick: () => this.toggle(id) },
        h('span', { class: 'ico', 'aria-hidden': 'true' }, def.icon), h('span', { class: 'lbl' }, def.title), h('span', { class: 'badge hidden' }));
      this.dock.append(btn);
    }
  }

  setBadge(id, n) {
    const b = this.dock.querySelector(`[data-win="${id}"] .badge`);
    if (!b) return;
    if (n > 0) { b.textContent = n; b.classList.remove('hidden'); } else b.classList.add('hidden');
  }

  isOpen(id) { return this.open.has(id); }

  /** Panels that depend on gear (the radio) appear in the dock only while the gear is there; an open window closes when it goes. */
  setAvailable(id, on) {
    const b = this.dock.querySelector(`[data-win="${id}"]`);
    if (b) b.classList.toggle('unavailable', !on);
    if (!on && this.open.has(id)) this.close(id);
  }

  toggle(id) {
    if (this.open.has(id)) {
      const w = this.open.get(id);
      if (w.el.classList.contains('focused') && !this.isNarrow()) this.close(id); else this.focus(id);
    } else this.show(id);
  }

  show(id, opts = {}) {
    const def = this.defs.get(id);
    if (!def) return;
    if (this.open.has(id)) { this.focus(id); if (opts.refresh !== false) this.refresh(id); return this.open.get(id); }
    const body = h('div', { class: 'win-body', tabindex: '0' });
    const el = h('section', { class: 'win', role: 'dialog', 'aria-label': def.title, dataset: { win: id } },
      h('header', { class: 'win-head', onDblclick: e => { if (e.target.tagName !== 'BUTTON') this.toggleMax(id); } },
        h('span', { class: 'ico', 'aria-hidden': 'true' }, def.icon),
        h('span', { class: 'win-title' }, def.title, def.sub ? h('span', { class: 'win-sub' }, def.sub) : null),
        h('button', { type: 'button', class: 'win-max', title: 'Maximize / restore', 'aria-label': `Maximize ${def.title}`, onClick: () => this.toggleMax(id) }, '▢'),
        h('button', { type: 'button', class: 'win-close', title: 'Close', 'aria-label': `Close ${def.title}`, onClick: () => this.close(id) }, '✕')),
      body,
      h('div', { class: 'win-resize', 'aria-hidden': 'true' }));
    const areaW = this.area.clientWidth, areaH = this.area.clientHeight;
    const size = def.size || { w: 560, h: 420 };
    const saved = this.geometry[id];
    const w = Math.min(saved?.w || size.w, areaW - 10), hgt = Math.min(saved?.h || size.h, areaH - 10);
    const off = saved ? 0 : (this.cascade++ % 8) * 26;
    el.style.width = `${w}px`; el.style.height = `${hgt}px`;
    el.style.left = `${Math.max(0, Math.min(areaW - w, (saved?.x ?? def.x ?? 20) + off))}px`;
    el.style.top = `${Math.max(0, Math.min(areaH - hgt, (saved?.y ?? def.y ?? 16) + off))}px`;
    this.area.append(el);
    this.open.set(id, { el, body, def, restore: null });
    this.makeDraggable(id, el, el.querySelector('.win-head'));
    this.makeResizable(id, el, el.querySelector('.win-resize'));
    el.addEventListener('pointerdown', () => this.focus(id), true);
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { this.close(id); } });
    this.focus(id);
    this.refresh(id);
    this.dock.querySelector(`[data-win="${id}"]`)?.classList.add('open');
    return this.open.get(id);
  }

  refresh(id) {
    const w = this.open.get(id);
    if (!w) return;
    const scroll = w.body.scrollTop;
    clear(w.body);
    w.body.className = 'win-body';
    try { w.def.render(w.body, w); } catch (err) { w.body.append(h('p', { class: 'danger' }, `Render error: ${err.message}`)); console.error(err); }
    w.body.scrollTop = scroll;
  }

  refreshAll() { for (const id of this.open.keys()) this.refresh(id); }

  focus(id) {
    const w = this.open.get(id);
    if (!w) return;
    for (const o of this.open.values()) o.el.classList.remove('focused');
    for (const b of this.dock.querySelectorAll('button')) b.classList.remove('active');
    w.el.classList.add('focused');
    w.el.style.zIndex = String(++this.z);
    this.dock.querySelector(`[data-win="${id}"]`)?.classList.add('active');
    this.setBadge(id, 0);
  }

  close(id) {
    const w = this.open.get(id);
    if (!w) return;
    w.el.remove();
    this.open.delete(id);
    this.dock.querySelector(`[data-win="${id}"]`)?.classList.remove('open', 'active');
    const last = [...this.open.keys()].pop();
    if (last) this.focus(last);
    $('#cmdInput')?.focus();
  }

  closeAll() { for (const id of [...this.open.keys()]) this.close(id); }

  isNarrow() { return window.matchMedia('(max-width: 900px)').matches; }

  toggleMax(id) {
    const w = this.open.get(id);
    if (!w || this.isNarrow()) return;
    if (w.el.classList.contains('max')) {
      w.el.classList.remove('max');
      if (w.restore) Object.assign(w.el.style, w.restore);
      w.restore = null;
    } else {
      w.restore = { left: w.el.style.left, top: w.el.style.top, width: w.el.style.width, height: w.el.style.height };
      w.el.classList.add('max');
    }
    this.focus(id);
    this.refresh(id);
  }

  /** Arrange every open window in a grid that fills the area. */
  tile() {
    if (this.isNarrow()) return;
    const ids = [...this.open.keys()];
    if (!ids.length) return;
    const cols = Math.ceil(Math.sqrt(ids.length)), rows = Math.ceil(ids.length / cols);
    const W = this.area.clientWidth / cols, H = this.area.clientHeight / rows;
    ids.forEach((id, i) => {
      const w = this.open.get(id);
      w.el.classList.remove('max'); w.restore = null;
      const c = i % cols, r = Math.floor(i / cols);
      Object.assign(w.el.style, { left: `${Math.round(c * W)}px`, top: `${Math.round(r * H)}px`, width: `${Math.round(W) - 4}px`, height: `${Math.round(H) - 4}px` });
      this.remember(id);
      this.refresh(id);
    });
  }

  remember(id) {
    const w = this.open.get(id);
    if (!w || w.el.classList.contains('max')) return;
    const g = { x: w.el.offsetLeft, y: w.el.offsetTop, w: w.el.offsetWidth, h: w.el.offsetHeight };
    this.geometry[id] = g;
    this.onGeometry?.(id, g);
  }

  forgetGeometry() { this.geometry = {}; }

  makeDraggable(id, el, handle) {
    let sx, sy, ox, oy, dragging = false;
    handle.addEventListener('pointerdown', e => {
      if (e.target.tagName === 'BUTTON' || this.isNarrow() || el.classList.contains('max')) return;
      dragging = true; sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', e => {
      if (!dragging) return;
      const nx = Math.max(0, Math.min(this.area.clientWidth - 60, ox + e.clientX - sx));
      const ny = Math.max(0, Math.min(this.area.clientHeight - 30, oy + e.clientY - sy));
      el.style.left = `${nx}px`; el.style.top = `${ny}px`;
    });
    const end = () => { if (dragging) { dragging = false; this.remember(id); } };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  makeResizable(id, el, grip) {
    let sx, sy, ow, oh, resizing = false;
    grip.addEventListener('pointerdown', e => {
      if (el.classList.contains('max')) return;
      resizing = true; sx = e.clientX; sy = e.clientY; ow = el.offsetWidth; oh = el.offsetHeight;
      grip.setPointerCapture(e.pointerId); e.preventDefault();
    });
    grip.addEventListener('pointermove', e => {
      if (!resizing) return;
      el.style.width = `${Math.max(300, ow + e.clientX - sx)}px`;
      el.style.height = `${Math.max(180, oh + e.clientY - sy)}px`;
    });
    const end = () => { if (resizing) { resizing = false; this.remember(id); this.refresh(id); } };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }
}
