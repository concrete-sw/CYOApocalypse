// A small window manager for the desktop: open, close, focus, drag, resize,
// and a dock of buttons. Each window has a render(body) function that fully
// redraws its content from state.

import { h, clear, $ } from './dom.js';

export class WindowManager {
  constructor(area, dock) {
    this.area = area;
    this.dock = dock;
    this.defs = new Map();
    this.open = new Map();   // id -> { el, body }
    this.z = 10;
    this.cascade = 0;
    this.badges = new Map();
  }

  register(def) { this.defs.set(def.id, def); }

  buildDock(order) {
    clear(this.dock);
    for (const id of order) {
      if (id === '---') { this.dock.append(h('div', { class: 'sep' })); continue; }
      const def = this.defs.get(id);
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
      h('header', { class: 'win-head' },
        h('span', { class: 'ico', 'aria-hidden': 'true' }, def.icon),
        h('span', { class: 'win-title' }, def.title, def.sub ? h('span', { class: 'win-sub' }, def.sub) : null),
        h('button', { type: 'button', title: 'Close', 'aria-label': `Close ${def.title}`, onClick: () => this.close(id) }, '✕')),
      body,
      h('div', { class: 'win-resize', 'aria-hidden': 'true' }));
    const size = def.size || { w: 560, h: 420 };
    const areaW = this.area.clientWidth, areaH = this.area.clientHeight;
    const w = Math.min(size.w, areaW - 10), hgt = Math.min(size.h, areaH - 10);
    const off = (this.cascade++ % 8) * 26;
    el.style.width = `${w}px`; el.style.height = `${hgt}px`;
    el.style.left = `${Math.max(0, Math.min(areaW - w, (def.x ?? 20) + off))}px`;
    el.style.top = `${Math.max(0, Math.min(areaH - hgt, (def.y ?? 16) + off))}px`;
    this.area.append(el);
    this.open.set(id, { el, body, def });
    this.makeDraggable(el, el.querySelector('.win-head'));
    this.makeResizable(el, el.querySelector('.win-resize'));
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

  makeDraggable(el, handle) {
    let sx, sy, ox, oy, dragging = false;
    handle.addEventListener('pointerdown', e => {
      if (e.target.tagName === 'BUTTON' || this.isNarrow()) return;
      dragging = true; sx = e.clientX; sy = e.clientY; ox = el.offsetLeft; oy = el.offsetTop;
      handle.setPointerCapture(e.pointerId);
    });
    handle.addEventListener('pointermove', e => {
      if (!dragging) return;
      const nx = Math.max(0, Math.min(this.area.clientWidth - 60, ox + e.clientX - sx));
      const ny = Math.max(0, Math.min(this.area.clientHeight - 30, oy + e.clientY - sy));
      el.style.left = `${nx}px`; el.style.top = `${ny}px`;
    });
    handle.addEventListener('pointerup', () => { dragging = false; });
    handle.addEventListener('pointercancel', () => { dragging = false; });
  }

  makeResizable(el, grip) {
    let sx, sy, ow, oh, resizing = false;
    grip.addEventListener('pointerdown', e => {
      resizing = true; sx = e.clientX; sy = e.clientY; ow = el.offsetWidth; oh = el.offsetHeight;
      grip.setPointerCapture(e.pointerId); e.preventDefault();
    });
    grip.addEventListener('pointermove', e => {
      if (!resizing) return;
      el.style.width = `${Math.max(300, ow + e.clientX - sx)}px`;
      el.style.height = `${Math.max(180, oh + e.clientY - sy)}px`;
    });
    grip.addEventListener('pointerup', () => { resizing = false; });
  }
}
