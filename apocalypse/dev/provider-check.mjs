// Exercises the provider layer end to end in Node against the mock GM:
// streaming, finish reasons, the world generator's single-call path with
// continue-and-stitch, the three-part path for models with small output
// limits, and the adapter's adapt-and-retry on provider rejections.
//   node apocalypse/dev/provider-check.mjs
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const { getProvider, completeWithMeta } = await import(path.join(here, '..', 'src', 'js', 'providers', 'index.js'));
const { makeOpenAICompatible } = await import(path.join(here, '..', 'src', 'js', 'providers', 'openaiCompatible.js'));
const { generateWorld, partFor } = await import(path.join(here, '..', 'src', 'js', 'engine', 'worldGenerator.js'));

async function withMock(env, fn) {
  const port = 8800 + Math.floor(Math.random() * 100);
  const mock = spawn(process.execPath, [path.join(here, 'mock-gm.js')], { env: { ...process.env, ...env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise((res, rej) => { mock.stdout.on('data', d => { if (String(d).includes('listening')) res(); }); mock.on('exit', c => rej(new Error(`mock exited ${c}`))); });
  try { return await fn(`http://localhost:${port}/v1`); } finally { mock.kill(); }
}

const provider = getProvider('custom');
const survivor = { name: 'Test', background: 'nurse', skills: ['medicine'] };
const settings = { apocalypseId: 'pandemic', apocalypseName: 'Engineered pandemic', difficulty: 'hardened', lengthDays: 30, startDay: 0 };

// Registry: DeepSeek is known to need parts; its reasoner has the larger cap.
const ds = getProvider('deepseek');
assert.equal(ds.outputCap('deepseek-chat'), 8192); assert.equal(ds.outputCap('deepseek-reasoner'), 65536); assert.ok(ds.worldInParts);
assert.equal(provider.outputCap('anything'), Infinity);
assert.equal(partFor('clue c1 must appear as a hidden entry with clueId "c1" at location loc4'), 'plot');
assert.equal(partFor('location loc3 heldBy unknown faction f4'), 'setting');
assert.equal(partFor('npc n2 needs a secret'), 'people');
assert.equal(partFor('deadlineDay missing or less than 7 (the survivor starts on day 0)'), 'setting');
console.log('✓ registry caps and problem routing');

await withMock({}, async baseUrl => {
  const r = await completeWithMeta(provider, { apiKey: 'x', baseUrl, model: 'mock', messages: [{ role: 'user', content: 'Reply with the single word READY.' }] });
  assert.equal(r.text, 'READY'); assert.equal(r.finishReason, 'stop');
  console.log('✓ streaming + finish reason');
  const world = await generateWorld({ provider, apiKey: 'x', baseUrl, model: 'mock', settings, survivor, onProgress: () => {} });
  assert.equal(world.title, 'The Quiet Season');
  console.log('✓ world generated in one reply');
  const seen = [];
  const parts = await generateWorld({ provider, apiKey: 'x', baseUrl, model: 'mock', settings: { ...settings, generation: 'parts' }, survivor, onProgress: m => seen.push(m) });
  assert.equal(parts.title, 'The Quiet Season'); assert.equal(parts.locations.length, 10); assert.equal(parts.npcs.length, 6); assert.ok(parts.ending.trueWayOut && parts.radio.channels.length >= 4);
  assert.ok(seen.some(m => /part 1 of 3/.test(m)) && seen.some(m => /part 3 of 3/.test(m)), 'progress named the parts');
  console.log('✓ world generated in three parts');
  const deep = await generateWorld({ provider: { ...provider, worldInParts: true }, apiKey: 'x', baseUrl, model: 'mock', settings: { ...settings, startDay: 21 }, survivor, onProgress: () => {} });
  assert.equal(deep.startOffset, 21); assert.ok(deep.timeline.filter(e => e.day > 0).length >= 5);
  console.log('✓ a provider flagged worldInParts builds in parts (deep start)');
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
  const seen2 = [];
  const parts = await generateWorld({ provider, apiKey: 'x', baseUrl, model: 'mock', settings: { ...settings, generation: 'parts' }, survivor, onProgress: m => seen2.push(m) });
  assert.equal(parts.npcs.length, 6); assert.equal(parts.timeline.length, 14);
  assert.ok(seen2.filter(m => /cut off/.test(m)).length >= 3, 'every cut-off part was continued');
  console.log('✓ cut-off parts continued and stitched');
});

await withMock({ MOCK_MAX_TOKENS: '4096' }, async baseUrl => {
  const p = makeOpenAICompatible({ id: 't', name: 'Test', baseUrl, defaultModel: 'mock' });
  const r = await completeWithMeta(p, { apiKey: 'x', model: 'mock', maxTokens: 32000, messages: [{ role: 'user', content: 'ECHO MAX_TOKENS' }] });
  assert.equal(r.text, '4096', 'the adapter retried with the cap the provider named');
  assert.equal(p.outputCap('mock'), 4096, 'and remembered it');
  const world = await generateWorld({ provider: p, apiKey: 'x', model: 'mock', settings, survivor, onProgress: () => {} });
  assert.equal(world.title, 'The Quiet Season');
  console.log('✓ max_tokens rejection adapted and remembered');
});

await withMock({ MOCK_NO_JSON: '1' }, async baseUrl => {
  const p = makeOpenAICompatible({ id: 't', name: 'Test', baseUrl, defaultModel: 'mock' });
  const r = await completeWithMeta(p, { apiKey: 'x', model: 'mock', json: true, messages: [{ role: 'user', content: 'Reply with the single word READY.' }] });
  assert.equal(r.text, 'READY', 'JSON mode dropped after the provider rejected it');
  console.log('✓ JSON-mode rejection adapted');
});
console.log('\nALL PROVIDER CHECKS PASSED');
