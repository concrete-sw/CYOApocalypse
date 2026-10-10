// Main controller: screens, API config, the turn loop, code-only actions, the command bar, save/load, the debrief.

import { $, $$, h, clear, toast, modal, esc, append } from './dom.js';
import { Typewriter } from './typewriter.js';
import { WindowManager } from './windows.js';
import { runBoot } from './boot.js';
import { registerPanels, DOCK_ORDER } from './panels/index.js';
import { PROVIDERS, getProvider, complete } from '../providers/index.js';
import { generateWorld } from '../engine/worldGenerator.js';
import { runTurn } from '../engine/gm.js';
import { runDebrief, finalizeDebrief, fallbackDebrief, computeStats } from '../engine/ending.js';
import { newGameState, addLog, advanceTime, checkEnd, DOOM_LABEL } from '../engine/state.js';
import { formatTime, phaseOf, daysLeft, dayOf, isNight, MIN_PER_DAY } from '../engine/clock.js';
import { APOCALYPSES, apocalypseById, randomApocalypse } from '../engine/apocalypses.js';
import { BACKGROUNDS, useItem, craft, removeItem, findItem, totalWeight, maxWeight, supplyDays, RECIPES } from '../engine/inventory.js';
import { deposit, withdraw, recoverCache } from '../engine/shelter.js';
import { clearGuard, withPlayer, loyaltyLabel, TASKS } from '../engine/companions.js';
import { getLocation, getNpc, getFaction, fuzzyFind } from '../engine/world.js';
import { conditions, describeInjuries } from '../engine/body.js';
import * as store from '../engine/storage.js';

const SPEED = { off: 0, fast: 4, normal: 12, slow: 28 };
const IDLE_BANNER = 'CIVIL ALERT NETWORK · ROUTINE · NO ACTIVE WARNINGS';

export class App {
  constructor() {
    this.state = null;
    this.settings = store.loadSettings();
    this.api = store.loadApiConfig();
    this.busy = false;
    this.abort = null;
    this.slot = 0;
    this.wm = null;
    this.selected = { item: null, npc: null, location: null, region: null };
    this.badges = {};
  }

  // ---------------------------------------------------------------- startup
  async init() {
    this.applySettings();
    this.setBanner(1, IDLE_BANNER);
    $('#wmInsignia').innerHTML = $('#insigniaLogin').innerHTML;
    this.setupLogin();
    this.setupNewGame();
    this.setupDesktop();
    await runBoot($('#bootLog'), { reduceMotion: this.settings.reduceMotion });
    this.showScreen('login');
    $('#apiKey').focus();
  }

  showScreen(name) {
    for (const s of $$('.screen')) s.classList.add('hidden');
    $(`#screen-${name}`).classList.remove('hidden');
    if (name === 'login' || name === 'newgame' || name === 'boot') this.setBanner(1, IDLE_BANNER);
    else if (this.state) this.setWorldBanner();
  }

  /** Full-width Emergency Alert System bars, top and bottom, coloured by alert level. */
  setBanner(level, text) {
    for (const id of ['#bannerTop', '#bannerBottom']) { const el = $(id); el.className = `easbar lvl-${level}`; el.textContent = text; }
  }
  setWorldBanner() {
    const s = this.state; if (!s) return;
    const region = (s.truth.region?.name || 'REGION').toUpperCase();
    const lvl = Math.max(1, Math.min(5, s.doom || 1));
    const calm = s.phase === 'prologue' && !s.ended;
    const status = s.ended ? 'RECORD CLOSED' : calm ? 'NO ACTIVE WARNINGS' : DOOM_LABEL[lvl];
    this.setBanner(calm ? 1 : lvl, `EMERGENCY ALERT SYSTEM · ${region} · ${status} · DAY ${dayOf(s.clock.minutes)}`);
  }

  applySettings() {
    const s = this.settings;
    document.body.classList.toggle('reduce-motion', !!s.reduceMotion);
    document.body.classList.toggle('no-scanlines', s.scanlines === false);
    document.body.classList.toggle('no-noise', s.noise === false);
    document.body.dataset.theme = s.theme || 'green';
    document.body.dataset.contrast = s.highContrast ? 'high' : 'normal';
    store.saveSettings(s);
  }

  get provider() { return getProvider(this.api.providerId); }
  get apiOpts() { return { provider: this.provider, apiKey: this.api.apiKey, model: this.api.model || this.provider.defaultModel, baseUrl: this.api.baseUrl || undefined }; }

