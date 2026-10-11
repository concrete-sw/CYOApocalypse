// Eating and drinking typed in the survivor's own words, resolved by the code:
// what gets eaten, from the pack or the home stores, what it does to the body,
// and how long it took. The GM is told the result and narrates it.

import { clamp } from './util.js';
import { findItem, removeItem, foodEffect } from './inventory.js';
import { setIllness } from './body.js';
import { atShelter, hasTap, hasFire } from './survival.js';

/**
 * intent: { eat, drink, cook, item, minutes } from classifyIntent.
 * Returns { ok, minutes, ate, drank, cooked, notices, missing } where ate/drank
 * name what was consumed (or null) and missing lists what could not be had.
 */
export function consumeByIntent(state, intent, rnd = Math.random) {
  const v = state.vitals;
  const notices = [], missing = [];
  const home = atShelter(state) && state.shelter?.stash ? state.shelter.stash : null;
  const lists = home ? [home, state.inventory.items] : [state.inventory.items];
  const from = l => (l === home ? 'the stores' : 'the pack');
  let ate = null, drank = null, cooked = false;
  let minutes = intent.minutes || 20;

  const pickFood = () => {
    if (intent.item) for (const l of lists) { const it = findItem(l, intent.item); if (it && it.category === 'food') return { it, l }; }
    for (const l of lists) { const food = l.filter(x => x.category === 'food').sort((a, b) => a.condition - b.condition)[0]; if (food) return { it: food, l }; }
    return null;
  };
  const pickWater = () => {
    for (const l of lists) { const w = l.find(x => x.category === 'water' && !x.tags.includes('dirty')); if (w) return { it: w, l }; }
    for (const l of lists) { const w = l.find(x => x.category === 'water'); if (w) return { it: w, l }; }
    return null;
  };

  if (intent.eat) {
    if (v.hunger > 95) notices.push('You are not hungry.');
    else {
      const f = pickFood();
      if (!f) { missing.push('food'); notices.push(home ? 'There is nothing left to eat in the stores or the pack.' : 'You have nothing to eat.'); }
      else {
        const { it, l } = f;
        const canCook = intent.cook && ((state.utilities?.power && atShelter(state)) || hasFire(state));
        cooked = canCook;
        const spoiled = it.condition < 30 && rnd() < 0.5;
        removeItem(l, it.id, 1);
        v.hunger = clamp(v.hunger + foodEffect(it) + (canCook ? 6 : 0));
        v.morale = clamp(v.morale + (canCook ? 4 : it.tags.includes('comfort') ? 5 : 2));
        ate = it.name;
        if (spoiled) { setIllness(state, { name: 'food poisoning', severity: 1 }); notices.push(`You eat the ${it.name.toLowerCase()} from ${from(l)}. It tasted wrong, and within the hour your stomach agrees.`); }
        else notices.push(`You ${canCook ? 'cook and eat' : 'eat'} ${it.name.toLowerCase()} from ${from(l)}.`);
        if (intent.cook && !canCook) notices.push('No power and no fire: you eat it cold.');
      }
    }
  }
  if (intent.drink) {
    if (v.thirst > 95 && !/coffee|tea|cocoa/.test(String(intent.item || ''))) notices.push('You are not thirsty.');
    else if (hasTap(state)) { v.thirst = clamp(v.thirst + 35); drank = /coffee|tea|cocoa/.test(String(intent.item || '')) ? intent.item : 'water from the tap'; if (drank !== 'water from the tap') v.morale = clamp(v.morale + 3); notices.push(`You drink ${drank}.`); }
    else {
      const w = pickWater();
      if (!w) { missing.push('water'); notices.push('There is no water to drink.'); }
      else {
        const { it, l } = w;
        removeItem(l, it.id, 1);
        v.thirst = clamp(v.thirst + 35);
        drank = it.name;
        if (it.tags.includes('dirty') && rnd() < 0.3) { setIllness(state, { name: 'stomach sickness', severity: 1 }); notices.push(`You drink the ${it.name.toLowerCase()} from ${from(l)}. Cramps follow within hours: it was not clean.`); }
        else notices.push(`You drink ${it.name.toLowerCase()} from ${from(l)}.`);
      }
    }
  }
  if (!ate && !drank) minutes = 5;
  return { ok: !!(ate || drank), minutes, ate, drank, cooked, notices, missing };
}
