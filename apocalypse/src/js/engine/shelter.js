// Base and nomad life: claiming a shelter, its stash, fortification, fuel, and night raids.

import { clamp, pick } from './util.js';
import { removeItem, addItem } from './inventory.js';
import { getLocation } from './world.js';
import { hostileFactions, holderOf } from './factions.js';
import { withPlayer, skillCount, isGuarding } from './companions.js';
import { atShelter, hasFire } from './survival.js';
import { addInjury } from './body.js';

export function claimShelter(state, locationId) {
  const loc = getLocation(state, locationId);
  if (!loc) return { ok: false, notice: 'Unknown place.' };
  if (state.location !== locationId) return { ok: false, notice: 'You have to be there to claim it.' };
  if ((loc.shelterQuality || 0) < 1) return { ok: false, notice: `${loc.name} cannot be made livable.` };
  if (state.shelter && state.shelter.locationId === locationId) return { ok: false, notice: 'This is already your shelter.' };
  const prev = state.shelter;
  if (prev && prev.stash.length) state.caches[prev.locationId] = prev.stash;
  const cached = state.caches[locationId] || [];
  delete state.caches[locationId];
  state.shelter = { locationId, defense: Math.min(2, Math.round((loc.shelterQuality || 1) / 2)), stash: cached, noise: 1, claimedAt: state.clock.minutes, raids: 0, fire: false };
  state.mode = 'base';
  return { ok: true, notice: `${loc.name} is your shelter now. Defense ${state.shelter.defense}/5.${prev?.stash?.length ? ` Your old stores stay hidden at ${getLocation(state, prev.locationId)?.name}.` : ''}` };
}
export function abandonShelter(state) {
  if (!state.shelter) return { ok: false, notice: 'You have no shelter to leave.' };
  const s = state.shelter;
  if (s.stash.length) state.caches[s.locationId] = s.stash;
  state.shelter = null; state.mode = 'nomad';
  return { ok: true, notice: `You leave ${getLocation(state, s.locationId)?.name || 'the shelter'} behind.${s.stash.length ? ' Your stores stay hidden there; you can come back for them.' : ''}` };
}

export function fortify(state) {
  if (!atShelter(state)) return { ok: false, notice: 'You must be at your shelter to fortify it.' };
  const s = state.shelter;
  if (s.defense >= 5) return { ok: false, notice: 'It will not get sturdier than this.' };
  const items = state.inventory.items;
  const kit = items.find(x => x.tags.includes('barricade'));
  const need = skillCount(state, 'mechanics') > 0 ? 1 : 2;
  const build = items.filter(x => x.tags.includes('build') && !x.tags.includes('barricade'));
  const have = build.reduce((a, x) => a + x.qty, 0);
  if (kit) removeItem(items, kit.id, 1);
  else if (have >= need) { let left = need; for (const b of build) { if (left <= 0) break; const t = Math.min(b.qty, left); removeItem(items, b.id, t); left -= t; } }
  else return { ok: false, notice: `Fortifying needs ${need} unit${need > 1 ? 's' : ''} of building material (planks, scrap, sandbags) or a barricade kit. You have ${have}.` };
  s.defense = Math.min(5, s.defense + 1); s.noise = Math.min(5, s.noise + 1);
  return { ok: true, notice: `Defense is now ${s.defense}/5. The work was loud.`, minutes: 180 };
}

export function deposit(state, itemId, qty = 1) {
  if (!atShelter(state)) return { ok: false, notice: 'You are not at your shelter.' };
  const it = removeItem(state.inventory.items, itemId, qty);
  if (!it) return { ok: false, notice: 'Nothing to store.' };
  addItem(state.shelter.stash, it);
  return { ok: true, notice: `Stored ${it.qty} × ${it.name}.` };
}
export function withdraw(state, itemId, qty = 1) {
  if (!atShelter(state)) return { ok: false, notice: 'You are not at your shelter.' };
  const it = removeItem(state.shelter.stash, itemId, qty);
  if (!it) return { ok: false, notice: 'Not in the stash.' };
  addItem(state.inventory.items, it);
  return { ok: true, notice: `Took ${it.qty} × ${it.name}.` };
}
export function recoverCache(state) {
  const c = state.caches[state.location];
  if (!c || !c.length) return { ok: false, notice: 'No cache here.' };
  const holder = holderOf(state, state.location);
  const hostile = holder && (state.factions[holder.id]?.standing ?? 0) < 0;
  let kept = c;
  if (hostile && Math.random() < 0.7) kept = c.filter(() => Math.random() < 0.3);
  for (const it of kept) addItem(state.inventory.items, it);
  delete state.caches[state.location];
  return { ok: true, notice: kept.length === c.length ? `Recovered ${kept.length} item${kept.length > 1 ? 's' : ''} from the cache.` : `Someone found the cache first. Only ${kept.length} of ${c.length} items remain.` };
}