  // ------------------------------------------------------------------ logon
  setupLogin() {
    const sel = $('#providerSelect');
    for (const p of PROVIDERS) sel.append(h('option', { value: p.id }, p.name));
    sel.value = this.api.providerId || 'anthropic';
    $('#apiKey').value = this.api.apiKey || '';
    $('#modelInput').value = this.api.model || '';
    $('#baseUrl').value = this.api.baseUrl || '';
    $('#rememberKey').checked = !!this.api.remember;
    const syncProvider = () => {
      const p = getProvider(sel.value);
      $('#modelInput').placeholder = p.defaultModel || 'model id';
      const dl = clear($('#modelList'));
      for (const m of p.models) append(dl, h('option', { value: m }));
      $('#baseUrlRow').classList.toggle('hidden', !p.allowCustomBaseUrl);
      $('#baseUrl').placeholder = p.defaultBaseUrl;
      $('#providerNotes').innerHTML = `${p.notes ? esc(p.notes) + ' ' : ''}${p.keyUrl ? `Get a key: <a href="${esc(p.keyUrl)}" target="_blank" rel="noopener">${esc(p.keyUrl)}</a>` : ''}`;
    };
    sel.addEventListener('change', syncProvider);
    syncProvider();
    const readForm = () => {
      this.api = { providerId: sel.value, apiKey: $('#apiKey').value.trim(), model: $('#modelInput').value.trim(), baseUrl: $('#baseUrl').value.trim(), remember: $('#rememberKey').checked };
      store.saveApiConfig({ ...this.api, apiKey: this.api.remember ? this.api.apiKey : '' });
    };
    $('#testConn').addEventListener('click', async () => {
      readForm();
      const st = $('#connStatus');
      st.textContent = 'Testing...'; st.className = 'muted small';
      try {
        const text = await complete(this.provider, { ...this.apiOpts, json: false, maxTokens: 20, temperature: 0, messages: [{ role: 'user', content: 'Reply with the single word READY.' }] });
        st.textContent = text.trim() ? `Link OK (${this.apiOpts.model}): "${text.trim().slice(0, 40)}"` : 'Link OK (empty reply)';
        st.className = 'accent small';
      } catch (err) { st.textContent = `Failed: ${err.message}`; st.className = 'danger small'; }
    });
    $('#forgetKey').addEventListener('click', () => { store.forgetApiKey(); $('#apiKey').value = ''; $('#rememberKey').checked = false; toast('Stored key removed.'); });
    $('#loginForm').addEventListener('submit', e => {
      e.preventDefault();
      readForm();
      if (!this.api.apiKey && !['ollama', 'custom'].includes(this.provider.id)) { toast('Enter an API key for the Game Master uplink.', 'warn'); $('#apiKey').focus(); return; }
      $('#newgameOperator').textContent = `GM uplink: ${this.provider.name}${this.apiOpts.model ? ` · ${this.apiOpts.model}` : ''}`;
      this.renderSlots();
      this.showScreen('newgame');
      $('#survivorName').focus();
    });
  }

  // --------------------------------------------------------------- new game
  setupNewGame() {
    const bg = $('#background');
    for (const b of BACKGROUNDS) bg.append(h('option', { value: b.id }, b.name));
    const notes = () => {
      const b = BACKGROUNDS.find(x => x.id === bg.value);
      $('#backgroundNotes').textContent = b ? `${b.blurb} Skills: ${b.skills.join(', ')}. Starts with ${b.kit.map(k => k.name.toLowerCase() + (k.qty > 1 ? ` ×${k.qty}` : '')).join(', ')}, plus a water bottle, a lighter, a jacket and a granola bar.${b.carry ? ` Carry limit ${b.carry > 0 ? '+' : ''}${b.carry} kg.` : ''}` : '';
    };
    bg.addEventListener('change', notes); notes();
    const ap = $('#apocalypseType');
    for (const a of APOCALYPSES) ap.append(h('option', { value: a.id }, a.name));
    ap.value = 'zombie';
    const toggle = () => $('#customPremiseRow').classList.toggle('hidden', ap.value !== 'custom');
    ap.addEventListener('change', toggle); toggle();
    $('#newGameForm').addEventListener('submit', async e => {
      e.preventDefault();
      let apo = apocalypseById(ap.value) || APOCALYPSES[0];
      if (apo.id === 'random') apo = randomApocalypse();
      const premise = $('#customPremise').value.trim();
      if (apo.id === 'custom' && premise.length < 10) { toast('Describe your premise in a sentence or two.', 'warn'); $('#customPremise').focus(); return; }
      const settings = { apocalypseId: apo.id, apocalypseName: apo.name, customPremise: apo.id === 'custom' ? premise : '', difficulty: $('#difficulty').value, length: $('#gameLength').value };
      const survivor = { name: $('#survivorName').value.trim() || 'Survivor', background: bg.value };
      await this.startNewGame(settings, survivor);
    });
    $('#genCancel').addEventListener('click', () => this.abort?.abort());
    $('#backToLogin').addEventListener('click', () => this.showScreen('login'));
    $('#importFile').addEventListener('change', async e => {
      const f = e.target.files[0]; if (!f) return;
      try { const st = await store.importStateFromFile(f); this.loadState(st, 0); toast('Save imported.'); } catch (err) { toast(`Import failed: ${err.message}`, 'danger'); }
      e.target.value = '';
    });
  }

  renderSlots() {
    const ul = clear($('#slotList'));
    for (const s of store.listSlots()) {
      const label = s.slot === 0 ? 'Autosave' : `Slot ${s.slot}`;
      if (s.empty) { append(ul, h('li', {}, h('span', { class: 'slot-info muted' }, h('b', {}, label), 'empty'))); continue; }
      append(ul, h('li', {},
        h('span', { class: 'slot-info' }, h('b', {}, `${label}: ${s.survivor || ''} · ${s.title || ''}`), `${s.apocalypse || ''} · ${s.region || ''} · day ${s.day}${s.ended ? ' · ENDED' : ''} · saved ${new Date(s.savedAt).toLocaleString()}`),
        h('span', { class: 'row' },
          h('button', { class: 'btn small', type: 'button', onClick: () => { this.loadState(store.loadSlot(s.slot), s.slot); } }, 'Resume'),
          h('button', { class: 'btn small ghost danger', type: 'button', onClick: async () => { if (await modal(`Delete ${label}?`, { buttons: [{ label: 'Delete', value: true, danger: true }, { label: 'Cancel', value: false }] })) { store.deleteSlot(s.slot); this.renderSlots(); } } }, '✕'))));
    }
  }

