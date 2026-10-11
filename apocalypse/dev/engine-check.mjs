// Engine smoke test: runs the code-owned systems against the sample world without a browser or an API key.
//   node apocalypse/dev/engine-check.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const eng = p => import(path.join(here, '..', 'src', 'js', 'engine', p));
const { validateWorld, normalizeWorld, deepClean, stripStamp, hourFromText } = await eng('schema.js');
const { newGameState, advanceTime, applyChanges, checkEnd, endingStatus, computeScore, takeEvents, addFlag, reopenAfterDeadline, gearAvailable, migrateState, unfiredCount } = await eng('state.js');
const { tick, hasTap } = await eng('survival.js');
const { useItem, craft, availableRecipes, addItem, supplyDays, totalWeight, maxWeight, startingKit, inferTags } = await eng('inventory.js');
const { addInjury, treatInjury } = await eng('body.js');
const { recruit, dailyUpkeep, checkBetrayals, assign, withPlayer, skillCount } = await eng('companions.js');
const { seededRandom } = await eng('util.js');
const { claimShelter, fortify, deposit, withdraw, nightlyRaidRoll } = await eng('shelter.js');
const { tune, scan, walkieReach } = await eng('radio.js');
const { travelPlan, rollTravel, scavengeBudget, resolveEncounter, makeEncounter, classifyApproach } = await eng('encounters.js');
const { describeAction, buildStateSnapshot, truthForGM } = await eng('gm.js');
const { computeStats, fallbackDebrief, finalizeDebrief } = await eng('ending.js');
const { weatherFor, dayOf, formatDate, formatLongDate, formatStamp, collapseDay, defaultStartDate } = await eng('clock.js');
const { extractJSON, repairJSON, looksTruncated } = await eng('json.js');
const { stitch, applyExtension } = await eng('worldGenerator.js');
const { buildBriefing, briefingText } = await eng('briefing.js');
const { getLocation } = await eng('world.js');
const { buildWorldGenerationPrompt, pickSeed, resolveStartDay } = await import(path.join(here, '..', 'src', 'js', 'prompts', 'worldGeneration.js'));
const { buildTimelineExtensionPrompt } = await import(path.join(here, '..', 'src', 'js', 'prompts', 'extension.js'));

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

// Timestamps models invent inside event text are stripped; the hour they name is kept.
assert.equal(stripStamp('Emergency broadcast, Day 0, 22:00. A coordinated cyberattack has caused regional power failure.'), 'Emergency broadcast. A coordinated cyberattack has caused regional power failure.');
assert.equal(stripStamp('Day 3, 06:30: The bridge closes.'), 'The bridge closes.');
assert.equal(stripStamp('[Day 12] The convoy arrives.'), 'The convoy arrives.');
assert.equal(stripStamp('At 22:00 the streetlights go out across the Reach.'), 'At 22:00 the streetlights go out across the Reach.');
assert.equal(hourFromText('Emergency broadcast, Day 0, 22:00. Power fails.'), 22);
assert.equal(hourFromText('By 6 pm the bridge is closed'), 18);
assert.equal(hourFromText('At noon the sirens start'), 12);
assert.equal(hourFromText('The dam fails'), null);
console.log('✓ stamps stripped, hours recovered');

const raw = JSON.parse(readFileSync(path.join(here, 'sample-world.json'), 'utf8'));
const problems = validateWorld(deepClean(raw));
assert.deepEqual(problems, [], `sample world must validate: ${problems.join('; ')}`);
assert.ok(validateWorld(deepClean(JSON.parse(JSON.stringify(raw))), { startDay: 21 }).some(p => /after day 21/.test(p)), 'a deep start demands events after the start day');
const truth = normalizeWorld(JSON.parse(JSON.stringify(raw)), {});
assert.equal(truth.startOffset, 0); assert.equal(truth.incitingIndex, 0); assert.equal(truth.region.startDate, '2025-10-14');
assert.deepEqual(truth.timeline.find(e => /Power fails/.test(e.event)).effects.utilities, { power: false, water: false, cell: false, internet: false });
console.log('✓ sample world validates and normalises');

