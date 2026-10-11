// Game state: everything the code owns. The GM proposes changes; applyChanges
// validates every id against the truth before accepting anything.

import { clamp, asArray, str, num } from './util.js';
import { START_MINUTES, MIN_PER_DAY, dayOf, weatherFor, formatDate } from './clock.js';
import { tick, atShelter } from './survival.js';
import { addInjury, setIllness, REGION_LABEL } from './body.js';
import { addItem, removeItem, findItem, startingKit, backgroundSkills, backgroundTitle, hasRadio, hasWalkie, hasPhone, vehicleOf } from './inventory.js';
import { meet, recruit, lose, adjustLoyalty, MOODS, withPlayer, dailyUpkeep, checkBetrayals, resolveAssignment, skillCount } from './companions.js';
import { meetFaction, adjustStanding, factionState } from './factions.js';
import { nightlyRaidRoll, burnFuel, claimShelter, abandonShelter } from './shelter.js';
import { getLocation, getNpc, getFaction, getClue, locState, revealLocation } from './world.js';
import { travelPlan } from './encounters.js';

export const SKILLS = ['medicine', 'mechanics', 'combat', 'scavenging', 'stealth', 'leadership', 'survival', 'electronics', 'farming', 'negotiation'];
export const DOOM_LABEL = { 1: 'ADVISORY', 2: 'WATCH', 3: 'REGIONAL EMERGENCY', 4: 'CONTINENTAL DARK', 5: 'EXTINCTION EVENT' };

function makeSurvivorId() {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  return `SV-${Math.floor(1000 + Math.random() * 9000)}-${letters[Math.floor(Math.random() * letters.length)]}${letters[Math.floor(Math.random() * letters.length)]}`;
}

export const UTILITY_KEYS = ['power', 'water', 'cell', 'internet'];

/**
 * A fresh game. The truth is already normalised and shifted so that day 0 is
 * the first day of play; truth.startOffset says how many days after the
 * collapse began that is (negative: before it). carryOver brings a survivor,
 * their pack and their companions into a new chapter.
 */
export function newGameState({ survivor, truth, settings, carryOver = null, rnd = Math.random }) {
  const start = truth.region?.startLocationId || truth.locations[0].id;
  const startDay = Math.round(num(truth.startOffset, 0));
  const background = survivor.background || 'nurse';
  const state = {
    version: 2,
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    survivor: { name: survivor.name, id: survivor.id || makeSurvivorId(), background, title: backgroundTitle(background, truth), skills: backgroundSkills(background, truth), text: str(survivor.text, '').slice(0, 600), carry: background === 'custom' ? clamp(num(truth.survivor?.carry, 0), -4, 6) : 0 },
    settings: { ...settings },
    truth,
    clock: { minutes: START_MINUTES, deadlineDay: settings?.openEnded ? null : num(truth.deadlineDay, 30) },
    utilities: { power: true, water: true, cell: true, internet: true },
    home: start,
    weather: { today: null },
    vitals: { health: 100, hunger: 85, thirst: 85, fatigue: 90, warmth: 60, morale: 70, hazard: 0 },
    body: { injuries: [], illness: null },
    inventory: { items: [] },
    companions: {}, npcsMet: [], factions: {},
    discovered: { locations: [] },
    location: start, shelter: null, caches: {}, mode: 'nomad', locationState: {},
    radio: { log: [], knownFreqs: [] },
    facts: [], clues: [], flags: [],
    threat: { level: 0, local: {} },
    events: { fired: [], queued: [] }, pending: [], worldEvents: [],
    journal: '', log: [], history: [], summary: '', turnCount: 0, hints: 0,
    phase: startDay > 0 ? 'play' : 'prologue', prologueTurns: 0, ended: null, debrief: null, doom: 1, lastChoices: [], encounter: null,
    chapter: carryOver?.chapter || 1, lineage: carryOver?.lineage || [],
    stats: { kills: 0, encounters: 0, itemsFound: 0, distance: 0, nightsOutside: 0, days: 0 }
  };
  for (const l of truth.locations) if (l.initiallyKnown || l.id === start) state.discovered.locations.push(l.id);
  for (const f of truth.factions || []) factionState(state, f.id);
  state.weather.today = weatherFor(state, 0);
  locState(state, start).visits = 1;

  // What they own. Before the collapse that is a home with a pantry; later, a pack.
  const kit = carryOver?.items ? { pack: carryOver.items.map(it => ({ ...it })), stash: [] } : startingKit({ background, truth, startDay, rnd });
  state.inventory.items = kit.pack;
  if (kit.stash.length) { const r = claimShelter(state, start); if (r.ok) state.shelter.stash = kit.stash; }
  // People from the survivor's own life are known from the first minute.
  for (const n of truth.npcs || []) if (n.knownToSurvivor) meet(state, n.id);
  for (const c of carryOver?.companions || []) {
    if (!getNpc(state, c.id)) continue;
    recruit(state, c.id);
    Object.assign(state.companions[c.id], { loyalty: clamp(num(c.loyalty, 50), 0, 100), mood: c.mood || 'steady', said: Array.isArray(c.said) ? c.said.slice(-10) : [], hasWalkie: !!c.hasWalkie });
  }
  if (startDay > 0) {
    state.threat.level = clamp(Math.round(num(truth.threat?.baseLevel, 1)), 0, 5);
    prefireTimeline(state);
  }
  seedFacts(state);
  return state;
}

