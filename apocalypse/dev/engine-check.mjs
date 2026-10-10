// Engine smoke test: runs the code-owned systems against the sample world without a browser or an API key.
//   node apocalypse/dev/engine-check.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const eng = p => import(path.join(here, '..', 'src', 'js', 'engine', p));
const { validateWorld, normalizeWorld, deepClean } = await eng('schema.js');
const { newGameState, advanceTime, applyChanges, checkEnd, endingStatus, computeScore, takeEvents, addFlag } = await eng('state.js');
const { tick } = await eng('survival.js');
const { useItem, craft, availableRecipes, addItem, supplyDays, totalWeight, maxWeight } = await eng('inventory.js');
const { addInjury, treatInjury } = await eng('body.js');
const { recruit, dailyUpkeep, checkBetrayals, assign, withPlayer, skillCount } = await eng('companions.js');
const { seededRandom } = await eng('util.js');
const { claimShelter, fortify, deposit, nightlyRaidRoll } = await eng('shelter.js');
const { tune, scan } = await eng('radio.js');
const { travelPlan, rollTravel, scavengeBudget, resolveEncounter, makeEncounter, classifyApproach } = await eng('encounters.js');
const { describeAction, buildStateSnapshot, truthForGM } = await eng('gm.js');
const { computeStats, fallbackDebrief, finalizeDebrief } = await eng('ending.js');
const { weatherFor, dayOf } = await eng('clock.js');
const { extractJSON, repairJSON, looksTruncated } = await eng('json.js');
const { stitch } = await eng('worldGenerator.js');

// Tolerant JSON parsing
assert.deepEqual(extractJSON('```json\n{"a": 1, "b": [1,2,],}\n```'), { a: 1, b: [1, 2] }, 'fences and trailing commas');
assert.deepEqual(extractJSON('Here you go:\n{"narrative": "He said \\"hi\\" and left\nquickly", "x": 2} thanks'), { narrative: 'He said "hi" and left\nquickly', x: 2 }, 'prose around, raw newline in string');
assert.deepEqual(extractJSON('{"a": "it\\\'s", // comment\n "b": /* c */ 1}'), { a: "it's", b: 1 }, 'invalid escape and comments');
assert.deepEqual(extractJSON('{"a": {"b": [1, 2, {"c": "cut off he'), { a: { b: [1, 2, { c: 'cut off he' }] } }, 'truncated document closed');
assert.deepEqual(extractJSON('{"a": 1, "b":'), { a: 1 }, 'dangling key dropped');
assert.ok(looksTruncated('{"a": 1, "b": "x') && !looksTruncated('{"a": 1}') && !looksTruncated('```json\n{"a":1}\n```'));
assert.equal(stitch('{"a": "hello wor', 'wor' + 'ld", "b": 2}'), '{"a": "hello world", "b": 2}', 'stitch drops repeated overlap');
assert.equal(stitch('{"a": 1,', ' "b": 2}'), '{"a": 1, "b": 2}', 'stitch without overlap');
console.log('✓ tolerant JSON: fences, comments, escapes, truncation, stitching');
const { getLocation } = await eng('world.js');

const raw = JSON.parse(readFileSync(path.join(here, 'sample-world.json'), 'utf8'));
const problems = validateWorld(deepClean(raw));
assert.deepEqual(problems, [], `sample world must validate: ${problems.join('; ')}`);
const truth = normalizeWorld(raw, {});
console.log('✓ sample world validates and normalises');

let state = newGameState({ survivor: { name: 'Dana Reyes', background: 'nurse' }, truth, settings: { apocalypseId: 'pandemic', difficulty: 'hardened', length: 'standard' } });
assert.equal(state.location, 'loc1'); assert.ok(state.inventory.items.length >= 5); assert.ok(state.discovered.locations.includes('loc4'));
assert.ok(state.weather.today && typeof state.weather.today.tempC === 'number');
console.log('✓ new game state', { items: state.inventory.items.map(i => i.name), weather: state.weather.today.label });

// Prologue describe
let txt = describeAction(state, { type: 'prologue_start' }, { minutes: 0 }, [], []);
assert.match(txt, /PROLOGUE: OPENING/);
state.phase = 'play'; state.threat.level = 1;

