// Validation and normalisation of the generated world truth. Returns a list of
// problems; an empty list means the world is playable. The generator regenerates
// with the problems fed back to the model.

import { asArray, num, str } from './util.js';
import { SKILLS } from './state.js';
import { parseStartDate, defaultStartDate } from './clock.js';

// Models write the string "null" (or "N/A", "none") where the schema says "or null".
const NULLISH = /^\s*(null|none|n\/a|na|nil|undefined|not applicable|unknown|-|—)\s*$/i;
export function deepClean(x) {
  if (typeof x === 'string') return NULLISH.test(x) ? null : x;
  if (Array.isArray(x)) return x.map(deepClean);
  if (x && typeof x === 'object') { for (const k of Object.keys(x)) x[k] = deepClean(x[k]); }
  return x;
}

export const LOCATION_TYPES = ['residence', 'shelter', 'store', 'hospital', 'checkpoint', 'industrial', 'wilderness', 'water', 'camp', 'government', 'ruin', 'transport', 'religious', 'other'];
export const TRIGGER_KINDS = ['loyaltyBelow', 'dayAfter', 'foodDaysBelow', 'moraleBelow', 'healthBelow', 'factionStandingAbove', 'factionStandingBelow', 'flag', 'shelterClaimed'];
export const BETRAYAL_EFFECTS = ['steal', 'leave', 'sabotage', 'lure', 'kill_attempt', 'defect'];
export const RESOURCE_KEYS = ['food', 'water', 'medical', 'fuel', 'materials', 'weapons'];
export const UTILITIES = ['power', 'water', 'cell', 'internet'];

/**
 * Models stamp event text with the day and hour they imagine ("Day 0, 22:00:
 * Power fails"). The game timestamps every event itself, so the stamp is
 * stripped; the hour it names is kept as the entry's hour (see hourFromText).
 */
export function stripStamp(text) {
  let t = String(text || '').trim();
  for (let i = 0; i < 3; i++) {
    const before = t;
    t = t.replace(/^[[(]?\s*day\s+-?\d+\s*(?:,?\s*(?:at\s+)?\d{1,2}:\d{2}(?:\s*(?:h|hrs|am|pm))?)?\s*[\])]?\s*[:,.\-–—]?\s*/i, '');
    t = t.replace(/^[[(]?\s*\d{1,2}:\d{2}(?:\s*(?:h|hrs|am|pm))?\s*[\])]?\s*[:,.\-–—]\s*/i, '');
    t = t.replace(/^([^.:!?]{0,40}?),?\s*day\s+-?\d+(?:\s*,?\s*(?:at\s+)?\d{1,2}:\d{2}(?:\s*(?:h|hrs|am|pm))?)?\s*([.:,\-–—]\s*)/i, (m, pre, punct) => (pre ? pre + (punct.trim() === ',' ? ': ' : punct) : ''));
    if (t === before) break;
  }
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}
/** The hour an event text names ("at 22:00", "by 6 pm", "at noon"), or null. */
export function hourFromText(text) {
  const t = String(text || '');
  let m = /\b([01]?\d|2[0-3]):([0-5]\d)\b/.exec(t);
  if (m) return Number(m[1]);
  m = /\b(1[0-2]|[1-9])\s*(am|pm|a\.m\.|p\.m\.)/i.exec(t);
  if (m) { const h = Number(m[1]) % 12; return /p/i.test(m[2]) ? h + 12 : h; }
  if (/\bmidnight\b/i.test(t)) return 0;
  if (/\b(?:at|by|around|before)\s+dawn\b|\bfirst light\b/i.test(t)) return 6;
  if (/\b(?:at|by|around)\s+noon\b|\bmidday\b/i.test(t)) return 12;
  if (/\b(?:at|by|around)\s+dusk\b|\bsunset\b/i.test(t)) return 19;
  return null;
}

/**
 * Validate the generated world. opts.startDay is the day of play relative to the
 * inciting event (negative: before it); opts.custom says the survivor wrote
 * their own background, so the model must supply skills for it.
 */
