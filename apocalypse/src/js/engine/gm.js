// The Game Master turn loop. The code resolves mechanics first (time, travel,
// encounters, scavenging, radio), then the GM narrates inside those results and
// proposes state changes, which are validated before they are applied.

import { GM_SYSTEM_PROMPT } from '../prompts/gmSystem.js';
import { buildSummaryPrompt } from '../prompts/summary.js';
import { extractJSON, extractPartialNarrative, looksTruncated } from './json.js';
import { complete, completeWithMeta } from '../providers/index.js';
import { clamp, asArray, num, str } from './util.js';
import { dayOf, hourOf, phaseOf, isNight, formatTime, formatHM, formatDuration, MIN_PER_DAY, daysLeft, formatStamp, formatLongDate, formatDate, collapseDay } from './clock.js';
import { addLog, addFact, queueEvent, takeEvents, applyChanges, advanceTime, checkEnd, endingAvailable, endingStatus, foundClue, retire, DOOM_LABEL, timelineMinute, gearAvailable } from './state.js';
import { diff, atShelter, warmthTarget } from './survival.js';
import { conditions, describeInjuries } from './body.js';
import { findItem, removeItem, itemValue, totalWeight, maxWeight, supplyDays } from './inventory.js';
import { withPlayer, away, loyaltyLabel, adjustLoyalty, recordSaid, assign, skillCount, isGuarding, companion } from './companions.js';
import { standingLabel, holderOf } from './factions.js';
import { claimShelter, abandonShelter, fortify, shelterSummary } from './shelter.js';
import { tune, scan, knowFreq, freqLabel, scheduleText, logRadio, walkieReach } from './radio.js';
import { buildBriefing, briefingText } from './briefing.js';
import { estimateMinutes } from './intent.js';
import { consumeByIntent } from './consume.js';
import { rollTravel, scavengeBudget, applyDepletion, resolveEncounter, classifyApproach, encounterChoices, makeEncounter } from './encounters.js';
import { getLocation, getNpc, getFaction, getClue, locState, effectiveDanger, isKnown } from './world.js';

const RECENT_TURNS = 10;        // turns kept verbatim (each turn is two messages)
const SUMMARIZE_AFTER = 18;     // fold older turns into the summary beyond this many

/** The truth as the GM needs it each turn (prologue text is dropped once play begins). */
export function truthForGM(state) {
  const t = { ...state.truth };
  if (state.phase !== 'prologue') { delete t.prologue; delete t.situationReport; }
  return t;
}