/** Fill in fields added after a save was written, so older saves keep loading. */
export function migrateState(state) {
  if (!state || typeof state !== 'object') return state;
  state.utilities = state.utilities || { power: false, water: false, cell: false, internet: false };
  state.home = state.home || state.truth?.region?.startLocationId || null;
  state.chapter = state.chapter || 1;
  state.lineage = state.lineage || [];
  if (state.survivor && !state.survivor.title) state.survivor.title = backgroundTitle(state.survivor.background, state.truth);
  if (state.truth && state.truth.startOffset == null) state.truth.startOffset = 0;
  if (state.clock && state.clock.deadlineDay === undefined) state.clock.deadlineDay = num(state.truth?.deadlineDay, 30);
  return state;
}

function seedFacts(state) {
  const t = state.truth; const home = getLocation(state, state.home);
  if (home) addFact(state, `Home: ${home.name}.`, 'system');
  const v = vehicleOf(state.inventory.items); if (v) addFact(state, `Has a ${v.kind === 'bike' ? 'bicycle' : 'vehicle'}: ${v.item.name}.`, 'system');
  for (const n of t.npcs || []) if (n.knownToSurvivor) addFact(state, `Knows ${n.name}${n.relationToSurvivor ? ` (${n.relationToSurvivor})` : ''}.`, 'system');
}

/** The minute on the game clock at which a timeline entry fires. */
export const timelineMinute = e => num(e.day, 0) * MIN_PER_DAY + num(e.hour, 9) * 60;
export function unfiredCount(state) { return asArray(state.truth.timeline).filter((e, i) => !state.events.fired.includes(i)).length; }

/** Gear that unlocks parts of the interface: a radio (carried, or in the stash while at the shelter), a walkie-talkie, a live phone. */
export function gearAvailable(state) {
  const lists = [state.inventory.items, ...(atShelter(state) && state.shelter?.stash ? [state.shelter.stash] : [])];
  return { radio: lists.some(hasRadio), walkie: hasWalkie(state.inventory.items), phone: hasPhone(state.inventory.items) && !!state.utilities?.cell, vehicle: vehicleOf(state.inventory.items) };
}