// Calendar
assert.equal(defaultStartDate('winter', 2026), '2026-01-12');
const seedState = { truth, clock: { minutes: 0 } };
assert.equal(formatDate(seedState, 0), 'Tue 14 Oct 2025');
assert.equal(formatLongDate(seedState, 3 * 1440), 'Friday 17 October 2025');
assert.match(formatStamp({ truth, clock: { minutes: 3 * 1440 + 9 * 60 + 40 } }), /^Day 3 \(Friday 17 October 2025\), 09:40, day$/);
console.log('✓ calendar');

// New game: an ordinary home before the collapse
let state = newGameState({ survivor: { name: 'Dana Reyes', background: 'nurse' }, truth, settings: { apocalypseId: 'pandemic', difficulty: 'hardened', lengthDays: 30, startDay: 0 }, rnd: seededRandom(3) });
assert.equal(state.location, 'loc1'); assert.equal(state.phase, 'prologue');
assert.ok(state.inventory.items.length >= 4, 'everyday pack');
assert.ok(state.inventory.items.some(i => i.tags.includes('phone')) && state.inventory.items.some(i => i.tags.includes('vehicle')), 'phone and car keys');
assert.equal(state.shelter?.locationId, 'loc1', 'home is the shelter');
assert.ok(state.shelter.stash.filter(i => i.category === 'food').length >= 7, 'a stocked pantry');
assert.deepEqual(state.utilities, { power: true, water: true, cell: true, internet: true });
assert.ok(state.npcsMet.includes('n1'), 'people from the survivor\'s life are known');
assert.ok(state.discovered.locations.includes('loc4'));
assert.ok(state.weather.today && typeof state.weather.today.tempC === 'number');
assert.ok(hasTap(state), 'the tap runs at home');
console.log('✓ new game state', { pack: state.inventory.items.map(i => i.name), stores: state.shelter.stash.length, weather: state.weather.today.label });

// Starting kits by timing
const deepKit = startingKit({ background: 'soldier', startDay: 21, rnd: seededRandom(5) });
assert.ok(deepKit.pack.some(i => i.category === 'food') && deepKit.pack.some(i => /dead/i.test(i.name)), 'a scavenger\'s pack weeks in');
assert.ok(inferTags('Walkie-talkies (pair)', 'electronics').includes('walkie') && !inferTags('Walkie-talkies (pair)', 'electronics').includes('radio'));
assert.ok(inferTags('Kitchen radio', 'electronics').includes('radio'));
console.log('✓ starting kits');

// Prologue describe
let txt = describeAction(state, { type: 'prologue_start' }, { minutes: 0 }, [], []);
assert.match(txt, /PROLOGUE: OPENING/); assert.match(txt, /Tuesday 14 October 2025/);
state.phase = 'play'; state.threat.level = 1;

// A day at home: the tap and the pantry keep the body going
const foodBefore = state.shelter.stash.filter(i => i.category === 'food').reduce((a, i) => a + i.qty, 0);
advanceTime(state, 24 * 60, {});
assert.ok(state.vitals.thirst > 80, `tap water keeps thirst up (${Math.round(state.vitals.thirst)})`);
assert.ok(state.vitals.hunger > 45, `the pantry feeds you (${Math.round(state.vitals.hunger)})`);
assert.ok(state.shelter.stash.filter(i => i.category === 'food').reduce((a, i) => a + i.qty, 0) < foodBefore, 'food was eaten from the stores');
takeEvents(state);
// A day of walking away from home (and from any tap) drains
state.location = 'loc3';
assert.ok(!hasTap(state), 'no tap at a bridge checkpoint');
advanceTime(state, 24 * 60, { exertion: true });
assert.ok(state.vitals.hunger < 50 && state.vitals.thirst < 20, 'a day of exertion drains hunger and thirst');
assert.ok(state.events.fired.length >= 1, 'the day 0 timeline event fired');
const evs = takeEvents(state);
assert.ok(evs.some(e => e.kind === 'world'), 'world events queued for the GM');
assert.ok(state.doom >= 2);
state.location = 'loc1';
console.log('✓ advanceTime: vitals', Object.fromEntries(Object.entries(state.vitals).map(([k, v]) => [k, Math.round(v)])), 'events', evs.map(e => e.kind));

