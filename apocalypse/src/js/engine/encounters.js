// Travel, encounters, combat and escape, and scavenging: all resolved by code.
// The GM is told the outcome and narrates it.

import { clamp, pick, overlap } from './util.js';
import { getLocation, locState, effectiveDanger } from './world.js';
import { diff } from './survival.js';
import { isNight } from './clock.js';
import { movementPenalty, combatPenalty, addInjury, REGION_LABEL } from './body.js';
import { weaponRating, spendAmmo, overweightFactor, removeItem, genericItem, vehicleOf } from './inventory.js';
import { withPlayer, skillCount, adjustLoyalty, lose } from './companions.js';
import { holderOf, adjustStanding, hostilityMod } from './factions.js';
import { getNpc } from './world.js';

export function distance(a, b) { return Math.hypot((a?.x || 0) - (b?.x || 0), (a?.y || 0) - (b?.y || 0)); }

/** Time and risk of travelling to a location from where the survivor stands. */
export function travelPlan(state, toId) {
  const from = getLocation(state, state.location), to = getLocation(state, toId);
  const dist = distance(from, to);
  const w = state.weather?.today || {};
  const night = isNight(state.clock.minutes);
  let minutes = Math.max(1, dist) * 6 * (w.travel || 1) * (1 + movementPenalty(state)) * (overweightFactor(state) > 1 ? 1.25 : 1) * (night ? 1.15 : 1);
  const v = vehicleOf(state.inventory.items);
  const vehicle = state.flags.includes('has_vehicle') ? 'vehicle' : v?.kind === 'motor' ? v.item.name : v?.kind === 'bike' ? v.item.name : null;
  if (state.flags.includes('has_vehicle') || v?.kind === 'motor') minutes *= 0.35;
  else if (v?.kind === 'bike') minutes *= 0.6;
  minutes = clamp(Math.round(minutes), 10, 16 * 60);
  const t = state.truth.threat || {};
  let risk = (effectiveDanger(state, toId) * 5 + (state.threat.level || 0) * 5 + (t.baseLevel || 0) * 2 + dist * 0.15) * (w.encounter || 1) * diff(state).encounter;
  if (night) risk *= Number(t.nightMultiplier) || 1.5;
  risk -= skillCount(state, 'stealth') * 6 + skillCount(state, 'scavenging') * 2;
  risk += withPlayer(state).length * 2;
  if (state.flags.some(f => f.startsWith('lured_by'))) risk = 100;
  return { distance: Math.round(dist), minutes, risk: clamp(Math.round(risk), 3, 100), to, from, vehicle };
}

export function rollTravel(state, toId, rnd = Math.random) {
  const plan = travelPlan(state, toId);
  const encounter = rnd() * 100 < plan.risk ? makeEncounter(state, plan.to, rnd, { ambush: plan.risk >= 100, context: 'travel' }) : null;
  return { ...plan, encounter };
}

export function makeEncounter(state, loc, rnd = Math.random, { ambush = false, context = 'travel' } = {}) {
  const holder = holderOf(state, loc.id);
  const humansWeight = clamp(0.35 + (holder ? 0.3 : 0) + (diff(state).hostility - 1) * 0.2, 0.1, 0.85);
  const kind = rnd() < humansWeight ? 'humans' : 'threat';
  const t = state.truth.threat || {};
  const strength = clamp(Math.round((Number(t.baseLevel) || 1) + (state.threat.level || 0) * 0.8 + effectiveDanger(state, loc.id) * 0.6 + (isNight(state.clock.minutes) ? 1.5 : 0) + (ambush ? 2 : 0) + rnd() * 2), 1, 10);
  const faction = kind === 'humans' && holder && rnd() < 0.7 ? holder : null;
  const flavor = kind === 'threat' ? (t.name || 'the threat')
    : faction ? `a ${faction.name} patrol`
    : pick(['desperate scavengers', 'armed looters', 'a family on the road who may not be what they seem', 'a lone stranger with a story', 'men in mismatched uniforms demanding a toll'], rnd);
  return { kind, strength, factionId: faction?.id || null, flavor, ambush, context, at: state.clock.minutes, locationId: loc.id, resolved: false };
}