export function validateWorld(w, opts = {}) {
  const problems = [];
  const need = (cond, msg) => { if (!cond) problems.push(msg); };
  if (!w || typeof w !== 'object') return ['World is not an object'];
  const S = Math.round(num(opts.startDay, 0));

  need(str(w.title).length > 1, 'title missing');
  need(w.apocalypse && str(w.apocalypse.type), 'apocalypse.type missing');
  need(w.apocalypse && str(w.apocalypse.publicBelief).length > 40, 'apocalypse.publicBelief missing or too short');
  need(w.apocalypse && str(w.apocalypse.trueCause).length > 80, 'apocalypse.trueCause missing or too short (needs a real hidden story)');
  need(w.apocalypse && str(w.apocalypse.hazardName), 'apocalypse.hazardName missing');
  need(w.region && str(w.region.name), 'region.name missing');
  need(w.prologue && str(w.prologue.ordinaryLife || w.prologue.ordinaryMorning).length > 80, 'prologue.ordinaryLife missing or too short');
  need(w.prologue && str(w.prologue.theMoment).length > 80, 'prologue.theMoment missing or too short');
  need(str(w.situationReport).length > 80, 'situationReport missing or too short');
  need(Number.isFinite(num(w.deadlineDay, NaN)) && num(w.deadlineDay) >= S + 7, `deadlineDay missing or less than ${S + 7} (the survivor starts on day ${S})`);
  const deadline = num(w.deadlineDay, 30);
  if (w.region && w.region.startDate != null) need(parseStartDate(w.region.startDate), 'region.startDate must be a YYYY-MM-DD date');
  const sv = w.survivor;
  need(sv && typeof sv === 'object' && str(sv.title) && str(sv.lifeBefore).length > 60, 'survivor needs a title and a lifeBefore paragraph');
  if (opts.custom) need(sv && Array.isArray(sv.skills) && sv.skills.some(x => SKILLS.includes(x)), `survivor.skills must name 1-2 of: ${SKILLS.join(', ')}`);

  const locations = asArray(w.locations);
  need(locations.length >= 8 && locations.length <= 12, `need 8-12 locations, got ${locations.length}`);
  const lIds = new Set();
  for (const l of locations) {
    need(l && l.id && !lIds.has(l.id), `location id missing or duplicate: ${l?.id}`);
    if (l?.id) lIds.add(l.id);
    need(l && str(l.name) && str(l.description).length > 40, `location ${l?.id} missing name or description`);
    need(l && Number.isFinite(num(l.x, NaN)) && Number.isFinite(num(l.y, NaN)), `location ${l?.id} needs numeric x and y (0-100)`);
    need(l && l.resources && typeof l.resources === 'object', `location ${l?.id} missing resources object`);
    need(l && Array.isArray(l.searchableAreas) && l.searchableAreas.length >= 2, `location ${l?.id} needs at least 2 searchableAreas`);
    if (l && l.heldBy != null) need(asArray(w.factions).some(f => f.id === l.heldBy), `location ${l.id} heldBy unknown faction ${l.heldBy}`);
    for (const h of asArray(l?.hidden)) need(h && str(h.what) && str(h.where), `location ${l?.id} has a hidden entry without what/where`);
  }
  const start = w.region?.startLocationId;
  need(lIds.has(start), `region.startLocationId "${start}" is not a location`);
  need(locations.filter(l => l.initiallyKnown).length >= 3, 'at least 3 locations must be initiallyKnown');
  need(locations.filter(l => num(l.shelterQuality) >= 3).length >= 2, 'at least 2 locations need shelterQuality 3 or more');
  need(locations.reduce((a, l) => a + asArray(l.hidden).length, 0) >= 6, 'at least 6 hidden items across all locations');

  const factions = asArray(w.factions);
  need(factions.length >= 2 && factions.length <= 3, `need 2-3 factions, got ${factions.length}`);
  const fIds = new Set();
  for (const f of factions) {
    need(f && f.id && !fIds.has(f.id), `faction id missing or duplicate: ${f?.id}`);
    if (f?.id) fIds.add(f.id);
    need(f && str(f.name) && str(f.goal) && str(f.secret), `faction ${f?.id} needs name, goal and secret`);
    need(f && lIds.has(f.baseLocationId), `faction ${f?.id} baseLocationId "${f?.baseLocationId}" is not a location`);
  }

  const npcs = asArray(w.npcs);
  need(npcs.length >= 6 && npcs.length <= 8, `need 6-8 npcs, got ${npcs.length}`);
  const nIds = new Set();
  let betrayers = 0;
  for (const n of npcs) {
    need(n && n.id && !nIds.has(n.id) && !lIds.has(n.id) && !fIds.has(n.id), `npc id missing or duplicate: ${n?.id}`);
    if (n?.id) nIds.add(n.id);
    need(n && str(n.name) && str(n.background).length > 40 && str(n.speechStyle) && str(n.personality), `npc ${n?.id} needs name, background, personality, speechStyle`);
    need(n && str(n.secret), `npc ${n?.id} needs a secret`);
    need(n && Array.isArray(n.skills) && n.skills.some(s => SKILLS.includes(s)), `npc ${n?.id} needs skills from: ${SKILLS.join(', ')}`);
    need(n && ['loyal', 'steady', 'fickle', 'treacherous'].includes(String(n.loyaltyTendency).toLowerCase()), `npc ${n?.id} loyaltyTendency must be loyal|steady|fickle|treacherous`);
    need(n && lIds.has(n.locationId), `npc ${n?.id} locationId "${n?.locationId}" is not a location`);
    if (n?.factionId != null) need(fIds.has(n.factionId), `npc ${n.id} factionId unknown`);
    const b = n?.betrayal;
    if (b && b.will) {
      betrayers++;
      need(b.trigger && TRIGGER_KINDS.includes(b.trigger.kind), `npc ${n.id} betrayal.trigger.kind must be one of ${TRIGGER_KINDS.join('|')}`);
      need(BETRAYAL_EFFECTS.includes(String(b.effect)), `npc ${n.id} betrayal.effect must be one of ${BETRAYAL_EFFECTS.join('|')}`);
      need(str(b.how).length > 10, `npc ${n.id} betrayal.how missing`);
      if (b.trigger && /faction/.test(b.trigger.kind)) need(fIds.has(b.trigger.factionId), `npc ${n.id} betrayal trigger needs a valid factionId`);
    }
  }
  need(betrayers >= 1, 'at least one npc must have betrayal.will true');
  need(npcs.some(n => n && n.knownToSurvivor === true), 'at least one npc must have knownToSurvivor true (someone from the survivor\'s own life)');

  const t = w.threat;
  need(t && str(t.name) && str(t.nature) && str(t.behavior), 'threat needs name, nature and behavior');
  need(t && Array.isArray(t.weaknesses) && t.weaknesses.length >= 1, 'threat.weaknesses needs at least 1 entry');
  need(t && Array.isArray(t.escalation) && t.escalation.length >= 2, 'threat.escalation needs at least 2 entries');

  const tl = asArray(w.timeline);
  need(tl.length >= 10, `timeline needs at least 10 entries, got ${tl.length}`);
  for (const e of tl) need(e && Number.isFinite(num(e.day, NaN)) && str(e.event).length > 10, 'every timeline entry needs a numeric day and an event');
  need(tl.filter(e => e && e.visible === false).length >= 3, 'at least 3 timeline entries must have visible false (hidden world events)');
  need(tl.some(e => e && e.contact === true && num(e.day, -1) > S), 'at least one timeline entry after the start day must have contact true (an incoming radio contact)');
  need(tl.some(e => num(e?.day, -1) === 0), 'the timeline must contain a day 0 inciting event');
  need(tl.some(e => num(e?.doom, 0) >= 4), 'the timeline must escalate to doom 4 or 5 before the deadline');
  if (S < 0) need(tl.some(e => num(e?.day, 0) < 0), `the survivor starts on day ${S}: the timeline needs entries on days ${S} to -1 (the signs before it begins)`);
  if (S > 0) {
    need(tl.filter(e => num(e?.day, -1) >= 0 && num(e?.day, -1) <= S).length >= 3, `the survivor starts on day ${S}: the timeline needs at least 3 entries between day 0 and day ${S} (what has already happened)`);
    need(tl.filter(e => num(e?.day, -1) > S).length >= 5, `the survivor starts on day ${S}: the timeline needs at least 5 entries after day ${S}`);
  }

  const en = w.ending;
  need(en && en.trueWayOut && str(en.trueWayOut.what) && lIds.has(en.trueWayOut.where), 'ending.trueWayOut needs what and a valid where (locationId)');
  if (en?.trueWayOut) {
    const ws = num(en.trueWayOut.windowStartDay, NaN), we = num(en.trueWayOut.windowEndDay, NaN);
    need(Number.isFinite(ws) && Number.isFinite(we) && ws <= we, 'ending.trueWayOut window days must be numbers with start <= end');
    need(we <= deadline, 'ending.trueWayOut.windowEndDay must not be after deadlineDay');
    need(ws >= S + 3, `ending.trueWayOut.windowStartDay must be at least ${S + 3} (the survivor starts on day ${S})`);
    const reqs = asArray(en.trueWayOut.requirements);
    need(reqs.length >= 1 && reqs.length <= 3, 'ending.trueWayOut.requirements needs 1-3 entries');
    for (const r of reqs) need(r && /^[a-z0-9_]+$/.test(str(r.flag)) && str(r.description) && str(r.howToObtain), 'each requirement needs a snake_case flag, description and howToObtain');
  }
  const clues = asArray(en?.clues);
  need(clues.length >= 3, `ending.clues needs at least 3 entries, got ${clues.length}`);
  const cIds = new Set();
  const freqs = new Set(asArray(w.radio?.channels).map(c => normFreq(c.freq)));
  for (const c of clues) {
    need(c && c.id && !cIds.has(c.id) && str(c.text).length > 10, `clue id/text missing or duplicate: ${c?.id}`);
    if (c?.id) cIds.add(c.id);
    const k = c?.source?.kind; const sid = c?.source?.id;
    need(['location', 'npc', 'radio'].includes(k), `clue ${c?.id} source.kind must be location|npc|radio`);
    if (k === 'location') {
      need(lIds.has(sid), `clue ${c.id} source location ${sid} unknown`);
      const loc = locations.find(l => l.id === sid);
      need(loc && asArray(loc.hidden).some(h => h.clueId === c.id), `clue ${c.id} must appear as a hidden entry with clueId "${c.id}" at location ${sid}`);
    }
    if (k === 'npc') need(nIds.has(sid), `clue ${c.id} source npc ${sid} unknown`);
    if (k === 'radio') need(freqs.has(normFreq(sid)), `clue ${c.id} source radio frequency ${sid} is not a channel`);
  }
  const hopes = asArray(en?.falseHopes);
  need(hopes.length >= 2 && hopes.length <= 3, `ending.falseHopes needs 2-3 entries, got ${hopes.length}`);
  for (const h of hopes) {
    need(h && h.id && str(h.promise) && str(h.whatReallyHappens), 'each false hope needs id, promise and whatReallyHappens');
    if (h?.where != null) need(lIds.has(h.where), `false hope ${h.id} where "${h.where}" is not a location`);
  }

  const channels = asArray(w.radio?.channels);
  need(channels.length >= 4, `radio.channels needs at least 4 entries, got ${channels.length}`);
  for (const c of channels) {
    need(c && normFreq(c.freq) != null, `channel frequency missing or not numeric: ${c?.freq}`);
    need(c && str(c.owner) && str(c.kind), `channel ${c?.freq} needs owner and kind`);
    need(c && Array.isArray(c.messages) && c.messages.length >= 1 && c.messages.every(m => str(m?.text).length > 5), `channel ${c?.freq} needs messages with text`);
  }
  return problems;
}

