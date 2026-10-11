// Inventory: pack, weight, supplies, item actions, and crafting.

import { h, append, modal } from '../dom.js';
import { tag, vitalBar, kv, pickList, btn } from './common.js';
import { totalWeight, maxWeight, supplyDays, availableRecipes, RECIPES, matchRecipe } from '../../engine/inventory.js';
import { treatmentTagsFor, REGION_LABEL } from '../../engine/body.js';
import { withPlayer } from '../../engine/companions.js';
import { getNpc } from '../../engine/world.js';
import { atShelter } from '../../engine/survival.js';

export function registerInventory(app, { S, reg, readOnly }) {
  reg({
    id: 'inventory', sub: 'PACK & SUPPLIES', title: 'Inventory', icon: '▣', size: { w: 720, h: 520 }, x: 60, y: 60,
    render(body) {
      const s = S(); const items = s.inventory.items;
      const w = totalWeight(s), max = maxWeight(s); const sup = supplyDays(s);
      append(body,
        vitalBar('Carrying', w, { max: Math.max(max, w), suffix: ` / ${max} kg` }),
        w > max ? h('p', { class: 'warn small' }, 'Over the weight limit: you tire faster and travel slower.') : null,
        h('p', { class: 'small muted' }, `Supplies for your group of ${sup.group}: food ${sup.food} day${sup.food === 1 ? '' : 's'} (${sup.foodUnits} meals), water ${sup.water} day${sup.water === 1 ? '' : 's'} (${sup.waterUnits} units).${s.shelter ? ' Includes your shelter stash.' : ''}`));
      if (!app.selected.item || !items.some(i => i.id === app.selected.item)) app.selected.item = items[0]?.id || null;
      const list = pickList(items.map(i => ({ id: i.id, title: `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`, meta: `${i.category} · ${(i.weight * i.qty).toFixed(1)} kg`, tags: [i.condition < 50 ? tag(`worn ${i.condition}%`, 'warn') : null, i.tags.includes('dirty') ? tag('dirty', 'bad') : null] })), { selectedId: app.selected.item, onSelect: id => { app.selected.item = id; app.wm.refresh('inventory'); }, empty: 'Your pack is empty.' });
      const detail = h('div', { class: 'detail' });
      const it = items.find(i => i.id === app.selected.item);
      if (it) {
        append(detail, h('h2', {}, it.name), kv([['Category', it.category], ['Quantity', it.qty], ['Weight', `${it.weight} kg each`], ['Condition', `${it.condition}%`], ['Tags', it.tags.join(', ') || '—']]));
        if (!readOnly()) {
          const row = h('div', { class: 'chip-row' });
          if (it.category === 'food') append(row, btn('Eat', () => app.useItem(it.id)));
          else if (it.category === 'water') append(row, btn(it.tags.includes('dirty') ? 'Drink (risky)' : 'Drink', () => app.useItem(it.id)));
          else if (it.category === 'medical') {
            const targets = s.body.injuries.filter(inj => treatmentTagsFor(inj).some(tg => it.tags.includes(tg)) && (inj.infected ? it.tags.includes('antibiotic') : !inj.treated));
            if (targets.length) { const sel = h('select', { 'aria-label': 'Injury to treat' }, targets.map(inj => h('option', { value: inj.id }, `${inj.type}, ${REGION_LABEL[inj.region].toLowerCase()}`))); append(row, sel, btn('Treat', () => app.treat(sel.value, it.id))); }
            if (it.tags.includes('painkiller') || (it.tags.includes('antibiotic') && s.body.illness && !s.body.illness.treated)) append(row, btn('Take', () => app.useItem(it.id)));
            if (!targets.length && !it.tags.includes('painkiller')) append(row, h('span', { class: 'muted small' }, 'Nothing to treat with this right now.'));
          } else if (it.tags.includes('comfort')) append(row, btn('Use', () => app.useItem(it.id)));
          else append(row, btn('Use (narrated)', () => app.useNarrated(it)));
          const mates = withPlayer(s);
          if (mates.length) { const sel = h('select', { 'aria-label': 'Give to' }, mates.map(id => h('option', { value: id }, getNpc(s, id)?.name || id))); append(row, sel, btn('Give', () => app.give(it.id, sel.value))); }
          if (atShelter(s)) append(row, btn('Store in shelter', () => app.deposit(it.id, 1)));
          append(row, btn('Drop', async () => { if (await modal(`Drop ${it.name}? It stays here only in memory; nobody will keep it for you.`, { buttons: [{ label: 'Drop', value: true, danger: true }, { label: 'Keep', value: false }] })) app.dropItem(it.id); }, 'small ghost danger'));
          append(detail, row);
        }
      }
      append(body, h('div', { class: 'split' }, list, detail));
      // crafting
      const avail = availableRecipes(s);
      append(body, h('h3', {}, `Crafting (${avail.length} possible)`));
      if (!readOnly()) for (const r of avail) append(body, h('div', { class: 'entry notice', style: 'color:inherit' }, h('div', { class: 'who' }, r.name, tag(`${r.minutes} min`)), h('div', { class: 'small muted' }, `${r.blurb} Uses: ${matchRecipe(items, r).map(p => p.item.name + (p.keep ? ' (kept)' : '')).join(', ')}.`), h('div', { class: 'row tight' }, btn('Craft', () => app.craft(r.id)))));
      append(body, h('details', {}, h('summary', { class: 'muted small' }, 'All recipes'), h('ul', { class: 'small' }, RECIPES.map(r => h('li', {}, h('b', {}, r.name), `: ${r.needs.map(n => n.tag).join(' + ')} → ${r.makes.name}${r.requiresShelter ? ' (at your shelter)' : ''}. ${r.blurb}`)))));
    }
  });
}
