// What a typed sentence means for the clock and the body. The code, not the
// Game Master, decides how long sleeping, waiting, eating and drinking take,
// and estimates the time any other action took when the GM forgets to say.

import { phaseOf } from './clock.js';

const NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const num = q => (/^\d/.test(q) ? parseFloat(q) : NUM_WORDS[q] ?? null);

/** "for 3 hours", "an hour", "a couple of hours", "forty minutes", "all day": minutes, or null. */
export function parseDuration(text) {
  const t = String(text || '').toLowerCase();
  let m = t.match(/\b(\d+(?:\.\d+)?|an?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|half an|a couple of|couple of|a few|few|several)\s*(?:more\s+|good\s+|solid\s+|full\s+)?(hours?|hrs?|h|minutes?|mins?)\b/);
  if (m) {
    const q = m[1];
    const n = /^\d/.test(q) ? parseFloat(q) : q === 'a' || q === 'an' || q === 'one' ? 1 : q === 'half an' ? 0.5 : /couple/.test(q) ? 2 : /few/.test(q) ? 3 : /several/.test(q) ? 4 : NUM_WORDS[q] ?? 1;
    return /^h/.test(m[2]) ? Math.round(n * 60) : Math.round(n);
  }
  if (/\ball (?:day|day long)\b/.test(t)) return 600;
  if (/\b(?:all|the whole|the rest of the|spend the|for the|through the)\s+(?:morning|afternoon|evening)\b/.test(t)) return 240;
  if (/\bhalf an hour\b|\bthirty minutes\b/.test(t)) return 30;
  return null;
}

