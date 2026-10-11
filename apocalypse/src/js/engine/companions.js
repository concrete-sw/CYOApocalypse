// Companions: loyalty, mood, needs, assignments, and the betrayals written into the world truth.

import { clamp, pick, uid } from './util.js';
import { supplyDays, removeItem, addItem, itemValue, genericItem } from './inventory.js';
import { addInjury } from './body.js';
import { dayOf, isNight } from './clock.js';
import { diff } from './survival.js';
import { getNpc, getLocation, locState } from './world.js';

export const MOODS = ['steady', 'hopeful', 'grateful', 'uneasy', 'afraid', 'angry', 'hostile', 'grieving', 'withdrawn'];
export const TASKS = {
  scout: { label: 'Scout', hours: 4, blurb: 'Learn a place\'s danger and what it holds. Risky if it is dangerous.' },
  scavenge: { label: 'Scavenge', hours: 6, blurb: 'Bring back what they can carry from a place.' },
  hunt: { label: 'Hunt and forage', hours: 5, blurb: 'Food from the land. Better with survival skill.' },
  guard: { label: 'Stand guard', hours: 0, blurb: 'Stays with you; lowers raid and ambush risk.' }
};

export function companion(state, id) {
  return state.companions[id] || (state.companions[id] = { status: 'met', loyalty: 50, mood: 'steady', said: [], assignment: null, metAt: state.clock.minutes, hungryDays: 0, hurt: 0 });
}
export function meet(state, id) {
  if (!state.npcsMet.includes(id)) state.npcsMet.push(id);
  return companion(state, id);
}
export function recruit(state, id) {
  meet(state, id);
  const c = state.companions[id];
  if (c.status === 'with') return c;
  const npc = getNpc(state, id);
  c.status = 'with'; c.joinedAt = state.clock.minutes;
  c.loyalty = { loyal: 65, steady: 55, fickle: 45, treacherous: 50 }[String(npc?.loyaltyTendency || '').toLowerCase()] ?? 50;
  c.mood = 'hopeful';
  return c;
}
export function lose(state, id, how) {
  const c = companion(state, id);
  c.status = how === 'died' ? 'dead' : how === 'captured' ? 'captured' : 'left';
  c.leftAt = state.clock.minutes; c.assignment = null; c.how = how;
  state.pending = state.pending.filter(p => p.npcId !== id);
}
export function withPlayer(state) { return Object.entries(state.companions).filter(([, c]) => c.status === 'with').map(([id]) => id); }
export function away(state) { return Object.entries(state.companions).filter(([, c]) => c.status === 'away').map(([id]) => id); }
export function groupSize(state) { return 1 + withPlayer(state).length; }
export function isGuarding(state) { return withPlayer(state).some(id => state.companions[id].assignment?.task === 'guard'); }
export function adjustLoyalty(state, id, delta) {
  const c = state.companions[id]; if (!c) return;
  c.loyalty = clamp(c.loyalty + delta, 0, 100);
  if (c.loyalty < 25 && !['hostile', 'angry'].includes(c.mood)) c.mood = 'uneasy';
}
export function loyaltyLabel(n) { return n >= 75 ? 'devoted' : n >= 55 ? 'solid' : n >= 40 ? 'steady' : n >= 25 ? 'uneasy' : 'hostile'; }
export function recordSaid(state, id, q, a) {
  const c = companion(state, id);
  c.said.push({ q, a, at: state.clock.minutes });
  if (c.said.length > 40) c.said.splice(0, c.said.length - 40);
}
/** How many in the group (player included) have a skill; capped at 3. */
export function skillCount(state, skill) {
  let n = state.survivor.skills.includes(skill) ? 1 : 0;
  for (const id of withPlayer(state)) { const npc = getNpc(state, id); if (npc?.skills?.includes(skill)) n++; }
  return Math.min(3, n);
}

/** Once a day everyone eats: stash first, then the pack. Returns events for the GM. */
export function dailyUpkeep(state, rnd = Math.random) {
  const events = [];
  const lists = [state.shelter?.stash, state.inventory.items].filter(Boolean);
  const take = cat => {
    for (const l of lists) {
      const it = l.find(x => x.category === cat && !(cat === 'water' && x.tags.includes('dirty')));
      if (it) { removeItem(l, it.id, 1); return true; }
    }
    return false;
  };
  for (const id of [...withPlayer(state), ...away(state)]) {
    const c = state.companions[id]; const npc = getNpc(state, id); const name = npc?.name || id;
    const ate = take('food') && take('food');
    const drank = take('water') && take('water');
    if (ate && drank) { c.hungryDays = 0; adjustLoyalty(state, id, 2); if (c.hurt > 0 && rnd() < 0.5) c.hurt--; }
    else {
      c.hungryDays = (c.hungryDays || 0) + 1;
      adjustLoyalty(state, id, -6 - c.hungryDays * 2);
      c.mood = c.hungryDays > 1 ? 'angry' : 'uneasy';
      events.push({ kind: 'companion_hungry', npcId: id, text: `${name} went without ${!ate && !drank ? 'food and water' : !ate ? 'food' : 'water'} today (${c.hungryDays} day${c.hungryDays > 1 ? 's' : ''} running).` });
    }
    if (state.vitals.morale < 25) adjustLoyalty(state, id, -1);
    if (c.status === 'with' && skillCount(state, 'leadership') > 0) adjustLoyalty(state, id, 1);
    if (c.loyalty < 20 && c.status === 'with' && rnd() < 0.3) {
      lose(state, id, 'left');
      events.push({ kind: 'companion_left', npcId: id, urgent: true, text: `${name} has had enough. They took their share and left before anyone woke.` });
    }
  }
  return events;
}

