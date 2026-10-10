// In-game clock and weather. Time is counted in minutes since Day 0, 00:00.

import { seededRandom, clamp } from './util.js';

export const MIN_PER_DAY = 1440;
export const START_MINUTES = 7 * 60 + 30; // Day 0 begins at 07:30

export const dayOf = m => Math.floor(m / MIN_PER_DAY);
export const hourOf = m => Math.floor((m % MIN_PER_DAY) / 60);
export const minuteOf = m => m % 60;

export function phaseOf(m) {
  const h = hourOf(m);
  if (h >= 21 || h < 5) return 'night';
  if (h < 7) return 'dawn';
  if (h < 18) return 'day';
  return 'dusk';
}
export const isNight = m => phaseOf(m) === 'night';

const pad = n => String(n).padStart(2, '0');
export function formatHM(m) { return `${pad(hourOf(m))}:${pad(minuteOf(m))}`; }
export function formatTime(m) { return `DAY ${dayOf(m)} · ${formatHM(m)}`; }
export function formatDuration(minutes) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}
export function daysLeft(state) { return state.clock.deadlineDay - dayOf(state.clock.minutes); }

// ------------------------------------------------------------------ weather
const KIND_LABEL = { clear: 'Clear', overcast: 'Overcast', rain: 'Rain', storm: 'Storm', fog: 'Fog', snow: 'Snow', heat: 'Heat', ashfall: 'Ashfall', dust: 'Dust' };
// Effects: travel time factor, encounter modifier, warmth target modifier (outdoors), scavenging modifier.
const KIND_FX = {
  clear:    { travel: 1.0,  encounter: 1.0,  warmth: 0,   scavenge: 1.0 },
  overcast: { travel: 1.0,  encounter: 1.0,  warmth: -3,  scavenge: 1.0 },
  rain:     { travel: 1.2,  encounter: 0.9,  warmth: -12, scavenge: 0.9 },
  storm:    { travel: 1.6,  encounter: 0.75, warmth: -20, scavenge: 0.7 },
  fog:      { travel: 1.25, encounter: 1.3,  warmth: -5,  scavenge: 0.95 },
  snow:     { travel: 1.5,  encounter: 0.85, warmth: -18, scavenge: 0.8 },
  heat:     { travel: 1.2,  encounter: 0.95, warmth: 14,  scavenge: 0.9 },
  ashfall:  { travel: 1.35, encounter: 0.9,  warmth: -6,  scavenge: 0.85 },
  dust:     { travel: 1.3,  encounter: 0.9,  warmth: -2,  scavenge: 0.85 }
};

function seasonBase(season) {
  const s = String(season || '').toLowerCase();
  if (/winter/.test(s)) return 2;
  if (/spring/.test(s)) return 12;
  if (/summer/.test(s)) return 24;
  if (/autumn|fall/.test(s)) return 11;
  return 12;
}
function climateAdjust(climate) {
  const c = String(climate || '').toLowerCase();
  let t = 0;
  if (/arid|desert/.test(c)) t += 7;
  if (/tropical|equatorial/.test(c)) t += 9;
  if (/polar|arctic|subarctic|boreal|alpine/.test(c)) t -= 11;
  if (/maritime|coastal|oceanic/.test(c)) t -= 1;
  if (/continental/.test(c)) t -= 2;
  return t;
}

/** Deterministic weather for a given day; the same save always sees the same skies. */
export function weatherFor(state, day) {
  const t = state.truth || {};
  const rnd = seededRandom(`${state.id}:weather:${day}`);
  const type = String(t.apocalypse?.type || '').toLowerCase();
  const climate = String(t.region?.climate || '').toLowerCase();
  let temp = seasonBase(t.region?.season) + climateAdjust(climate) + (rnd() * 12 - 6);
  // Long-term trends by apocalypse.
  if (/impact|asteroid|volcan|nuclear|winter/.test(type)) temp -= 0.35 * day;
  if (/climate|flood|heat/.test(type)) temp += 0.08 * day;
  // Weather kind weights.
  const w = { clear: 35, overcast: 30, rain: 20, fog: 8, storm: 5 };
  if (/flood|climate/.test(type)) { w.rain += 20; w.storm += 12; w.clear -= 15; }
  if (/nuclear|volcan|impact/.test(type)) { w.ashfall = 22; w.clear -= 10; }
  if (/arid|desert/.test(climate)) { w.dust = 18; w.rain -= 12; w.fog -= 5; }
  if (/maritime|coastal/.test(climate)) { w.fog += 8; }
  if (temp < 1) { w.snow = (w.rain || 0) + 10; w.rain = 0; }
  if (temp > 29) { w.heat = 25; }
  const entries = Object.entries(w).filter(([, v]) => v > 0);
  const total = entries.reduce((a, [, v]) => a + v, 0);
  let r = rnd() * total;
  let kind = 'clear';
  for (const [k, v] of entries) { r -= v; if (r <= 0) { kind = k; break; } }
  if (kind === 'storm' || kind === 'rain' || kind === 'snow') temp -= 2;
  const fx = KIND_FX[kind] || KIND_FX.clear;
  const tempC = Math.round(clamp(temp, -35, 48));
  return { kind, tempC, label: `${KIND_LABEL[kind] || kind} ${tempC}°C`, ...fx, windy: rnd() < 0.3 };
}