  async startNewGame(settings, survivor) {
    const st = $('#genStatus');
    const btn = $('#newGameForm button[type=submit]');
    btn.disabled = true; $('#genCancel').classList.remove('hidden'); st.className = 'muted small';
    this.abort = new AbortController();
    try {
      const skills = BACKGROUNDS.find(b => b.id === survivor.background)?.skills || [];
      const truth = await generateWorld({ ...this.apiOpts, settings, survivor: { ...survivor, skills }, signal: this.abort.signal, onProgress: msg => { st.textContent = msg; } });
      this.state = newGameState({ survivor, truth, settings });
      this.slot = 0;
      addLog(this.state, 'system', `Survivor ${this.state.survivor.name} (${this.state.survivor.id}) registered. Region: ${truth.region?.name || 'unknown'}. "${truth.title}".`);
      this.autosave();
      st.textContent = '';
      this.enterDesktop(true);
    } catch (err) {
      st.textContent = this.abort.signal.aborted ? 'Cancelled.' : `Could not build the world: ${err.message}`;
      st.className = 'danger small';
    } finally { btn.disabled = false; $('#genCancel').classList.add('hidden'); this.abort = null; }
  }

  loadState(state, slot) {
    this.state = state;
    this.slot = slot || 0;
    this.selected = { item: null, npc: null, location: null, region: null };
    if (state.ended && state.debrief) { this.showDebrief(state.debrief); return; }
    this.enterDesktop(false);
    if (state.ended && !state.debrief) this.runEnding();
  }

  autosave() {
    if (!this.state) return;
    this.lastSave = Date.now();
    store.saveSlot(0, this.state);
    if (this.slot) store.saveSlot(this.slot, this.state);
  }

  // ---------------------------------------------------------------- desktop
  setupDesktop() {
    this.wm = new WindowManager($('#windowArea'), $('#dock'));
    registerPanels(this);
    this.wm.buildDock(DOCK_ORDER);
    $('#cmdBar').addEventListener('submit', e => { e.preventDefault(); const v = $('#cmdInput').value.trim(); if (!v) return; $('#cmdInput').value = ''; this.handleCommand(v); });
    document.addEventListener('keydown', e => {
      if (e.target.matches('input, textarea, select') && e.key !== 'Escape') return;
      if (e.key === '/') { e.preventDefault(); $('#cmdInput').focus(); }
      if (e.altKey && /^[1-9]$/.test(e.key)) { const id = DOCK_ORDER.filter(x => x !== '---')[Number(e.key) - 1]; if (id) { e.preventDefault(); this.wm.show(id); } }
    });
    window.addEventListener('beforeunload', () => this.autosave());
  }

  enterDesktop(fresh) {
    this.wm.closeAll();
    this.showScreen('desktop');
    this.setWorldBanner();
    this.updateTopbar();
    this.wm.show('log');
    if (!this.wm.isNarrow()) { this.wm.show('status'); this.wm.focus('log'); }
    this.wm.refreshAll();
    $('#cmdInput').focus();
    if (fresh && this.state.turnCount === 0) this.act({ type: this.state.lineage?.length ? 'arrival' : 'prologue_start' });
  }

  updateTopbar() {
    const s = this.state; if (!s) return;
    const m = s.clock.minutes;
    $('#topDay').textContent = formatTime(m);
    $('#topWeather').textContent = `${phaseOf(m).toUpperCase()} · ${s.weather.today?.label || ''}`;
    const left = daysLeft(s);
    const dl = $('#topDeadline');
    dl.textContent = s.ended ? 'RECORD CLOSED' : left >= 0 ? `DEADLINE DAY ${s.clock.deadlineDay} · ${left} DAY${left === 1 ? '' : 'S'} LEFT` : 'PAST THE DEADLINE';
    dl.className = `mono deadline ${left < 2 ? 'danger' : left < 5 ? 'warn' : ''}`;
    $('#topSurvivor').textContent = `${s.survivor.name} · ${s.survivor.id}`;
    const region = s.truth.region?.name || 'Region';
    $('#wmText').innerHTML = `<div class="wm-name">${esc(s.survivor.name.toUpperCase())}</div><div class="wm-id">${esc(s.survivor.id)}</div><div class="wm-region">${esc(region.toUpperCase())}</div><div class="wm-sub">SURVIVOR LIAISON RECORD</div>`;
    const saved = this.lastSave ? new Date(this.lastSave).toLocaleTimeString() : 'never';
    $('#statusBar').textContent = `EOC LINK · ${region.toUpperCase()} · SURVIVOR ${s.survivor.name.toUpperCase()} (${s.survivor.id}) · GM ${this.provider.name.toUpperCase()} · TURN ${s.turnCount} · LAST SAVE ${saved}`;
  }

  setStatus(text, busy = false) {
    const el = $('#topStatus');
    el.textContent = text || '';
    el.classList.toggle('busy', busy);
  }