// Time passes: a day of walking
const n0 = advanceTime(state, 24 * 60, { exertion: true });
assert.ok(state.vitals.hunger < 50 && state.vitals.thirst < 20, 'a day of exertion drains hunger and thirst');
assert.ok(state.events.fired.length >= 1, 'the day 0 timeline event fired');
const evs = takeEvents(state);
assert.ok(evs.some(e => e.kind === 'world'), 'world events queued for the GM');
assert.ok(state.doom >= 2);
console.log('✓ advanceTime: vitals', Object.fromEntries(Object.entries(state.vitals).map(([k, v]) => [k, Math.round(v)])), 'events', evs.map(e => e.kind));

// Eat and drink
const water = state.inventory.items.find(i => i.category === 'water');
let r = useItem(state, water.id); assert.ok(r.ok, r.notice); assert.ok(state.vitals.thirst > 30);
const food = state.inventory.items.find(i => i.category === 'food');
r = useItem(state, food.id); assert.ok(r.ok, r.notice);
console.log('✓ consumables');

// Injuries and treatment
const inj = addInjury(state, { region: 'left arm', type: 'cut', severity: 2 });
assert.equal(inj.region, 'leftArm');
const kit = state.inventory.items.find(i => i.tags.includes('bandage'));
r = useItem(state, kit.id, { injuryId: inj.id }); assert.ok(r.ok, r.notice); assert.ok(inj.treated);
console.log('✓ injury + treatment:', r.notice);

// Crafting
addItem(state.inventory.items, { name: 'Dirty water', category: 'water' });
assert.ok(availableRecipes(state).some(x => x.id === 'boilwater'), 'boil water available with lighter + dirty water');
r = craft(state, 'boilwater'); assert.ok(r.ok, r.notice);
console.log('✓ crafting:', r.notice);

// Travel + scavenging
const plan = travelPlan(state, 'loc2'); assert.ok(plan.minutes > 0 && plan.risk >= 3);
state.location = 'loc2';
const b = scavengeBudget(state, 'loc2', 'the back office');
assert.ok(b.count >= 0 && b.count <= 3);
console.log('✓ travel plan', { minutes: plan.minutes, risk: plan.risk }, 'scavenge', { count: b.count, cats: b.categories, hidden: b.hiddenIndex, quality: b.quality });

// GM changes application with validation
const notices = applyChanges(state, {
  vitals: { morale: 5, health: -200 },
  itemsGained: [{ name: 'Canned beans', qty: 2, category: 'food' }, { name: 'Bogus', qty: 99, category: 'ammo' }],
  companionsMet: ['n1', 'nope'], companionsRecruited: ['n1'], npcMood: { n1: 'grateful' }, loyaltyDelta: { n1: 99 },
  factionsMet: ['f1'], factionDelta: { f1: -50 }, locationsRevealed: ['loc9', 'zzz'], factsLearned: ['Maya knows the hospital.'],
  cluesFound: ['c1', 'c99'], flags: ['annie_trusts_you'], threatDelta: 5, hintGiven: true
}, { deathBlocked: true });
assert.ok(state.vitals.health > 0, 'death blocked clamps health');
assert.ok(state.companions.n1?.status === 'with');
assert.ok(state.companions.n1.loyalty <= 70, 'loyalty delta clamped to +5');
assert.equal(state.factions.f1.standing, -15, 'faction delta clamped to -15');
assert.ok(state.discovered.locations.includes('loc9') && !state.discovered.locations.includes('zzz'));
assert.ok(state.clues.includes('c1') && !state.clues.includes('c99'));
assert.equal(state.threat.level, 2, 'threat delta clamped to +1');
assert.ok(state.inventory.items.some(i => i.name === 'Bogus' && i.qty === 60), 'ammo capped at 60');
console.log('✓ applyChanges validation:', notices.length, 'notices');

// Encounter resolution
state.encounter = makeEncounter(state, getLocation(state, 'loc2'), Math.random, { context: 'test' });
assert.equal(classifyApproach('I run for the alley'), 'flee');
const res = resolveEncounter(state, 'fight', seededRandom(7)); // a lost fight can kill a companion; keep the run deterministic
assert.ok(res && res.outcome && res.text.length > 20); assert.equal(state.encounter, null);
console.log('✓ encounter:', res.outcome, '|', res.text.slice(0, 120));