/** A clock hour named in the text: "nine", "9am", "21:00", "nine in the morning", "noon", "dawn", "morning", "dark". Null when none. */
export function parseClockTarget(text) {
  const t = String(text || '').toLowerCase();
  let m = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (m) return Number(m[1]);
  m = t.match(/\b(1[0-2]|[1-9]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*(?:o'?clock)?\s*(a\.?m\.?|p\.?m\.?|in the (?:morning|afternoon|evening)|at night|tonight)\b/);
  if (m) {
    let h = num(m[1]); const q = m[2];
    if (/p|afternoon|evening|night|tonight/.test(q) && h < 12) h += 12;
    if (/a\.?m/.test(q) && h === 12) h = 0;
    return h;
  }
  m = t.match(/\b(?:until|till|til|to|at|around|by|past)\s+(1[0-2]|[1-9]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b(?!\s*(?:hours?|hrs?|minutes?|mins?|days?|km|miles?|of them|more))/);
  if (m) { const h = num(m[1]); return h <= 5 ? h + 12 : h; }   // "till five" means the afternoon; "till nine" the morning
  for (const [re, h] of [[/\b(?:first light|daybreak|sunrise|dawn)\b/, 6], [/\bmorning\b/, 7], [/\b(?:noon|midday|lunchtime)\b/, 12], [/\bafternoon\b/, 14], [/\b(?:evening|dusk|sunset|sundown)\b/, 19], [/\b(?:dark|night ?fall|night)\b/, 21], [/\bmidnight\b/, 0]]) if (re.test(t)) return h;
  return null;
}

/** Minutes from now until the next occurrence of an hour, clamped. */
export function minutesUntilHour(state, hour, { min = 30, max = 16 * 60 } = {}) {
  const now = state.clock.minutes;
  let d = hour * 60 - (now % 1440);
  if (d <= 0) d += 1440;
  return Math.max(min, Math.min(max, d));
}

/** How long a night's sleep lasts from now: to the stated hour, or to seven if it is late, or a full eight hours by day. */
export function sleepMinutes(state, { minutes = null, target = null, nap = false } = {}) {
  if (nap) return minutes ? Math.min(minutes, 180) : 90;
  if (minutes) return Math.min(minutes, 16 * 60);
  if (target != null) { const d = minutesUntilHour(state, target, { min: 30, max: 24 * 60 }); return d > 16 * 60 ? 8 * 60 : d; }
  const ph = phaseOf(state.clock.minutes);
  if (ph === 'night' || ph === 'dusk') return minutesUntilHour(state, 7, { min: 4 * 60, max: 12 * 60 });
  return 8 * 60;
}

const NEGATED = /\b(?:can'?t|cannot|couldn'?t|don'?t|do not|won'?t|will not|not|no|never|without|instead of|rather than|skip|refuse to|too \w+ to)\s+(?:\w+\s+){0,2}?(?:sleep|sleeping|rest|resting|nap|eat|eating|drink|wait|bed)\b/;
const TALKY = /^(?:tell|ask|say|offer|give|hand|call|text|message|radio|shout|yell|whisper|promise|warn|invite)\b/;

/**
 * Classify a typed action the code should resolve itself:
 *   { kind: 'sleep' | 'nap' | 'wait', minutes, target }  or
 *   { kind: 'consume', eat, drink, cook, item, minutes }  or null (anything else goes to the GM).
 * npcMentioned: the sentence names someone the survivor knows, so it is probably about them, not a meal or a nap.
 */
export function classifyIntent(text, { npcMentioned = false } = {}) {
  const t = String(text || '').toLowerCase().replace(/[.!?]+$/, '').trim();
  if (!t || NEGATED.test(t)) return null;
  const words = t.split(/\s+/).length;
  const minutes = parseDuration(t);
  const target = parseClockTarget(t);
  const talky = TALKY.test(t) || npcMentioned;
  const nap = /\b(?:nap|doze|close my eyes|shut my eyes|rest my eyes|catnap|forty winks|power nap)\b/.test(t);
  const sleep = /\b(?:go (?:to )?(?:sleep|bed)|back to (?:sleep|bed)|get some (?:sleep|rest|shut-?eye|shuteye|kip)|sleep|slept|turn in|crash(?: out)?|lie down|lay down|bed down|hit the (?:sack|hay)|pass out|doze off|call it a night|rest)\b/.test(t) && !/\b(?:rest of|the rest|arrest|restaurant|interest|restroom|rest ?stop|lay down the|put down)\b/.test(t);
  const wait = /\b(?:wait|pass the time|kill time|hang around|stay put|sit tight|hold (?:here|position|up|out)|stay (?:here|in|home|inside|where i am)|keep watch|stand watch)\b/.test(t);
  if (nap && !talky) return { kind: 'nap', minutes, target };
  if (sleep && !talky && (words <= 14 || minutes != null || target != null)) return { kind: 'sleep', minutes, target };
  if (wait && !talky && (words <= 12 || minutes != null || target != null)) return { kind: 'wait', minutes, target };
  if (talky) return null;
  const cook = /\b(?:cook|fry|boil|scramble|heat up|warm up|reheat|make (?:some |a |myself |us )?(?:breakfast|lunch|dinner|supper|tea|food|a meal|something to eat|something hot|eggs|pasta|rice|soup|noodles|toast|a sandwich|sandwiches|oatmeal|porridge|coffee)|fix (?:some |a |myself )?(?:breakfast|lunch|dinner|supper|food|a meal|a plate)|put the kettle on|brew)\b/.test(t);
  const eat = cook && !/\b(?:coffee|tea|kettle|brew)\b/.test(t) || /\b(?:eat|ate|eating|breakfast|lunch|dinner|supper|snack|a bite|something to eat|feed myself|grab (?:some )?food|have (?:some )?food|finish (?:the|my) (?:leftovers|soup|meal|plate))\b/.test(t);
  const drink = /\b(?:drink|drank|coffee|tea|cocoa|a glass of|a cup of|hydrate|rehydrate|sip|gulp|chug|down a|water from the tap|fill (?:a|the|my) (?:glass|cup|bottle)|put the kettle on|brew)\b/.test(t) && !/\b(?:drink(?:ing)? (?:in|it in) the view)\b/.test(t);
  if (eat || drink) return { kind: 'consume', eat: !!eat, drink: !!drink, cook: !!cook, item: namedThing(t), minutes: cook ? 40 : eat ? 25 : 5 };
  return null;
}

function namedThing(t) {
  const m = t.match(/\b(?:eat|have|drink|make|cook|fry|boil|heat up|warm up|reheat|finish|open|grab)\s+(?:some |the |a |an |my |one of the |a can of |a tin of |a couple of |two |three )?([a-z][a-z' -]{2,30}?)(?:\s+(?:and|then|while|before|after|from|out of|in|on|with|for|at)\b|$)/);
  if (!m) return null;
  const n = m[1].trim();
  return /^(?:something|anything|food|a meal|breakfast|lunch|dinner|supper|a bite|a snack|myself|up)$/.test(n) ? null : n;
}

const CLOCK_LEAD = /\b(?:it is|it's|its|by|at|nearly|almost|around|about|just after|just before|past|gone|until|till|comes up at|wake(?:s)? (?:you )?at|wake(?:s)? (?:you )?up at)\s+/;
/** The minute of the day a narrative says it now is ("It is nine in the morning", "by 7:10"), or null. The last stated time wins. */
export function clockFromNarrative(narrative) {
  const t = String(narrative || '').toLowerCase();
  const re = new RegExp(`${CLOCK_LEAD.source}((?:[01]?\\d|2[0-3]):[0-5]\\d|(?:1[0-2]|[1-9]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\\s*(?:o'?clock|a\\.?m\\.?|p\\.?m\\.?|in the (?:morning|afternoon|evening)|at night))|noon|midday|midnight|dawn|first light|dusk)`, 'g');
  let best = null, m;
  while ((m = re.exec(t))) {
    const hm = m[1].match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
    if (hm) { best = Number(hm[1]) * 60 + Number(hm[2]); continue; }
    const h = parseClockTarget(m[1]); if (h != null) best = h * 60;
  }
  return best;
}

const KEYWORD_MINUTES = [
  [/\b(?:cook|fry|boil|bake|roast|make (?:dinner|breakfast|lunch|supper|a meal)|prepare (?:food|a meal))\b/, 45],
  [/\b(?:shower|bath|wash(?: up)?|shave|clean (?:up|myself))\b/, 30],
  [/\b(?:drive|walk|cycle|ride|bike|head (?:over|down|out|up|to)|go (?:over|down|out|up|round|across) to|make my way|cross (?:town|the city))\b/, 40],
  [/\b(?:search|rummage|go through|dig through|sort (?:through|out)|pack|unpack|clean (?:the|out|up)|fix|repair|mend|work on|build|board up|barricade|fortify|load|unload|stack)\b/, 60],
  [/\b(?:read|study|listen to|watch (?:the news|tv|television)|scroll|check the news|go online|look up|research)\b/, 30],
  [/\b(?:call|phone|ring|text|message|email|dm)\b/, 10],
  [/\b(?:talk|ask|tell|say|chat|argue|discuss|explain|speak)\b/, 15],
  [/\b(?:eat|drink|snack|breakfast|lunch|dinner|coffee|tea)\b/, 20],
  [/\b(?:look|check|inspect|examine|peer|glance|open|close|lock|unlock|turn on|turn off|switch)\b/, 10]
];

/**
 * The game's own estimate of how long a free action took, used when the GM does
 * not say (or says something absurd): { minutes, resting, source }.
 */
export function estimateMinutes(state, text, narrative = '') {
  const intent = classifyIntent(text);
  if (intent?.kind === 'sleep') return { minutes: sleepMinutes(state, intent), resting: true, source: 'sleep' };
  if (intent?.kind === 'nap') return { minutes: sleepMinutes(state, { ...intent, nap: true }), resting: true, source: 'nap' };
  if (intent?.kind === 'wait') return { minutes: intent.minutes || (intent.target != null ? minutesUntilHour(state, intent.target) : 60), resting: false, source: 'wait' };
  const dur = parseDuration(text);
  if (dur) return { minutes: Math.min(dur, 16 * 60), resting: false, source: 'duration' };
  const said = clockFromNarrative(narrative);
  if (said != null) {
    let d = said - (state.clock.minutes % 1440); if (d <= 0) d += 1440;
    if (d >= 10 && d <= 12 * 60) return { minutes: d, resting: /\b(?:sleep|slept|asleep|wake|woke|overnight)\b/i.test(narrative), source: 'narrative-clock' };
  }
  const t = String(text || '').toLowerCase();
  for (const [re, mins] of KEYWORD_MINUTES) if (re.test(t)) return { minutes: mins, resting: false, source: 'keyword' };
  return { minutes: 20, resting: false, source: 'default' };
}