/** Visible state the GM is given each turn. Compact on purpose. */
export function buildStateSnapshot(state) {
  const t = state.truth; const m = state.clock.minutes; const v = state.vitals;
  const loc = getLocation(state, state.location); const ls = locState(state, state.location);
  const holder = holderOf(state, state.location);
  const sup = supplyDays(state);
  const gear = gearAvailable(state);
  return {
    survivor: { name: state.survivor.name, background: state.survivor.title || state.survivor.background, backgroundNotes: state.survivor.text || undefined, skills: state.survivor.skills },
    day: dayOf(m), date: formatLongDate(state, m), time: formatHM(m), phase: phaseOf(m), weather: state.weather.today?.label, deadlineDay: state.clock.deadlineDay, daysLeft: daysLeft(state), openEnded: state.clock.deadlineDay == null, deadlinePassed: state.deadlinePassed ?? null,
    collapseDay: collapseDay(state, m), chapter: state.chapter || 1,
    utilities: { ...state.utilities }, home: getLocation(state, state.home)?.name || null,
    gear: { radio: gear.radio, walkieTalkie: gear.walkie, workingPhone: gear.phone, vehicle: gear.vehicle ? gear.vehicle.item.name : null },
    peopleKnownBefore: asArray(t.npcs).filter(n => n.knownToSurvivor).map(n => `${n.id} ${n.name}${n.relationToSurvivor ? ` (${n.relationToSurvivor})` : ''}`),
    history: state.worldEvents.filter(e => e.history).slice(-8).map(e => `${formatDate(state, e.at)}: ${e.text}`),
    doom: `${state.doom}/5 ${DOOM_LABEL[state.doom]}`, threatLevel: state.threat.level, gamePhase: state.phase,
    vitals: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Math.round(x)])), hazardName: t.apocalypse?.hazardName, conditions: conditions(state),
    injuries: describeInjuries(state), illness: state.body.illness ? `${state.body.illness.name} (severity ${state.body.illness.severity}${state.body.illness.treated ? ', treated' : ''})` : null,
    location: { id: loc?.id, name: loc?.name, type: loc?.type, visits: ls.visits, heldBy: holder ? holder.name : null, hiddenFoundHere: ls.hiddenFound.map(i => loc?.hidden?.[i]?.what), searchedAreas: [...new Set(ls.searched)] },
    knownLocations: state.discovered.locations.map(id => { const l = getLocation(state, id); const s = state.locationState[id]; return { id, name: l?.name, visited: (s?.visits || 0) > 0, scouted: !!s?.scouted, isShelter: state.shelter?.locationId === id }; }),
    mode: state.mode, shelter: shelterSummary(state),
    inventory: state.inventory.items.map(i => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`), carry: `${totalWeight(state)}/${maxWeight(state)} kg`, supplies: { foodDays: sup.food, waterDays: sup.water, group: sup.group },
    companions: Object.entries(state.companions).filter(([, c]) => c.status !== 'unknown').map(([id, c]) => ({ id, name: getNpc(state, id)?.name, status: c.status, loyalty: `${c.loyalty} (${loyaltyLabel(c.loyalty)})`, mood: c.mood, hurt: c.hurt || 0, hungryDays: c.hungryDays || 0, assignment: c.assignment?.task || null, lastSaid: c.said.slice(-2).map(s => ({ survivor: s.q, them: s.a.slice(0, 300) })) })),
    npcsMet: state.npcsMet,
    factions: Object.entries(state.factions).filter(([, f]) => f.known).map(([id, f]) => ({ id, name: getFaction(state, id)?.name, standing: `${f.standing} (${standingLabel(f.standing)})` })),
    radio: { knownFrequencies: state.radio.knownFreqs.map(freqLabel), recentlyHeard: state.radio.log.slice(-3).map(x => `${freqLabel(x.freq)}: ${String(x.text).slice(0, 160)}`) },
    facts: state.facts.slice(-25).map(f => f.text), cluesFound: state.clues, flags: state.flags,
    pending: state.pending.map(p => `${p.label} (ready ${formatTime(p.readyAt)})`),
    encounterInProgress: state.encounter && !state.encounter.resolved ? { with: state.encounter.flavor, strength: state.encounter.strength, ambush: state.encounter.ambush } : null,
    endingConditionsMet: endingAvailable(state), hintsTaken: state.hints, turn: state.turnCount
  };
}

function onPlayStart(state) {
  state.threat.level = clamp(Math.round(num(state.truth.threat?.baseLevel, 1)), 0, 5);
  addLog(state, 'sitrep', state.truth.situationReport, 'system');
  addFact(state, 'Situation report received (see the Log).', 'system');
}

/** Everything the code decides before the GM speaks. Mutates state (time, location, rolls). */
function preResolve(state, action) {
  const pre = { minutes: 0, tickCtx: {}, allowGmTime: false, deathPossible: state.vitals.health < 35, budget: null, locationId: state.location, encounterResult: null, theMoment: false };
  const d = diff(state);
  const S = Math.round(num(state.truth.startOffset, 0));
  if (state.phase === 'prologue') {
    pre.deathPossible = false;
    if (action.type === 'prologue_start' || action.type === 'opening') { pre.minutes = 0; return pre; }
    if (S === 0) {
      // The morning it begins: one ordinary turn, then the clock runs to the inciting event.
      pre.minutes = 20;
      if (state.prologueTurns >= 1) {
        pre.theMoment = true;
        const first = state.truth.timeline?.[state.truth.incitingIndex ?? 0];
        if (first) { const at = timelineMinute(first); if (at > state.clock.minutes) pre.minutes = at - state.clock.minutes; }
      }
      return pre;
    }
    // Before it begins: ordinary life runs on the ordinary rules below; the moment comes when the inciting event fires.
    pre.prologueLife = true;
  }
  if (action.type === 'opening') { pre.minutes = 0; pre.deathPossible = false; return pre; }
  if (state.encounter && !state.encounter.resolved) {
    const approach = action.approach || classifyApproach(action.text || '');
    pre.encounterResult = resolveEncounter(state, approach);
    pre.minutes = 20;
    pre.deathPossible = /lost|ambushed/.test(pre.encounterResult.outcome) || state.vitals.health < 35;
    return pre;
  }
  const loc = getLocation(state, state.location);
  switch (action.type) {
    case 'travel': {
      const roll = rollTravel(state, action.locationId);
      pre.travel = roll; pre.minutes = roll.minutes; pre.tickCtx = { exertion: true };
      state.location = action.locationId; pre.locationId = action.locationId;
      locState(state, action.locationId).visits++;
      state.stats.distance += roll.distance;
      if (roll.encounter) state.encounter = roll.encounter;
      pre.deathPossible = false;
      break;
    }
    case 'arrival': pre.minutes = 0; pre.deathPossible = false; locState(state, state.location).visits++; break;
    case 'look': pre.minutes = 20; locState(state, state.location).visits++; break;
    case 'search': {
      const b = scavengeBudget(state, state.location, action.area);
      pre.budget = b; pre.minutes = b.minutes; pre.tickCtx = { exertion: true };
      if (b.hiddenIndex != null) {
        const ls = locState(state, state.location); ls.hiddenFound.push(b.hiddenIndex);
        pre.hidden = loc.hidden[b.hiddenIndex];
        addFact(state, `At ${loc.name}: ${pre.hidden.what}`, 'search');
        if (pre.hidden.clueId) foundClue(state, pre.hidden.clueId);
      }
      if (b.disturbance) state.encounter = b.disturbance;
      applyDepletion(state, state.location, b.categories);
      break;
    }
    case 'consume': { pre.consume = consumeByIntent(state, action.intent || { eat: true, minutes: 25 }); pre.minutes = pre.consume.minutes; break; }
    case 'rest': {
      const hours = clamp(num(action.hours, 6), 0.5, 16);
      pre.hours = hours; pre.minutes = hours * 60; pre.tickCtx = { sleeping: true, camp: !!action.camp };
      if (!atShelter(state)) {
        const risk = (effectiveDanger(state, state.location) * 4 + state.threat.level * 4 + (isNight(state.clock.minutes) ? 10 : 0)) * d.encounter - skillCount(state, 'stealth') * 5 - (isGuarding(state) ? 10 : 0);
        if (Math.random() * 100 < clamp(risk, 2, 60)) state.encounter = makeEncounter(state, loc, Math.random, { ambush: true, context: 'rest' });
      }
      break;
    }
    case 'wait': pre.hours = clamp(num(action.hours, 1), 0.25, 12); pre.minutes = Math.round(pre.hours * 60); break;
    case 'talk': pre.minutes = 10; break;
    case 'give': {
      const it = findItem(state.inventory.items, action.itemId);
      const c = state.companions[action.npcId];
      if (it && c) {
        removeItem(state.inventory.items, it.id, 1);
        if (it.tags.includes('walkie')) c.hasWalkie = true;
        pre.loyaltyGain = Math.min(10, Math.max(2, Math.round(itemValue({ ...it, qty: 1 }) / 2)));
        adjustLoyalty(state, action.npcId, pre.loyaltyGain); c.mood = 'grateful';
        if (it.category === 'medical' && c.hurt > 0) c.hurt--;
        pre.giveItem = it;
      }
      pre.minutes = 5;
      break;
    }
    case 'call': { pre.call = walkieReach(state); pre.minutes = 5; break; }
    case 'tune': { pre.tune = tune(state, action.freq); pre.minutes = 30; break; }
    case 'scan': { const ch = scan(state); pre.scan = ch; pre.minutes = 45; if (ch) { knowFreq(state, ch.freq); pre.tune = tune(state, ch.freq); } break; }
    case 'fortify': { pre.fortify = fortify(state); pre.minutes = pre.fortify.ok ? pre.fortify.minutes : 0; break; }
    case 'claim': { pre.claim = claimShelter(state, state.location); pre.minutes = pre.claim.ok ? 60 : 0; break; }
    case 'abandon': { pre.abandon = abandonShelter(state); pre.minutes = pre.abandon.ok ? 30 : 0; break; }
    case 'assign': { pre.assign = assign(state, action.npcId, action.task, action.locationId); pre.minutes = 10; break; }
    case 'skip': { pre.minutes = skipAheadMinutes(state); pre.tickCtx = { sleeping: isNight(state.clock.minutes) && atShelter(state) }; break; }
    case 'hint': pre.minutes = 30; break;
    case 'trade': pre.minutes = 30; pre.allowGmTime = true; break;
    case 'use': pre.minutes = 10; pre.allowGmTime = true; break;
    case 'end': pre.minutes = 0; break;
    default: pre.minutes = 15; pre.allowGmTime = true;
  }
  if (pre.prologueLife) {
    // Ordinary life: no ambushes, raids or disturbances before the world has broken.
    pre.allowGmTime = true; pre.deathPossible = false;
    state.encounter = null; if (pre.travel) pre.travel.encounter = null; if (pre.budget) pre.budget.disturbance = null;
  }
  return pre;
}

/** Skip ahead to the next thing that matters: an event, a returning companion, a change of light, or hunger. At most 12 hours. */
function skipAheadMinutes(state) {
  const now = state.clock.minutes; let next = now + 12 * 60;
  (state.truth.timeline || []).forEach((e, i) => { if (state.events.fired.includes(i)) return; const at = timelineMinute(e); if (at > now && at < next) next = at; });
  for (const p of state.pending) if (p.readyAt > now && p.readyAt < next) next = p.readyAt;
  const dayStart = Math.floor(now / MIN_PER_DAY) * MIN_PER_DAY;
  for (const b of [5, 7, 18, 21]) { const cand = dayStart + b * 60; if (cand > now && cand < next) next = cand; }
  const dawn = dayStart + MIN_PER_DAY + 5 * 60; if (dawn < next) next = dawn;
  const v = state.vitals; const dr = diff(state).drain;
  for (const tt of [(v.hunger - 25) / (2.1 * dr) * 60, (v.thirst - 25) / (4.2 * dr) * 60]) if (tt > 30 && now + tt < next) next = now + tt;
  return Math.max(30, Math.round(next - now));
}

/** Turn a UI action plus the code's results into the structured message the GM receives. */
export function describeAction(state, action, pre, events, notices) {
  const lines = [];
  const words = (action.text || '').trim();
  const loc = getLocation(state, state.location);
  const time = formatStamp(state);
  const weather = state.weather.today?.label || '';
  const S = Math.round(num(state.truth.startOffset, 0));
  const moment = !!pre.theMoment || events.some(e => e.inciting);
  if (state.phase === 'prologue' && (action.type === 'prologue_start' || moment || S === 0)) {
    if (moment) {
      const inc = state.truth.timeline?.[state.truth.incitingIndex ?? 0];
      lines.push(`[PROLOGUE: THE MOMENT · it is ${time}, ${weather}] ${words ? `The survivor was doing this: "${words}".` : 'The survivor is going about their day.'} While they do it, the world breaks. Inciting event (it happened at ${inc ? formatHM(timelineMinute(inc)) : 'this hour'}): "${inc?.event || ''}". Narrate how they notice (truth.prologue.howTheyNotice), then truth.prologue.theMoment and the first hours (prologue.firstHours) as one tight, frightening, grounded scene in their own life, 200-320 words. End with the survivor forced into a first real survival decision and offer 2-4 choices. After this turn the game proper begins; the situation report will be posted automatically, so do not read it out.`);
      const others = events.filter(e => !e.inciting && !e.silent);
      if (others.length) lines.push(`Also happening: ${others.map(e => e.text).join(' | ')}`);
      return lines.join('\n');
    }
    if (action.type === 'prologue_start') {
      if (S < 0) lines.push(`[PROLOGUE: ORDINARY LIFE · ${time} · ${weather}] This is the first scene. Narrate the start of an ordinary day from truth.survivor.lifeBefore and truth.prologue.ordinaryLife: home, routine, the people in the survivor's life (the npcs with knownToSurvivor true). Nothing is wrong and nothing is foreshadowed. End with the survivor about to do something ordinary and offer 2-3 ordinary choices (work, errands, people). 150-250 words.`);
      else lines.push(`[PROLOGUE: OPENING · ${time} · ${weather}] Narrate the survivor's ordinary morning from the truth's prologue.ordinaryLife and survivor.lifeBefore: home, routine, the people in their life. Nothing is wrong yet, though one small detail may feel off. End with the survivor about to do something ordinary and offer 2-3 ordinary choices. 150-250 words.`);
      return lines.join('\n');
    }
    lines.push(`[PROLOGUE: ORDINARY ACTION · ${time}] The survivor does: "${words}". Keep the day ordinary; something small may be slightly wrong (a siren far off, a headline, a dropped call, a neighbour who left early). Offer 2-3 ordinary choices. 80-160 words.`);
    return lines.join('\n');
  }
  if (action.type === 'opening') {
    const b = buildBriefing(state);
    lines.push(`[OPENING · ALREADY SURVIVING · ${time} · ${weather}] This is the first scene of a game that begins ${S} days into the collapse. The survivor has read the dossier below. Open on where they stand right now (${loc?.name}), what the last ${S} days have cost, the state of their home, their pack and the people around them, and the first real decision. 180-300 words, 2-4 choices. Do not read the dossier back to them.\nDOSSIER:\n${briefingText(b)}`);
    return lines.join('\n');
  }
  if (state.phase === 'prologue') lines.push(`[PROLOGUE: ORDINARY LIFE CONTINUES · collapse day ${collapseDay(state)}] The world is still ordinary: power, water, phones, shops and money all work (see utilities). Keep it so. If an EVENT fired, it is a small sign: weave it in once, lightly, without explanation. Ordinary choices; move time with timeMinutes (an errand 60-120, a working shift up to 480, a night's sleep with "resting": true). Do not start the collapse yourself.`);
  if (events.length) {
    lines.push('[EVENTS SINCE THE LAST TURN: they already happened and the state already reflects them. Weave them in, urgent ones first.]');
    for (const e of events) {
      if (e.silent) { lines.push(`- (background) ${e.text}`); continue; }
      let note = '';
      if (e.kind === 'world' && e.index != null && state.truth.timeline?.[e.index]) { const at = timelineMinute(state.truth.timeline[e.index]); note += ` (at ${formatDate(state, at)} ${formatHM(at)})`; }
      if (e.kind === 'world' && !e.visible) note = ' (HIDDEN world event: the survivor does not witness it. Show it only through indirect signs if anything would reach them: distant smoke, a radio fragment, a rumour, an unusual silence. Otherwise leave it out.)';
      if (e.urgent) note += ' (URGENT: open with this.)';
      if (e.contact) note += ` (RADIO CONTACT: a named voice reaches the survivor${e.radioFreq ? ` on ${e.radioFreq}` : ''}, speaking in first person, wanting something time-critical. Speaker "radio". Hold the scene on the contact until the survivor answers; offer choices about how to answer.)`;
      if (e.kind === 'betrayal') note += ' (BETRAYAL: narrate exactly this; the state already reflects it. Do not soften it.)';
      lines.push(`- [${String(e.kind).toUpperCase()}] ${e.text}${note}`);
    }
    lines.push('');
  }
  if (notices.length) lines.push(`[BODY AND SUPPLY NOTICES: ${notices.join(' | ')}]`);
  if (pre.encounterResult) {
    const r = pre.encounterResult;
    lines.push(`[ENCOUNTER RESOLVED BY THE GAME] ${r.text} Narrate exactly this outcome in 120-220 words; do not change who was hurt or what was lost. Survivor's words: ${words || '(none)'}`);
    lines.push(`It is now ${time}.`);
    lines.push(`DEATH POSSIBLE THIS TURN: ${pre.deathPossible ? 'yes' : 'no'}.`);
    return lines.join('\n');
  }
  const encounterTail = enc => `ENCOUNTER BEGINS: ${enc.flavor}${enc.ambush ? ' (an AMBUSH; they were waiting)' : ''}, strength ${enc.strength}/10, ${enc.kind === 'humans' ? 'human' : 'the threat itself'}. End your narrative at the moment of decision. Do NOT resolve it, do not describe injuries or losses; the game resolves the survivor's next action as fight, flee, hide or talk. Offer no choices (the game supplies them).`;
  switch (action.type) {
    case 'travel': {
      const t = pre.travel; const ls = locState(state, loc.id); const holder = holderOf(state, loc.id);
      lines.push(`[ACTION: TRAVEL to location=${loc.id} ("${loc.name}") · about ${t.distance} km${t.vehicle ? ` by ${t.vehicle}` : ' on foot'} · took ${formatDuration(t.minutes)} · weather ${weather} · arriving ${time}]`);
      lines.push(ls.visits <= 1 ? `First visit: describe the approach and the place as the truth describes it, with its sharpEyeDetails as things a careful eye notices (leads, not answers). ${holder ? `It is held by ${holder.name}.` : ''}` : `Return visit (${ls.visits}). Note what has changed.`);
      if (t.encounter) lines.push(encounterTail(t.encounter));
      if (words) lines.push(`Survivor: ${words}`);
      break;
    }
    case 'arrival': { const prev = (state.lineage || []).slice(-1)[0]; lines.push(`[NEW SURVIVOR] This is a new person in a world that already has a history. Narrate who ${state.survivor.name} is (a ${state.survivor.background}), how they have survived until now (it is ${time}, ${weather}), where they stand (${loc?.name}) and what they see. ${prev ? `The previous survivor, ${prev.name}, ${prev.ending === 'death' ? `died on day ${prev.day}${prev.cause ? ` (${prev.cause})` : ''}` : prev.ending === 'escape' ? `got out on day ${prev.day}` : `was last seen on day ${prev.day}`}; the world remembers them, and people who met them may mention them.` : ''} Offer 2-4 choices. 150-250 words.`); break; }
    case 'look': lines.push(`[ACTION: LOOK AROUND at ${loc.id} ("${loc.name}") · ${time} · ${weather}] Describe what is visible now. Mention the searchable areas naturally. Survivor: ${words || 'I take it in.'}`); break;
    case 'search': {
      const b = pre.budget;
      lines.push(`[ACTION: SEARCH location=${loc.id} ("${loc.name}") area="${action.area}" · took ${b.minutes} min · now ${time}]`);
      lines.push(`SCAVENGE RESULT (decided by the game): ${b.count === 0 ? 'NOTHING useful this time (picked over, or the wrong place). Do not add items.' : `${b.count} item(s) of quality "${b.quality}", categories: ${b.categories.join(', ')}. Name them to fit the scene (suggestions: ${b.suggestions.join('; ')}) and list exactly these in changes.itemsGained with those categories.`}`);
      if (pre.hidden) lines.push(`HIDDEN FIND: the survivor discovers ${pre.hidden.what} (${pre.hidden.where}). It is already recorded; narrate the discovery${pre.hidden.clueId ? ` and let the clue land in play: "${getClue(state, pre.hidden.clueId)?.text}"` : ''}. If it is a physical object they would take, you may add it as one extra item.`);
      if (b.disturbance) lines.push(`DISTURBANCE: the search is interrupted. ${encounterTail(b.disturbance)}`);
      if (words) lines.push(`Survivor: ${words}`);
      break;
    }
    case 'rest':
      lines.push(`[ACTION: SLEEP / REST ${pre.hours}h at ${loc.name}${atShelter(state) ? ' (your shelter)' : ' (no shelter: rough camp)'} · the clock has already moved · it is now ${time}]${words ? ` Survivor: "${words}".` : ''} Narrate the whole span in one reply: lying down, what the night or the hours held, the waking, how the body feels now. The game has applied the rest and the time; do not change vitals for it. 80-180 words.${state.encounter ? ` They are woken. ${encounterTail(state.encounter)}` : ''}`);
      break;
    case 'consume': {
      const c = pre.consume;
      lines.push(`[ACTION: EAT / DRINK · resolved by the game · ${c.minutes} min · now ${time}] Survivor: "${words}"`);
      lines.push(c.ok
        ? `RESULT: ${c.ate ? `ate ${c.ate}${c.cooked ? ' (cooked)' : ''}; ` : ''}${c.drank ? `drank ${c.drank}; ` : ''}hunger now ${Math.round(state.vitals.hunger)}, thirst ${Math.round(state.vitals.thirst)}. ${c.notices.join(' ')} Narrate the meal or the drink briefly (40-120 words), consistent with exactly this. The body and the stores are already updated: change no vitals and list no items.`
        : `RESULT: NOTHING. ${c.notices.join(' ')} Narrate the empty cupboard, the dry tap or the search for something to eat briefly (40-100 words); no items appear and no vitals change.`);
      break;
    }
    case 'wait': lines.push(`[ACTION: WAIT ${pre.hours}h at ${loc.name} · now ${time}] A brief passage of time: what changes, what is heard. 60-120 words.`); break;
    case 'talk': {
      const npc = getNpc(state, action.npcId); const c = companion(state, action.npcId);
      lines.push(`[ACTION: TALK to npc=${npc.id} ("${npc.name}" · ${c.status === 'with' ? 'companion' : c.status === 'away' ? 'AWAY on a task, reachable only if plausible' : 'present at this place'} · loyalty ${c.loyalty} (${loyaltyLabel(c.loyalty)}) · mood ${c.mood}${c.hurt ? ' · hurt' : ''}${c.hungryDays ? ` · ${c.hungryDays} day(s) hungry` : ''})]`);
      lines.push(action.indirect ? `What follows is what the survivor does and says to them, in the survivor's own words.\nSurvivor: ${words}` : `Survivor says: "${words}"`);
      lines.push('Answer in their voice (speaker "npc:<id>"). They remember everything in their said-log and what the survivor has done. Set npcMood and loyaltyDelta (-3..3) honestly. If the survivor asks them to come along and they would, set companionsRecruited. If they know a clue (ending.clues with source.kind "npc" and their id) and the conversation earns it, let it come out naturally and set cluesFound.');
      break;
    }
    case 'give': {
      const npc = getNpc(state, action.npcId);
      if (pre.giveItem) lines.push(`[ACTION: GIVE "${pre.giveItem.name}" to npc=${npc.id} ("${npc.name}")] The item has changed hands and loyalty rose by ${pre.loyaltyGain} (already applied). Narrate their reaction in character, briefly (40-100 words). Survivor: ${words || '(says nothing)'}`);
      else lines.push(`[ACTION: GIVE] The survivor meant to hand something over but has nothing matching. One line, in character.`);
      break;
    }
    case 'call': {
      const r = pre.call;
      const who = [...r.companions.map(c => `npc ${c.id} ("${c.name}", about ${c.distance} km away at ${c.locationName}, carrying a paired unit)`), ...r.factions.map(f => `faction ${f.id} ("${f.name}", people within range)`), ...(r.stranger ? ['an unknown stranger listening on the same channel'] : [])];
      lines.push(`[ACTION: WALKIE-TALKIE CALL · range about ${r.rangeKm} km · now ${time}] Survivor transmits: "${words}"`);
      lines.push(who.length ? `WHO CAN HEAR AND ANSWER: ${who.join('; ')}. Only these; answer in their voice, or with static if they choose not to.` : 'NOBODY is within range with a paired unit. Static, a far-off burst of someone else\'s traffic, nothing more. Speaker "radio".');
      break;
    }
    case 'tune': {
      const r = pre.tune;
      lines.push(`[ACTION: RADIO TUNE ${freqLabel(r.freq)} · 30 min · now ${time}]`);
      if (r.kind === 'invalid') lines.push('Result: the dial setting made no sense; static. One or two lines, speaker "radio".');
      else if (r.kind === 'static') lines.push('Result: static, nothing but noise on this frequency now. One or two atmospheric lines, speaker "radio". Do not invent a broadcast.');
      else if (r.kind === 'carrier') lines.push(`Result: a carrier or dead air; something broadcasts here at other times (${scheduleText(r.channel)}). Hint at that without content, two or three lines, speaker "radio".`);
      else lines.push(`Result: BROADCAST from "${r.channel.owner}" (${r.channel.kind}). Render this message in the broadcaster's voice, with static, repeats and atmosphere, without adding facts: """${r.message.text}"""${r.message.truthful === false ? ' (The game knows this broadcast is misleading. Play it straight; never flag it as false.)' : ''} Speaker "radio". If this broadcast carries a clue from ending.clues (source.kind "radio", this frequency) set cluesFound.`);
      break;
    }
    case 'scan': {
      lines.push(`[ACTION: RADIO SCAN · 45 min · now ${time}]`);
      if (pre.scan && pre.tune?.kind === 'broadcast') lines.push(`The scan locks onto ${freqLabel(pre.tune.freq)}, "${pre.tune.channel.owner}" (${pre.tune.channel.kind}). Render this message in the broadcaster's voice without adding facts: """${pre.tune.message.text}""" Speaker "radio".`);
      else lines.push('The scan finds nothing but noise and a few broken carriers. One or two lines, speaker "radio".');
      break;
    }
    case 'fortify': lines.push(`[ACTION: FORTIFY shelter] ${pre.fortify.ok ? `Done (3 hours). ${pre.fortify.notice} Narrate the work briefly; companions may help or complain.` : `NOT POSSIBLE: ${pre.fortify.notice} Narrate the frustration briefly; no state change.`}`); break;
    case 'claim': lines.push(`[ACTION: CLAIM SHELTER at ${loc.name}] ${pre.claim.ok ? `The survivor settles in (1 hour). ${pre.claim.notice} Narrate making the place theirs.` : `NOT POSSIBLE: ${pre.claim.notice} One or two lines.`}`); break;
    case 'abandon': lines.push(`[ACTION: ABANDON SHELTER] ${pre.abandon.ok ? pre.abandon.notice : pre.abandon.notice} Narrate briefly.`); break;
    case 'assign': {
      const npc = getNpc(state, action.npcId); const r = pre.assign;
      lines.push(`[ACTION: ASSIGN ${npc?.name} to ${action.task}${action.locationId ? ` at ${getLocation(state, action.locationId)?.name}` : ''}] ${r.ok ? `${r.notice} Narrate the departure or arrangement briefly, in their voice if they have opinions.` : `${r.refused ? 'REFUSED' : 'NOT POSSIBLE'}: ${r.notice} Narrate briefly.`}`);
      break;
    }
    case 'skip': lines.push(`[ACTION: SKIP AHEAD ${formatDuration(pre.minutes)} · now ${time} · ${weather}] Narrate the passage of time compactly (80-160 words): what changed, what was heard, how the body feels.`); break;
    case 'hint': lines.push(`[ACTION: HINT REQUESTED] The survivor asks for direction: "${words || 'What should I do?'}". Give ONE vague, in-character nudge (a thought, a memory, a companion's remark, a radio fragment) toward the next useful step. Never name the solution or the hidden cause. Set hintGiven true. Hints so far: ${state.hints}.`); break;
    case 'trade': {
      const f = holderOf(state, state.location); const st = f ? state.factions[f.id]?.standing || 0 : 0;
      lines.push(`[ACTION: TRADE${f ? ` with ${f.name} (standing ${st}, ${standingLabel(st)})` : ' (no faction holds this place; only a passing stranger could trade)'}] Survivor: "${words}". Barter is in character; their tradeGoods and wants are in the truth. Exchanged items go in itemsGained and itemsLost (at most 2 each way), only items the survivor actually holds. Hostile standing means no trade.`);
      break;
    }
    case 'use': lines.push(`[ACTION: USE "${action.itemName}"] Survivor: ${words || `I use the ${action.itemName}.`} Narrate the attempt; set changes only as the truth allows. If it is consumed, list it in itemsLost.`); break;
    case 'end': lines.push('[ACTION: END MY STORY] The survivor chooses to stop here. Narrate a final, quiet closing scene of 80-150 words in the present tense. No choices.'); break;
    case 'choice': lines.push(`[ACTION: CHOICE] The survivor chose: "${words}". Resolve it in the world's terms. Set timeMinutes (0-240) for how long it took.`); break;
    default: lines.push(`[ACTION: FREE] Survivor: ${words}\nThe world is open: the survivor attempts exactly this, and you resolve it by the world's physics, the people present and the state. Impossible or foolish things fail, cost or backfire believably; they are never refused and never answered with a menu. Set timeMinutes for how long it took (0-240; up to 720 with "resting": true if they sleep or rest). If they set out for a KNOWN location, set "moveTo" to its id and the game applies the travel time. If they search or forage in prose, award at most two modest items that fit this place.`);
  }
  if (action.type !== 'end') {
    if (endingAvailable(state)) lines.push('NOTE: ENDING CONDITIONS ARE MET here and now. If the survivor takes the way out, set "escape": true and narrate the departure without revealing the hidden cause (the debrief will).');
    else { const es = endingStatus(state); if (es.atPlace) lines.push(`NOTE: this is the place of the true way out, but it is not open: ${es.missing.join('; ')}. Do not let them leave by it; show why it is not possible yet.`); }
  }
  lines.push(`It is ${time}, ${weather}. Utilities: power ${state.utilities?.power ? 'on' : 'OFF'}, water ${state.utilities?.water ? 'on' : 'OFF'}, phones ${state.utilities?.cell ? 'on' : 'OFF'}, internet ${state.utilities?.internet ? 'on' : 'OFF'}. DEATH POSSIBLE THIS TURN: ${pre.deathPossible ? 'yes' : 'no'}.`);
  return lines.join('\n');
}