export function playerPower(state) {
  const items = state.inventory.items;
  let p = 1 + skillCount(state, 'combat') * 2 + weaponRating(items);
  for (const id of withPlayer(state)) { const npc = getNpc(state, id); p += npc?.skills?.includes('combat') ? 1.5 : 0.5; }
  p -= combatPenalty(state) * 4;
  if (state.vitals.fatigue < 20) p -= 1.5;
  if (state.vitals.health < 40) p -= 1;
  if (state.vitals.hunger < 15) p -= 0.5;
  return Math.max(0.5, p);
}

export function classifyApproach(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(fight|attack|shoot|open fire|swing|charge|strike|kill|stab|hit|punch|club|defend myself|stand and)\b/.test(t)) return 'fight';
  if (/\b(run|flee|escape|sprint|bolt|retreat|get away|back off|get out|leave fast|drive off)\b/.test(t)) return 'flee';
  if (/\b(hide|wait|crouch|duck|stay still|quiet|take cover|freeze|sneak|slip past|lie low)\b/.test(t)) return 'hide';
  if (/\b(talk|negotiate|trade|offer|surrender|hands up|call out|greet|parley|bargain|plead|hail|reason|ask them|tell them|say)\b/.test(t)) return 'talk';
  return 'improvise';
}
export function encounterChoices(enc) {
  return enc.kind === 'humans' ? ['Fight', 'Run', 'Hide', 'Talk to them'] : ['Fight', 'Run', 'Hide and wait'];
}

