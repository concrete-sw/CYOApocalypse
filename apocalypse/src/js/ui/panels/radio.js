// Radio: tune, scan, known frequencies, and the log of everything heard.

import { h, append } from '../dom.js';
import { tag, timeOf, btn } from './common.js';
import { freqLabel } from '../../engine/radio.js';

export function registerRadio(app, { S, reg, readOnly }) {
  reg({
    id: 'radio', sub: 'RECEIVER', title: 'Radio', icon: '⌁', size: { w: 600, h: 500 }, x: 240, y: 90,
    render(body) {
      const s = S();
      body.classList.add('col');
      const input = h('input', { type: 'text', placeholder: 'frequency, e.g. 162.400 or 1610', 'aria-label': 'Frequency', value: s.radio.lastTuned || '' });
      const go = () => { const v = input.value.trim(); if (!v) return; s.radio.lastTuned = v; app.tune(v); };
      input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
      append(body, h('p', { class: 'muted small', style: 'margin:0 0 6px' }, 'The radio is your main source of intelligence, and some of it lies. Tuning takes 30 minutes; a scan sweeps the bands for 45. Broadcasts keep schedules: a dead frequency by day may be alive at night.'));
      if (!readOnly()) append(body, h('div', { class: 'row tight' }, input, btn('Tune', go, 'small primary'), btn('Scan', () => app.scan())));
      if (s.radio.knownFreqs.length) append(body, h('div', { class: 'chip-row' }, h('span', { class: 'muted small' }, 'Known:'), s.radio.knownFreqs.map(f => btn(freqLabel(f), () => { s.radio.lastTuned = String(f); app.tune(String(f)); }, 'small ghost'))));
      const log = h('div', { class: 'log-stream' });
      const entries = [...s.radio.log].reverse();
      if (!entries.length) append(log, h('p', { class: 'muted small' }, 'Nothing logged yet.'));
      for (const e of entries) append(log, h('div', { class: `entry radio` }, h('div', { class: 'who' }, `${timeOf(e.at)} · ${freqLabel(e.freq)}${e.owner ? ` · ${e.owner}` : ''}`, e.kind && e.kind !== 'broadcast' ? tag(e.kind) : null), h('div', { class: 'narr small' }, e.text)));
      append(body, h('h3', {}, `Log (${s.radio.log.length})`), log);
    }
  });
}
