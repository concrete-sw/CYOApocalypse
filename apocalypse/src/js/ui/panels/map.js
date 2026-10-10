// Map: the region, known locations, travel, search, claim shelter, trade.

import { h, append } from '../dom.js';
import { tag, kv, pickList, btn } from './common.js';
import { renderMap } from '../mapView.js';
import { getLocation, locState, effectiveDanger } from '../../engine/world.js';
import { travelPlan } from '../../engine/encounters.js';
import { holderOf, standingLabel } from '../../engine/factions.js';
import { formatDuration, isNight } from '../../engine/clock.js';

const RES_LABEL = { food: 'food', water: 'water', medical: 'medical', fuel: 'fuel', materials: 'materials', weapons: 'weapons' };

export function registerMap(app, { S, reg, readOnly }) {
  reg({
    id: 'map', sub: 'REGION', title: 'Map', icon: '⌖', size: { w: 820, h: 600 }, x: 120, y: 30,
    render(body) {
      const s = S();
      const ids = s.discovered.locations;
      if (!app.selected.location || !ids.includes(app.selected.location)) app.selected.location = s.location;
      const sel = app.selected.location;
      const map = h('div', { class: 'map' }, renderMap(s, { selected: sel, onSelect: id => { app.selected.location = id; app.wm.refresh('map'); } }));
      const list = pickList(ids.map(id => { const l = getLocation(s, id); const ls = s.locationState[id]; const visited = (ls?.visits || 0) > 0 || ls?.scouted; return { id, title: l.name, meta: `${l.type}${visited ? ` · danger ${Math.round(effectiveDanger(s, id))}/5` : ' · unvisited'}`, tags: [id === s.location ? tag('here', 'ok') : null, s.shelter?.locationId === id ? tag('shelter', 'info') : null, s.caches[id]?.length ? tag('cache', 'info') : null] }; }), { selectedId: sel, onSelect: id => { app.selected.location = id; app.wm.refresh('map'); } });
      const detail = h('div', { class: 'detail' });
      const l = getLocation(s, sel);
      if (l) {
        const ls = locState(s, l.id); const visited = ls.visits > 0 || ls.scouted; const holder = holderOf(s, l.id);
        const here = l.id === s.location;
        const plan = here ? null : travelPlan(s, l.id);
        append(detail, h('h2', {}, l.name, here ? tag('you are here', 'ok') : null),
          kv([
            ['Type', l.type],
            ['Danger', visited ? `${Math.round(effectiveDanger(s, l.id))}/5` : 'unknown until visited or scouted'],
            ['Held by', visited ? (holder ? `${holder.name}${s.factions[holder.id]?.known ? ` (${standingLabel(s.factions[holder.id].standing)})` : ''}` : 'nobody, as far as you can tell') : '?'],
            ['Shelter', visited ? (l.shelterQuality >= 3 ? `good (${l.shelterQuality}/5)` : l.shelterQuality >= 1 ? `poor (${l.shelterQuality}/5)` : 'not livable') : '?'],
            ['Searched', ls.searched.length ? [...new Set(ls.searched)].join(', ') : 'nothing yet'],
            ['Found here', ls.hiddenFound.length ? ls.hiddenFound.map(i => l.hidden[i]?.what).join('; ') : null],
            ['Travel', plan ? `${Math.round(plan.distance)} km · about ${formatDuration(plan.minutes)} · risk ${plan.risk < 20 ? 'low' : plan.risk < 45 ? 'moderate' : plan.risk < 70 ? 'high' : 'extreme'}${isNight(s.clock.minutes) ? ' · NIGHT' : ''}` : null]
          ]));
        if (visited) append(detail, h('p', { class: 'narr small' }, l.description), l.travelNotes ? h('p', { class: 'muted small' }, l.travelNotes) : null);
        else append(detail, h('p', { class: 'muted' }, 'You have not been here. You know it exists.'));
        if (ls.searched.length) append(detail, h('p', { class: 'small' }, 'What seems left here: ', Object.entries(ls.resources).map(([k, v]) => tag(`${RES_LABEL[k]} ${'●'.repeat(v)}${'○'.repeat(Math.max(0, 5 - v))}`, v === 0 ? 'bad' : v <= 1 ? 'warn' : ''))));
        if (!readOnly()) {
          const row = h('div', { class: 'chip-row' });
          if (!here) append(row, btn('Travel there', () => app.travel(l.id), 'small primary'));
          else {
            append(row, btn('Look around', () => app.look()));
            if ((!s.shelter || s.shelter.locationId !== l.id) && l.shelterQuality >= 1) append(row, btn('Claim as shelter', () => app.claim()));
            if (holder && (s.factions[holder.id]?.standing ?? 0) > -20) append(row, btn(`Trade with ${holder.name}`, () => app.tradePrompt(holder)));
            if (s.caches[l.id]?.length) append(row, btn('Recover cache', () => app.recoverCache()));
          }
          append(detail, row);
          if (here) {
            const area = h('input', { type: 'text', placeholder: 'Where exactly? e.g. "the back office", "under the stairs"', 'aria-label': 'Area to search' });
            area.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); if (area.value.trim()) app.search(area.value.trim()); } });
            append(detail, h('h3', {}, 'Search'), h('div', { class: 'chip-row' }, (l.searchableAreas || []).map(a => btn(a, () => app.search(a), `small ghost`))), h('div', { class: 'row tight' }, area, btn('Search', () => { if (area.value.trim()) app.search(area.value.trim()); })),
              h('p', { class: 'muted small' }, 'Searching takes about an hour. Places run dry; repeat searches of the same spot find less. Night searches are dangerous.'));
          }
        }
      }
      append(body, map, h('div', { class: 'split', style: 'height:auto;margin-top:10px' }, list, detail));
    }
  });
}