// ------------------------------------------------------------------ logging
export function addLog(state, kind, text, speaker = null, extra = {}) {
  state.log.push({ at: state.clock.minutes, kind, text, speaker, ...extra });
  if (state.log.length > 500) state.log.splice(0, state.log.length - 500);
}
export function addFact(state, text, source = 'gm') {
  if (!text || state.facts.some(f => f.text === text)) return false;
  state.facts.push({ text, at: state.clock.minutes, source });
  return true;
}
export function addFlag(state, f) {
  const s = String(f || '').trim().slice(0, 60);
  if (s && !state.flags.includes(s)) { state.flags.push(s); return true; }
  return false;
}
export const hasFlag = (state, f) => state.flags.includes(f);
export function queueEvent(state, ev) { state.events.queued.push({ at: state.clock.minutes, ...ev }); }
export function takeEvents(state) { return state.events.queued.splice(0); }
export function foundClue(state, id, notices = []) {
  const c = getClue(state, id);
  if (c && !state.clues.includes(id)) {
    state.clues.push(id);
    notices.push(`CLUE: ${c.text}`);
    addFact(state, `Clue: ${c.text}`, 'clue');
    return true;
  }
  return false;
}

// --------------------------------------------------------------------- time
/** Advance the clock in steps of at most an hour, ticking the body and firing world events. */
export function advanceTime(state, minutes, ctx = {}) {
  const notices = [];
  let remaining = Math.max(0, Math.round(minutes));
  while (remaining > 0 && !state.ended) {
    const step = Math.min(60, remaining);
    const before = state.clock.minutes;
    state.clock.minutes += step; remaining -= step;
    notices.push(...tick(state, step, ctx));
    fireTimeline(state, before, state.clock.minutes);
    resolvePending(state);
    if (dayOf(before) !== dayOf(state.clock.minutes)) onNewDay(state);
    if (state.vitals.health <= 0) break;
  }
  return notices;
}

function fireTimeline(state, from, to) {
  asArray(state.truth.timeline).forEach((e, i) => {
    if (state.events.fired.includes(i)) return;
    if (timelineMinute(e) > to) return;
    applyTimelineEntry(state, e, i);
  });
}

/** Everything that happened before the first day of play is applied silently and recorded as history. */
function prefireTimeline(state) {
  asArray(state.truth.timeline).forEach((e, i) => {
    if (timelineMinute(e) < START_MINUTES) applyTimelineEntry(state, e, i, { history: true });
  });
}

/** Apply one timeline entry: doom, threat, captures, reveals, utilities; then queue it for the GM (or file it as history). */
export function applyTimelineEntry(state, e, i, { history = false } = {}) {
  state.events.fired.push(i);
  const doom = clamp(Math.round(num(e.doom, 0)), 1, 5);
  if (doom > state.doom) state.doom = doom;
  const fx = e.effects || {};
  if (fx.threatDelta) state.threat.level = clamp(state.threat.level + clamp(Math.round(num(fx.threatDelta)), -2, 2), 0, 5);
  if (fx.locationId && getLocation(state, fx.locationId)) {
    const ls = locState(state, fx.locationId);
    if (fx.capturedBy !== undefined && fx.capturedBy !== null && getFaction(state, fx.capturedBy)) ls.heldBy = fx.capturedBy;
    else if (fx.capturedBy === null && 'capturedBy' in fx && fx.liberated) ls.heldBy = null;
    if (fx.dangerDelta) ls.dangerMod = clamp((ls.dangerMod || 0) + num(fx.dangerDelta), -3, 3);
    if (fx.hazardDelta && state.location === fx.locationId && !history) state.vitals.hazard = clamp(state.vitals.hazard + num(fx.hazardDelta));
  }
  if (fx.revealLocationId) revealLocation(state, fx.revealLocationId);
  if (fx.utilities && typeof fx.utilities === 'object') {
    for (const k of UTILITY_KEYS) if (typeof fx.utilities[k] === 'boolean') state.utilities[k] = fx.utilities[k];
  }
  const visible = e.visible !== false;
  const at = history ? timelineMinute(e) : state.clock.minutes;
  if (visible) state.worldEvents.push({ day: num(e.day, 0), text: str(e.event), at, doom, history });
  if (!history) queueEvent(state, { kind: 'world', index: i, text: str(e.event), visible, urgent: !!e.contact || (visible && doom >= 4), contact: !!e.contact, radioFreq: fx.radioFreq || null, doom, inciting: i === state.truth.incitingIndex });
  return e;
}