/** Resolve the current encounter with an approach. Mutates state; returns the result the GM narrates. */
export function resolveEncounter(state, approachIn, rnd = Math.random) {
  const enc = state.encounter; if (!enc) return null;
  const items = state.inventory.items;
  const power = playerPower(state); const S = enc.strength;
  const night = isNight(state.clock.minutes);
  let approach = approachIn;
  let note = '';
  if (approach === 'talk' && enc.kind !== 'humans') { approach = 'fight'; note = 'The survivor tried to reason with something that does not reason; it came to a fight.'; }
  const faction = enc.factionId ? (state.truth.factions || []).find(f => f.id === enc.factionId) : null;
  const standing = faction ? state.factions[faction.id]?.standing || 0 : 0;
  const hostility = faction ? hostilityMod(state, faction.id) : diff(state).hostility;
  const res = { approach, outcome: '', injuries: [], itemsLost: [], companionCasualty: null, ammoUsed: 0, noise: 0, standingDelta: 0, moraleDelta: 0, gift: false, note, text: '' };

  const fightChance = clamp(45 + (power - S) * 9 - (enc.ambush ? 15 : 0), 8, 92);
  const fleeChance = clamp(55 + skillCount(state, 'stealth') * 8 - S * 5 - movementPenalty(state) * 40 - (state.vitals.fatigue < 25 ? 15 : 0) - (enc.ambush ? 15 : 0), 8, 92);
  const hideChance = clamp(50 + skillCount(state, 'stealth') * 12 - withPlayer(state).length * 6 + (night ? 10 : 0) - (enc.ambush ? 30 : 0), 5, 90);
  const talkChance = clamp(40 + skillCount(state, 'negotiation') * 12 + standing / 4 - (hostility - 1) * 35 - (enc.ambush ? 10 : 0), 5, 90);
  if (approach === 'improvise') { approach = fightChance >= fleeChance ? 'fight' : 'flee'; note = `The survivor improvised something of their own; the game resolved it with the odds of ${approach === 'fight' ? 'fighting' : 'getting away'}. Narrate THEIR idea, with this outcome.`; }
  const roll = rnd() * 100;

  const hurt = sev => {
    const type = enc.kind === 'threat' ? pick(['bite', 'laceration', 'bruise', 'puncture'], rnd) : pick(['gunshot', 'cut', 'bruise', 'fracture'], rnd);
    const region = pick(['leftArm', 'rightArm', 'leftLeg', 'rightLeg', 'torso', 'abdomen', 'leftHand', 'rightHand', 'head'], rnd);
    const inj = addInjury(state, { region, type, severity: sev }, rnd);
    res.injuries.push({ region: inj.region, type: inj.type, severity: inj.severity });
  };
  const dropItems = (n, protectWeapons = true) => {
    const cands = items.filter(x => !(protectWeapons && x.category === 'weapon')).sort(() => rnd() - 0.5).slice(0, n);
    for (const c of cands) { removeItem(items, c.id, 1); res.itemsLost.push(c.name); }
  };
  const casualty = p => {
    const ids = withPlayer(state); if (!ids.length || rnd() >= p) return;
    const id = pick(ids, rnd); const npc = getNpc(state, id);
    if (rnd() < 0.45) { lose(state, id, 'died'); res.companionCasualty = { id, name: npc?.name || id, how: 'died' }; }
    else { state.companions[id].hurt = (state.companions[id].hurt || 0) + 1; adjustLoyalty(state, id, -5); res.companionCasualty = { id, name: npc?.name || id, how: 'hurt' }; }
  };
  const useAmmo = () => { if (weaponRating(items) >= 3) { res.ammoUsed = spendAmmo(items, 2 + Math.floor(rnd() * 5)); res.noise += 2; } else res.noise += 1; };

  state.stats.encounters++;
  if (approach === 'fight') {
    useAmmo();
    if (roll < fightChance * 0.55) { res.outcome = 'won'; state.stats.kills++; res.moraleDelta = 5; }
    else if (roll < fightChance) { res.outcome = 'won_hurt'; hurt(1 + (rnd() < 0.4 ? 1 : 0)); state.stats.kills++; res.moraleDelta = 1; }
    else if (roll < fightChance + 25) { res.outcome = 'lost'; hurt(2); dropItems(1); casualty(0.3); res.moraleDelta = -8; }
    else { res.outcome = 'lost_badly'; hurt(2); hurt(1 + (rnd() < 0.5 ? 1 : 0)); dropItems(2, false); casualty(0.5); res.moraleDelta = -15; }
    if (faction) res.standingDelta = -15;
  } else if (approach === 'flee') {
    if (roll < fleeChance) { res.outcome = 'escaped'; }
    else { res.outcome = 'escaped_hurt'; hurt(1 + (rnd() < 0.3 ? 1 : 0)); if (rnd() < 0.4) dropItems(1); res.moraleDelta = -4; }
    if (faction) res.standingDelta = -3;
  } else if (approach === 'hide') {
    if (roll < hideChance) { res.outcome = 'hid'; }
    else { res.outcome = 'ambushed'; hurt(2); dropItems(1); casualty(0.25); res.moraleDelta = -8; res.noise += 1; }
  } else if (approach === 'talk') {
    if (roll < talkChance) { res.outcome = 'talked'; res.standingDelta = faction ? 8 : 0; res.moraleDelta = 3; res.gift = rnd() < 0.4; }
    else { res.outcome = 'talk_failed'; if (rnd() < 0.5) { hurt(1); dropItems(1); } else dropItems(2); res.standingDelta = faction ? -5 : 0; res.moraleDelta = -5; }
  }
  state.vitals.morale = clamp(state.vitals.morale + res.moraleDelta);
  if (faction && res.standingDelta) adjustStanding(state, faction.id, res.standingDelta);
  if (res.noise) {
    state.threat.local[enc.locationId] = clamp((state.threat.local[enc.locationId] || 0) + res.noise, 0, 5);
    if (state.shelter?.locationId === enc.locationId) state.shelter.noise = Math.min(5, state.shelter.noise + 1);
  }
  enc.resolved = true; enc.result = res;
  state.encounter = null;
  state.flags = state.flags.filter(f => !f.startsWith('lured_by'));
  res.text = summarize(res, enc);
  return res;
}