// Utilities fail with the timeline (a rested survivor at home, so the days do not kill them)
Object.assign(state.vitals, { health: 100, hunger: 85, thirst: 85, fatigue: 90 });
advanceTime(state, 5 * 1440); takeEvents(state);
assert.equal(state.utilities.power, false, 'the power failed on day 6'); assert.equal(state.utilities.cell, false);
assert.ok(!hasTap(state), 'no tap once the water fails');
console.log('✓ utilities follow the timeline');

// Eat and drink from the pack (taking from the stores first)
const stashWater = state.shelter.stash.find(i => i.category === 'water'); assert.ok(withdraw(state, stashWater.id, 1).ok);
const water = state.inventory.items.find(i => i.category === 'water');
let r = useItem(state, water.id); assert.ok(r.ok, r.notice); assert.ok(state.vitals.thirst > 30);
const stashFood = state.shelter.stash.find(i => i.category === 'food'); assert.ok(withdraw(state, stashFood.id, 1).ok);
const food = state.inventory.items.find(i => i.category === 'food');
state.vitals.hunger = 40;
r = useItem(state, food.id); assert.ok(r.ok, r.notice);
console.log('✓ consumables');

// Injuries and treatment
const inj = addInjury(state, { region: 'left arm', type: 'cut', severity: 2 });
assert.equal(inj.region, 'leftArm');
const stashKit = state.shelter.stash.find(i => i.tags.includes('bandage')); assert.ok(withdraw(state, stashKit.id, 1).ok);
const kit = state.inventory.items.find(i => i.tags.includes('bandage'));
r = useItem(state, kit.id, { injuryId: inj.id }); assert.ok(r.ok, r.notice); assert.ok(inj.treated);
console.log('✓ injury + treatment:', r.notice);

// Crafting
addItem(state.inventory.items, { name: 'Dirty water', category: 'water' });
addItem(state.inventory.items, { name: 'Lighter', category: 'tool', tags: ['fire'] });
assert.ok(availableRecipes(state).some(x => x.id === 'boilwater'), 'boil water available with lighter + dirty water');
r = craft(state, 'boilwater'); assert.ok(r.ok, r.notice);
console.log('✓ crafting:', r.notice);

// Travel + scavenging; a car is faster than feet
const plan = travelPlan(state, 'loc2'); assert.ok(plan.minutes > 0 && plan.risk >= 3);
assert.ok(plan.vehicle, 'the car keys count as a vehicle');
const keys = state.inventory.items.find(i => i.tags.includes('vehicle'));
state.inventory.items = state.inventory.items.filter(i => i !== keys);
const walk = travelPlan(state, 'loc2'); assert.ok(walk.minutes > plan.minutes * 2, `walking (${walk.minutes}) is slower than driving (${plan.minutes})`);
state.location = 'loc2';
const b = scavengeBudget(state, 'loc2', 'the back office');
assert.ok(b.count >= 0 && b.count <= 3);
console.log('✓ travel plan', { drive: plan.minutes, walk: walk.minutes, risk: plan.risk }, 'scavenge', { count: b.count, cats: b.categories, hidden: b.hiddenIndex, quality: b.quality });

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
assert.ok(state.threat.level >= 2, 'threat delta clamped to +1');
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
assert.ok(state.shelter?.locationId === 'loc1', 'home is still the shelter');
addItem(state.inventory.items, { name: 'Planks', category: 'material', qty: 2 });
r = fortify(state); assert.ok(r.ok, r.notice);
const beans = state.inventory.items.find(i => i.name === 'Canned beans');
r = deposit(state, beans.id, 1); assert.ok(r.ok, r.notice);
const raid = nightlyRaidRoll(state, () => 0.0001);
assert.ok(raid && raid.kind === 'raid', 'forced raid rolls an event');
console.log('✓ shelter:', state.shelter ? `defense ${state.shelter.defense}` : 'overrun', '| raid:', raid.outcome);

