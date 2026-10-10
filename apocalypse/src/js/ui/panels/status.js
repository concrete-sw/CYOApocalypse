// Status: vitals, conditions, the body figure, injuries and treatment, the clock and pending tasks. Compact by design.

import { h, append } from '../dom.js';
import { tag, vitalBar, timeOf, btn } from './common.js';
import { renderBody } from '../bodyFigure.js';
import { REGION_LABEL, treatmentTagsFor, conditions } from '../../engine/body.js';
import { formatTime, phaseOf, daysLeft } from '../../engine/clock.js';
import { DOOM_LABEL } from '../../engine/state.js';
import { getLocation } from '../../engine/world.js';

export function registerStatus(app, { S, reg, readOnly }) {
  reg({
    id: 'status', sub: 'VITALS & BODY', title: 'Status', icon: '♥', size: { w: 560, h: 580 }, x: 700, y: 12,
    render(body) {
      const s = S(); const v = s.vitals; const t = s.truth;
      const loc = getLocation(s, s.location);
      const left = daysLeft(s);
      append(body,
        h('div', { class: 'card-head', style: 'margin-bottom:4px' }, h('span', { class: `banner ${s.doom >= 4 ? 'bad' : s.doom >= 3 ? 'warn' : ''}` }, `DOOM ${s.doom}/5 · ${DOOM_LABEL[s.doom]}`), h('span', { class: 'muted small' }, `${formatTime(s.clock.minutes)} · ${phaseOf(s.clock.minutes)} · ${s.weather.today?.label || ''}`)),
        h('p', { class: 'small muted', style: 'margin:0 0 6px' }, `${loc?.name || '?'}${s.shelter?.locationId === s.location ? ' (your shelter)' : ''} · ${s.mode === 'base' ? `base at ${getLocation(s, s.shelter.locationId)?.name}` : 'nomad'} · deadline day ${s.clock.deadlineDay}, ${left} day${left === 1 ? '' : 's'} left · threat ${s.threat.level}/5${(s.threat.local[s.location] || 0) > 0 ? ` (+${s.threat.local[s.location]} here)` : ''}`),
        h('div', { class: 'vitals two' },
          vitalBar('Health', v.health), vitalBar('Morale', v.morale), vitalBar('Hunger', v.hunger), vitalBar('Thirst', v.thirst),
          vitalBar('Fatigue', v.fatigue), vitalBar('Warmth', v.warmth), vitalBar(t.apocalypse?.hazardName || 'Hazard', v.hazard, { inverse: true })),
        h('div', { class: 'conds' }, conditions(s).length ? conditions(s).map(c => tag(c, /critical|starv|dehyd|hypo|collaps|infect|despair/.test(c) ? 'bad' : 'warn')) : tag('no acute conditions', 'ok'))
      );
      const injuries = s.body.injuries;
      const selectedRegion = app.selected.region;
      const figure = h('div', { class: 'body-fig' }, renderBody(s, { selected: selectedRegion, onSelect: r => { app.selected.region = app.selected.region === r ? null : r; app.wm.refresh('status'); } }));
      const right = h('div', { class: 'injuries' });
      const shown = selectedRegion ? injuries.filter(i => i.region === selectedRegion) : injuries;
      append(right, h('h3', { style: 'margin-top:0' }, `Injuries (${injuries.length})`, selectedRegion ? h('span', { class: 'muted' }, ` · ${REGION_LABEL[selectedRegion]} `, h('a', { href: '#', onClick: e => { e.preventDefault(); app.selected.region = null; app.wm.refresh('status'); } }, 'all')) : null));
      if (!shown.length) append(right, h('p', { class: 'muted small' }, selectedRegion ? 'Nothing wrong there.' : 'No injuries. Click a body part to inspect it.'));
      for (const inj of shown) {
        const tags = treatmentTagsFor(inj);
        const meds = s.inventory.items.filter(it => it.category === 'medical' && it.tags.some(tg => tags.includes(tg)) && (inj.infected ? it.tags.includes('antibiotic') : !it.tags.includes('antibiotic') || tags.length === 1));
        const sel = h('select', { 'aria-label': 'Treatment' }, meds.map(m => h('option', { value: m.id }, `${m.name}${m.qty > 1 ? ` ×${m.qty}` : ''}`)));
        append(right, h('div', { class: 'injury' },
          h('div', { class: 'who' }, `${REGION_LABEL[inj.region]} · ${inj.type} · sev ${inj.severity}`, inj.infected ? tag('infected', 'bad') : null, inj.treated ? tag('treated', 'ok') : tag('untreated', 'warn')),
          h('div', { class: 'small muted' }, `healing ${Math.round(inj.progress)}% · since ${timeOf(inj.at)}${inj.infected ? ' · needs antibiotics' : inj.treated ? '' : ` · needs ${tags.filter(x => x !== 'antibiotic').join(' or ')}`}`),
          readOnly() || (!inj.infected && inj.treated) ? null : h('div', { class: 'row tight' }, meds.length ? [sel, btn('Treat', () => app.treat(inj.id, sel.value))] : h('span', { class: 'warn small' }, 'No suitable treatment in your pack.'))));
      }
      if (s.body.illness) {
        const ill = s.body.illness;
        const anti = s.inventory.items.find(it => it.tags.includes('antibiotic'));
        append(right, h('div', { class: 'injury' }, h('div', { class: 'who' }, `Illness · ${ill.name} · sev ${ill.severity}`, ill.treated ? tag('treated', 'ok') : tag('untreated', 'bad')),
          readOnly() || ill.treated ? null : h('div', { class: 'row tight' }, anti ? btn(`Take ${anti.name}`, () => app.useItem(anti.id)) : h('span', { class: 'warn small' }, 'Antibiotics would help. Rest, clean water and food help a little.'))));
      }
      append(right, h('div', { class: 'legend' }, h('span', {}, h('i', { class: 's1' }), 'minor'), h('span', {}, h('i', { class: 's2' }), 'serious'), h('span', {}, h('i', { class: 's3' }), 'critical'), h('span', {}, 'dashed = treated · pulsing = infected')));
      append(body, h('div', { class: 'body-wrap' }, figure, right));
      append(body, h('p', { class: 'small muted', style: 'margin:6px 0 0' }, h('b', {}, `Pending (${s.pending.length}): `), s.pending.length ? s.pending.map(p => `${p.label} · ready ${formatTime(p.readyAt)}`).join(' | ') : 'nothing resolving later.'),
        readOnly() ? null : h('div', { class: 'row tight' }, btn('Take stock', () => app.takeStock())));
    }
  });
}
