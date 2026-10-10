// Exercises the provider layer end to end in Node against the mock GM:
// streaming, finish reasons, and the world generator's continue-and-stitch
// path when a reply is cut off at the output limit.
//   node apocalypse/dev/provider-check.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const { getProvider, completeWithMeta } = await import(path.join(here, '..', 'src', 'js', 'providers', 'index.js'));
const { generateWorld } = await import(path.join(here, '..', 'src', 'js', 'engine', 'worldGenerator.js'));

async function withMock(env, fn) {
  const port = 8800 + Math.floor(Math.random() * 100);
  const mock = spawn(process.execPath, [path.join(here, 'mock-gm.js')], { env: { ...process.env, ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res, rej) => { mock.stdout.on('data', d => { if (String(d).includes('listening')) res(); }); mock.on('exit', c => rej(new Error(`mock exited ${c}`))); });
  try { return await fn(`http://localhost:${port}/v1`); } finally { mock.kill(); }
}

const provider = getProvider('custom');
const survivor = { name: 'Test', background: 'nurse', skills: ['medicine'] };
const settings = { apocalypseId: 'pandemic', apocalypseName: 'Engineered pandemic', difficulty: 'hardened', length: 'standard' };

await withMock({}, async baseUrl => {
  const r = await completeWithMeta(provider, { apiKey: 'x', baseUrl, model: 'mock', messages: [{ role: 'user', content: 'Reply with the single word READY.' }] });
  assert.equal(r.text, 'READY'); assert.equal(r.finishReason, 'stop');
  console.log('✓ streaming + finish reason');
  const world = await generateWorld({ provider, apiKey: 'x', baseUrl, model: 'mock', settings, survivor, onProgress: () => {} });
  assert.equal(world.title, 'The Quiet Season');
  console.log('✓ world generated in one reply');
});

await withMock({ MOCK_TRUNCATE: '1' }, async baseUrl => {
  const seen = [];
  const r = await completeWithMeta(provider, { apiKey: 'x', baseUrl, model: 'mock', messages: [{ role: 'user', content: 'designing the hidden ground truth' }] });
  assert.equal(r.finishReason, 'length', 'mock reports a cut-off reply');
  const world = await generateWorld({ provider, apiKey: 'x', baseUrl, model: 'mock', settings, survivor, onProgress: m => seen.push(m) });
  assert.equal(world.title, 'The Quiet Season');
  assert.equal(world.locations.length, 10);
  assert.ok(seen.some(m => /cut off/.test(m)), 'progress reported the continuation');
  console.log('✓ cut-off world continued and stitched:', seen.find(m => /cut off/.test(m)));
});
console.log('\nALL PROVIDER CHECKS PASSED');