function onNewDay(state) {
  const day = dayOf(state.clock.minutes);
  state.weather.today = weatherFor(state, day);
  state.stats.days = day;
  if (!state.shelter || state.shelter.locationId !== state.location) state.stats.nightsOutside++;
  const raid = state.phase === 'prologue' ? null : nightlyRaidRoll(state); if (raid) queueEvent(state, raid);
  burnFuel(state);
  // Without power the fridge is a cupboard: fresh and frozen food turns.
  if (state.shelter && !state.utilities?.power) for (const it of state.shelter.stash) if (it.category === 'food' && /frozen|fresh|eggs|leftovers|cheese|milk|bread|meat|fish fillet|yogh?urt|salad|apples|potatoes/i.test(it.name)) it.condition = Math.max(5, it.condition - 20);
  for (const ev of dailyUpkeep(state)) queueEvent(state, ev);
  for (const ev of checkBetrayals(state)) queueEvent(state, ev);
  for (const k of Object.keys(state.threat.local)) state.threat.local[k] = Math.max(0, state.threat.local[k] - 1);
  if (state.shelter && skillCount(state, 'farming') > 0 && day - dayOf(state.shelter.claimedAt) >= 10 && Math.random() < 0.5) {
    addItem(state.shelter.stash, { name: 'Garden vegetables', category: 'food', qty: 2, condition: 70 });
    queueEvent(state, { kind: 'pending_done', text: 'The garden gave a little food today.', silent: true });
  }
  if (state.shelter && [...state.shelter.stash, ...state.inventory.items].some(x => x.tags.includes('watercollector')) && /rain|storm|snow/.test(state.weather.today.kind)) {
    addItem(state.shelter.stash, { name: 'Rainwater', category: 'water', qty: 2 });
    queueEvent(state, { kind: 'pending_done', text: 'The rain catcher filled overnight.', silent: true });
  }
  queueEvent(state, { kind: 'newday', text: `Day ${day} begins. ${state.weather.today.label}${state.weather.today.windy ? ', windy' : ''}.`, visible: true, silent: true });
}

function resolvePending(state) {
  const now = state.clock.minutes;
  for (const p of [...state.pending]) {
    if (p.readyAt > now) continue;
    state.pending.splice(state.pending.indexOf(p), 1);
    if (p.kind === 'assignment') {
      const ev = resolveAssignment(state, p);
      if (ev) { if (ev.clueId) foundClue(state, ev.clueId); queueEvent(state, ev); }
    } else if (p.kind === 'craft') {
      addItem(state.inventory.items, p.item);
      queueEvent(state, { kind: 'pending_done', text: `${p.label} is ready.`, silent: true });
    } else {
      queueEvent(state, { kind: 'pending_done', text: `${p.label}.`, silent: true });
    }
  }
}