function normFreq(s) { const n = parseFloat(String(s ?? '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 1000) / 1000 : null; }

/** Fill defaults and coerce types so the engine can rely on shapes. Call after validation passes. */
export function normalizeWorld(w, settings = {}) {
  const S = Math.round(num(settings.startDay, 0));
  w.apocalypse = w.apocalypse || {};
  w.apocalypse.type = str(w.apocalypse.type, settings.apocalypseName || 'Unknown');
  w.apocalypse.hazardName = str(w.apocalypse.hazardName, 'Exposure');
  w.region = w.region || {};
  w.region.season = str(w.region.season, 'autumn');
  w.region.startDate = parseStartDate(w.region.startDate) ? String(w.region.startDate).slice(0, 10) : defaultStartDate(w.region.season);
  w.deadlineDay = Math.round(num(w.deadlineDay, 30));
  w.situationReport = stripStamp(str(w.situationReport));
  w.prologue = w.prologue && typeof w.prologue === 'object' ? w.prologue : {};
  w.prologue.ordinaryLife = str(w.prologue.ordinaryLife || w.prologue.ordinaryMorning); delete w.prologue.ordinaryMorning;
  w.prologue.signs = asArray(w.prologue.signs).map(String).slice(0, 6);
  w.prologue.howTheyNotice = str(w.prologue.howTheyNotice);
  const sv = w.survivor && typeof w.survivor === 'object' ? w.survivor : {};
  w.survivor = {
    title: str(sv.title, '').slice(0, 60), lifeBefore: str(sv.lifeBefore),
    skills: asArray(sv.skills).filter(x => SKILLS.includes(x)).slice(0, 2),
    kit: asArray(sv.kit).filter(k => k && (typeof k === 'string' || k.name)).slice(0, 4),
    carry: Math.max(-4, Math.min(6, Math.round(num(sv.carry, 0)))),
    vehicle: sv.vehicle ? str(sv.vehicle).slice(0, 60) : null
  };
  for (const l of w.locations) {
    l.x = Math.max(0, Math.min(100, num(l.x, 50))); l.y = Math.max(0, Math.min(100, num(l.y, 50)));
    l.danger = Math.max(0, Math.min(5, Math.round(num(l.danger, 1))));
    l.hazard = Math.max(0, Math.min(5, Math.round(num(l.hazard, 0))));
    l.shelterQuality = Math.max(0, Math.min(5, Math.round(num(l.shelterQuality, 0))));
    l.type = LOCATION_TYPES.includes(String(l.type).toLowerCase()) ? String(l.type).toLowerCase() : 'other';
    const r = {}; for (const k of RESOURCE_KEYS) r[k] = Math.max(0, Math.min(5, Math.round(num(l.resources?.[k], 0)))); l.resources = r;
    l.initiallyKnown = !!l.initiallyKnown || l.id === w.region.startLocationId;
    l.hidden = asArray(l.hidden).filter(h => h && h.what && h.where).map(h => ({ what: str(h.what), where: str(h.where), clueId: h.clueId || null }));
    l.sharpEyeDetails = asArray(l.sharpEyeDetails).map(String);
    l.searchableAreas = asArray(l.searchableAreas).map(String);
    l.heldBy = l.heldBy || null;
  }
  const startLoc = w.locations.find(l => l.id === w.region.startLocationId);
  if (startLoc && startLoc.shelterQuality < 1) startLoc.shelterQuality = 1;
  for (const f of w.factions) { f.strength = Math.max(1, Math.min(5, Math.round(num(f.strength, 2)))); f.tradeGoods = asArray(f.tradeGoods).map(String); f.wants = asArray(f.wants).map(String); f.attitudeToStrangers = str(f.attitudeToStrangers, 'wary').toLowerCase(); }
  for (const n of w.npcs) {
    n.skills = asArray(n.skills).filter(s => SKILLS.includes(s));
    n.loyaltyTendency = String(n.loyaltyTendency).toLowerCase();
    n.factionId = n.factionId || null;
    n.knownToSurvivor = n.knownToSurvivor === true;
    n.relationToSurvivor = n.relationToSurvivor ? str(n.relationToSurvivor).slice(0, 120) : null;
    if (!n.betrayal || !n.betrayal.will) n.betrayal = null;
    else { n.betrayal.trigger = n.betrayal.trigger || {}; n.betrayal.trigger.value = num(n.betrayal.trigger.value, 0); }
  }
  w.threat = w.threat || {};
  w.threat.nightMultiplier = Math.max(1, Math.min(3, num(w.threat.nightMultiplier, 1.5)));
  w.threat.baseLevel = Math.max(0, Math.min(5, Math.round(num(w.threat.baseLevel, 1))));
  w.timeline = asArray(w.timeline).map(e => {
    const event = stripStamp(str(e.event));
    const effects = e.effects && typeof e.effects === 'object' ? e.effects : {};
    if (effects.utilities && typeof effects.utilities === 'object') { const u = {}; for (const k of UTILITIES) if (typeof effects.utilities[k] === 'boolean') u[k] = effects.utilities[k]; effects.utilities = u; } else delete effects.utilities;
    return { ...e, event, day: Math.round(num(e.day, 0)), hour: Math.max(0, Math.min(23, Math.round(hourFromText(event) ?? num(e.hour, 9)))), doom: Math.max(1, Math.min(5, Math.round(num(e.doom, 1)))), visible: e.visible !== false, contact: !!e.contact, effects };
  }).sort((a, b) => (a.day * 24 + a.hour) - (b.day * 24 + b.hour));
  // The inciting event: the first entry on the day it all begins. At an onset start the morning before it is the prologue.
  const inciting = w.timeline.find(e => e.day === 0) || w.timeline[0];
  if (inciting && inciting.day === 0 && S === 0 && inciting.hour < 9) inciting.hour = 9;
  w.incitingIndex = w.timeline.indexOf(inciting);
  // Utilities fail with the world unless the model said when; a story with no blackout at all is not a collapse.
  if (!w.timeline.some(e => e.effects.utilities && Object.keys(e.effects.utilities).length)) {
    const at3 = w.timeline.find(e => e.doom >= 3), at4 = w.timeline.find(e => e.doom >= 4);
    if (at3) at3.effects.utilities = { cell: false, internet: false };
    if (at4) at4.effects.utilities = { ...(at4.effects.utilities || {}), power: false, water: false };
  }
  w.ending.trueWayOut.requirements = asArray(w.ending.trueWayOut.requirements);
  w.ending.trueWayOut.windowStartDay = Math.round(num(w.ending.trueWayOut.windowStartDay, 0));
  w.ending.trueWayOut.windowEndDay = Math.round(num(w.ending.trueWayOut.windowEndDay, w.deadlineDay));
  w.ending.falseHopes = asArray(w.ending.falseHopes).map(h => ({ ...h, where: h.where || null }));
  w.radio = w.radio || { channels: [] };
  for (const c of w.radio.channels) { c.freq = String(c.freq); c.schedule = c.schedule && typeof c.schedule === 'object' ? c.schedule : {}; c.messages = asArray(c.messages).map(m => ({ fromDay: Math.round(num(m.fromDay, 0)), text: stripStamp(str(m.text)), truthful: m.truthful !== false })); }
  shiftWorldDays(w, S);
  return w;
}

/**
 * The model counts days from the inciting event. The game counts them from the
 * first day of play, so every day number in the truth is moved by the start
 * offset: a game that begins three days before the collapse sees the inciting
 * event on day 3; one that begins three weeks in sees it on day -21, already
 * history. The offset is kept as truth.startOffset.
 */
export function shiftWorldDays(w, S) {
  w.startOffset = S;
  if (!S) return w;
  for (const e of asArray(w.timeline)) e.day = Math.round(num(e.day, 0)) - S;
  for (const c of asArray(w.radio?.channels)) {
    const sc = c.schedule || {};
    if (sc.fromDay != null) sc.fromDay = Math.round(num(sc.fromDay, 0)) - S;
    if (sc.toDay != null) sc.toDay = Math.round(num(sc.toDay, 0)) - S;
    for (const m of asArray(c.messages)) m.fromDay = Math.round(num(m.fromDay, 0)) - S;
  }
  const wo = w.ending?.trueWayOut;
  if (wo) { wo.windowStartDay = Math.round(num(wo.windowStartDay, 0)) - S; wo.windowEndDay = Math.round(num(wo.windowEndDay, 0)) - S; }
  w.deadlineDay = Math.round(num(w.deadlineDay, 30)) - S;
  for (const n of asArray(w.npcs)) if (n.betrayal?.trigger?.kind === 'dayAfter') n.betrayal.trigger.value = num(n.betrayal.trigger.value, 0) - S;
  return w;
}
