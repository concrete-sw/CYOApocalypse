// Settings: display, save slots, export and import, the Game Master link, and ending the story.

import { h, append, toast, modal } from '../dom.js';
import * as store from '../../engine/storage.js';

export function registerSettings(app, { S, reg }) {
  reg({
    id: 'settings', sub: 'SYSTEM', title: 'Settings', icon: '⚙', size: { w: 580, h: 560 }, x: 320, y: 50,
    render(body) {
      const st = app.settings; const s = S();
      const opt = (label, el) => h('label', {}, label, el);
      const sel = (val, opts, on) => h('select', { onChange: e => { on(e.target.value); app.applySettings(); app.wm.refresh('settings'); } }, opts.map(([v, l]) => h('option', { value: v, selected: String(val) === v }, l)));
      const chk = (val, on) => h('input', { type: 'checkbox', checked: val, onChange: e => { on(e.target.checked); app.applySettings(); } });
      append(body, h('h3', {}, 'Display'),
        opt('Theme', sel(st.theme || 'green', [['green', 'Phosphor green'], ['amber', 'Amber'], ['blue', 'Cold blue'], ['blackout', 'Blackout (red)']], v => { st.theme = v; })),
        opt('Typewriter speed', sel(st.typeSpeed || 'normal', [['off', 'Instant'], ['fast', 'Fast'], ['normal', 'Normal'], ['slow', 'Slow']], v => { st.typeSpeed = v; })),
        h('label', { class: 'check' }, chk(!!st.reduceMotion, v => { st.reduceMotion = v; }), 'Reduce motion (no scanlines, noise, blinking or typewriter)'),
        h('label', { class: 'check' }, chk(st.scanlines !== false, v => { st.scanlines = v; }), 'Scanlines'),
        h('label', { class: 'check' }, chk(st.noise !== false, v => { st.noise = v; }), 'Background noise texture'),
        h('label', { class: 'check' }, chk(!!st.highContrast, v => { st.highContrast = v; }), 'High contrast text'));
      append(body, h('h3', {}, 'Save slots'),
        h('ul', { class: 'slot-list' }, store.listSlots().map(sl => h('li', {},
          h('span', { class: 'slot-info' }, h('b', {}, sl.slot === 0 ? 'Autosave' : `Slot ${sl.slot}`), sl.empty ? 'empty' : `${sl.survivor} · ${sl.title} · day ${sl.day}${sl.ended ? ' · ENDED' : ''} · ${new Date(sl.savedAt).toLocaleString()}`),
          h('span', { class: 'row', style: 'margin:0' },
            sl.slot === 0 ? null : h('button', { class: 'btn small', type: 'button', onClick: async () => { if (sl.empty || await modal(`Overwrite slot ${sl.slot}?`, { buttons: [{ label: 'Overwrite', value: true, danger: true }, { label: 'Cancel', value: false }] })) { store.saveSlot(sl.slot, s); app.slot = sl.slot; toast(`Saved to slot ${sl.slot}.`); app.wm.refresh('settings'); } } }, 'Save here'),
            sl.empty ? null : h('button', { class: 'btn small ghost', type: 'button', onClick: async () => { if (await modal(`Load ${sl.slot === 0 ? 'the autosave' : `slot ${sl.slot}`}? Unsaved progress in the current game is kept in the autosave only.`, { buttons: [{ label: 'Load', value: true, primary: true }, { label: 'Cancel', value: false }] })) { app.autosave(); app.loadState(store.loadSlot(sl.slot), sl.slot); } } }, 'Load'))))),
        h('div', { class: 'row' },
          h('button', { class: 'btn small', type: 'button', onClick: () => store.exportState(s) }, 'Export .json'),
          h('label', { class: 'btn small file-btn' }, 'Import .json', h('input', { type: 'file', accept: '.json,application/json', hidden: true, onChange: async e => { const f = e.target.files[0]; if (!f) return; try { app.loadState(await store.importStateFromFile(f), 0); toast('Imported.'); } catch (err) { toast(err.message, 'danger'); } } })),
          h('button', { class: 'btn small ghost', type: 'button', onClick: () => { app.autosave(); app.renderSlots(); app.showScreen('newgame'); } }, 'Back to registration')));
      append(body, h('h3', {}, 'Game Master'),
        h('p', { class: 'small muted' }, `${app.provider.name} · ${app.apiOpts.model}. Change it on the logon screen (Back to registration → Change uplink). Turns so far: ${s.turnCount}.`),
        s.ended ? null : h('div', { class: 'row' }, h('button', { class: 'btn small ghost danger', type: 'button', onClick: () => app.endStory() }, 'End my story'), h('span', { class: 'muted small' }, 'Closes the record and unseals the truth.')),
        h('details', {}, h('summary', { class: 'muted small' }, 'Last raw GM reply (debug)'), h('pre', { class: 'small', style: 'white-space:pre-wrap' }, s.history[s.history.length - 1]?.content || '')));
    }
  });
}