// Companions upkeep, assignment, betrayal trigger, walkie-talkies
recruit(state, 'n2');
state.inventory.items = state.inventory.items.filter(i => i.category !== 'food'); if (state.shelter) state.shelter.stash = state.shelter.stash.filter(i => i.category !== 'food');
const up = dailyUpkeep(state, () => 0.99);
assert.ok(up.some(e => e.kind === 'companion_hungry'), 'hungry companions complain');
const bet = checkBetrayals(state);
assert.ok(bet.some(e => e.npcId === 'n2' && e.effect === 'steal'), 'Rico steals when food is short');
assert.equal(state.companions.n2.status, 'left');
recruit(state, 'n3');
state.companions.n3.hasWalkie = true;
r = assign(state, 'n3', 'scout', 'loc1'); assert.ok(r.ok, r.notice); assert.equal(state.companions.n3.status, 'away');
addItem(state.inventory.items, { name: 'Walkie-talkies (pair)', category: 'electronics', qty: 1 });
const reach = walkieReach(state, () => 0.9);
assert.ok(reach.companions.some(c => c.id === 'n3'), 'a companion with a paired unit nearby can be called');
assert.ok(gearAvailable(state).walkie && !gearAvailable(state).radio, 'walkie counts as a walkie, not a radio');
advanceTime(state, 5 * 60);
assert.equal(state.companions.n3.status === 'away', false, 'assignment resolved');
console.log('✓ companions: upkeep/betrayal/assignment/walkie', takeEvents(state).map(e => e.kind));

// Radio
state.clock.minutes = 12 * 1440 + 21 * 60; // day 12, 21:00
let t = tune(state, '7.200'); assert.equal(t.kind, 'broadcast', 'survivor net at 21:00 day 12'); assert.match(t.message.text, /eighteenth/);
t = tune(state, '99.9'); assert.equal(t.kind, 'static');
t = tune(state, '156.800'); assert.equal(t.kind, 'broadcast');
const sc = scan(state, () => 0.1); assert.ok(sc);
console.log('✓ radio: broadcast/static/scan');

// Timeline extension
const ext = applyExtension(state, {
  timeline: [
    { day: 20, hour: 7, event: 'Day 20, 07:00: The Wardens move their checkpoint to the truck stop.', doom: 4, visible: true, effects: { locationId: 'loc10', capturedBy: 'f1', dangerDelta: 1, utilities: { power: true } } },
    { day: 5, event: 'This is in the past and must be dropped.', doom: 3 },
    { day: 25, event: 'A voice calls for anyone with a boat.', contact: true, effects: { radioFreq: '7.200', locationId: 'nowhere', capturedBy: 'f9' } }
  ],
  radioMessages: [{ freq: '7.200', fromDay: 21, text: 'Anyone with a boat, the cove is watched now. Out.', truthful: true }, { freq: '1.000', fromDay: 21, text: 'no such channel' }],
  nextWayOut: { what: 'A fuel barge up the river', where: 'loc5', windowStartDay: 30, windowEndDay: 34, requirements: [{ flag: 'barge_pilot', description: 'A pilot who knows the river', howToObtain: 'Earn Dee\'s trust.' }], clues: [{ text: 'Dee says the barge runs on the thirtieth.', source: { kind: 'npc', id: 'n3' } }, { text: 'bad', source: { kind: 'location', id: 'loc5' } }] }
});
assert.equal(ext.added, 2, 'past entries dropped'); assert.equal(ext.messages, 1);
const added = state.truth.timeline.slice(-2);
assert.equal(added[0].hour, 7); assert.equal(added[0].event, 'The Wardens move their checkpoint to the truck stop.');
assert.deepEqual(added[0].effects.utilities, { power: true });
assert.ok(!added[1].effects.locationId && !added[1].effects.capturedBy && added[1].effects.radioFreq === '7.200', 'bad ids dropped');
assert.equal(state.truth.ending.trueWayOut.where, 'loc5'); assert.equal(state.truth.ending.clues.at(-1).id, 'x6');
assert.ok(buildTimelineExtensionPrompt({ state }).includes('day greater than 12'));
console.log('✓ timeline extension: validated and spliced');