// ------------------------------------------------------------- GM changes
/** Apply a GM changes block after validating everything against the truth. Returns notices. */
export function applyChanges(state, changes, ctx = {}) {
  const notices = [];
  if (!changes || typeof changes !== 'object') return notices;
  const v = state.vitals;

  if (changes.vitals && typeof changes.vitals === 'object') {
    const lim = { health: [-35, 15], hunger: [-40, 40], thirst: [-40, 40], fatigue: [-40, 30], warmth: [-30, 30], morale: [-25, 20], hazard: [-20, 30] };
    for (const [k, [lo, hi]] of Object.entries(lim)) {
      let d = clamp(num(changes.vitals[k], 0), lo, hi);
      if (!d) continue;
      if (k === 'health' && d < 0 && ctx.deathBlocked) d = Math.max(d, -(v.health - 5));
      v[k] = clamp(v[k] + d);
    }
  }

  let gained = asArray(changes.itemsGained).filter(x => x && (typeof x === 'string' || x.name)).map(x => (typeof x === 'string' ? { name: x } : x));
  const cap = ctx.budget ? ctx.budget.count + (ctx.budget.hiddenIndex != null ? 1 : 0) : 4;
  gained = gained.slice(0, cap);
  for (const spec of gained) {
    const isAmmo = spec.category === 'ammo' || /round|shell|cartridge|ammo/i.test(spec.name);
    const it = addItem(state.inventory.items, { ...spec, qty: clamp(Math.round(num(spec.qty, 1)) || 1, 1, isAmmo ? 60 : 6) });
    notices.push(`Found: ${it.name}${num(spec.qty, 1) > 1 ? ` ×${Math.min(num(spec.qty, 1), isAmmo ? 60 : 6)}` : ''}`);
    state.stats.itemsFound++;
  }
  for (const n of asArray(changes.itemsLost).slice(0, 5)) {
    const name = typeof n === 'string' ? n : n?.name;
    const it = findItem(state.inventory.items, name);
    if (it) { removeItem(state.inventory.items, it.id, typeof n === 'object' ? clamp(Math.round(num(n.qty, 1)), 1, it.qty) : 1); notices.push(`Lost: ${it.name}`); }
  }
  for (const inj of asArray(changes.injuries).slice(0, 2)) {
    if (!inj || typeof inj !== 'object') continue;
    const added = addInjury(state, { ...inj, severity: clamp(Math.round(num(inj.severity, 1)), 1, ctx.deathBlocked ? 2 : 3) });
    notices.push(`Injured: ${added.type}, ${REGION_LABEL[added.region].toLowerCase()} (severity ${added.severity})`);
  }
  if (changes.illness && typeof changes.illness === 'object' && changes.illness.name) { setIllness(state, changes.illness); notices.push(`Ill: ${state.body.illness.name}`); }

  for (const id of asArray(changes.companionsMet)) if (getNpc(state, id) && !state.npcsMet.includes(id)) { meet(state, id); notices.push(`Met: ${getNpc(state, id).name}`); }
  for (const id of asArray(changes.companionsRecruited)) {
    const c = state.companions[id];
    if (getNpc(state, id) && c?.status !== 'with' && c?.status !== 'dead') { recruit(state, id); notices.push(`${getNpc(state, id).name} joins you.`); }
  }
  for (const x of asArray(changes.companionsLost)) {
    const id = typeof x === 'string' ? x : x?.id; const how = typeof x === 'object' && x ? String(x.how || 'left') : 'left';
    const c = state.companions[id];
    if (getNpc(state, id) && c && (c.status === 'with' || c.status === 'away')) { lose(state, id, ['died', 'captured', 'left'].includes(how) ? how : 'left'); notices.push(`${getNpc(state, id).name}: ${how}`); }
  }
  if (changes.npcMood && typeof changes.npcMood === 'object') {
    for (const [id, mood] of Object.entries(changes.npcMood)) { const m = String(mood || '').toLowerCase(); if (state.companions[id] && MOODS.includes(m)) state.companions[id].mood = m; }
  }
  if (changes.loyaltyDelta && typeof changes.loyaltyDelta === 'object') {
    for (const [id, d] of Object.entries(changes.loyaltyDelta)) if (state.companions[id]) adjustLoyalty(state, id, clamp(Math.round(num(d, 0)), -5, 5));
  }

  for (const id of asArray(changes.factionsMet)) if (getFaction(state, id) && meetFaction(state, id)) notices.push(`Faction identified: ${getFaction(state, id).name}`);
  if (changes.factionDelta && typeof changes.factionDelta === 'object') {
    for (const [id, d] of Object.entries(changes.factionDelta)) {
      if (!getFaction(state, id)) continue;
      const dd = clamp(Math.round(num(d, 0)), -15, 15); if (!dd) continue;
      meetFaction(state, id); adjustStanding(state, id, dd);
      notices.push(`${getFaction(state, id).name}: standing ${dd > 0 ? '+' : ''}${dd}`);
    }
  }

  for (const id of asArray(changes.locationsRevealed)) if (revealLocation(state, id)) notices.push(`Location marked: ${getLocation(state, id).name}`);
  for (const h of asArray(changes.hiddenFound)) {
    const loc = getLocation(state, h?.locationId); const idx = Math.round(num(h?.index, -1));
    if (!loc || !loc.hidden?.[idx]) continue;
    const ls = locState(state, loc.id);
    if (ls.hiddenFound.includes(idx)) continue;
    if (loc.id !== state.location && !ctx.allowRemoteHidden) continue;
    ls.hiddenFound.push(idx);
    notices.push(`Discovered: ${loc.hidden[idx].what}`);
    addFact(state, `At ${loc.name}: ${loc.hidden[idx].what}`, 'search');
    if (loc.hidden[idx].clueId) foundClue(state, loc.hidden[idx].clueId, notices);
  }
  for (const f of asArray(changes.factsLearned).slice(0, 4)) if (typeof f === 'string' && f.trim() && addFact(state, f.trim())) notices.push(`Noted: ${f.trim().slice(0, 90)}`);
  for (const id of asArray(changes.cluesFound)) foundClue(state, id, notices);
  for (const f of asArray(changes.flags).slice(0, 5)) if (typeof f === 'string') addFlag(state, f);
  for (const f of asArray(changes.flagsCleared).slice(0, 5)) state.flags = state.flags.filter(x => x !== f);

  const td = clamp(Math.round(num(changes.threatDelta, 0)), -1, 1);
  if (td) { state.threat.level = clamp(state.threat.level + td, 0, 5); notices.push(`Threat ${td > 0 ? 'rising' : 'easing'}: ${state.threat.level}/5`); }

  if (changes.shelter && typeof changes.shelter === 'object') {
    if (changes.shelter.claim && state.location === changes.shelter.claim) { const r = claimShelter(state, changes.shelter.claim); if (r.ok) notices.push(r.notice); }
    if (changes.shelter.abandon === true && state.shelter) { const r = abandonShelter(state); if (r.ok) notices.push(r.notice); }
  }
  if (typeof changes.moveTo === 'string' && changes.moveTo !== state.location && getLocation(state, changes.moveTo) && state.discovered.locations.includes(changes.moveTo) && !ctx.noMove) {
    const plan = travelPlan(state, changes.moveTo);
    state.location = changes.moveTo;
    locState(state, changes.moveTo).visits++;
    state.stats.distance += plan.distance;
    ctx.travelMinutes = plan.minutes;
    notices.push(`Travelled to ${getLocation(state, changes.moveTo).name}`);
  }
  if (changes.hintGiven === true) { state.hints++; v.morale = clamp(v.morale - 5); notices.push('Hint taken. It cost you some resolve.'); }

  if (changes.death && typeof changes.death === 'object') {
    if (ctx.deathBlocked) { v.health = Math.max(6, v.health - 40); addInjury(state, { region: 'torso', type: 'laceration', severity: 2 }); notices.push('You barely survived that.'); }
    else { v.health = 0; state.deathCause = str(changes.death.cause, 'Killed').slice(0, 120); }
  }
  if (changes.escape === true) {
    if (endingAvailable(state)) state.escapeRequested = true; else notices.push('The way out is not open yet.');
  }
  return notices;
}

