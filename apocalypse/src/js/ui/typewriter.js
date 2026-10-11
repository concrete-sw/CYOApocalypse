// Streams text into an element with a typewriter effect. The source text may
// keep growing while we type (streaming); we simply chase the target.

export class Typewriter {
  constructor(el, { speedMs = 12, reduceMotion = false } = {}) {
    this.el = el;
    this.speedMs = speedMs;
    this.reduceMotion = reduceMotion;
    this.target = '';
    this.shown = 0;
    this.done = false;
    this.timer = null;
    this.el.classList.add('cursor');
  }
  update(text) {
    this.target = text;
    if (this.reduceMotion || this.speedMs <= 0) { this.el.textContent = text; this.shown = text.length; return; }
    if (!this.timer) this.tick();
  }
  tick() {
    const step = () => {
      if (this.shown < this.target.length) {
        // Speed up when far behind so long replies do not drag.
        const lag = this.target.length - this.shown;
        const n = lag > 400 ? 8 : lag > 120 ? 3 : 1;
        this.shown = Math.min(this.target.length, this.shown + n);
        this.el.textContent = this.target.slice(0, this.shown);
        this.el.scrollIntoView?.({ block: 'nearest' });
        this.timer = setTimeout(step, this.speedMs);
      } else if (this.done) {
        this.timer = null;
        this.el.classList.remove('cursor');
      } else {
        this.timer = setTimeout(step, 60);
      }
    };
    step();
  }
  finish(text) {
    if (text != null) this.target = text;
    this.done = true;
    if (this.reduceMotion || this.speedMs <= 0) {
      this.el.textContent = this.target; this.shown = this.target.length;
      clearTimeout(this.timer); this.timer = null; this.el.classList.remove('cursor');
    } else if (!this.timer) this.tick();
  }
  skip() {
    clearTimeout(this.timer); this.timer = null;
    this.el.textContent = this.target; this.shown = this.target.length;
    if (this.done) this.el.classList.remove('cursor'); else this.tick();
  }
}
