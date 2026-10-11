// Drives a full playthrough of the BUILT index.html over file:// with Playwright,
// against the offline mock GM. Fails on any console error or page error.
//
//   node apocalypse/dev/build.js && node apocalypse/dev/playthrough.mjs
//
// Needs Playwright with Chromium: `npm i -g playwright && npx playwright install chromium`,
// or set PLAYWRIGHT_MODULE to a directory containing the playwright package.

import { spawn, execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright'];
  try { candidates.push(path.join(execSync('npm root -g', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), 'playwright')); } catch { /* ignore */ }
  for (const c of candidates.filter(Boolean)) { try { return require(c); } catch { /* next */ } }
  throw new Error('Playwright not found. Install it (npm i -g playwright) or set PLAYWRIGHT_MODULE.');
}
const { chromium } = loadPlaywright();

const indexPath = path.join(here, '..', 'index.html');
if (!existsSync(indexPath)) { console.error('Build first: node apocalypse/dev/build.js'); process.exit(1); }
const url = `file://${indexPath}`;
const PORT = 8790;

const mock = spawn(process.execPath, [path.join(here, 'mock-gm.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((res, rej) => { mock.stdout.on('data', d => { if (String(d).includes('listening')) res(); }); mock.on('exit', c => rej(new Error(`mock exited ${c}`))); setTimeout(() => rej(new Error('mock did not start')), 8000); });

const errors = [];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
page.on('console', msg => { if (msg.type() === 'error') errors.push(`console: ${msg.text()}`); });
page.on('pageerror', err => errors.push(`pageerror: ${err.message}`));

const step = (name) => console.log(`· ${name}`);
const state = () => page.evaluate(() => JSON.parse(JSON.stringify(window.cyoa.state)));
const idle = async () => { await page.waitForFunction(() => window.cyoa && !window.cyoa.busy, null, { timeout: 30000 }); };
const cmd = async (line) => { await page.fill('#cmdInput', line); await page.press('#cmdInput', 'Enter'); await page.waitForTimeout(100); await idle(); await settle(); };
// If an encounter began, resolve it by running.
async function settle() {
  for (let i = 0; i < 3; i++) {
    const s = await state();
    if (!(s.encounter && !s.encounter.resolved)) return;
    step('  encounter in progress: running');
    await page.click('.choices .btn:has-text("Run")');
    await page.waitForTimeout(100); await idle();
  }
}
async function logon() {
  await page.click('#bootSkip');
  await page.waitForSelector('#screen-login:not(.hidden)');
  await page.selectOption('#providerSelect', 'custom');
  await page.fill('#baseUrl', `http://localhost:${PORT}/v1`);
  await page.fill('#apiKey', 'test-key');
}

try {
  step('boot and logon');
  await page.goto(url);
  await logon();
  await page.click('#testConn');
  await page.waitForFunction(() => /Link OK/.test(document.querySelector('#connStatus').textContent), null, { timeout: 15000 });
  await page.click('#loginForm button[type=submit]');
  await page.waitForSelector('#screen-newgame:not(.hidden)');

  step('new game');
  await page.fill('#survivorName', 'Dana Reyes');
  await page.selectOption('#background', 'nurse');
  await page.fill('#homePlace', 'Port Hollis');
  await page.selectOption('#apocalypseType', 'pandemic');
  await page.selectOption('#gameStart', 'onset');
  await page.selectOption('#difficulty', 'hardened');
  await page.selectOption('#gameLength', '30');
  await page.click('#newGameForm button[type=submit]');
  await page.waitForSelector('#screen-desktop:not(.hidden)', { timeout: 30000 });
  await idle();
  let s = await state();
  if (s.turnCount !== 1 || s.phase !== 'prologue') throw new Error(`expected prologue turn 1, got turn ${s.turnCount} phase ${s.phase}`);
  if (!(await page.textContent('#topRegion')).includes('CASCADE REACH')) throw new Error('top bar should carry the region');
  if (!(await page.textContent('#topDay')).includes('TUE 14 OCT 2025')) throw new Error('top bar should carry the calendar date');
  if (s.shelter?.locationId !== 'loc1' || !s.shelter.stash.some(i => i.category === 'food')) throw new Error('an ordinary start begins at home with a stocked pantry');
  if (!s.utilities?.power) throw new Error('the grid is up before the collapse');

  step('dossier');
  const card = await page.textContent('.log-stream .entry.briefing');
  if (!/Dana Reyes/.test(card) || !/Tuesday 14 October 2025/.test(card) || !/Maya Okonkwo/.test(card) || !/Harrow Street/.test(card)) throw new Error('the dossier card should say who, when, where and whom you know');
  await page.click('[data-win="dossier"]');
  await page.waitForSelector('.win[data-win="dossier"] .dossier');
  if (!(await page.textContent('.win[data-win="dossier"]')).includes('The record')) throw new Error('dossier panel should explain the record');
  await page.click('.win[data-win="dossier"] .win-close');
  await page.evaluate(() => { const st = window.cyoa.state; st.shelter.stash = st.shelter.stash.filter(i => !i.tags.includes('radio') && !i.tags.includes('walkie')); st.inventory.items = st.inventory.items.filter(i => !i.tags.includes('radio') && !i.tags.includes('walkie')); window.cyoa.updateTopbar(); });
  if (!(await page.$('.dock button[data-win="radio"].unavailable'))) throw new Error('the Radio panel should be hidden without a radio');

  step('prologue');
  await cmd('Turn on the radio and listen');
  await cmd('Go down to the pharmacy');
  s = await state();
  if (s.phase !== 'play') throw new Error(`expected play phase after the moment, got ${s.phase}`);
  if (!(await page.textContent('.log-stream')).includes('SITUATION REPORT')) throw new Error('situation report missing from the log');

  step('travel to the pharmacy');
  await cmd('go pharmacy');
  s = await state();
  if (s.location !== 'loc2') throw new Error(`expected loc2, got ${s.location}`);
  if (!s.npcsMet.includes('n1')) throw new Error('should have met Maya');

  step('companion talk and recruit');
  await cmd('talk maya Will you come with me? We can do more together.');
  s = await state();
  if (s.companions.n1?.status !== 'with') throw new Error(`Maya should be with us, status ${s.companions.n1?.status}`);
  await page.click('[data-win="companions"]');
  await page.waitForSelector('.win[data-win="companions"]');
  if (!(await page.textContent('.win[data-win="companions"]')).includes('Maya Okonkwo')) throw new Error('companion panel should list Maya');

  step('inventory: eat and craft');
  await page.evaluate(() => { const st = window.cyoa.state; st.vitals.hunger = 60; st.inventory.items.push({ id: 'itgran', name: 'Granola bar', category: 'food', tags: ['food'], qty: 1, weight: 0.2, condition: 90 }); });
  s = await state();
  const hungerBefore = s.vitals.hunger;
  await cmd('eat granola');
  s = await state();
  if (!(s.vitals.hunger > hungerBefore)) throw new Error('eating should raise hunger');
  await page.click('[data-win="inventory"]');
  await page.waitForSelector('.win[data-win="inventory"] .list li');

  step('search');
  const turns = s.turnCount;
  await cmd('search the back office');
  s = await state();
  if (s.turnCount <= turns) throw new Error('search should run a turn');

  step('free text beats shortcuts');
  const before = s.turnCount;
  await cmd('Open the door and wave at the coordinator. Explain you were in the bathroom.');
  s = await state();
  if (s.turnCount !== before + 1) throw new Error('a sentence starting with "open" should reach the GM as a free action');
  await cmd('/open map');
  if (!(await page.$('.win[data-win="map"]'))) throw new Error('a slash should force the open shortcut');
  const hourBefore = Math.floor((s.clock.minutes % 1440) / 60);
  const turnsBefore = s.turnCount;
  let untilMorning = 7 - hourBefore; if (untilMorning <= 0) untilMorning += 24;
  await cmd('sleep until morning');
  s = await state();
  if (untilMorning <= 12) {
    if (Math.floor((s.clock.minutes % 1440) / 60) !== 7) throw new Error('"sleep until morning" should rest until 07:00');
  } else if (s.turnCount !== turnsBefore + 1) throw new Error('"sleep until morning" in daytime should go to the GM as a free action');
  await cmd('rest 2 hours');
  const after = await state();
  if (after.clock.minutes - s.clock.minutes < 120) throw new Error('"rest 2 hours" should advance the clock two hours');
  s = after;

  step('radio appears with a radio; walkie-talkie calls');
  await cmd('tune 162.400');
  s = await state();
  if (s.radio.log.length) throw new Error('tuning without a radio should not reach the dial');
  await page.evaluate(() => { const st = window.cyoa.state; st.inventory.items.push({ id: 'itradio', name: 'Hand-crank radio', category: 'electronics', tags: ['radio'], qty: 1, weight: 0.6, condition: 90 }, { id: 'itwalkie', name: 'Walkie-talkies (pair)', category: 'electronics', tags: ['walkie'], qty: 2, weight: 0.3, condition: 90 }); window.cyoa.updateTopbar(); });
  if (await page.$('.dock button[data-win="radio"].unavailable')) throw new Error('the Radio panel should appear once a radio is carried');
  await cmd('call Maya, can you hear me?');
  s = await state();
  if (!s.radio.log.some(e => e.kind === 'call')) throw new Error('a walkie-talkie call should be logged');

  step('radio');
  await cmd('tune 162.400');
  s = await state();
  if (!s.radio.log.length) throw new Error('radio log should have an entry');
  await page.click('[data-win="radio"]');
  await page.waitForSelector('.win[data-win="radio"] .entry.radio');

  step('status and body figure');
  await page.click('[data-win="status"]');
  await page.waitForSelector('.win[data-win="status"] .body-fig svg .region');
  const regions = await page.$$eval('.win[data-win="status"] .body-fig .region', els => els.length);
  if (regions !== 12) throw new Error(`expected 12 body regions, got ${regions}`);
  const bars = await page.$$eval('.win[data-win="status"] .vital', els => els.length);
  if (bars !== 7) throw new Error(`expected 7 vitals bars, got ${bars}`);
  await page.evaluate(() => { const st = window.cyoa.state; st.body.injuries.push({ id: 'injtest', region: 'leftArm', type: 'cut', severity: 2, treated: false, infected: false, at: st.clock.minutes, progress: 0 }); if (!st.inventory.items.some(i => i.tags.includes('bandage'))) st.inventory.items.push({ id: 'itband', name: 'Bandage', category: 'medical', tags: ['bandage'], qty: 2, weight: 0.1, condition: 100 }); window.cyoa.wm.refresh('status'); });
  await page.waitForSelector('.win[data-win="status"] .body-fig .region.sev2');
  await page.click('.win[data-win="status"] button:has-text("Treat")');
  s = await state();
  if (!s.body.injuries[0].treated) throw new Error('treat button should treat the injury');

  step('map and shelter');
  await page.click('[data-win="map"]');
  await page.waitForSelector('.win[data-win="map"] .map svg .node');
  const nodes = await page.$$eval('.win[data-win="map"] .map svg .node', els => els.length);
  if (nodes < 7) throw new Error(`expected at least 7 map nodes, got ${nodes}`);
  const vb0 = await page.getAttribute('.win[data-win="map"] .map svg', 'viewBox');
  await page.click('.win[data-win="map"] .map-tools button[title="Zoom in"]');
  const vb1 = await page.getAttribute('.win[data-win="map"] .map svg', 'viewBox');
  if (vb0 === vb1) throw new Error('zoom in should change the map viewBox');
  await page.hover('.win[data-win="map"] .map svg');
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(100);
  const vb2 = await page.getAttribute('.win[data-win="map"] .map svg', 'viewBox');
  if (vb1 === vb2) throw new Error('wheel should zoom the map');
  await page.click('.win[data-win="map"] .win-max');
  if (!(await page.$('.win[data-win="map"].max'))) throw new Error('maximize should add the max class');
  await page.click('.win[data-win="map"] .win-max');
  if (await page.$('.win[data-win="map"].max')) throw new Error('restore should remove the max class');
  await page.click('.dock button[title="Tile windows"]');
  await page.waitForTimeout(100);
  await cmd('claim');
  s = await state();
  if (s.shelter?.locationId !== 'loc2') throw new Error('shelter should be the pharmacy');
  await page.click('[data-win="shelter"]');
  await page.waitForSelector('.win[data-win="shelter"]');
  if (!(await page.textContent('.win[data-win="shelter"]')).includes('BASE')) throw new Error('shelter panel should show BASE');

  step('journal, factions, help, take stock');
  for (const id of ['journal', 'factions', 'help']) { await page.click(`[data-win="${id}"]`); await page.waitForSelector(`.win[data-win="${id}"]`); }
  await cmd('note remember the diesel');
  s = await state();
  if (!s.journal.includes('diesel')) throw new Error('note should be in the journal');
  await page.click('.win[data-win="log"] button:has-text("Take stock")').catch(async () => { await page.click('[data-win="log"]'); await page.click('.win[data-win="log"] button:has-text("Take stock")'); });
  await page.waitForSelector('#modal[open]');
  await page.click('#modal .btn');

  step('save to slot 1, reload, resume');
  await page.click('[data-win="settings"]');
  await page.waitForSelector('.win[data-win="settings"]');
  await page.click('.win[data-win="settings"] .slot-list li:nth-child(2) button:has-text("Save here")');
  await page.waitForTimeout(200);
  const saved = await page.evaluate(() => !!localStorage.getItem('cyoa.slot.1'));
  if (!saved) throw new Error('slot 1 should be saved');
  await page.selectOption('.win[data-win="settings"] select', 'amber');
  const theme = await page.evaluate(() => document.body.dataset.theme);
  if (theme !== 'amber') throw new Error('theme should switch to amber');
  await page.reload();
  await logon();
  await page.click('#loginForm button[type=submit]');
  await page.waitForSelector('#screen-newgame:not(.hidden)');
  await page.click('#slotList li:nth-child(2) button:has-text("Resume")');
  await page.waitForSelector('#screen-desktop:not(.hidden)');
  await idle();
  s = await state();
  if (s.location !== 'loc2' || s.companions.n1?.status !== 'with') throw new Error('resumed state should match the save');

  step('tablet width');
  await page.setViewportSize({ width: 820, height: 1000 });
  await page.click('[data-win="status"]');
  await page.waitForTimeout(150);
  const visibleWins = await page.$$eval('.win', els => els.filter(e => getComputedStyle(e).display !== 'none').length);
  if (visibleWins !== 1) throw new Error(`tablet width should show one full-screen panel, saw ${visibleWins}`);
  await page.setViewportSize({ width: 1280, height: 860 });

  step('skip ahead, give, assign');
  await cmd('skip');
  await page.evaluate(() => { const st = window.cyoa.state; st.inventory.items.push({ id: 'ittest', name: 'Chocolate bar', category: 'food', tags: ['food', 'comfort'], qty: 1, weight: 0.2, condition: 90 }); });
  await cmd('give chocolate to maya');
  s = await state();
  if (s.inventory.items.some(i => i.id === 'ittest')) throw new Error('given item should leave the pack');
  await cmd('assign maya scout apartments');
  s = await state();
  if (s.companions.n1.status !== 'away' || !s.pending.length) throw new Error('Maya should be away on assignment');

  step('the deadline passes: keep surviving, and the world keeps moving');
  const tlBefore = s.truth.timeline.length;
  await page.evaluate(() => { const st = window.cyoa.state; st.clock.minutes = 31 * 1440 + 8 * 60; st.vitals.health = 100; st.vitals.thirst = 90; st.vitals.hunger = 90; window.cyoa.updateTopbar(); });
  await page.fill('#cmdInput', 'wait 1'); await page.press('#cmdInput', 'Enter');
  await page.waitForSelector('#modal[open]', { timeout: 30000 });
  if (!/deadline has passed/i.test(await page.textContent('#modal'))) throw new Error('the deadline should offer a choice');
  await page.click('#modal .btn.primary');
  await page.waitForTimeout(200); await idle();
  s = await state();
  if (s.ended || s.clock.deadlineDay != null || s.deadlinePassed !== 30) throw new Error('keeping on should reopen the record without a deadline');
  if (!(await page.textContent('#topDeadline')).includes('NO CLOCK')) throw new Error('top bar should show that the clock is gone');
  if (s.truth.timeline.length <= tlBefore) throw new Error('the timeline should have been extended once it ran out');

  step('ending: the way out');
  await page.evaluate(() => { const st = window.cyoa.state; st.clock.minutes = 19 * 1440 + 9 * 60; st.flags.push('annie_trusts_you', 'has_diesel'); if (!st.discovered.locations.includes('loc8')) st.discovered.locations.push('loc8'); st.companions.n1.status = 'with'; st.companions.n1.assignment = null; st.pending = []; window.cyoa.updateTopbar(); window.cyoa.wm.refreshAll(); });
  await cmd('go dunmore');
  s = await state();
  if (s.location !== 'loc8') throw new Error(`expected loc8, got ${s.location}`);
  if (!(await page.textContent('#topAlert')).match(/CONTINENTAL DARK|REGIONAL EMERGENCY|EXTINCTION/)) throw new Error('alert chip should reflect a raised alert level by day 19');
  await cmd('Take the Marit out of the cove');
  await page.waitForSelector('#screen-debrief:not(.hidden)', { timeout: 30000 });
  await idle();
  s = await state();
  if (s.ended?.kind !== 'escape') throw new Error(`expected escape ending, got ${JSON.stringify(s.ended)}`);
  const debrief = await page.textContent('#debriefBody');
  if (!/TRUTH UNSEALED/.test(debrief) || !/Meridian/.test(debrief) || !/hidden timeline/i.test(debrief)) throw new Error('debrief should reveal the truth and the timeline');
  if (!/\d+ \/ 100/.test(debrief)) throw new Error('debrief should show a score');

  step('continue the story: chapter two');
  const packBefore = s.inventory.items.length;
  await page.click('#debriefBody button:has-text("Continue the story")');
  await page.waitForSelector('#modal[open]');
  await page.click('#modal .btn.primary');
  await page.waitForSelector('#screen-desktop:not(.hidden)', { timeout: 30000 });
  await idle();
  s = await state();
  if (s.chapter !== 2 || s.lineage?.length !== 1 || s.phase !== 'play' || s.turnCount !== 1) throw new Error(`chapter two should open in play: chapter ${s.chapter}, lineage ${s.lineage?.length}, phase ${s.phase}, turn ${s.turnCount}`);
  if (s.companions.n1?.status !== 'with') throw new Error('Maya should have come along');
  if (s.inventory.items.length < Math.min(3, packBefore)) throw new Error('the pack should carry over');
  if (!/CHAPTER 2/.test(await page.textContent('.log-stream .entry.briefing'))) throw new Error('the dossier should say chapter 2');
  if (!(await page.textContent('.log-stream')).includes('SITUATION REPORT')) throw new Error('a mid-collapse start posts the situation report');

  step('end by choice, then continue in this world');
  await cmd('end my story');
  await page.waitForSelector('#modal[open]');
  await page.click('#modal .btn.danger');
  await page.waitForSelector('#screen-debrief:not(.hidden)', { timeout: 30000 });
  await idle();
  await page.click('#debriefBody button:has-text("Continue in this world")');
  await page.waitForSelector('#modal[open]');
  await page.fill('#modal input', 'Second Survivor');
  await page.click('#modal .btn.primary');
  await page.waitForSelector('#screen-desktop:not(.hidden)');
  await idle();
  s = await state();
  if (s.survivor.name !== 'Second Survivor' || !s.lineage?.length || s.phase !== 'play') throw new Error('continue-world should start a new survivor in the same world');

  if (errors.length) throw new Error(`console/page errors:\n${errors.join('\n')}`);
  console.log('\nPLAYTHROUGH PASSED with no console errors');
} catch (err) {
  console.error('\nPLAYTHROUGH FAILED:', err.message);
  if (errors.length) console.error(errors.join('\n'));
  try {
    const dbg = await page.evaluate(() => { const st = window.cyoa.state; return { screen: [...document.querySelectorAll('.screen')].find(e => !e.classList.contains('hidden'))?.id, busy: window.cyoa.busy, location: st.location, day: Math.floor(st.clock.minutes / 1440), ended: st.ended, debrief: !!st.debrief, flags: st.flags, encounter: st.encounter, choices: st.lastChoices, lastLog: st.log.slice(-3).map(l => `${l.kind}/${l.speaker}: ${String(l.text).slice(0, 160)}`), lastHistory: st.history.slice(-1).map(x => x.content.slice(0, 300)) }; });
    console.error('state:', JSON.stringify(dbg, null, 1));
  } catch (e2) { console.error('could not read state:', e2.message); }
  try { await page.screenshot({ path: path.join(here, 'playthrough-failure.png'), fullPage: true }); console.error('screenshot: dev/playthrough-failure.png'); } catch { /* ignore */ }
  process.exitCode = 1;
} finally {
  await browser.close();
  mock.kill();
}
