// The Log: the narrative stream, world events, the situation report, and the current choices.

import { h, append } from '../dom.js';
import { tag, timeOf } from './common.js';
import { formatDuration } from '../../engine/clock.js';
import { gearAvailable } from '../../engine/state.js';
import { renderDossier } from './dossier.js';

export function registerLog(app, { S, reg, readOnly }) {
  reg({
    id: 'log', sub: 'SITUATION', title: 'Log', icon: '▤', size: { w: 660, h: 560 }, x: 16, y: 12,
    render(body) {
      body.classList.add('col');
      const s = S();
      const wrap = h('div', { class: 'log-stream' });
      for (const e of s.log.slice(-80)) {
        if (e.kind === 'briefing') { append(wrap, h('div', { class: 'entry briefing' }, h('div', { class: 'who' }, `${timeOf(e.at)} · DOSSIER · READ BEFORE YOU DO ANYTHING`), renderDossier(s, { compact: true }), h('p', { class: 'muted small' }, 'The Dossier panel keeps this. ', h('a', { href: '#', onClick: ev => { ev.preventDefault(); app.wm.show('dossier'); } }, 'Open it')))); continue; }
        if (e.kind === 'sitrep') { append(wrap, h('div', { class: 'entry sitrep' }, h('div', { class: 'who' }, `${timeOf(e.at)} · SITUATION REPORT · EMERGENCY MANAGEMENT`), h('div', { class: 'narr' }, e.text))); continue; }
        if (e.kind === 'system' || e.kind === 'notice') { append(wrap, h('div', { class: `entry ${e.kind}` }, h('div', { class: 'who' }, `${timeOf(e.at)} · ${e.kind.toUpperCase()}`), h('div', { class: 'narr' }, e.text))); continue; }
        if (e.survivorLine) append(wrap, h('div', { class: 'entry survivor' }, h('div', { class: 'who' }, `${timeOf(e.at)} · ${s.survivor.name}`), h('div', { class: 'narr' }, e.survivorLine)));
        for (const ev of e.events || []) append(wrap, h('div', { class: `entry event ${e.urgent ? 'urgent' : ''}` }, h('div', { class: 'who' }, 'EVENT'), h('div', { class: 'narr' }, ev)));
        const kind = (e.speaker || 'narrator').split(':')[0];
        append(wrap, h('div', { class: `entry ${kind}` }, h('div', { class: 'who' }, `${timeOf(e.at)} · ${app.speakerLabel(e.speaker)}`), h('div', { class: 'narr' }, e.text)));
      }
      if (!s.log.length) append(wrap, h('div', { class: 'entry system' }, 'Waiting for the first transmission...'));
      append(body, wrap);
      const composer = h('div', { class: 'composer' });
      if (s.encounter && !s.encounter.resolved) append(composer, h('p', { class: 'banner bad' }, `ENCOUNTER · ${s.encounter.flavor.toUpperCase()} · STRENGTH ${s.encounter.strength}/10`));
      if (!readOnly() && s.lastChoices.length) {
        append(composer, h('div', { class: 'choices' }, s.lastChoices.map(c => h('button', { class: 'btn ghost', type: 'button', disabled: app.busy, onClick: () => app.choose(c) }, c))));
      }
      if (!readOnly() && (s.phase === 'play' || (s.phase === 'prologue' && (s.truth.startOffset || 0) < 0)) && !(s.encounter && !s.encounter.resolved)) {
        const gear = gearAvailable(s);
        append(composer, h('div', { class: 'quick' },
          h('button', { class: 'btn small ghost', type: 'button', onClick: () => app.takeStock() }, 'Take stock'),
          h('button', { class: 'btn small ghost', type: 'button', onClick: () => app.skipAhead() }, 'Skip ahead'),
          h('button', { class: 'btn small ghost', type: 'button', onClick: () => app.rest(s.vitals.fatigue < 40 ? 8 : 4) }, s.vitals.fatigue < 40 ? 'Sleep 8h' : 'Rest 4h'),
          gear.radio ? h('button', { class: 'btn small ghost', type: 'button', onClick: () => app.wm.show('radio') }, 'Listen to the radio') : null,
          s.phase === 'play' ? h('button', { class: 'btn small ghost', type: 'button', onClick: () => app.hint() }, 'Ask for a hint') : null,
          h('span', { class: 'muted small' }, `Turn ${s.turnCount} · ${s.pending.length ? `${s.pending.length} pending` : 'nothing pending'}`)));
      }
      if (readOnly()) append(composer, h('p', { class: 'muted small' }, 'This record is closed.'));
      append(body, composer);
      wrap.scrollTop = wrap.scrollHeight;
    }
  });
}
