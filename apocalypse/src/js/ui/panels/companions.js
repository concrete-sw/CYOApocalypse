// Companions: profiles, loyalty, mood, everything they have said, talk, give and assign.

import { h, append } from '../dom.js';
import { tag, kv, pickList, meter, timeOf, btn } from './common.js';
import { loyaltyLabel, TASKS, withPlayer } from '../../engine/companions.js';
import { getNpc, getLocation } from '../../engine/world.js';

const STATUS_TAG = { with: ['with you', 'ok'], away: ['away on a task', 'info'], met: ['met', ''], left: ['left', 'warn'], dead: ['dead', 'bad'], captured: ['captured', 'bad'] };

export function registerCompanions(app, { S, reg, readOnly }) {
  reg({
    id: 'companions', sub: 'PEOPLE', title: 'Companions', icon: '☺', size: { w: 740, h: 540 }, x: 100, y: 80,
    render(body) {
      const s = S();
      const ids = s.npcsMet;
      if (!app.selected.npc || !ids.includes(app.selected.npc)) app.selected.npc = ids[0] || null;
      const list = pickList(ids.map(id => { const npc = getNpc(s, id); const c = s.companions[id]; const [lbl, cls] = STATUS_TAG[c?.status] || ['met', '']; return { id, title: npc?.name || id, meta: `${(npc?.skills || []).join(', ')} · mood ${c?.mood || '?'} · ${loyaltyLabel(c?.loyalty ?? 50)}`, tags: [tag(lbl, cls), c?.assignment?.task === 'guard' ? tag('guard', 'info') : null, c?.hurt ? tag('hurt', 'warn') : null] }; }), { selectedId: app.selected.npc, onSelect: id => { app.selected.npc = id; app.wm.refresh('companions'); }, empty: 'You have met nobody yet. People are out there: at the places you travel to, on the radio, on the road.' });
      const detail = h('div', { class: 'detail' });
      const id = app.selected.npc; const npc = id ? getNpc(s, id) : null; const c = id ? s.companions[id] : null;
      if (npc && c) {
        const here = c.status === 'with' || npc.locationId === s.location;
        append(detail,
          h('h2', {}, npc.name), 
          kv([['Status', (STATUS_TAG[c.status] || ['met'])[0]], ['Age', npc.age], ['Skills', (npc.skills || []).join(', ')], ['Mood', c.mood], ['Loyalty', meter(c.loyalty, 100, c.loyalty < 25 ? 'bad' : c.loyalty < 45 ? 'warn' : '')], ['Needs', `${c.hungryDays ? `${c.hungryDays} day(s) without food` : 'fed'}${c.hurt ? ` · hurt (${c.hurt})` : ''}`], ['Task', c.assignment ? `${TASKS[c.assignment.task]?.label || c.assignment.task}${c.assignment.locationId ? ` at ${getLocation(s, c.assignment.locationId)?.name}` : ''}` : null], ['Last seen', c.status === 'with' ? 'with you' : getLocation(s, npc.locationId)?.name]]),
          h('p', { class: 'narr' }, npc.background), h('p', { class: 'muted small' }, npc.personality));
        if (!readOnly() && c.status !== 'dead') {
          const q = h('textarea', { rows: '2', placeholder: here ? `Say something to ${npc.name}. Enter sends, Shift+Enter for a new line.` : `${npc.name} is not here. You can still try to reach them if it makes sense (a radio, a message left behind).`, 'aria-label': 'Your words' });
          const send = () => { const v = q.value.trim(); if (!v) return; q.value = ''; app.talk(id, v); };
          q.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
          append(detail, h('div', { class: 'composer' }, q, h('div', { class: 'row tight' }, btn('Say it', send, 'small primary'), here ? null : tag('not present', 'warn'))));
          if (c.status === 'with') {
            const items = s.inventory.items;
            if (items.length) { const sel = h('select', { 'aria-label': 'Item to give' }, items.map(it => h('option', { value: it.id }, `${it.name}${it.qty > 1 ? ` ×${it.qty}` : ''}`))); append(detail, h('div', { class: 'row tight' }, sel, btn('Give', () => app.give(sel.value, id)))); }
            const task = h('select', { 'aria-label': 'Task' }, Object.entries(TASKS).map(([k, t]) => h('option', { value: k }, t.label)));
            const where = h('select', { 'aria-label': 'Where' }, s.discovered.locations.map(l => h('option', { value: l, selected: l === s.location }, getLocation(s, l)?.name)));
            append(detail, h('div', { class: 'row tight' }, task, where, btn('Assign', () => app.assign(id, task.value, task.value === 'guard' ? null : where.value)), c.assignment?.task === 'guard' ? btn('Relieve guard', () => app.clearGuard(id), 'small ghost') : null),
              h('p', { class: 'muted small' }, Object.values(TASKS).map(t => `${t.label}: ${t.blurb}`).join(' ')));
          }
        }
        append(detail, h('h3', {}, `Conversation (${c.said.length})`));
        if (!c.said.length) append(detail, h('p', { class: 'muted small' }, 'Nothing said yet.'));
        for (const x of c.said.slice(-20)) append(detail, h('div', { class: 'entry survivor' }, h('div', { class: 'who' }, `${timeOf(x.at)} · ${s.survivor.name}`), h('div', { class: 'narr' }, x.q)), h('div', { class: 'entry npc' }, h('div', { class: 'who' }, npc.name.toUpperCase()), h('div', { class: 'narr' }, x.a)));
      }
      append(body, h('p', { class: 'muted small', style: 'margin:0 0 8px' }, `${withPlayer(s).length} travelling with you. Companions eat from your stores every day, remember how you treat them, and leave or worse when loyalty breaks.`));
      append(body, h('div', { class: 'split' }, list, detail));
    }
  });
}
