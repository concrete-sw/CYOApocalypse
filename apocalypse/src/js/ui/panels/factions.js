// Factions: who holds power, how they see you, and what you know of them.

import { h, append } from '../dom.js';
import { tag, kv, timeOf } from './common.js';
import { standingLabel, holderOf } from '../../engine/factions.js';
import { getFaction, getLocation } from '../../engine/world.js';

export function registerFactions(app, { S, reg }) {
  reg({
    id: 'factions', sub: 'POWERS', title: 'Factions', icon: '⚑', size: { w: 600, h: 480 }, x: 300, y: 70,
    render(body) {
      const s = S();
      const known = Object.entries(s.factions).filter(([, f]) => f.known);
      const unknown = s.truth.factions.length - known.length;
      if (!known.length) append(body, h('p', { class: 'muted' }, 'You have not identified any organised group yet. There are rumours of others out there.'));
      for (const [id, f] of known) {
        const t = getFaction(s, id);
        const holds = s.discovered.locations.filter(l => holderOf(s, l)?.id === id && ((s.locationState[l]?.visits || 0) > 0 || s.locationState[l]?.scouted)).map(l => getLocation(s, l)?.name);
        const pct = (f.standing + 100) / 2;
        append(body, h('h2', {}, t.name, tag(standingLabel(f.standing), f.standing >= 20 ? 'ok' : f.standing <= -20 ? 'bad' : '')),
          h('div', { class: 'standing-scale', title: `standing ${f.standing}` }, h('i', { style: `left:${pct}%` })),
          kv([['Ideology', t.ideology], ['Attitude to strangers', t.attitudeToStrangers], ['They trade', (t.tradeGoods || []).join(', ') || '?'], ['They want', (t.wants || []).join(', ') || '?'], ['Holds (that you know of)', holds.join(', ') || 'unknown'], ['Base', (s.locationState[t.baseLocationId]?.visits || 0) > 0 ? getLocation(s, t.baseLocationId)?.name : 'unknown'], ['Radio', t.radioFreq && s.radio.knownFreqs.some(x => Math.abs(x - parseFloat(t.radioFreq)) < 0.0051) ? t.radioFreq : null], ['Contacts', `${f.contacts}${f.lastContactAt != null ? ` · last ${timeOf(f.lastContactAt)}` : ''}`]]));
      }
      if (unknown > 0 && known.length) append(body, h('p', { class: 'muted small' }, `At least ${unknown} other group${unknown > 1 ? 's' : ''} operate${unknown > 1 ? '' : 's'} in the region. You have not met them yet.`));
      append(body, h('p', { class: 'muted small' }, 'Standing moves with what you do: fights with their people, trades, favours, broken promises. Factions act on their own schedule whether or not you are watching.'));
    }
  });
}
