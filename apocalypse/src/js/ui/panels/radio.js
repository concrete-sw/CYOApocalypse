// Radio: the receiver (tune, scan, known frequencies, the log of everything
// heard) and the walkie-talkie (short-range calls). The panel only exists
// while the survivor actually has one or the other.

import { h, append } from '../dom.js';
import { tag, timeOf, btn } from './common.js';
import { freqLabel, walkieReach } from '../../engine/radio.js';
import { gearAvailable } from '../../engine/state.js';
import { getLocation } from '../../engine/world.js';

export function registerRadio(app, { S, reg, readOnly }) {
  reg({
    id: 'radio', sub: 'RECEIVER', title: 'Radio', icon: '⌁', size: { w: 600, h: 520 }, x: 240, y: 90,
    render(body) {
      const s = S();
      body.classList.add('col');
      const gear = gearAvailable(s);
      if (!gear.radio && !gear.walkie) {
        append(body, h('p', { class: 'muted' }, 'You have no radio and no walkie-talkie. Find one, or take the one from home, and this panel wakes up.'));
        return;
      }
      if (gear.radio) {
        const radio = [...s.inventory.items, ...(s.shelter?.stash || [])].find(i => i.tags.includes('radio'));
        const input = h('input', { type: 'text', placeholder: 'frequency, e.g. 162.400 or 1610', 'aria-label': 'Frequency', value: s.radio.lastTuned || '' });
        const go = () => { const v = input.value.trim(); if (!v) return; s.radio.lastTuned = v; app.tune(v); };
        input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
        append(body, h('p', { class: 'muted small', style: 'margin:0 0 6px' }, `${radio ? radio.name : 'The radio'}: your main source of intelligence, and some of it lies. Tuning takes 30 minutes; a scan sweeps the bands for 45. Broadcasts keep schedules: a dead frequency by day may be alive at night.`));
        if (!readOnly()) append(body, h('div', { class: 'row tight' }, input, btn('Tune', go, 'small primary'), btn('Scan', () => app.scan())));
        if (s.radio.knownFreqs.length) append(body, h('div', { class: 'chip-row' }, h('span', { class: 'muted small' }, 'Known:'), s.radio.knownFreqs.map(f => btn(freqLabel(f), () => { s.radio.lastTuned = String(f); app.tune(String(f)); }, 'small ghost'))));
      }
      if (gear.walkie) {
        const reach = walkieReach(s, () => 1);
        const q = h('input', { type: 'text', placeholder: 'What you say into the walkie-talkie', 'aria-label': 'Transmission' });
        const send = () => { const v = q.value.trim(); if (!v) return; q.value = ''; app.call(v); };
        q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); send(); } });
        append(body, h('h3', {}, 'Walkie-talkie'),
          h('p', { class: 'muted small', style: 'margin:0 0 4px' }, `Short range: about ${reach.rangeKm} km from ${getLocation(s, s.location)?.name || 'here'}. It reaches companions you gave a paired unit to, and anyone else listening nearby. ${reach.companions.length ? `In range: ${reach.companions.map(c => `${c.name} (${c.locationName})`).join(', ')}.` : 'No companion with a paired unit is in range.'}${reach.factions.length ? ` ${reach.factions.map(f => f.name).join(' and ')} have people within range.` : ''}`),
          readOnly() ? null : h('div', { class: 'row tight' }, q, btn('Transmit', send, 'small primary')));
      }
      const log = h('div', { class: 'log-stream' });
      const entries = [...s.radio.log].reverse();
      if (!entries.length) append(log, h('p', { class: 'muted small' }, 'Nothing logged yet.'));
      for (const e of entries) append(log, h('div', { class: 'entry radio' }, h('div', { class: 'who' }, `${timeOf(e.at)} · ${e.kind === 'call' ? 'walkie-talkie' : freqLabel(e.freq)}${e.owner ? ` · ${e.owner}` : ''}`, e.kind && e.kind !== 'broadcast' ? tag(e.kind) : null), h('div', { class: 'narr small' }, e.text)));
      append(body, h('h3', {}, `Log (${s.radio.log.length})`), log);
    }
  });
}