function normalizeSpeaker(state, speaker, action) {
  const s = String(speaker || '').trim();
  if (s === 'narrator' || s === 'radio' || s === 'system') return s;
  const m = s.match(/^(npc|faction):(.+)$/);
  if (m && ((m[1] === 'npc' && getNpc(state, m[2])) || (m[1] === 'faction' && getFaction(state, m[2])))) return s;
  if (action.type === 'talk' && action.npcId) return `npc:${action.npcId}`;
  if (action.type === 'tune' || action.type === 'scan') return 'radio';
  return 'narrator';
}

/**
 * Run one GM turn. onNarrative(text) is called repeatedly with the narrative so far.
 * Returns { narrative, speaker, choices, changes, notices, events, fallback, timeSpent, ended }.
 */
export async function runTurn({ state, action, provider, apiKey, model, baseUrl, onNarrative, onStatus, signal }) {
  const pre = preResolve(state, action);
  const noticesBefore = advanceTime(state, pre.minutes, pre.tickCtx);
  const events = takeEvents(state);
  if (state.phase === 'prologue' && events.some(e => e.inciting)) pre.theMoment = true;
  const actionText = describeAction(state, action, pre, events, noticesBefore);
  const snapshot = buildStateSnapshot(state);
  // The truth rides in the system prompt so the long, unchanging prefix can be cached by the provider.
  const system = `${GM_SYSTEM_PROMPT}\n\n======================================================================\nWORLD TRUTH (hidden; never reveal)\n======================================================================\n${JSON.stringify(truthForGM(state))}`;
  const context = [
    'CURRENT STATE:', JSON.stringify(snapshot), '',
    state.summary ? `SUMMARY OF EARLIER PLAY:\n${state.summary}` : 'SUMMARY OF EARLIER PLAY: (the story has just begun)'
  ].join('\n');
  const messages = [
    { role: 'user', content: `${context}\n\n(The transcript of recent turns follows as separate messages. Reply only to the final ACTION.)` },
    { role: 'assistant', content: '{"narrative": "Understood. Ready to continue.", "speaker": "narrator", "choices": [], "changes": {}}' },
    ...state.history.slice(-RECENT_TURNS * 2),
    { role: 'user', content: actionText }
  ];

  let raw = '';
  let parsed = null;
  let fallback = false;
  let cutOff = false;
  for (let attempt = 1; attempt <= 2; attempt++) {
    onStatus?.(attempt === 1 ? 'Transmitting...' : 'Malformed reply; retrying...');
    raw = '';
    let lastShown = '';
    const nag = cutOff ? 'Your previous reply was cut off at the output limit. Keep the narrative under 180 words and the JSON compact.' : 'Your previous reply was not valid JSON. Reply with exactly one JSON object as specified, "narrative" first, no fences or commentary.';
    const msgs = attempt === 1 ? messages : [...messages.slice(0, -1), { role: 'user', content: `${actionText}\n\n(${nag})` }];
    try {
      const r = await completeWithMeta(provider, { apiKey, model, baseUrl, json: true, system, messages: msgs, maxTokens: 6000, temperature: 0.85, effort: 'low', signal }, (chunk, text) => {
        const n = extractPartialNarrative(text);
        if (n != null && n !== lastShown) { lastShown = n; onNarrative?.(n); }
      });
      raw = r.text;
      if (r.finishReason === 'refusal') throw new Error('The model declined to continue this scene. Try a different action.');
      cutOff = r.finishReason === 'length' || looksTruncated(raw);
    } catch (err) {
      if (signal?.aborted || attempt === 2 || /declined/.test(err.message)) throw err;
      continue;
    }
    try {
      parsed = extractJSON(raw);
      if (typeof parsed.narrative !== 'string') throw new Error('no narrative');
      break;
    } catch { parsed = null; }
  }
  if (!parsed) {
    fallback = true;
    const n = extractPartialNarrative(raw);
    parsed = { narrative: (n && n.length > 20) ? n : raw.replace(/^[{\s"]*narrative"?\s*:?\s*"?/, '').trim(), speaker: 'narrator', choices: [], changes: {} };
  }
  onNarrative?.(parsed.narrative);

  const ctx = { budget: pre.budget, locationId: pre.locationId, deathBlocked: !pre.deathPossible, noMove: !pre.allowGmTime, narrative: parsed.narrative || '' };
  const notices = applyChanges(state, parsed.changes || {}, ctx);
  // Time for a free action: what the GM says it took, checked against the game's own estimate from
  // the survivor's words and the narrative, so a night's sleep is never twenty minutes.
  let resting = pre.allowGmTime && (parsed.changes?.resting === true || parsed.resting === true);
  let extra = 0;
  if (pre.allowGmTime) {
    const said = [parsed.timeMinutes, parsed.changes?.timeMinutes].map(x => num(x, NaN)).find(Number.isFinite);
    const est = estimateMinutes(state, action.text || '', parsed.narrative || '');
    if (!Number.isFinite(said) || said <= 0) { extra = est.minutes; resting = resting || est.resting; }
    else if (est.resting && est.minutes > said) { extra = est.minutes; resting = true; }
    else if (est.source === 'narrative-clock' && est.minutes > said) extra = est.minutes;
    else extra = said;
    extra = clamp(Math.round(extra), 0, resting ? 960 : 600);
  }
  if (ctx.travelMinutes) extra = Math.max(extra, ctx.travelMinutes);
  const noticesAfter = extra ? advanceTime(state, extra, resting ? { sleeping: true, camp: !atShelter(state) } : ctx.travelMinutes ? { exertion: true } : {}) : [];

  state.lastChoices = asArray(parsed.choices).filter(c => typeof c === 'string' && c.trim()).slice(0, 4).map(c => c.trim().slice(0, 140));
  if (state.encounter && !state.encounter.resolved) state.lastChoices = encounterChoices(state.encounter);
  if (action.type === 'end') state.lastChoices = [];

  const speaker = normalizeSpeaker(state, parsed.speaker, action);
  if (action.type === 'talk' && action.npcId) recordSaid(state, action.npcId, action.text, parsed.narrative);
  if ((action.type === 'tune' || action.type === 'scan') && pre.tune?.kind === 'broadcast') logRadio(state, { freq: pre.tune.freq, text: pre.tune.message.text, owner: pre.tune.channel.owner, kind: pre.tune.channel.kind, truthful: pre.tune.message.truthful !== false });
  else if (action.type === 'tune' && pre.tune && pre.tune.kind !== 'invalid') logRadio(state, { freq: pre.tune.freq, text: pre.tune.kind === 'static' ? 'static' : 'carrier / dead air', kind: pre.tune.kind });
  else if (action.type === 'call') logRadio(state, { freq: null, kind: 'call', text: `"${action.text}" · ${parsed.narrative.slice(0, 240)}` });
  addLog(state, action.type, parsed.narrative, speaker, { events: events.filter(e => !e.silent).map(e => e.text), urgent: events.some(e => e.urgent), survivorLine: action.text || null });
  state.history.push({ role: 'user', content: actionText }, { role: 'assistant', content: JSON.stringify({ narrative: parsed.narrative, speaker, choices: state.lastChoices, changes: parsed.changes || {} }) });
  state.turnCount += 1;

  if (state.phase === 'prologue') {
    state.prologueTurns += 1;
    if (pre.theMoment) { state.phase = 'play'; onPlayStart(state); }
  }
  if (action.type === 'opening') state.openingDone = true;
  if (action.type === 'end') retire(state);

  if (state.history.length > SUMMARIZE_AFTER * 2) {
    const old = state.history.splice(0, state.history.length - RECENT_TURNS * 2);
    try {
      onStatus?.('Updating the record...');
      const turns = old.map(t => ({ role: t.role, content: t.role === 'assistant' ? safeNarrative(t.content) : t.content }));
      state.summary = (await complete(provider, { apiKey, model, baseUrl, json: false, system: 'You summarise role-play transcripts precisely.', messages: [{ role: 'user', content: buildSummaryPrompt({ previousSummary: state.summary, turns }) }], maxTokens: 2000, temperature: 0.3, effort: 'low', signal })).trim();
    } catch { state.history.unshift(...old); }
  }
  const ended = checkEnd(state);
  return { narrative: parsed.narrative, speaker, choices: state.lastChoices, changes: parsed.changes || {}, notices: [...noticesBefore, ...notices, ...noticesAfter], events, fallback, timeSpent: pre.minutes + extra, ended, pre };
}

function safeNarrative(json) { try { return JSON.parse(json).narrative || json; } catch { return json; } }