/** Each cold night a fire burns one unit of fuel or building material if there is one. */
export function burnFuel(state) {
  if (!state.shelter) return;
  const cold = (state.weather?.today?.tempC ?? 12) < 9;
  if (!cold || !hasFire(state)) { state.shelter.fire = false; return; }
  const lists = [state.shelter.stash, state.inventory.items];
  for (const l of lists) {
    const fuel = l.find(x => x.tags.includes('fuel')) || l.find(x => x.tags.includes('build') && !x.tags.includes('barricade'));
    if (fuel) { removeItem(l, fuel.id, 1); state.shelter.fire = true; return; }
  }
  state.shelter.fire = false;
}

/** Rolled once per night at the shelter. Returns an event for the GM, or null. */
export function nightlyRaidRoll(state, rnd = Math.random) {
  const s = state.shelter; if (!s) return null;
  const loc = getLocation(state, s.locationId);
  const hostile = hostileFactions(state).length;
  const holder = holderOf(state, s.locationId);
  const holderHostile = holder && (state.factions[holder.id]?.standing ?? 0) < 0 ? 1 : 0;
  const guard = isGuarding(state) && atShelter(state);
  const base = (state.threat.level || 0) * 3 + hostile * 6 + holderHostile * 8 + s.noise * 3 + (state.flags.some(f => f.startsWith('lured_by')) ? 10 : 0) - s.defense * 4 - (guard ? 6 : 0);
  const p = clamp(base, 0, 35) * (atShelter(state) ? 1 : 1.3);
  s.noise = Math.max(0, s.noise - 1);
  if (rnd() * 100 >= p) return null;
  const strength = (state.threat.level || 1) + hostile + Math.round(rnd() * 3);
  const defense = s.defense + (guard ? 1 : 0) + (atShelter(state) ? skillCount(state, 'combat') : 0);
  const margin = defense - strength;
  const lost = [];
  const takeRandom = n => { for (let i = 0; i < n && s.stash.length; i++) { const it = pick(s.stash, rnd); removeItem(s.stash, it.id, 1); lost.push(it.name); } };
  let outcome, text;
  if (margin >= 2) { outcome = 'repelled'; text = `Something tested the defenses of ${loc?.name} in the night and gave up.`; }
  else if (margin >= 0) { outcome = 'repelled_losses'; takeRandom(1); s.defense = Math.max(0, s.defense - 1); text = `They got as far as the door of ${loc?.name}.${lost.length ? ` The ${lost[0]} is gone` : ' Nothing taken'} and the barricade needs work.`; }
  else if (margin >= -2) {
    outcome = 'looted';
    for (const f of s.stash.filter(x => x.category === 'food' || x.category === 'water')) { const n = Math.ceil(f.qty / 2); removeItem(s.stash, f.id, n); lost.push(`${n} × ${f.name}`); }
    takeRandom(1);
    text = `They got into ${loc?.name} ${atShelter(state) ? 'while you slept' : 'while you were away'}. Half the stores are gone${lost.length ? ` (${lost.join(', ')})` : ''}.`;
  } else {
    outcome = 'overrun';
    text = `${loc?.name} was overrun. Whatever you kept there is theirs now.`;
    if (atShelter(state)) { const inj = addInjury(state, { region: pick(['leftArm', 'rightArm', 'torso', 'head'], rnd), type: 'bruise', severity: 2 }, rnd); text += ` You got out with a ${inj.type}.`; }
    state.shelter = null; state.mode = 'nomad';
  }
  if (state.shelter) state.shelter.raids++;
  return { kind: 'raid', outcome, text, lost, urgent: outcome !== 'repelled' };
}

export function shelterSummary(state) {
  const s = state.shelter; if (!s) return null;
  const food = s.stash.filter(x => x.category === 'food').reduce((a, x) => a + x.qty, 0);
  const water = s.stash.filter(x => x.category === 'water' && !x.tags.includes('dirty')).reduce((a, x) => a + x.qty, 0);
  const fuel = s.stash.filter(x => x.tags.includes('fuel')).reduce((a, x) => a + x.qty, 0);
  return { locationId: s.locationId, name: getLocation(state, s.locationId)?.name, defense: s.defense, noise: s.noise, raids: s.raids, fire: s.fire, stash: { foodUnits: food, waterUnits: water, fuelUnits: fuel, items: s.stash.length }, guarded: isGuarding(state), withPlayer: withPlayer(state).length };
}
