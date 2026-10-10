// Status: vitals, conditions, the body figure, injuries and treatment, the clock and pending tasks.

import { h, append } from '../dom.js';
import { tag, vitalBar, kv, timeOf, btn } from './common.js';
import { renderBody } from '../bodyFigure.js';
import { REGION_LABEL, treatmentTagsFor, conditions } from '../../engine/body.js';
import { formatTime, phaseOf, daysLeft } from '../../engine/clock.js';
import { DOOM_LABEL } from '../../engine/state.js';
import { getLocation } from '../../engine/world.js';

export function registerStatus(app, { S, reg, readOnly }) {
  reg({
    id: 'status', sub: 'VITALS & BODY', title: 'Status', icon: '♥', size: { w: 620, h: 560 }, x: 700, y: 12,
    render(body) {
      const s = S(); const v = s.vitals; const t = s.truth;
      const loc = getLocation(s, s.location);
      append(body,
        h('div', { class: 'card-head' }, h('span', { class: `banner ${s.doom >= 4 ? 'bad' : s.doom >= 3 ? 'warn' : ''}` }, `DOOM ${s.doom}/5 · ${DOOM_LABEL[s.doom]}`), h('span', { class: 'muted small' }, `${formatTime(s.clock.minutes)} · ${phaseOf(s.clock.minutes)} · ${s.weather.today?.label || ''}`)),
        kv([
          ['Where', `${loc?.name || '?'}${s.shelter?.locationId === s.location ? ' (your shelter)' : ''}`],
          ['Mode', s.mode === 'base' ? `Base at ${getLocation(s, s.shelter.locationId)?.name}` : 'Nomad (no fixed shelter)'],
          ['Deadline', `Day ${s.clock.deadlineDay} · ${daysLeft(s)} day${daysLeft(s) === 1 ? '' : 's'} left`],
          ['Threat', `${s.threat.level}/5${(s.threat.local[s.location] || 0) > 0 ? ` (+${s.threat.local[s.location]} here)` : ''}`]
        ]),
        h('div', { class: 'vitals' },
          vitalBar('Health', v.health), vitalBar('Hunger', v.hunger), vitalBar('Thirst', v.thirst), vitalBar('Fatigue', v.fatigue),
          vitalBar('Warmth', v.warmth), vitalBar('Morale', v.morale), vitalBar(t.apocalypse?.hazardName || 'Hazard', v.hazard, { inverse: true })),
        h('p', { class: 'muted small', style: 'margin:0 0 6px' }, `${t.apocalypse?.hazardName || 'Hazard'}: ${t.apocalypse?.hazardDescription || 'apocalypse-specific exposure'}`),
        h('div', { class: 'conds' }, conditions(s).length ? conditions(s).map(c => tag(c, /critical|starv|dehyd|hypo|collaps|infect|despair/.test(c) ? 'bad' : 'warn')) : tag('no acute conditions', 'ok'))
      );
      // body + injuries
      const injuries = s.body.injuries;
      const selectedRegion = app.selected.region;
      const figure = h('div', { class: 'body-fig' }, renderBody(s, { selected: selectedRegion, onSelect: r => { app.selected.region = app.selected.region === r ? null : r; app.wm.refresh('status'); } }));
      const right = h('div', {});
      append(right, h('h3', {}, `Injuries (${injuries.length})`));
      const shown = selectedRegion ? injuries.filter(i => i.region === selectedRegion) : injuries;
      if (selectedRegion) append(right, h('p', { class: 'muted small' }, `${REGION_LABEL[selectedRegion]} selected. `, h('a', { href: '#', onClick: e => { e.preventDefault(); app.selected.region = null; app.wm.refresh('status'); } }, 'show all')));
      if (!shown.length) append(right, h('p', { class: 'muted small' }, selectedRegion ? 'Nothing wrong there.' : 'No injuries.'));
      for (const inj of shown) {
        const tags = treatmentTagsFor(inj);
        const meds = s.inventory.items.filter(it => it.category === 'medical' && it.tags.some(tg => tags.includes(tg)) && (inj.infected ? it.tags.includes('antibiotic') : !it.tags.includes('antibiotic') || tags.length === 1));
        const sel = h('select', { 'aria-label': 'Treatment' }, meds.map(m => h('option', { value: m.id }, `${m.name}${m.qty > 1 ? ` ×${m.qty}` : ''}`)));
        append(right, h('div', { class: 'entry notice', style: 'color:inherit' },
          h('div', { class: 'who' }, `${REGION_LABEL[inj.region]} · ${inj.type} · severity ${inj.severity}`, inj.infected ? tag('infected', 'bad') : null, inj.treated ? tag('treated', 'ok') : tag('untreated', 'warn')),
          h('div', { class: 'small muted' }, `Healing ${Math.round(inj.progress)}% · since ${timeOf(inj.at)}${inj.infected ? ' · needs antibiotics' : inj.treated ? '' : ` · needs ${tags.filter(x => x !== 'antibiotic').join(' or ')}`}`),
          readOnly() || (!inj.infected && inj.treated) ? null : h('div', { class: 'row tight' }, meds.length ? [sel, btn('Treat', () => app.treat(inj.id, sel.value))] : h('span', { class: 'warn small' }, 'No suitable treatment in your pack.'))));
      }
      if (s.body.illness) {
        const ill = s.body.illness;
        const anti = s.inventory.items.find(it => it.tags.includes('antibiotic'));
        append(right, h('h3', {}, 'Illness'), h('div', { class: 'entry notice', style: 'color:inherit' }, h('div', { class: 'who' }, `${ill.name} · severity ${ill.severity}`, ill.treated ? tag('treated', 'ok') : tag('untreated', 'bad')),
          readOnly() || ill.treated ? null : h('div', { class: 'row tight' }, anti ? btn(`Take ${anti.name}`, () => app.useItem(anti.id)) : h('span', { class: 'warn small' }, 'Antibiotics would help. Rest, clean water and food help a little.'))));
      }
      append(right, h('div', { class: 'legend' }, h('span', {}, h('i', { class: 's1' }), 'minor'), h('span', {}, h('i', { class: 's2' }), 'serious'), h('span', {}, h('i', { class: 's3' }), 'critical'), h('span', {}, 'dashed = treated, pulsing = infected')));
      append(body, h('div', { class: 'body-wrap' }, figure, right));
      // pending
      append(body, h('h3', {}, `Pending (${s.pending.length})`));
      if (!s.pending.length) append(body, h('p', { class: 'muted small' }, 'Nothing resolving later. Companion tasks and long jobs appear here.'));
      else append(body, h('ul', { class: 'small' }, s.pending.map(p => h('li', {}, `${p.label} · ready ${formatTime(p.readyAt)}`))));
      if (!readOnly()) append(body, h('div', { class: 'row' }, btn('Take stock', () => app.takeStock())));
    }
  });
}