// Ending gate (the original way out, restored for the test)
state.truth.ending.trueWayOut = state.truth.ending.previousWayOuts[0];
state.location = 'loc8'; state.clock.minutes = 19 * 1440 + 9 * 60;
let es = endingStatus(state); assert.ok(es.atPlace && es.inWindow && !es.open, 'missing has_diesel');
addFlag(state, 'has_diesel'); es = endingStatus(state); assert.ok(es.open, `ending should be open: ${es.missing}`);
applyChanges(state, { escape: true }); assert.ok(state.escapeRequested);
const ended = checkEnd(state); assert.equal(ended.kind, 'escape');
const score = computeScore(state); assert.ok(score > 50 && score <= 100);
const stats = computeStats(state); const d = finalizeDebrief(state, fallbackDebrief(state, stats), stats);
assert.ok(d.timeline.length >= 10 && d.trueCause.length > 50 && d.rating);
console.log('✓ ending: escape, score', score, d.rating);

// Deadline: the player may keep going
const s3 = newGameState({ survivor: { name: 'Y', background: 'cook' }, truth, settings: { difficulty: 'hardened', lengthDays: 30, startDay: 0 }, rnd: seededRandom(2) }); s3.phase = 'play';
s3.clock.minutes = 31 * 1440 + 8 * 60;
assert.equal(checkEnd(s3).kind, 'deadline');
assert.ok(reopenAfterDeadline(s3)); assert.equal(s3.ended, null); assert.equal(s3.clock.deadlineDay, null); assert.equal(checkEnd(s3), null);
assert.ok(takeEvents(s3).some(e => e.kind === 'world'), 'the GM hears that the day has passed');
const s4 = newGameState({ survivor: { name: 'Z', background: 'cook' }, truth, settings: { difficulty: 'hardened', openEnded: true, startDay: 0 } });
assert.equal(s4.clock.deadlineDay, null, 'open-ended games have no deadline');
console.log('✓ deadline passed: reopened; open-ended games');

// Starting before, and weeks into, the collapse
const before = normalizeWorld(JSON.parse(JSON.stringify(raw)), { startDay: -3 });
assert.equal(before.startOffset, -3); assert.equal(before.timeline[before.incitingIndex].day, 3); assert.equal(before.deadlineDay, 33); assert.equal(before.ending.trueWayOut.windowStartDay, 21);
const sb = newGameState({ survivor: { name: 'B', background: 'teacher' }, truth: before, settings: { difficulty: 'hardened', lengthDays: 30, startDay: -3 }, rnd: seededRandom(4) });
assert.equal(sb.phase, 'prologue'); assert.equal(collapseDay(sb), -3); assert.equal(sb.events.fired.length, 0);
txt = describeAction(sb, { type: 'prologue_start' }, { minutes: 0 }, [], []); assert.match(txt, /ORDINARY LIFE/);
sb.prologueTurns = 1;
txt = describeAction(sb, { type: 'rest', hours: 8 }, { minutes: 480, hours: 8, prologueLife: true, allowGmTime: true }, [], []); assert.match(txt, /ORDINARY LIFE CONTINUES/); assert.match(txt, /ACTION: SLEEP \/ REST/);
txt = describeAction(sb, { type: 'free', text: 'Walk to work' }, { minutes: 15, prologueLife: true }, [{ kind: 'world', index: before.incitingIndex, text: before.timeline[before.incitingIndex].event, visible: true, inciting: true }], []);
assert.match(txt, /THE MOMENT/); assert.match(txt, /it happened at 10:00/);
const deep = normalizeWorld(JSON.parse(JSON.stringify(raw)), { startDay: 21 });
assert.equal(deep.timeline[deep.incitingIndex].day, -21);
const sd = newGameState({ survivor: { name: 'D', background: 'mechanic' }, truth: deep, settings: { difficulty: 'hardened', lengthDays: 30, startDay: 21 }, rnd: seededRandom(6) });
assert.equal(sd.phase, 'play'); assert.equal(collapseDay(sd), 21);
assert.ok(sd.worldEvents.filter(e => e.history).length >= 5, 'history is on the record');
assert.equal(sd.utilities.power, false, 'the grid went down fifteen days ago'); assert.ok(sd.doom >= 4);
assert.ok(sd.locationState.loc3?.heldBy === 'f1', 'captures already happened');
assert.ok(unfiredCount(sd) > 0);
const bd = buildBriefing(sd);
assert.ok(bd.publicStory && bd.publicStory.events.length >= 5 && /2025/.test(bd.publicStory.events[0].date));
assert.match(briefingText(bd), /WHAT HAS HAPPENED SO FAR/);
txt = describeAction(sd, { type: 'opening' }, { minutes: 0 }, [], []); assert.match(txt, /ALREADY SURVIVING/); assert.match(txt, /DOSSIER:/);
console.log('✓ start timing: before (prologue life, the moment) and weeks in (history, utilities, opening)');

