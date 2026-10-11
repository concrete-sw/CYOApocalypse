// Shelter: base or nomad, defenses, stash, upkeep, fortify, caches.

import { h, append, modal } from '../dom.js';
import { tag, kv, meter, btn } from './common.js';
import { getLocation } from '../../engine/world.js';
import { atShelter, hasFire } from '../../engine/survival.js';
import { skillCount, isGuarding } from '../../engine/companions.js';

export function registerShelter(app, { S, reg, readOnly }) {
  reg({
    id: 'shelter', sub: 'BASE / CAMP', title: 'Shelter', icon: '⌂', size: { w: 640, h: 520 }, x: 160, y: 70,
    render(body) {
      const s = S();
      if (!s.shelter) {
        append(body, h('div', { class: 'card-head' }, h('span', { class: 'banner warn' }, 'NOMAD · NO FIXED SHELTER')),
          h('p', { class: 'narr small' }, 'You carry everything and sleep where you stop. Travel is cheaper on the nerves and nobody raids a camp that moves, but nights are colder, rest is poorer, and your pack is all you own.'),
          h('p', { class: 'small muted' }, 'To settle, travel to a place with decent shelter and claim it from the Map panel. Good shelters you know of:'));
        const cands = s.discovered.locations.map(id => getLocation(s, id)).filter(l => l && ((s.locationState[l.id]?.visits || 0) > 0) && l.shelterQuality >= 1).sort((a, b) => b.shelterQuality - a.shelterQuality);
        append(body, cands.length ? h('ul', { class: 'small' }, cands.map(l => h('li', {}, `${l.name}: shelter ${l.shelterQuality}/5${l.id === s.location ? ' (here)' : ''}`))) : h('p', { class: 'muted small' }, 'None you have visited yet.'));
        if (!readOnly()) append(body, h('div', { class: 'row' }, btn('Make camp and sleep 8h', () => app.rest(8, true), 'small primary'), s.location && getLocation(s, s.location)?.shelterQuality >= 1 ? btn('Claim this place', () => app.claim()) : null));
      } else {
        const sh = s.shelter; const loc = getLocation(s, sh.locationId); const here = atShelter(s);
        const food = sh.stash.filter(x => x.category === 'food').reduce((a, x) => a + x.qty, 0);
        const water = sh.stash.filter(x => x.category === 'water' && !x.tags.includes('dirty')).reduce((a, x) => a + x.qty, 0);
        append(body, h('div', { class: 'card-head' }, h('span', { class: 'banner' }, `BASE · ${loc?.name.toUpperCase()}`), here ? tag('you are here', 'ok') : tag('you are away', 'warn')),
          kv([
            ['Defense', meter(sh.defense, 5, sh.defense <= 1 ? 'bad' : sh.defense <= 2 ? 'warn' : '')],
            ['Noise', meter(sh.noise, 5, sh.noise >= 4 ? 'bad' : sh.noise >= 2 ? 'warn' : '')],
            ['Watch', isGuarding(s) ? 'someone is on guard' : 'nobody on guard'],
            ['Fire', sh.fire ? 'a fire burned last night' : hasFire(s) ? 'fire possible (fuel or wood in stores)' : 'no fuel or wood for a fire'],
            ['Raids', `${sh.raids} so far`],
            ['Stores', `${food} meals · ${water} water · ${sh.stash.length} item type${sh.stash.length === 1 ? '' : 's'}`]
          ]),
          h('div', { class: 'chip-row' }, ['power', 'water', 'cell', 'internet'].map(k => tag(`${k === 'cell' ? 'phones' : k} ${s.utilities?.[k] ? 'on' : 'OFF'}`, s.utilities?.[k] ? 'ok' : 'bad'))),
          h('p', { class: 'muted small' }, `${s.utilities?.water ? 'The taps run: you drink freely here. ' : ''}${s.utilities?.power ? 'The heating works and the fridge is cold. ' : 'No power: the fridge is a cupboard and fresh food is turning. '}While you are here and hungry you eat from the stores on your own. Companions eat from the stash first. Cold nights burn one fuel or wood. Noise fades a step each quiet day; fights and building raise it. Defense lowers raid odds; a guard helps.`));
        append(body, h('h3', {}, 'Stash'));
        if (!sh.stash.length) append(body, h('p', { class: 'muted small' }, 'Empty. Store items from the Inventory panel when you are here.'));
        else append(body, h('table', {}, h('tbody', {}, sh.stash.map(it => h('tr', {}, h('td', {}, `${it.name}${it.qty > 1 ? ` ×${it.qty}` : ''}`), h('td', { class: 'muted small' }, it.category), h('td', {}, here && !readOnly() ? btn('Take 1', () => app.withdraw(it.id, 1), 'small ghost') : null))))));
        if (!readOnly()) {
          const need = skillCount(s, 'mechanics') > 0 ? 1 : 2;
          append(body, h('h3', {}, 'Work'), h('div', { class: 'row tight' },
            here ? btn(`Fortify (+1 defense, 3h, ${need} building material or a barricade kit)`, () => app.fortify()) : h('span', { class: 'muted small' }, 'Return to your shelter to work on it or store things.'),
            btn('Abandon shelter', async () => { if (await modal(`Leave ${loc?.name} behind? Your stash stays hidden there as a cache you can come back for, if nobody finds it first.`, { buttons: [{ label: 'Abandon', value: true, danger: true }, { label: 'Stay', value: false }] })) app.abandon(); }, 'small ghost danger')));
        }
      }
      const caches = Object.entries(s.caches || {}).filter(([, v]) => v?.length);
      if (caches.length) append(body, h('h3', {}, 'Caches'), h('ul', { class: 'small' }, caches.map(([id, v]) => h('li', {}, `${getLocation(s, id)?.name}: ${v.length} item type${v.length === 1 ? '' : 's'}${id === s.location ? ' (here; recover from the Map panel)' : ''}`))));
    }
  });
}
