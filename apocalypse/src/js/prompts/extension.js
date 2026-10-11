// Prompt that extends a world's timeline once its scripted events have all
// fired (open-ended play, or play after the deadline). The model writes the
// next weeks of history in the same world, nothing else.

import { dayOf } from '../engine/clock.js';
import { asArray, str } from '../engine/util.js';
import { getLocation } from '../engine/world.js';
import { holderOf } from '../engine/factions.js';

export function buildTimelineExtensionPrompt({ state, days = 30 }) {
  const t = state.truth; const day = dayOf(state.clock.minutes);
  const fired = asArray(t.timeline).filter((e, i) => state.events.fired.includes(i)).slice(-14).map(e => `day ${e.day}: ${e.event}${e.visible === false ? ' (hidden)' : ''}`);
  const locations = asArray(t.locations).map(l => { const h = holderOf(state, l.id); return `${l.id} "${l.name}" (${l.type}${h ? `, held by ${h.id}` : ''}${state.locationState[l.id]?.visits ? ', visited' : ''})`; });
  const npcs = asArray(t.npcs).map(n => `${n.id} "${n.name}" (${state.companions[n.id]?.status || 'not met'})`);
  const factions = asArray(t.factions).map(f => `${f.id} "${f.name}": goal ${f.goal}; secret ${f.secret}; base ${f.baseLocationId}; standing with survivor ${state.factions[f.id]?.standing ?? 0}`);
  const channels = asArray(t.radio?.channels).map(c => `${c.freq} (${c.kind}, ${c.owner})`);
  const wo = t.ending?.trueWayOut;
  const wayOut = wo ? `${wo.what} at ${wo.where}, window days ${wo.windowStartDay}-${wo.windowEndDay}${state.deadlinePassed != null ? ' (the deadline has passed; this way out is gone)' : day > wo.windowEndDay ? ' (the window has closed)' : ''}` : 'none';
  return `You are the designer of a running survival game. Its scripted timeline has run out and play continues. Write the NEXT ${days} DAYS of this world's hidden history as JSON, consistent with everything below. Day numbers continue the game's count (today is day ${day}); every entry must have a day greater than ${day}.

WORLD: "${t.title}" · ${t.apocalypse?.type}
THE TRUTH (hidden from the player): ${t.apocalypse?.trueCause}
THREAT: ${t.threat?.name}: ${t.threat?.behavior} Escalation so far: ${asArray(t.threat?.escalation).join(' | ')}
DOOM NOW: ${state.doom}/5 · threat level ${state.threat.level}/5 · power ${state.utilities?.power ? 'on' : 'off'}, water ${state.utilities?.water ? 'on' : 'off'}, cell ${state.utilities?.cell ? 'on' : 'off'}
FACTIONS:
- ${factions.join('\n- ')}
LOCATIONS: ${locations.join('; ')}
PEOPLE: ${npcs.join('; ')}
RADIO CHANNELS: ${channels.join('; ')}
WHAT HAS HAPPENED (most recent last):
- ${fired.join('\n- ') || 'nothing yet'}
THE SURVIVOR: ${state.survivor.name}, at ${getLocation(state, state.location)?.name}, ${state.shelter ? `based at ${getLocation(state, state.shelter.locationId)?.name}` : 'nomad'}, companions: ${Object.entries(state.companions).filter(([, c]) => c.status === 'with').map(([id]) => id).join(', ') || 'none'}.
THE WAY OUT SO FAR: ${wayOut}

Write 8 to 12 new timeline entries that continue the arcs already in motion: factions rise, fall, split, strike deals and lose places; the threat changes; the weather and the season bite; the outside world sends something (or nothing); people the survivor knows act on their own wants. Two or three entries have visible false (events the survivor does not witness). One entry has contact true: a named voice on one of the radio channels wanting something time-critical (set effects.radioFreq). Use effects to capture or free places (locationId with capturedBy a faction id or null with liberated true), change danger, raise or lower threat (threatDelta -2..2), reveal a location, or change utilities (power, water, cell, internet true/false). Doom may rise or fall by at most one step from ${state.doom}. Write event text with no day numbers and no clock times (the game stamps them); set "hour" instead.

Also write 3 to 6 new radio messages on existing channels, each with fromDay greater than ${day}, in each broadcaster's voice, some untruthful.

${state.deadlinePassed != null || (wo && day > wo.windowEndDay) ? `The old way out is gone. You MAY add "nextWayOut": a new, harder way out of the region (a route, a vessel, a convoy, a place that will hold) with a window at least 10 days from now, 1-2 requirements as snake_case flags with how the survivor obtains them, and 2-3 clues with source kind "npc" (an npc id) or "radio" (a channel frequency). Its clues must also appear as timeline events or radio messages so the survivor can find them. Set it to null to keep the world without an exit.` : 'Set "nextWayOut" to null; the current way out stands.'}

Reply with ONE JSON object and nothing else:
{
  "timeline": [ { "day": ${day + 1}, "hour": 9, "event": "what happens, concretely", "doom": ${state.doom}, "visible": true, "contact": false, "effects": { "threatDelta": 0, "locationId": null, "capturedBy": null, "liberated": false, "dangerDelta": 0, "revealLocationId": null, "radioFreq": null, "utilities": null } } ],
  "radioMessages": [ { "freq": "${asArray(t.radio?.channels)[0]?.freq || '162.400'}", "fromDay": ${day + 2}, "text": "as spoken", "truthful": true } ],
  "nextWayOut": null
}
Where a value is absent use JSON null, never the string "null". Numbers are numbers.`;
}