// The dossier for an ordinary start
const b0 = buildBriefing(state);
assert.equal(b0.stamp.date, formatLongDate(state)); assert.ok(b0.people.some(p => p.name === 'Maya Okonkwo')); assert.ok(b0.home && b0.home.name);
assert.match(briefingText(b0), /^WHEN: day/);
console.log('✓ dossier');

// Custom background and migration
const customTruth = normalizeWorld(JSON.parse(JSON.stringify(raw)), {});
customTruth.survivor = { ...customTruth.survivor, title: 'lighthouse keeper', skills: ['electronics', 'survival'], kit: [{ name: 'Signal lamp', category: 'tool' }], carry: 2, vehicle: null };
const sc2 = newGameState({ survivor: { name: 'K', background: 'custom', text: 'Lighthouse keeper, 60, bad knee' }, truth: customTruth, settings: { difficulty: 'hardened', startDay: 0 } });
assert.deepEqual(sc2.survivor.skills, ['electronics', 'survival']); assert.equal(sc2.survivor.title, 'lighthouse keeper');
assert.ok(sc2.shelter.stash.some(i => i.name === 'Signal lamp')); assert.equal(maxWeight(sc2), 18 + 2);
const old = JSON.parse(JSON.stringify(sc2)); delete old.utilities; delete old.home; migrateState(old); assert.ok(old.utilities && old.home === 'loc1');
console.log('✓ custom background, migration');

// Prompts
const gen = buildWorldGenerationPrompt({ apocalypseId: 'ai', apocalypseName: 'Runaway AI', difficulty: 'hardened', lengthDays: 45, startDay: -3, homePlace: 'Lisbon, Portugal', survivor: { name: 'K', background: 'custom' }, customBackground: 'tram driver', seed: pickSeed(seededRandom(1)), variant: 'a logistics AI' });
assert.match(gen, /deadlineDay MUST be exactly 42/); assert.match(gen, /Lisbon, Portugal/); assert.match(gen, /BEFORE the inciting event/); assert.match(gen, /a logistics AI/); assert.match(gen, /tram driver/);
assert.ok([-5, -4, -3, -2].includes(resolveStartDay('before', () => 0.99)) && resolveStartDay('onset') === 0 && resolveStartDay('deep', () => 0) === 18);
console.log('✓ generation prompt');

