// Small shared helpers used across the engine.

export function clamp(n, lo = 0, hi = 100) { return Math.min(hi, Math.max(lo, n)); }
export function round1(n) { return Math.round(n * 10) / 10; }
export function uid(prefix = 'x') { return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
export function pick(arr, rnd = Math.random) { return arr[Math.floor(rnd() * arr.length)]; }
export function asArray(x) { return Array.isArray(x) ? x : []; }
export function num(x, fallback = 0) { const n = typeof x === 'string' ? parseFloat(x) : x; return Number.isFinite(n) ? n : fallback; }
export function str(x, fallback = '') { return typeof x === 'string' ? x : (x == null ? fallback : String(x)); }
export function titleCase(s) { return String(s || '').replace(/[-_]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase()); }
export function words(s) { return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(w => w.length > 2 && !STOP.has(w)); }
const STOP = new Set(['the', 'and', 'for', 'with', 'under', 'inside', 'behind', 'near', 'from', 'into', 'onto', 'over', 'that', 'this', 'its', 'their']);
export function overlap(a, b) { const wb = new Set(words(b)); return words(a).filter(w => wb.has(w)).length; }

/** Deterministic PRNG from a string seed (mulberry32 over a hash). */
export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export function seededRandom(seed) {
  let a = typeof seed === 'number' ? seed >>> 0 : hashString(String(seed));
  return function () {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