/** Betrayals written into the truth fire when their trigger holds. */
export function checkBetrayals(state, rnd = Math.random) {
  const events = [];
  for (const npc of state.truth.npcs || []) {
    const b = npc.betrayal; const c = state.companions[npc.id];
    if (!b || !b.will || !c || c.status !== 'with' || c.betrayed) continue;
    if (!triggerHolds(state, b.trigger, c)) continue;
    c.betrayed = true;
    const text = applyBetrayalEffect(state, npc, b, rnd);
    events.push({ kind: 'betrayal', npcId: npc.id, how: b.how, effect: b.effect, text, urgent: true });
  }
  return events;
}
function triggerHolds(state, t, c) {
  if (!t || !t.kind) return false;
  const day = dayOf(state.clock.minutes); const v = Number(t.value);
  switch (t.kind) {
    case 'loyaltyBelow': return c.loyalty < v;
    case 'dayAfter': return day >= v;
    case 'foodDaysBelow': return supplyDays(state).food < v;
    case 'moraleBelow': return state.vitals.morale < v;
    case 'healthBelow': return state.vitals.health < v;
    case 'factionStandingAbove': return (state.factions[t.factionId]?.standing ?? 0) > v;
    case 'factionStandingBelow': return (state.factions[t.factionId]?.standing ?? 0) < v;
    case 'flag': return state.flags.includes(String(t.flag || t.value));
    case 'shelterClaimed': return !!state.shelter;
    default: return false;
  }
}
function applyBetrayalEffect(state, npc, b, rnd) {
  const name = npc.name; const effect = String(b.effect || 'leave');
  if (effect === 'steal') {
    const all = [...state.inventory.items, ...(state.shelter?.stash || [])].sort((a, z) => itemValue(z) - itemValue(a));
    const taken = [];
    for (const it of all.slice(0, 3)) {
      const list = state.inventory.items.includes(it) ? state.inventory.items : state.shelter.stash;
      removeItem(list, it.id, Math.max(1, Math.ceil(it.qty / 2)));
      taken.push(it.name);
    }
    lose(state, npc.id, 'left');
    return `${name} is gone, and so are: ${taken.join(', ') || 'nothing of value'}. ${b.how || ''}`.trim();
  }
  if (effect === 'sabotage') {
    if (state.shelter) {
      state.shelter.defense = Math.max(0, state.shelter.defense - 2);
      for (const f of state.shelter.stash.filter(x => x.category === 'food' || x.category === 'water')) removeItem(state.shelter.stash, f.id, Math.ceil(f.qty / 2));
    }
    lose(state, npc.id, 'left');
    return `${name} left in the night. The defenses are wrecked and half the stores are spoiled or gone. ${b.how || ''}`.trim();
  }
  if (effect === 'lure') { state.flags.push(`lured_by_${npc.id}`); return `${name} has been passing your movements to someone. The next road you take will be watched. ${b.how || ''}`.trim(); }
  if (effect === 'kill_attempt') {
    const inj = addInjury(state, { region: 'torso', type: 'cut', severity: 2 }, rnd);
    lose(state, npc.id, 'left');
    return `${name} came for you in the dark. You are cut (${inj.type}, chest, severity 2) and they have fled. ${b.how || ''}`.trim();
  }
  if (effect === 'defect') { lose(state, npc.id, 'left'); return `${name} has gone over to the other side, and knows everything about you. ${b.how || ''}`.trim(); }
  lose(state, npc.id, 'left');
  return `${name} is gone. ${b.how || ''}`.trim();
}

// ---------------------------------------------------------------- assignments
export function assign(state, id, task, locationId) {
  const c = state.companions[id]; const npc = getNpc(state, id); const t = TASKS[task];
  if (!c || c.status !== 'with') return { ok: false, notice: 'They are not with you.' };
  if (!t) return { ok: false, notice: 'Unknown task.' };
  const name = npc?.name || id;
  if (c.loyalty < 30) return { ok: false, refused: true, notice: `${name} refuses. "Do it yourself."` };
  if (task === 'guard') {
    c.assignment = { task, startedAt: state.clock.minutes };
    return { ok: true, notice: `${name} is standing guard.` };
  }
  const loc = getLocation(state, locationId) || getLocation(state, state.location);
  const p = { id: uid('pd'), kind: 'assignment', npcId: id, task, locationId: loc.id, readyAt: state.clock.minutes + t.hours * 60, label: `${name}: ${t.label.toLowerCase()} at ${loc.name}` };
  c.status = 'away'; c.assignment = { task, locationId: loc.id, readyAt: p.readyAt };
  state.pending.push(p);
  return { ok: true, notice: `${name} sets out to ${t.label.toLowerCase()} ${loc.name}. Back in about ${t.hours} hours.`, pending: p };
}
export function clearGuard(state, id) { const c = state.companions[id]; if (c?.assignment?.task === 'guard') c.assignment = null; }