  // ---------------------------------------------------------------- actions
  /** Run a GM turn for an action. Returns the turn result or null. */
  async act(action) {
    const s = this.state;
    if (!s || s.ended) return null;
    if (this.busy) { toast('Wait for the current transmission to finish.', 'warn'); return null; }
    if (s.encounter && !s.encounter.resolved && !['encounter', 'free', 'choice'].includes(action.type)) { toast('Deal with what is in front of you first.', 'warn'); return null; }
    this.busy = true;
    this.abort = new AbortController();
    const prevFocused = [...this.wm.open.entries()].find(([, w]) => w.el.classList.contains('focused'))?.[0] || null;
    const target = this.liveTarget();
    const line = this.survivorLineFor(action);
    const liveWrap = h('div', { class: 'entry live narrator' }, h('div', { class: 'who' }, 'TRANSMITTING'), h('div', { class: 'stream' }));
    if (target) {
      if (line) append(target, h('div', { class: 'entry survivor' }, h('div', { class: 'who' }, s.survivor.name), h('div', { class: 'narr' }, line)));
      append(target, liveWrap);
      liveWrap.scrollIntoView({ block: 'end' });
    }
    const tw = new Typewriter(liveWrap.querySelector('.stream'), { speedMs: SPEED[this.settings.typeSpeed ?? 'normal'] ?? 12, reduceMotion: this.settings.reduceMotion });
    liveWrap.addEventListener('click', () => tw.skip());
    this.setStatus('Transmitting...', true);
    let result = null;
    try {
      result = await runTurn({ state: s, action, ...this.apiOpts, signal: this.abort.signal, onNarrative: text => tw.update(text), onStatus: t => this.setStatus(t, true) });
      liveWrap.querySelector('.who').textContent = this.speakerLabel(result.speaker);
      liveWrap.className = `entry ${result.speaker.split(':')[0]}`;
      tw.finish(result.narrative);
      await this.waitTypewriter(tw);
      for (const n of result.notices) toast(n, /Injured|Lost|Ill:|starving|dehydrated|infected|barely|critical|died|left|gone/i.test(n) ? 'danger' : /CLUE|Found|joins|Met|Healed|Location|Discovered/i.test(n) ? 'info' : '');
      if (result.fallback) toast('The reply was not well-formed; shown as plain text, no state changes applied.', 'warn');
      this.afterTurn(action, result);
    } catch (err) {
      tw.finish('');
      liveWrap.className = 'entry system';
      liveWrap.querySelector('.stream').textContent = this.abort.signal.aborted ? 'Transmission cancelled.' : `LINK ERROR: ${err.message}`;
      toast(err.message, 'danger', 8000);
    } finally {
      this.busy = false; this.abort = null; this.setStatus('');
      this.updateTopbar(); this.setWorldBanner();
      this.autosave();
      this.wm.refreshAll();
      // Bring the panel the player was working in back to the front now that the narrative has finished.
      if (prevFocused && prevFocused !== 'log' && this.wm.open.has(prevFocused)) this.wm.focus(prevFocused);
      if (this.state.ended && !this.state.debrief) this.runEnding();
    }
    return result;
  }

  waitTypewriter(tw) {
    return new Promise(res => { const poll = () => (tw.shown >= tw.target.length ? res() : setTimeout(poll, 50)); poll(); });
  }

  afterTurn(action, result) {
    for (const n of result.notices) {
      if (/^(Found|Lost)/.test(n)) this.bump('inventory');
      if (/^(Met|.*joins you|.*: (left|died|captured))/.test(n)) this.bump('companions');
      if (/^Location/.test(n)) this.bump('map');
      if (/^(CLUE|Noted|Discovered)/.test(n)) this.bump('journal');
      if (/^Faction|standing/.test(n)) this.bump('factions');
      if (/^(Injured|Ill:|Healed)/.test(n)) this.bump('status');
    }
    for (const e of result.events || []) {
      if (e.kind === 'raid') this.bump('shelter');
      if (/companion|betrayal|assignment/.test(e.kind)) this.bump('companions');
    }
    if (action.type === 'tune' || action.type === 'scan') this.bump('radio');
  }

  bump(id) {
    const w = this.wm.open.get(id);
    if (w && w.el.classList.contains('focused')) return;
    this.badges[id] = (this.badges[id] || 0) + 1;
    this.wm.setBadge(id, this.badges[id]);
  }

  liveTarget() {
    const w = this.wm.open.get('log') || this.wm.show('log');
    this.wm.focus('log');
    return w.body.querySelector('.log-stream') || w.body;
  }

  survivorLineFor(a) {
    const s = this.state;
    const npc = id => getNpc(s, id)?.name || id;
    switch (a.type) {
      case 'prologue_start': case 'arrival': return null;
      case 'travel': return `Sets out for ${getLocation(s, a.locationId)?.name}.`;
      case 'look': return 'Looks around.';
      case 'search': return `Searches ${a.area}.`;
      case 'rest': return `${a.camp ? 'Makes camp and rests' : 'Rests'} for ${a.hours || 6} hours.`;
      case 'wait': return `Waits ${a.hours || 1} hour${(a.hours || 1) === 1 ? '' : 's'}.`;
      case 'talk': return `To ${npc(a.npcId)}: "${a.text}"`;
      case 'give': return `Gives ${findItem(s.inventory.items, a.itemId)?.name || 'something'} to ${npc(a.npcId)}.`;
      case 'tune': return `Tunes the radio to ${a.freq}.`;
      case 'scan': return 'Scans the bands.';
      case 'fortify': return 'Works on the defenses.';
      case 'claim': return `Claims ${getLocation(s, s.location)?.name} as shelter.`;
      case 'abandon': return 'Abandons the shelter.';
      case 'assign': return `Sends ${npc(a.npcId)} to ${a.task}${a.locationId ? ` at ${getLocation(s, a.locationId)?.name}` : ''}.`;
      case 'skip': return 'Lets time pass.';
      case 'hint': return 'Stops to think about what to do next.';
      case 'trade': return `Offers a trade: "${a.text}"`;
      case 'use': return `Uses ${a.itemName}.${a.text ? ` ${a.text}` : ''}`;
      case 'end': return 'Decides this is where the story ends.';
      case 'encounter': return a.text || a.approach;
      default: return a.text || '';
    }
  }

  speakerLabel(speaker) {
    const s = this.state;
    if (!speaker || speaker === 'narrator') return 'NARRATOR';
    if (speaker === 'radio') return 'RADIO';
    if (speaker === 'system') return 'SYSTEM';
    const [kind, id] = speaker.split(':');
    if (kind === 'npc') return (getNpc(s, id)?.name || id).toUpperCase();
    if (kind === 'faction') return (getFaction(s, id)?.name || id).toUpperCase();
    return 'NARRATOR';
  }