// Snapshot and action descriptions
const snap = buildStateSnapshot(state); assert.ok(snap.vitals && snap.knownLocations.length > 0 && snap.companions.length >= 2 && snap.utilities && snap.date);
assert.ok(!('prologue' in truthForGM(state)));
const s2 = newGameState({ survivor: { name: 'X', background: 'soldier' }, truth, settings: { difficulty: 'nightmare', startDay: 0 } }); s2.phase = 'play';
for (const a of [{ type: 'look' }, { type: 'wait', hours: 2 }, { type: 'hint', text: 'help' }, { type: 'free', text: 'I shout' }, { type: 'call', text: 'Anyone out there?' }, { type: 'end' }]) {
  const pre = { minutes: 15, hours: 2, deathPossible: false, budget: null, travel: null, tune: { kind: 'static', freq: 99 }, call: { rangeKm: 3, companions: [], factions: [], stranger: false } };
  const d2 = describeAction(s2, a, pre, [{ kind: 'world', text: 'Something happened', visible: false }], ['You need water.']);
  assert.ok(d2.includes('ACTION') || d2.includes('END MY STORY'), d2.slice(0, 80));
  assert.match(d2, /Utilities:|END MY STORY/);
}
// Death path
s2.vitals.health = 0; assert.equal(checkEnd(s2).kind, 'death');
console.log('✓ snapshot, action descriptions, death');

// Intent: sleeping, waiting, meals and time belong to the code
const { classifyIntent, parseClockTarget, parseDuration, sleepMinutes, estimateMinutes, clockFromNarrative } = await eng('intent.js');
const { consumeByIntent } = await eng('consume.js');
assert.equal(classifyIntent('sleep till nine in the morning').kind, 'sleep'); assert.equal(classifyIntent('sleep till nine in the morning').target, 9);
assert.equal(classifyIntent('Go to sleep').kind, 'sleep'); assert.equal(classifyIntent('nap for an hour').kind, 'nap'); assert.equal(classifyIntent('nap for an hour').minutes, 60);
assert.equal(classifyIntent('wait until dark').kind, 'wait'); assert.equal(classifyIntent('wait until dark').target, 21);
assert.equal(classifyIntent("I can't sleep, check the window"), null);
assert.equal(classifyIntent('tell Alma to get some sleep', { npcMentioned: true }), null);
assert.equal(classifyIntent('Open the door and wave at the coordinator'), null);
assert.equal(classifyIntent('Make some eggs and coffee').kind, 'consume'); assert.ok(classifyIntent('Make some eggs and coffee').cook);
assert.equal(classifyIntent('eat the leftovers').item, 'leftovers'); assert.ok(classifyIntent('Make some coffee').drink);
assert.equal(parseDuration('sleep till nine in the morning'), null, '"in the morning" is a time, not a duration'); assert.equal(parseDuration('spend the afternoon on the roof'), 240);
assert.equal(parseClockTarget('sleep until 6:30'), 6); assert.equal(parseClockTarget('wait till five'), 17); assert.equal(parseDuration('rest for a couple of hours'), 120);
assert.equal(clockFromNarrative('You sleep through all of it. It is nine in the morning and you have slept.'), 540); assert.equal(clockFromNarrative('By 7:10 the street is awake.'), 430);
const sx = newGameState({ survivor: { name: 'T', background: 'nurse' }, truth, settings: { difficulty: 'hardened', startDay: 0 }, rnd: seededRandom(9) }); sx.phase = 'play';
sx.clock.minutes = 3 * 60 + 21;
assert.equal(sleepMinutes(sx, { target: 9 }), 339, 'till nine from 03:21');
assert.equal(sleepMinutes(sx, {}), 240, 'at night a plain "sleep" runs to seven, at least four hours');
sx.clock.minutes = 10 * 60;
assert.equal(sleepMinutes(sx, { target: 7 }), 480, 'morning is too far away by day: a full sleep instead');
let est = estimateMinutes(sx, 'Go to sleep', ''); assert.equal(est.resting, true); assert.equal(est.minutes, 480);
est = estimateMinutes(sx, 'Boot the phone and see what came in', 'You thumb it on.'); assert.equal(est.minutes, 10);
est = estimateMinutes(sx, 'Head down to the basement cage', ''); assert.equal(est.minutes, 40);
sx.clock.minutes = 6 * 60;
est = estimateMinutes(sx, 'Finish the coffee', 'By 7:10 the street is awake.'); assert.equal(est.source, 'narrative-clock'); assert.equal(est.minutes, 70);
// eating from the stores at home, drinking from the tap
sx.vitals.hunger = 40; sx.vitals.thirst = 50;
let cr = consumeByIntent(sx, { eat: true, drink: true, cook: true, minutes: 40 });
assert.ok(cr.ok && cr.ate && cr.drank === 'water from the tap' && cr.cooked, JSON.stringify(cr));
assert.ok(sx.vitals.hunger > 60 && sx.vitals.thirst > 80, 'the meal counted');
sx.shelter.stash = sx.shelter.stash.filter(i => i.category !== 'food'); sx.inventory.items = sx.inventory.items.filter(i => i.category !== 'food');
cr = consumeByIntent(sx, { eat: true, minutes: 25 }); assert.ok(!cr.ok && cr.missing.includes('food'));
// exhaustion knocks you out
sx.vitals.fatigue = 2; sx.vitals.thirst = 90; sx.vitals.hunger = 90;
const kn = advanceTime(sx, 120, { exertion: true });
assert.ok(kn.some(x => /pass out/.test(x)), 'passing out is reported'); assert.ok(sx.vitals.fatigue > 20, 'and the body slept');
// a meal the GM narrated feeds the body
addItem(sx.inventory.items, { name: 'Tin of peaches', category: 'food' }); sx.vitals.hunger = 30;
applyChanges(sx, { itemsLost: ['Tin of peaches'] }, { narrative: 'You eat the peaches with your fingers.' });
assert.ok(sx.vitals.hunger > 40, 'itemsLost of food in a meal raises hunger');
txt = describeAction(sx, { type: 'consume', text: 'eat something', intent: { eat: true } }, { minutes: 25, consume: { ok: true, ate: 'Crackers', drank: null, cooked: false, minutes: 25, notices: ['You eat crackers from the pack.'], missing: [] } }, [], []);
assert.match(txt, /EAT \/ DRINK/); assert.match(txt, /ate Crackers/);
console.log('✓ intent: sleep, wait, meals and time are the code\'s');