function summarize(res, enc) {
  const parts = [`Against ${enc.flavor} (strength ${enc.strength}/10) the survivor chose to ${res.approach.toUpperCase()}; outcome: ${res.outcome.replace(/_/g, ' ').toUpperCase()}.`];
  if (res.injuries.length) parts.push(`Survivor injured: ${res.injuries.map(i => `${i.type} to the ${REGION_LABEL[i.region].toLowerCase()} (severity ${i.severity})`).join('; ')}.`);
  else parts.push('Survivor unhurt.');
  if (res.ammoUsed) parts.push(`Ammunition spent: ${res.ammoUsed}.`);
  if (res.itemsLost.length) parts.push(`Items lost or dropped: ${res.itemsLost.join(', ')}.`);
  if (res.companionCasualty) parts.push(`Companion ${res.companionCasualty.name} ${res.companionCasualty.how === 'died' ? 'was KILLED' : 'was hurt'}.`);
  if (res.standingDelta) parts.push(`Faction standing ${res.standingDelta > 0 ? '+' : ''}${res.standingDelta}.`);
  if (res.gift) parts.push('They parted on good terms; a small gift or useful information changes hands (you may add ONE modest item or a fact).');
  if (res.noise) parts.push('It was loud; the area is more dangerous now.');
  if (res.note) parts.push(res.note);
  return parts.join(' ');
}

// ---------------------------------------------------------------- scavenging
const RES_TO_CAT = { food: 'food', water: 'water', medical: 'medical', fuel: 'fuel', materials: 'material', weapons: 'weapon' };

/** What a search of an area can yield; decided before the GM speaks. */
export function scavengeBudget(state, locationId, area, rnd = Math.random) {
  const loc = getLocation(state, locationId); const ls = locState(state, locationId); const d = diff(state);
  const res = ls.resources; const total = Object.values(res).reduce((a, b) => a + b, 0);
  const skill = skillCount(state, 'scavenging'); const w = state.weather?.today || {};
  const areaKey = String(area || 'general').toLowerCase().trim();
  const repeat = ls.searched.filter(a => a === areaKey).length;
  const night = isNight(state.clock.minutes);
  let roll = rnd() * 100 + skill * 10 + Math.min(20, total * 2) * d.scarcity * (w.scavenge || 1) - repeat * 25 - (night ? 10 : 0);
  if ((loc.sharpEyeDetails || []).some(s => overlap(s, areaKey) > 0)) roll += 10;
  let count = roll < 30 ? 0 : roll < 60 ? 1 : roll < 88 ? 2 : 3;
  if (total === 0) count = 0;
  const pool = Object.entries(res).filter(([, v]) => v > 0).flatMap(([k, v]) => Array(k === 'weapons' ? Math.ceil(v / 2) : v).fill(RES_TO_CAT[k]));
  const categories = [];
  for (let i = 0; i < count && pool.length; i++) categories.push(pick(pool, rnd));
  const quality = roll > 95 ? 'good' : roll > 60 ? 'fair' : 'poor';
  let hiddenIndex = null;
  const hidden = (loc.hidden || []).map((hh, i) => ({ ...hh, i })).filter(hh => !ls.hiddenFound.includes(hh.i));
  for (const hh of hidden) { if (overlap(hh.where, areaKey) > 0 && rnd() < 0.85) { hiddenIndex = hh.i; break; } }
  if (hiddenIndex === null && hidden.length && roll > 85 && rnd() < 0.3) hiddenIndex = hidden[0].i;
  const dangerChance = (effectiveDanger(state, locationId) * 5 + (state.threat.level || 0) * 2 + (night ? 12 : 0)) * d.encounter;
  const disturbance = rnd() * 100 < dangerChance ? makeEncounter(state, loc, rnd, { context: 'search' }) : null;
  const minutes = 45 + Math.round(rnd() * 30) + categories.length * 10;
  ls.searched.push(areaKey);
  return { count: categories.length, categories, quality, hiddenIndex, minutes, disturbance, suggestions: categories.map(c => genericItem(c, rnd, quality).name) };
}
export function applyDepletion(state, locationId, categories, rnd = Math.random) {
  const ls = locState(state, locationId);
  for (const c of categories) {
    const k = Object.keys(RES_TO_CAT).find(key => RES_TO_CAT[key] === c);
    if (k && ls.resources[k] > 0 && rnd() < 0.6) ls.resources[k]--;
  }
}