  // GM-narrated actions.
  free(text) { return this.act({ type: 'free', text }); }
  choose(text) {
    const s = this.state;
    if (s.encounter && !s.encounter.resolved) {
      const approach = { fight: 'fight', run: 'flee', flee: 'flee', hide: 'hide', talk: 'talk' }[text.toLowerCase().split(/\s+/)[0]] || null;
      return this.act({ type: 'encounter', approach, text });
    }
    return this.act({ type: 'choice', text });
  }
  travel(locationId) {
    if (locationId === this.state.location) { toast('You are already here.', 'warn'); return null; }
    if (isNight(this.state.clock.minutes)) toast('Travelling at night. Everything out there is more dangerous now.', 'warn');
    return this.act({ type: 'travel', locationId });
  }
  look() { return this.act({ type: 'look' }); }
  search(area) { return this.act({ type: 'search', area }); }
  rest(hours = 6, camp = false) { return this.act({ type: 'rest', hours, camp }); }
  wait(hours = 1) { return this.act({ type: 'wait', hours }); }
  talk(npcId, text) { if (!text?.trim()) { toast('Say something first.', 'warn'); return null; } return this.act({ type: 'talk', npcId, text: text.trim() }); }
  give(itemId, npcId) { return this.act({ type: 'give', itemId, npcId }); }
  tune(freq) { return this.act({ type: 'tune', freq }); }
  scan() { return this.act({ type: 'scan' }); }
  fortify() { return this.act({ type: 'fortify' }); }
  claim() { return this.act({ type: 'claim' }); }
  abandon() { return this.act({ type: 'abandon' }); }
  assign(npcId, task, locationId) { return this.act({ type: 'assign', npcId, task, locationId }); }
  skipAhead() { return this.act({ type: 'skip' }); }
  hint(text) { return this.act({ type: 'hint', text }); }
  trade(text) { return this.act({ type: 'trade', text }); }
  useNarrated(item) { return this.act({ type: 'use', itemName: item.name, text: '' }); }
  async tradePrompt(faction) {
    const input = h('input', { type: 'text', placeholder: 'e.g. "Two cans of beans for a jerrycan of fuel"' });
    const ok = await modal(h('div', {}, h('p', {}, `Barter with ${faction.name}. What do you offer, and for what?`), input), { title: 'Trade', buttons: [{ label: 'Offer', value: true, primary: true }, { label: 'Cancel', value: false }] });
    if (ok && input.value.trim()) this.trade(input.value.trim());
  }
  async endStory() {
    if (this.busy || !this.state || this.state.ended) return;
    const ok = await modal('End your story here? The record closes and the truth is unsealed. This cannot be undone.', { title: 'End my story', buttons: [{ label: 'End it', value: true, danger: true }, { label: 'Keep going', value: false }] });
    if (ok) this.act({ type: 'end' });
  }

  // Code-only actions: no GM call.
  useItem(itemId) {
    const s = this.state; if (!s || s.ended) return;
    const it = findItem(s.inventory.items, itemId); if (!it) return;
    const r = useItem(s, it.id);
    if (!r.ok) { toast(r.notice, 'warn'); return; }
    if (r.needsGm) return this.useNarrated(it);
    toast(r.notice, 'info'); addLog(s, 'notice', r.notice);
    advanceTime(s, 10);
    this.afterCodeAction();
  }
  treat(injuryId, itemId) {
    const s = this.state; if (!s || s.ended) return;
    const r = useItem(s, itemId, { injuryId });
    toast(r.notice, r.ok ? 'info' : 'warn');
    if (r.ok) { addLog(s, 'notice', r.notice); advanceTime(s, 15); this.afterCodeAction(); }
  }
  craft(recipeId) {
    const s = this.state; if (!s || s.ended) return;
    const r = craft(s, recipeId);
    toast(r.notice, r.ok ? 'info' : 'warn');
    if (r.ok) { addLog(s, 'notice', r.notice); advanceTime(s, r.minutes || 20); this.afterCodeAction(); }
  }
  dropItem(itemId) {
    const s = this.state; const it = findItem(s.inventory.items, itemId); if (!it) return;
    removeItem(s.inventory.items, it.id, it.qty);
    toast(`Dropped ${it.name}.`); addLog(s, 'notice', `Dropped ${it.name}.`);
    this.afterCodeAction();
  }
  deposit(itemId, qty = 1) { const r = deposit(this.state, itemId, qty); toast(r.notice, r.ok ? 'info' : 'warn'); if (r.ok) this.afterCodeAction(); }
  withdraw(itemId, qty = 1) { const r = withdraw(this.state, itemId, qty); toast(r.notice, r.ok ? 'info' : 'warn'); if (r.ok) this.afterCodeAction(); }
  recoverCache() { const r = recoverCache(this.state); toast(r.notice, r.ok ? 'info' : 'warn'); if (r.ok) { addLog(this.state, 'notice', r.notice); this.afterCodeAction(); } }
  clearGuard(npcId) { clearGuard(this.state, npcId); toast(`${getNpc(this.state, npcId)?.name} stands down.`); this.afterCodeAction(); }
  afterCodeAction() {
    this.updateTopbar(); this.setWorldBanner(); this.autosave(); this.wm.refreshAll();
    if (checkEnd(this.state) && !this.state.debrief) this.runEnding();
  }