// ------------------------------------------------------------------ ending
export function endingAvailable(state) { return endingStatus(state).open; }
export function endingStatus(state) {
  const e = state.truth.ending?.trueWayOut;
  if (!e) return { open: false, atPlace: false, missing: ['no way out defined'] };
  const day = dayOf(state.clock.minutes);
  const atPlace = state.location === e.where;
  const missing = [];
  const ws = num(e.windowStartDay, 0), we = num(e.windowEndDay, 9999);
  if (day < ws) missing.push(`too early (not before day ${ws})`);
  if (day > we) missing.push(`too late (the window closed on day ${we})`);
  for (const r of asArray(e.requirements)) if (r?.flag && !state.flags.includes(r.flag)) missing.push(str(r.description, r.flag));
  return { open: atPlace && missing.length === 0, atPlace, missing, windowStartDay: ws, windowEndDay: we, inWindow: day >= ws && day <= we };
}
export function checkEnd(state) {
  if (state.ended) return state.ended;
  const day = dayOf(state.clock.minutes);
  if (state.vitals.health <= 0) state.ended = { kind: 'death', at: state.clock.minutes, cause: state.deathCause || deathCauseFromState(state) };
  else if (state.escapeRequested && endingAvailable(state)) state.ended = { kind: 'escape', at: state.clock.minutes };
  else if (state.clock.deadlineDay != null && day > state.clock.deadlineDay) state.ended = { kind: 'deadline', at: state.clock.minutes };
  if (state.ended) state.phase = 'ended';
  return state.ended || null;
}
/** The deadline passed and the player chose to keep surviving: no clock now, only the days. */
export function reopenAfterDeadline(state) {
  if (!state.ended || state.ended.kind !== 'deadline') return false;
  state.deadlinePassed = state.clock.deadlineDay;
  state.ended = null; state.debrief = null; state.phase = 'play'; state.escapeRequested = false;
  state.clock.deadlineDay = null;
  addLog(state, 'system', `Day ${state.deadlinePassed} has come and gone. The record stays open: there is no deadline now, only the days, and whatever is still out there.`);
  queueEvent(state, { kind: 'world', text: 'The day the survivor had been counting down to has passed. Whatever was going to happen by then has happened, or never will.', visible: true, urgent: true, doom: state.doom });
  return true;
}
export function retire(state) {
  if (!state.ended) { state.ended = { kind: 'retired', at: state.clock.minutes }; state.phase = 'ended'; }
  return state.ended;
}
function deathCauseFromState(state) {
  const v = state.vitals;
  if (v.thirst <= 0) return 'Dehydration';
  if (v.hunger <= 0) return 'Starvation';
  if (v.warmth < 20) return 'Exposure';
  if (v.hazard > 80) return str(state.truth.apocalypse?.hazardName, 'Exposure');
  if (state.body.injuries.some(i => i.infected)) return 'Infection';
  if (state.body.illness) return `${state.body.illness.name}`;
  return 'Injuries';
}

