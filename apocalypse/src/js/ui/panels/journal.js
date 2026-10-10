// Journal: facts learned automatically, clues, world events witnessed, and the player's own notes.

import { h, append } from '../dom.js';
import { tag, timeOf } from './common.js';
import { getClue } from '../../engine/world.js';

export function registerJournal(app, { S, reg }) {
  reg({
    id: 'journal', sub: 'FACTS & NOTES', title: 'Journal', icon: '✎', size: { w: 600, h: 520 }, x: 280, y: 60,
    render(body) {
      const s = S();
      const ta = h('textarea', { class: 'notebook-text', 'aria-label': 'Your notes', placeholder: 'Your own notes. Saved automatically.' }, s.journal || '');
      let timer; ta.addEventListener('input', () => { s.journal = ta.value; clearTimeout(timer); timer = setTimeout(() => app.autosave(), 500); });
      append(body,
        h('h3', {}, `Clues (${s.clues.length})`),
        s.clues.length ? h('ul', { class: 'small' }, s.clues.map(id => h('li', {}, tag('clue', 'ok'), ' ', getClue(s, id)?.text || id))) : h('p', { class: 'muted small' }, 'Nothing that points to a way out yet. Search carefully, earn people\'s trust, and listen to the radio at odd hours.'),
        h('h3', {}, `Facts (${s.facts.length})`),
        s.facts.length ? h('ul', { class: 'small' }, [...s.facts].reverse().map(f => h('li', {}, h('span', { class: 'faint' }, `${timeOf(f.at)} `), f.text))) : h('p', { class: 'muted small' }, 'Facts the world confirms are logged here automatically.'),
        h('h3', {}, `What you have witnessed (${s.worldEvents.length})`),
        s.worldEvents.length ? h('ul', { class: 'timeline small' }, [...s.worldEvents].reverse().map(e => h('li', {}, h('span', { class: 'faint' }, `Day ${e.day}: `), e.text))) : h('p', { class: 'muted small' }, 'Nothing yet.'),
        h('h3', {}, 'Your notes'), ta,
        h('h3', {}, 'Record'),
        h('p', { class: 'muted small' }, `Turns ${s.turnCount} · encounters ${s.stats.encounters} · fights won ${s.stats.kills} · items found ${s.stats.itemsFound} · distance ${s.stats.distance} km · nights without shelter ${s.stats.nightsOutside} · hints ${s.hints}`));
    }
  });
}
