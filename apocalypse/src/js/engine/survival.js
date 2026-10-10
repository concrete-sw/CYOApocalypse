// The survival math the code owns: hunger, thirst, fatigue, warmth, morale,
// health, hazard exposure, healing, infection and illness, all per tick.

import { clamp } from './util.js';
import { clothingWarmth, protectionLevel, overweightFactor } from './inventory.js';
import { REGION_LABEL } from './body.js';

export const DIFFICULTY = {
  survivor:  { label: 'Survivor',  drain: 0.75, scarcity: 1.3, hostility: 0.7, encounter: 0.7,  heal: 1.3 },
  hardened:  { label: 'Hardened',  drain: 1.0,  scarcity: 1.0, hostility: 1.0, encounter: 1.0,  heal: 1.0 },
  nightmare: { label: 'Nightmare', drain: 1.3,  scarcity: 0.7, hostility: 1.4, encounter: 1.35, heal: 0.8 }
};
export function diff(state) { return DIFFICULTY[state.settings?.difficulty] || DIFFICULTY.hardened; }

// Points per hour at Hardened. Hunger lasts about two days, thirst one.
const RATE = { hunger: 2.1, thirst: 4.2, fatigue: 3.0, morale: 0.25 };
const INDOORS = /building|house|home|store|hospital|school|church|warehouse|office|mall|station|bunker|shelter|apartment|hotel|factory|clinic|pharmacy|cabin|barn|garage|library|motel|tower|silo|plant|depot|prison|base/i;

export function atShelter(state) { return !!(state.shelter && state.shelter.locationId === state.location); }
export function hasFire(state) {
  const lists = [state.inventory.items, ...(state.shelter?.stash ? [state.shelter.stash] : [])];
  const all = lists.flat();
  return all.some(x => x.tags.includes('fire')) && all.some(x => x.tags.includes('fuel') || x.tags.includes('build'));
}

/** Where body warmth settles given weather, clothing, shelter and fire (0-100). */
export function warmthTarget(state) {
  const w = state.weather?.today || { tempC: 12, warmth: 0 };
  let target = 50 + (w.tempC - 10) * 2.2;
  target += clothingWarmth(state.inventory.items);
  const loc = (state.truth?.locations || []).find(l => l.id === state.location);
  if (atShelter(state)) {
    target += 6 + (loc?.shelterQuality || 0) * 3 + (w.warmth || 0) * 0.3;
    if (state.shelter.fire) target += 14;
  } else if (loc && INDOORS.test(`${loc.type} ${loc.name}`)) {
    target += 5 + (w.warmth || 0) * 0.5;
  } else {
    target += w.warmth || 0;
  }
  if (state.camp?.fire) target += 12;
  return clamp(target, 0, 100);
}

/**
 * Advance the body by `minutes`. ctx: { sleeping, exertion, camp }.
 * Returns human-readable notices for threshold crossings and healing.
 */