  takeStock() {
    const s = this.state; if (!s) return;
    const v = s.vitals; const r = x => Math.round(x); const sup = supplyDays(s);
    const loc = getLocation(s, s.location);
    const lines = [
      `${formatTime(s.clock.minutes)} · ${phaseOf(s.clock.minutes).toUpperCase()} · ${s.weather.today?.label || ''}`,
      `DOOM  ${s.doom}/5 ${DOOM_LABEL[s.doom]} · threat ${s.threat.level}/5 · ${daysLeft(s)} day(s) to the deadline`,
      `WHERE ${loc?.name || '?'}${s.shelter?.locationId === s.location ? ' (shelter)' : ''} · mode ${s.mode}`,
      `BODY  health ${r(v.health)} · hunger ${r(v.hunger)} · thirst ${r(v.thirst)} · fatigue ${r(v.fatigue)} · warmth ${r(v.warmth)} · morale ${r(v.morale)} · ${s.truth.apocalypse?.hazardName || 'hazard'} ${r(v.hazard)}`,
      `      ${conditions(s).join(', ') || 'no acute conditions'}`,
      `HURT  ${describeInjuries(s).join('; ') || 'no injuries'}${s.body.illness ? ` · ill: ${s.body.illness.name} (${s.body.illness.severity})` : ''}`,
      `PACK  ${totalWeight(s)}/${maxWeight(s)} kg · ${s.inventory.items.map(i => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`).join(', ') || 'empty'}`,
      `STORE food ${sup.food}d · water ${sup.water}d for ${sup.group}${s.shelter ? ` · stash ${s.shelter.stash.length} item type(s) · defense ${s.shelter.defense}/5` : ''}`,
      `CREW  ${withPlayer(s).map(id => `${getNpc(s, id)?.name} (${s.companions[id].mood}, ${loyaltyLabel(s.companions[id].loyalty)})`).join(' | ') || 'alone'}`,
      `PEND  ${s.pending.map(p => p.label).join(' | ') || 'nothing'}`,
      `KNOWN ${s.discovered.locations.length} places · ${s.npcsMet.length} people · ${Object.values(s.factions).filter(f => f.known).length} factions · ${s.clues.length} clues · ${s.facts.length} facts`
    ];
    modal(h('pre', { class: 'small', style: 'white-space:pre-wrap;margin:0' }, lines.join('\n')), { title: 'Take stock' });
  }

  // ----------------------------------------------------------- command bar
  handleCommand(line) {
    const s = this.state; if (!s) return;
    if (s.ended) { toast('This record is closed.', 'warn'); return; }
    const [cmd, ...rest] = line.split(/\s+/);
    const arg = rest.join(' ').trim();
    const c = cmd.toLowerCase();
    const bad = m => toast(m, 'warn');
    const known = () => s.discovered.locations.map(id => getLocation(s, id)).filter(Boolean);
    const findLoc = q => fuzzyFind(known(), q);
    const findNpc = q => fuzzyFind(s.npcsMet.map(id => getNpc(s, id)).filter(Boolean), q);
    if (s.encounter && !s.encounter.resolved) return this.act({ type: 'encounter', text: line });
    switch (c) {
      case 'help': case '?': return this.wm.show('help');
      case 'open': case 'show': { const id = DOCK_ORDER.find(x => x !== '---' && (x === arg.toLowerCase() || this.wm.defs.get(x)?.title.toLowerCase().startsWith(arg.toLowerCase()))); return id ? this.wm.show(id) : bad(`No panel "${arg}".`); }
      case 'go': case 'travel': case 'goto': case 'walk': { const l = findLoc(arg); if (l) return this.travel(l.id); break; }
      case 'look': case 'l': return this.look();
      case 'search': case 'scavenge': case 'loot': return arg ? this.search(arg) : bad('search <area>');
      case 'rest': case 'sleep': return this.rest(parseFloat(arg) || 6);
      case 'camp': return this.rest(parseFloat(arg) || 8, true);
      case 'wait': return this.wait(parseFloat(arg) || 1);
      case 'skip': return this.skipAhead();
      case 'eat': case 'drink': case 'use': case 'take': { const it = findItem(s.inventory.items, arg); if (it) return this.useItem(it.id); break; }
      case 'craft': case 'make': { const r = RECIPES.find(x => x.id === arg.toLowerCase() || x.name.toLowerCase().startsWith(arg.toLowerCase())); return r ? this.craft(r.id) : bad('craft <recipe>; the Inventory panel lists them.'); }
      case 'drop': { const it = findItem(s.inventory.items, arg); if (it) return this.dropItem(it.id); break; }
      case 'give': { const m = arg.match(/^(.+?)\s+to\s+(.+)$/i); if (!m) break; const it = findItem(s.inventory.items, m[1]); const n = findNpc(m[2]); if (it && n && s.companions[n.id]?.status === 'with') return this.give(it.id, n.id); if (it && n) return bad('They are not with you.'); break; }
      case 'talk': case 'say': case 'ask': case 'tell': {
        const m = arg.match(/^(?:to\s+)?(\S+)\s*(.*)$/); if (!m) break;
        const n = findNpc(m[1]); if (!n) break;
        if (!m[2]) { this.selected.npc = n.id; return this.wm.show('companions'); }
        return this.talk(n.id, m[2]);
      }
      case 'assign': case 'send': {
        const m = arg.match(/^(\S+)\s+(scout|scavenge|hunt|guard)(?:\s+(?:to\s+|at\s+)?(.+))?$/i); if (!m) return bad('assign <name> scout|scavenge|hunt|guard [place]');
        const n = findNpc(m[1]); if (!n) return bad('Unknown person.');
        const l = m[3] ? findLoc(m[3]) : null; if (m[3] && !l) return bad(`Unknown place "${m[3]}".`);
        return this.assign(n.id, m[2].toLowerCase(), l?.id || null);
      }
      case 'tune': case 'radio': return arg ? this.tune(arg) : this.wm.show('radio');
      case 'scan': return this.scan();
      case 'listen': return this.wm.show('radio');
      case 'claim': case 'settle': return this.claim();
      case 'fortify': case 'barricade': return this.fortify();
      case 'abandon': return this.abandon();
      case 'trade': case 'barter': return this.trade(arg || 'What do you have to trade?');
      case 'stock': case 'status': return this.takeStock();
      case 'inventory': case 'inv': case 'i': return this.wm.show('inventory');
      case 'map': case 'm': return this.wm.show('map');
      case 'hint': return this.hint(arg);
      case 'note': case 'n': { if (!arg) return this.wm.show('journal'); s.journal = (s.journal ? s.journal + '\n' : '') + arg; this.autosave(); this.wm.refresh('journal'); return toast('Note added.'); }
      case 'save': return this.wm.show('settings');
      case 'export': return store.exportState(s);
      case 'end': if (!arg || /story|game|it/i.test(arg)) return this.endStory(); break;
      default: break;
    }
    return this.free(line);
  }

  // ---------------------------------------------------------------- ending
  async runEnding() {
    const s = this.state;
    if (!s || !s.ended || s.debrief || this.busy) return;
    this.busy = true; this.abort = new AbortController();
    this.setStatus('Compiling the record...', true);
    const e = s.ended;
    addLog(s, 'system', e.kind === 'death' ? `${s.survivor.name} died on day ${dayOf(e.at)}. ${e.cause || ''}`.trim() : e.kind === 'escape' ? `${s.survivor.name} got out of ${s.truth.region?.name || 'the region'}.` : e.kind === 'deadline' ? 'The deadline passed. The world moved on without an answer.' : 'The story ends here.');
    try {
      s.debrief = await runDebrief({ state: s, ...this.apiOpts, signal: this.abort.signal, onStatus: t => this.setStatus(t, true) });
    } catch (err) {
      toast(`The record could not be compiled by the GM: ${err.message}`, 'danger', 8000);
      s.debrief = finalizeDebrief(s, fallbackDebrief(s, computeStats(s)));
    } finally { this.busy = false; this.abort = null; this.setStatus(''); this.autosave(); this.setWorldBanner(); }
    this.showDebrief(s.debrief);
  }

  showDebrief(d) {
    const s = this.state; const t = s.truth; const e = s.ended || { kind: 'retired' };
    const body = clear($('#debriefBody'));
    const scoreClass = d.score >= 75 ? '' : d.score >= 45 ? 'mid' : 'bad';
    const li = arr => h('ul', {}, (arr || []).map(x => h('li', {}, typeof x === 'string' ? x : JSON.stringify(x))));
    const outcome = { death: `DIED ON DAY ${dayOf(e.at || s.clock.minutes)}${e.cause ? ` · ${e.cause.toUpperCase()}` : ''}`, escape: 'GOT OUT', deadline: 'SURVIVED TO THE DEADLINE', retired: 'STORY ENDED BY CHOICE' }[e.kind] || e.kind.toUpperCase();
    const wo = d.wayOut;
    append(body,
      h('div', { class: 'card-head' }, h('span', { class: 'banner' }, 'RECORD CLOSED · DEBRIEF · TRUTH UNSEALED'), h('span', { class: 'muted' }, `${s.survivor.name} · ${s.survivor.id} · ${t.region?.name || ''}`)),
      h('div', { class: `score ${scoreClass}` }, `${d.score} / 100`),
      h('h1', {}, d.rating),
      h('p', { class: 'muted' }, `${outcome}. ${d.stats?.daysSurvived ?? dayOf(s.clock.minutes)} days of ${s.clock.deadlineDay}. ${t.title}.`),
      h('h2', {}, 'Epitaph'), h('p', { class: 'narr' }, d.epitaph || ''),
      h('h2', {}, 'The verdict'), h('p', { class: 'narr' }, d.verdict || ''),
      h('h2', {}, 'What was really going on'), h('p', { class: 'narr' }, d.whatReallyHappened || ''),
      h('dl', { class: 'kv' },
        h('dt', {}, 'What people believed'), h('dd', {}, d.publicBelief || ''),
        h('dt', {}, 'The truth'), h('dd', {}, d.trueCause || ''),
        h('dt', {}, 'The way out'), h('dd', {}, wo ? `${wo.what} · at ${getLocation(s, wo.where)?.name || wo.where} · days ${wo.windowStartDay} to ${wo.windowEndDay} · needed: ${(wo.requirements || []).map(r => r.description).join('; ') || 'nothing special'}` : ''),
        h('dt', {}, 'You reached it'), h('dd', {}, e.kind === 'escape' ? 'Yes.' : 'No.')),
      h('h2', {}, 'What you got right'), li(d.gotRight),
      h('h2', {}, 'What you missed'), li(d.missed),
      h('h2', {}, 'False hopes'), li(d.falseHopes),
      d.falseHopeDetails?.length ? h('table', {}, h('tbody', {}, d.falseHopeDetails.map(f => h('tr', {}, h('th', {}, f.promise), h('td', {}, f.whatReallyHappens), h('td', {}, s.flags.includes(`pursued_${f.id}`) ? h('span', { class: 'tag bad' }, 'you pursued it') : h('span', { class: 'tag ok' }, 'avoided')))))) : null,
      h('h2', {}, 'The people'), li(d.companionFates),
      h('table', {}, h('tbody', {}, (d.npcSecrets || []).map(n => h('tr', {}, h('th', {}, n.name, n.met ? null : h('span', { class: 'tag' }, 'never met')), h('td', {}, n.secret), h('td', { class: 'small' }, n.betrayal ? `Would betray: ${n.betrayal}` : 'Would not betray'))))),
      h('h2', {}, 'The factions'), h('table', {}, h('tbody', {}, (d.factionSecrets || []).map(f => h('tr', {}, h('th', {}, f.name), h('td', {}, f.goal), h('td', {}, f.secret))))),
      h('h2', {}, 'The region after'), h('p', { class: 'narr' }, d.regionAfter || ''),
      d.ifYouHad ? [h('h2', {}, 'If you had...'), h('p', { class: 'narr' }, d.ifYouHad)] : null,
      h('h2', {}, 'The hidden timeline'),
      h('ul', { class: 'timeline' }, (d.timeline || []).map(x => h('li', {}, `Day ${x.day}: ${x.event}`, x.visible ? null : h('span', { class: 'tag warn' }, 'hidden'), x.fired ? null : h('span', { class: 'tag' }, 'never happened: the story ended first')))),
      h('h2', {}, 'Statistics'),
      h('table', {}, h('tbody', {}, Object.entries({
        'Clues found': `${d.stats?.cluesFound?.length ?? 0} of ${d.stats?.cluesTotal ?? '?'}`, 'Places visited': `${d.stats?.locationsVisited ?? 0} of ${d.stats?.locationsTotal ?? '?'}`, 'Hidden things found': `${d.stats?.hiddenFound ?? 0} of ${d.stats?.hiddenTotal ?? '?'}`,
        'Encounters': d.stats?.encounters ?? 0, 'Fights won': d.stats?.kills ?? 0, 'Nights without shelter': d.stats?.nightsOutside ?? 0, 'Hints taken': d.stats?.hints ?? 0, 'Companions at the end': (d.stats?.companions || []).filter(c => c.status === 'with').length
      }).map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, String(v)))))),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', type: 'button', onClick: () => { this.renderSlots(); this.showScreen('newgame'); } }, 'New survivor'),
        h('button', { class: 'btn', type: 'button', onClick: () => this.continueWorld() }, 'Continue in this world'),
        h('button', { class: 'btn ghost', type: 'button', onClick: () => store.exportState(s) }, 'Export record'),
        h('button', { class: 'btn ghost', type: 'button', onClick: () => { this.showScreen('desktop'); } }, 'Review the terminal (read-only)'))
    );
    this.showScreen('debrief');
  }

  /** A new survivor in the same world: the truth, the timeline, depleted places, factions and caches persist. */
  async continueWorld() {
    const old = this.state; if (!old) return;
    const name = h('input', { type: 'text', maxlength: '40', placeholder: 'Survivor name' });
    const bg = h('select', {}, BACKGROUNDS.map(b => h('option', { value: b.id }, b.name)));
    const ok = await modal(h('div', {}, h('p', {}, `Another person has been surviving in ${old.truth.region?.name || 'this region'} all along. The world remembers ${old.survivor.name}: what they used up, who they met, what they built.`), h('label', {}, 'Name', name), h('label', {}, 'Background', bg)), { title: 'Continue in this world', buttons: [{ label: 'Begin', value: true, primary: true }, { label: 'Cancel', value: false }] });
    if (!ok) return;
    const s = newGameState({ survivor: { name: name.value.trim() || 'Survivor', background: bg.value }, truth: old.truth, settings: old.settings });
    const nextMorning = (Math.floor(old.clock.minutes / MIN_PER_DAY) + 1) * MIN_PER_DAY + 7 * 60;
    s.clock.minutes = Math.min(nextMorning, (old.clock.deadlineDay) * MIN_PER_DAY + 7 * 60);
    s.phase = 'play'; s.doom = old.doom; s.threat.level = old.threat.level;
    s.events.fired = [...old.events.fired]; s.worldEvents = [...old.worldEvents];
    s.locationState = JSON.parse(JSON.stringify(old.locationState));
    for (const ls of Object.values(s.locationState)) ls.visits = 0;
    s.discovered.locations = [...new Set([...s.discovered.locations, ...old.discovered.locations])];
    s.caches = JSON.parse(JSON.stringify(old.caches || {}));
    if (old.shelter?.stash?.length) s.caches[old.shelter.locationId] = [...(s.caches[old.shelter.locationId] || []), ...old.shelter.stash];
    for (const [id, f] of Object.entries(old.factions)) s.factions[id] = { known: f.known, standing: 0, contacts: 0 };
    s.npcsMet = old.npcsMet.filter(id => old.companions[id]?.status !== 'dead' || true);
    for (const [id, c] of Object.entries(old.companions)) s.companions[id] = { status: c.status === 'dead' ? 'dead' : 'met', loyalty: 50, mood: 'uneasy', said: [], assignment: null, metAt: s.clock.minutes, hungryDays: 0, hurt: 0, how: c.status === 'dead' ? c.how : undefined };
    s.flags = old.flags.filter(f => f.startsWith('pursued_') || f.startsWith('world_'));
    s.lineage = [...(old.lineage || []), { name: old.survivor.name, ending: old.ended?.kind || 'retired', day: dayOf(old.ended?.at || old.clock.minutes), cause: old.ended?.cause || null }];
    s.weather.today = null; advanceTime(s, 0); s.weather.today = s.weather.today || old.weather.today;
    addLog(s, 'system', `${s.survivor.name} (${s.survivor.id}) takes up the record on day ${dayOf(s.clock.minutes)}. ${old.survivor.name}'s story ended on day ${dayOf(old.ended?.at || old.clock.minutes)}.`);
    this.state = s; this.slot = 0; this.selected = { item: null, npc: null, location: null, region: null };
    this.autosave();
    this.enterDesktop(true);
  }
}