export function resolveAssignment(state, p, rnd = Math.random) {
  const c = state.companions[p.npcId]; const npc = getNpc(state, p.npcId); const loc = getLocation(state, p.locationId);
  if (!c || c.status !== 'away' || !npc || !loc) return null;
  const name = npc.name; const skills = npc.skills || [];
  const danger = (loc.danger || 2) * 4 + (state.threat.level || 0) * 3 + (isNight(p.readyAt) ? 8 : 0);
  const bonus = (skills.includes('stealth') ? 10 : 0) + (skills.includes('scavenging') && p.task !== 'scout' ? 8 : 0) + (skills.includes('combat') ? 6 : 0) + (skills.includes('survival') && p.task === 'hunt' ? 10 : 0);
  const risk = clamp(danger - bonus, 2, 70) * diff(state).hostility;
  const r = rnd() * 100;
  c.status = 'with'; c.assignment = null;
  if (r < risk * 0.3) {
    lose(state, p.npcId, 'died');
    return { kind: 'assignment_result', npcId: p.npcId, task: p.task, outcome: 'died', urgent: true, text: `${name} did not come back from ${loc.name}.` };
  }
  if (r < risk) {
    adjustLoyalty(state, p.npcId, -5); c.mood = 'afraid'; c.hurt = (c.hurt || 0) + 1;
    return { kind: 'assignment_result', npcId: p.npcId, task: p.task, outcome: 'hurt', text: `${name} came back from ${loc.name} hurt and empty-handed.` };
  }
  const ls = locState(state, loc.id);
  if (p.task === 'scout') {
    ls.scouted = true;
    const clue = (state.truth.ending?.clues || []).find(cl => cl.source?.kind === 'location' && cl.source?.id === loc.id && !state.clues.includes(cl.id));
    const gotClue = clue && rnd() < 0.3;
    return { kind: 'assignment_result', npcId: p.npcId, task: p.task, outcome: 'success', text: `${name} scouted ${loc.name}: danger about ${loc.danger}/5, ${holderText(state, loc)}. ${gotClue ? `They also noticed something: ${clue.text}` : ''}`.trim(), clueId: gotClue ? clue.id : null };
  }
  if (p.task === 'scavenge') {
    const total = Object.values(ls.resources).reduce((a, b) => a + b, 0);
    const n = total === 0 ? 0 : 1 + (rnd() < 0.6 ? 1 : 0) + (skills.includes('scavenging') && rnd() < 0.5 ? 1 : 0);
    const names = [];
    const keys = Object.entries(ls.resources).filter(([, v]) => v > 0).map(([k]) => k);
    for (let i = 0; i < n && keys.length; i++) {
      const k = pick(keys, rnd); const cat = { materials: 'material', weapons: 'weapon' }[k] || k;
      const it = addItem(state.inventory.items, genericItem(cat, rnd));
      names.push(it.name); if (rnd() < 0.6) ls.resources[k] = Math.max(0, ls.resources[k] - 1);
    }
    adjustLoyalty(state, p.npcId, 1);
    return { kind: 'assignment_result', npcId: p.npcId, task: p.task, outcome: 'success', items: names, text: names.length ? `${name} is back from ${loc.name} with: ${names.join(', ')}.` : `${name} is back from ${loc.name}. It has been picked clean.` };
  }
  if (p.task === 'hunt') {
    const n = 1 + Math.floor(rnd() * 2) + (skills.includes('survival') ? 1 : 0);
    const it = addItem(state.inventory.items, { name: rnd() < 0.5 ? 'Fresh meat' : 'Foraged greens and roots', category: 'food', qty: n, condition: 60 });
    return { kind: 'assignment_result', npcId: p.npcId, task: p.task, outcome: 'success', items: [it.name], text: `${name} is back with ${n} portion${n > 1 ? 's' : ''} of ${it.name.toLowerCase()}.` };
  }
  return { kind: 'assignment_result', npcId: p.npcId, task: p.task, outcome: 'success', text: `${name} is back.` };
}
function holderText(state, loc) {
  const ls = state.locationState?.[loc.id];
  const id = ls && ls.heldBy !== undefined ? ls.heldBy : loc.heldBy;
  const f = id ? (state.truth.factions || []).find(x => x.id === id) : null;
  return f ? `held by ${f.name}` : 'nobody seems to hold it';
}