export function tick(state, minutes, ctx = {}) {
  const notices = [];
  const d = diff(state);
  const h = minutes / 60;
  const v = state.vitals;
  const before = { ...v };
  const sleeping = !!ctx.sleeping;
  const hot = (state.weather?.today?.tempC ?? 12) > 28;
  const ow = overweightFactor(state);

  v.hunger = clamp(v.hunger - RATE.hunger * d.drain * h * (sleeping ? 0.6 : 1));
  v.thirst = clamp(v.thirst - RATE.thirst * d.drain * h * (sleeping ? 0.6 : 1) * (hot ? 1.3 : 1) * (ctx.exertion ? 1.3 : 1));
  if (sleeping) v.fatigue = clamp(v.fatigue + (atShelter(state) ? 12 : ctx.camp ? 9 : 7) * h);
  else v.fatigue = clamp(v.fatigue - RATE.fatigue * h * (ow > 1 ? 1 + (ow - 1) * 1.5 : 1) * (ctx.exertion ? 1.4 : 1));

  const target = warmthTarget(state);
  const step = Math.min(Math.abs(target - v.warmth), 6 * h);
  v.warmth = clamp(v.warmth + Math.sign(target - v.warmth) * step);

  let morale = -RATE.morale * h;
  if (v.hunger > 60 && v.thirst > 60 && v.fatigue > 50) morale += 0.15 * h;
  if (sleeping && atShelter(state)) morale += 0.2 * h;
  v.morale = clamp(v.morale + morale);

  let dmg = 0;
  if (v.hunger <= 0) dmg += 1.5 * h;
  if (v.thirst <= 0) dmg += 4 * h;
  if (v.fatigue <= 0) dmg += 0.5 * h;
  if (v.warmth < 20) dmg += 2 * h; else if (v.warmth < 35) dmg += 0.5 * h;
  if (v.warmth > 92) dmg += 0.5 * h;
  for (const inj of state.body.injuries) dmg += (inj.infected ? 0.6 : inj.treated ? 0.05 : 0.2) * inj.severity * h;
  if (state.body.illness) dmg += 0.4 * state.body.illness.severity * (state.body.illness.treated ? 0.4 : 1) * h;
  if (v.hazard > 90) dmg += 3 * h; else if (v.hazard > 70) dmg += 1 * h; else if (v.hazard > 50) dmg += 0.3 * h;
  if (dmg === 0 && v.hunger > 40 && v.thirst > 40 && v.fatigue > 40) v.health = clamp(v.health + 0.4 * d.heal * h * (sleeping ? 1.6 : 1));
  v.health = clamp(v.health - dmg);

  // Hazard exposure: the apocalypse-specific meter.
  const loc = (state.truth?.locations || []).find(l => l.id === state.location);
  const prot = protectionLevel(state.inventory.items) + (atShelter(state) ? 1 : 0);
  const exposure = Math.max(0, (loc?.hazard || 0) - prot) * 0.6 * h;
  const isRad = /radiat|fallout|dose|rad\b/i.test(state.truth?.apocalypse?.hazardName || '');
  v.hazard = clamp(v.hazard + exposure - (exposure === 0 ? (isRad ? 0.05 : 0.3) * h : 0));

  // Injuries heal, or fester.
  const fed = v.hunger > 30 && v.thirst > 30;
  for (const inj of [...state.body.injuries]) {
    inj.progress += (100 / (inj.severity * 48)) * h * (inj.treated ? 1 : 0.35) * (fed ? 1 : 0.5) * d.heal;
    if (inj.progress >= 100 && !inj.infected) {
      state.body.injuries.splice(state.body.injuries.indexOf(inj), 1);
      notices.push(`Healed: ${inj.type}, ${REGION_LABEL[inj.region].toLowerCase()}.`);
      continue;
    }
    if (!inj.treated && !inj.infected) {
      const p = inj.severity * (inj.type === 'bite' ? 0.03 : inj.type === 'burn' || inj.type === 'gunshot' ? 0.02 : 0.012) * h;
      if (Math.random() < p) { inj.infected = true; notices.push(`The ${inj.type} on your ${REGION_LABEL[inj.region].toLowerCase()} is infected.`); }
    }
  }

  // Illness runs its course or deepens.
  const ill = state.body.illness;
  if (ill) {
    if (ill.treated) {
      ill.progress = (ill.progress || 0) + (h / 48) * 100;
      if (ill.progress >= 100) { state.body.illness = null; notices.push(`You have shaken off the ${ill.name}.`); }
    } else if (state.clock.minutes >= (ill.nextStageAt || 0)) {
      ill.nextStageAt = state.clock.minutes + 72 * 60;
      if (ill.severity < 3) { ill.severity++; notices.push(`The ${ill.name} is getting worse.`); }
    } else if (ill.severity === 1 && v.health > 60 && Math.random() < 0.01 * h) {
      state.body.illness = null; notices.push(`The ${ill.name} has passed.`);
    }
  }

  const hz = state.truth?.apocalypse?.hazardName || 'Hazard';
  const down = (key, thr, msg) => { if (before[key] >= thr && v[key] < thr) notices.push(msg); };
  const up = (key, thr, msg) => { if (before[key] <= thr && v[key] > thr) notices.push(msg); };
  down('hunger', 25, 'You need to eat.'); down('hunger', 0.01, 'You are starving.');
  down('thirst', 25, 'You need water.'); down('thirst', 0.01, 'You are dehydrated. This will kill you.');
  down('fatigue', 20, 'You are exhausted. Rest soon.');
  down('warmth', 30, 'You are dangerously cold.');
  down('health', 30, 'You are badly hurt.');
  up('hazard', 50, `${hz} exposure is high.`); up('hazard', 80, `${hz} exposure is critical.`);
  return notices;
}
