// Dossier: who you are, where and when you are, what you own, who you know,
// what the public knows, and what the record is for. Every line is built by
// the code from the truth and the state, so nothing in it is invented.

import { h, append } from '../dom.js';
import { tag, kv } from './common.js';
import { buildBriefing } from '../../engine/briefing.js';

export function renderDossier(s, { compact = false } = {}) {
  const b = buildBriefing(s);
  const util = (k, label) => tag(`${label} ${b.utilities[k] ? 'ON' : 'OFF'}`, b.utilities[k] ? 'ok' : 'bad');
  const root = h('div', { class: `dossier ${compact ? 'compact' : ''}` });
  append(root,
    h('div', { class: 'card-head' }, h('span', { class: 'banner' }, `SURVIVOR DOSSIER${b.stamp.chapter > 1 ? ` · CHAPTER ${b.stamp.chapter}` : ''}`), h('span', { class: 'muted small' }, `${b.survivor.name} · ${b.survivor.id}`)),
    h('h3', {}, 'When'),
    h('p', {}, h('b', {}, `Day ${b.stamp.day} · ${b.stamp.date} · ${b.stamp.time}`), ` · ${b.stamp.season}${b.stamp.weather ? ` · ${b.stamp.weather}` : ''}`),
    h('p', { class: 'narr' }, b.timing),
    h('h3', {}, 'Where'),
    h('p', {}, h('b', {}, `${b.region.name}${b.region.country ? `, ${b.region.country}` : ''}`)),
    h('p', { class: 'narr small' }, b.region.description, b.region.now ? ` ${b.region.now}` : ''),
    b.home ? [h('p', {}, h('b', {}, `Home: ${b.home.name}`), b.home.isShelter ? tag('your shelter', 'ok') : null), h('p', { class: 'narr small' }, b.home.description)] : null,
    h('h3', {}, 'Who you are'),
    kv([['Name', b.survivor.name], ['Record', b.survivor.id], ['Background', b.survivor.title], ['Skills', b.survivor.skills.join(', ') || 'none in particular']]),
    b.survivor.blurb ? h('p', { class: 'narr small' }, b.survivor.blurb) : null,
    b.survivor.lifeBefore ? h('p', { class: 'narr' }, b.survivor.lifeBefore) : null,
    h('h3', {}, 'People in your life'),
    b.people.length ? h('ul', { class: 'small' }, b.people.map(p => h('li', {}, h('b', {}, p.name), `: ${p.relation}${p.where ? ` (usually at ${p.where})` : ''}`))) : h('p', { class: 'muted small' }, 'Nobody in particular. You will meet people.'),
    h('h3', {}, 'What you have'),
    h('p', { class: 'small' }, h('b', {}, 'Carrying: '), b.carrying.join(', ') || 'nothing'),
    b.stores.length ? h('p', { class: 'small' }, h('b', {}, 'At home: '), b.stores.join(', ')) : null,
    b.vehicle ? h('p', { class: 'small' }, h('b', {}, 'Vehicle: '), b.vehicle) : null,
    h('div', { class: 'chip-row' }, util('power', 'power'), util('water', 'water'), util('cell', 'phones'), util('internet', 'internet'), b.gear.radio ? tag('radio', 'info') : null, b.gear.walkie ? tag('walkie-talkie', 'info') : null)
  );
  if (b.publicStory) {
    append(root,
      h('h3', {}, 'What is happening'),
      h('p', { class: 'narr' }, h('b', {}, 'What people believe: '), b.publicStory.belief),
      b.publicStory.events.length ? [h('p', { class: 'small muted', style: 'margin-bottom:2px' }, 'What has happened so far, as far as anyone knows:'), h('ul', { class: 'timeline small' }, b.publicStory.events.map(e => h('li', {}, h('span', { class: 'faint' }, `${e.date}: `), e.text)))] : null,
      b.publicStory.sitrep ? h('div', { class: 'entry sitrep' }, h('div', { class: 'who' }, 'LATEST OFFICIAL PICTURE'), h('div', { class: 'narr small' }, b.publicStory.sitrep)) : null);
  }
  append(root, h('h3', {}, 'The record'), h('p', { class: 'narr' }, b.goal.text));
  return root;
}

export function registerDossier(app, { S, reg }) {
  reg({
    id: 'dossier', sub: 'SURVIVOR RECORD', title: 'Dossier', icon: '▥', size: { w: 640, h: 600 }, x: 200, y: 20,
    render(body) { append(body, renderDossier(S())); }
  });
}