// Variety: recent seeds and variants are avoided; clichés are banned unless the variant is that
const { variantFor, clichesFor } = await eng('apocalypses.js');
const v1 = variantFor('ai', seededRandom(1)); assert.ok(v1); assert.notEqual(variantFor('ai', seededRandom(1), [v1]), v1);
const sd1 = pickSeed(seededRandom(2)); const sd2 = pickSeed(seededRandom(2), { openings: [sd1.opening] }); assert.notEqual(sd1.opening, sd2.opening); assert.ok(sd1.channel);
assert.ok(clichesFor('ai').some(c => /compliance/.test(c)));
const gen2 = buildWorldGenerationPrompt({ apocalypseId: 'ai', difficulty: 'hardened', lengthDays: 30, startDay: 0, survivor: { name: 'K', background: 'nurse' }, seed: sd1, variant: 'a logistics system that quietly stops delivering to districts it rates unproductive; no drones, no voice, just empty shelves and trucks that never turn in' });
assert.match(gen2, /BANNED/); assert.match(gen2, /compliance, social-credit or citizen scores/); assert.match(gen2, /HOW OFFICIAL WORD TRAVELS/);
const gen3 = buildWorldGenerationPrompt({ apocalypseId: 'ai', difficulty: 'hardened', lengthDays: 30, startDay: 0, survivor: { name: 'K', background: 'nurse' }, seed: sd1, variant: 'a compliance scoring system that becomes law overnight: doors, food and medicine answer to a number, and the number is watching' });
assert.ok(!/BANNED[^\n]*compliance, social-credit/.test(gen3), 'the compliance variant may use scores');
console.log('✓ variety: recent seeds and variants avoided; clichés banned');

// Weather determinism
assert.deepEqual(weatherFor(state, 5), weatherFor(state, 5));
console.log('✓ weather deterministic:', [0, 5, 10, 20].map(dd => weatherFor(state, dd).label).join(' | '));
console.log('\nALL ENGINE CHECKS PASSED');