// Shelter, stash, fortify, raid
state.location = 'loc1';
r = claimShelter(state, 'loc1'); assert.ok(r.ok, r.notice);
addItem(state.inventory.items, { name: 'Planks', category: 'material', qty: 2 });
r = fortify(state); assert.ok(r.ok, r.notice);
const beans = state.inventory.items.find(i => i.name === 'Canned beans');
r = deposit(state, beans.id, 1); assert.ok(r.ok, r.notice);
const raid = nightlyRaidRoll(state, () => 0.0001);
assert.ok(raid && raid.kind === 'raid', 'forced raid rolls an event');
console.log('✓ shelter:', state.shelter ? `defense ${state.shelter.defense}` : 'overrun', '| raid:', raid.outcome);

// Companions upkeep, assignment, betrayal trigger
recruit(state, 'n2');
state.inventory.items = state.inventory.items.filter(i => i.category !== 'food'); if (state.shelter) state.shelter.stash = state.shelter.stash.filter(i => i.category !== 'food');
const up = dailyUpkeep(state, () => 0.99);
assert.ok(up.some(e => e.kind === 'companion_hungry'), 'hungry companions complain');
const bet = checkBetrayals(state);
assert.ok(bet.some(e => e.npcId === 'n2' && e.effect === 'steal'), 'Rico steals when food is short');
assert.equal(state.companions.n2.status, 'left');
recruit(state, 'n3');
r = assign(state, 'n3', 'scout', 'loc4'); assert.ok(r.ok, r.notice); assert.equal(state.companions.n3.status, 'away');
advanceTime(state, 5 * 60);
assert.equal(state.companions.n3.status === 'away', false, 'assignment resolved');
console.log('✓ companions: upkeep/betrayal/assignment', takeEvents(state).map(e => e.kind));

// Radio
state.clock.minutes = 12 * 1440 + 21 * 60; // day 12, 21:00
let t = tune(state, '7.200'); assert.equal(t.kind, 'broadcast', 'survivor net at 21:00 day 12'); assert.match(t.message.text, /eighteenth/);
t = tune(state, '99.9'); assert.equal(t.kind, 'static');
t = tune(state, '156.800'); assert.equal(t.kind, 'broadcast');
const sc = scan(state, () => 0.1); assert.ok(sc);
console.log('✓ radio: broadcast/static/scan');

// Ending gate
state.location = 'loc8'; state.clock.minutes = 19 * 1440 + 9 * 60;
let es = endingStatus(state); assert.ok(es.atPlace && es.inWindow && !es.open, 'missing has_diesel');
addFlag(state, 'has_diesel'); es = endingStatus(state); assert.ok(es.open, `ending should be open: ${es.missing}`);
applyChanges(state, { escape: true }); assert.ok(state.escapeRequested);
const ended = checkEnd(state); assert.equal(ended.kind, 'escape');
const score = computeScore(state); assert.ok(score > 50 && score <= 100);
const stats = computeStats(state); const d = finalizeDebrief(state, fallbackDebrief(state, stats), stats);
assert.ok(d.timeline.length >= 10 && d.trueCause.length > 50 && d.rating);
console.log('✓ ending: escape, score', score, d.rating);

// Snapshot and action descriptions
const snap = buildStateSnapshot(state); assert.ok(snap.vitals && snap.knownLocations.length > 0 && snap.companions.length >= 2);
assert.ok(!('prologue' in truthForGM(state)));
const s2 = newGameState({ survivor: { name: 'X', background: 'soldier' }, truth, settings: { difficulty: 'nightmare' } }); s2.phase = 'play';
for (const a of [{ type: 'look' }, { type: 'wait', hours: 2 }, { type: 'hint', text: 'help' }, { type: 'free', text: 'I shout' }, { type: 'end' }]) {
  const pre = { minutes: 15, hours: 2, deathPossible: false, budget: null, travel: null, tune: { kind: 'static', freq: 99 } };
  const d2 = describeAction(s2, a, pre, [{ kind: 'world', text: 'Something happened', visible: false }], ['You need water.']);
  assert.ok(d2.includes('ACTION') || d2.includes('END MY STORY'), d2.slice(0, 80));
}
// Death path
s2.vitals.health = 0; assert.equal(checkEnd(s2).kind, 'death');
console.log('✓ snapshot, action descriptions, death');

// Weather determinism
assert.deepEqual(weatherFor(state, 5), weatherFor(state, 5));
console.log('✓ weather deterministic:', [0, 5, 10, 20].map(dd => weatherFor(state, dd).label).join(' | '));
console.log('\nALL ENGINE CHECKS PASSED');
