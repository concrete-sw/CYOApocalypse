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
  await page.selectOption('#apocalypseType', 'pandemic');
  await page.selectOption('#difficulty', 'hardened');
  await page.selectOption('#gameLength', 'standard');
  await page.click('#newGameForm button[type=submit]');
  await page.waitForSelector('#screen-desktop:not(.hidden)', { timeout: 30000 });
  await idle();
  let s = await state();
  if (s.turnCount !== 1 || s.phase !== 'prologue') throw new Error(`expected prologue turn 1, got turn ${s.turnCount} phase ${s.phase}`);
  if (!(await page.textContent('#topRegion')).includes('CASCADE REACH')) throw new Error('top bar should carry the region');

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
  await page.evaluate(() => { const st = window.cyoa.state; st.body.injuries.push({ id: 'injtest', region: 'leftArm', type: 'cut', severity: 2, treated: false, infected: false, at: st.clock.minutes, progress: 0 }); window.cyoa.wm.refresh('status'); });
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

  step('ending: the way out');
  await page.evaluate(() => { const st = window.cyoa.state; st.clock.minutes = 19 * 1440 + 9 * 60; st.flags.push('annie_trusts_you', 'has_diesel'); if (!st.discovered.locations.includes('loc8')) st.discovered.locations.push('loc8'); st.companions.n1.status = 'with'; st.pending = []; window.cyoa.updateTopbar(); window.cyoa.wm.refreshAll(); });
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

  step('continue in this world');
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