export function computeScore(state) {
  const e = state.ended || { kind: 'retired' }; const t = state.truth; const day = dayOf(state.clock.minutes);
  let score = { escape: 55, deadline: 35, retired: 15, death: 8 }[e.kind] ?? 10;
  score += Math.min(24, state.clues.length * 8);
  score += Math.min(8, state.discovered.locations.length);
  score += Math.min(9, withPlayer(state).length * 3);
  const hopes = asArray(t.ending?.falseHopes);
  const pursued = hopes.filter(f => state.flags.includes(`pursued_${f.id}`)).length;
  score += Math.max(0, hopes.length - pursued) * 2;
  if (e.kind === 'death') score += Math.round(10 * Math.min(1, day / Math.max(1, num(state.clock.deadlineDay ?? t.deadlineDay, 30))));
  if (state.deadlinePassed != null) score += Math.min(10, Math.max(0, day - state.deadlinePassed));
  score -= state.hints * 3;
  return clamp(Math.round(score), 0, 100);
}
export function ratingFor(score, kind) {
  if (kind === 'escape') return score >= 85 ? 'Legend of the Wasteland' : 'Survivor';
  if (kind === 'deadline') return score >= 50 ? 'Endured' : 'Outlasted, barely';
  if (kind === 'retired') return score >= 45 ? 'Walked away' : 'Gave up';
  return score >= 35 ? 'Lost' : 'Forgotten';
}
