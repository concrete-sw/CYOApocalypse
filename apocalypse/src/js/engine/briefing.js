// The survivor's dossier: who they are, where and when they are, what they own,
// who they know, and what the public knows so far. Built by the code from the
// truth and the state, so every date, time and fact in it is real.

import { dayOf, formatLongDate, formatDate, formatHM, MIN_PER_DAY } from './clock.js';
import { getLocation } from './world.js';
import { BACKGROUNDS, vehicleOf } from './inventory.js';
import { gearAvailable } from './state.js';
import { asArray, num, str } from './util.js';

const firstSentence = t => { const s = str(t).trim(); const m = s.match(/^(.+?[.!?])(\s|$)/); return m ? m[1] : s; };
const lower = t => (t ? t.charAt(0).toLowerCase() + t.slice(1) : t);

export function buildBriefing(state) {
  const t = state.truth; const S = Math.round(num(t.startOffset, 0));
  const home = getLocation(state, state.home || t.region?.startLocationId);
  const bg = BACKGROUNDS.find(b => b.id === state.survivor.background);
  const items = state.inventory.items; const stash = state.shelter?.stash || [];
  const names = list => list.map(i => `${i.name}${i.qty > 1 ? ` ×${i.qty}` : ''}`);
  const veh = vehicleOf(items);
  const people = asArray(t.npcs).filter(n => n.knownToSurvivor).map(n => ({ id: n.id, name: n.name, relation: n.relationToSurvivor || firstSentence(n.background), where: getLocation(state, n.locationId)?.name || null }));
  const history = state.worldEvents.filter(e => e.history).map(e => ({ date: formatDate(state, e.at), text: e.text }));
  const incite = asArray(t.timeline)[t.incitingIndex];
  const region = t.region?.name || 'the region';
  const timing = S < 0
    ? `Nothing has happened. As far as anyone knows, nothing is going to. Life is ordinary, and the record begins ${-S} day${-S === 1 ? '' : 's'} before it stops being so. You do not know that.`
    : S === 0 ? 'An ordinary morning, so far. The record begins today.'
    : `It has been ${S} day${S === 1 ? '' : 's'} since it began.${incite && incite.visible !== false ? ` What began it, as far as anyone knows: ${lower(firstSentence(incite.event))}` : ''} You have been surviving since then.`;
  const deadline = state.clock.deadlineDay;
  const goal = S < 0
    ? `Nothing is wrong, and you have no reason to think it will be. Live your life: type what you do and say. When the world changes, this console will carry what the authorities are saying, and from then on the question is how to stay alive and how to get out of ${region} before the way out closes.`
    : `Somewhere in ${region} there is a way out of this, or a way through it. It is not marked on any map and it will not stay open: find the people who know, search the places that matter, and listen to the radio at odd hours. ${deadline == null ? 'There is no deadline on this record; the way out exists all the same, and it will not wait for you.' : `The record closes on day ${deadline} (${formatLongDate(state, deadline * MIN_PER_DAY)}) unless you are out, or dead, before then. If you are still alive on that day you can choose to keep going.`} Nothing here will tell you what to do. Type what you do and say.`;
  return {
    stamp: { day: dayOf(state.clock.minutes), date: formatLongDate(state), time: formatHM(state.clock.minutes), season: t.region?.season || '', weather: state.weather.today?.label || '', chapter: state.chapter || 1 },
    timing, collapseDay: S,
    region: { name: region, country: t.region?.country || '', description: t.region?.description || '', now: S > 0 ? t.region?.descriptionNow || '' : '' },
    home: home ? { name: home.name, description: home.description, isShelter: state.shelter?.locationId === home.id } : null,
    survivor: { name: state.survivor.name, id: state.survivor.id, title: state.survivor.title || bg?.name || 'Civilian', blurb: state.survivor.background === 'custom' ? state.survivor.text : (bg?.blurb || ''), skills: state.survivor.skills, lifeBefore: t.survivor?.lifeBefore || '' },
    people,
    carrying: names(items), stores: names(stash), vehicle: veh ? veh.item.name : null, gear: gearAvailable(state),
    utilities: { ...state.utilities },
    publicStory: S > 0 ? { belief: t.apocalypse?.publicBelief || '', events: history, sitrep: t.situationReport || '' } : null,
    goal: { deadlineDay: deadline, deadlineDate: deadline != null ? formatLongDate(state, deadline * MIN_PER_DAY) : null, openEnded: deadline == null, text: goal }
  };
}

/** The dossier as plain text, for the GM's first turn and for the log. */
export function briefingText(b) {
  const lines = [];
  lines.push(`WHEN: day ${b.stamp.day}, ${b.stamp.date}, ${b.stamp.time}. ${b.stamp.season ? `${b.stamp.season}, ` : ''}${b.stamp.weather}.`);
  lines.push(`SITUATION: ${b.timing}`);
  lines.push(`WHERE: ${b.region.name}${b.region.country ? `, ${b.region.country}` : ''}. ${b.region.description}${b.region.now ? ` ${b.region.now}` : ''}`);
  if (b.home) lines.push(`HOME: ${b.home.name}. ${b.home.description}`);
  lines.push(`WHO: ${b.survivor.name} (${b.survivor.id}), ${b.survivor.title}. ${b.survivor.blurb} Skills: ${b.survivor.skills.join(', ') || 'none in particular'}.${b.survivor.lifeBefore ? ` ${b.survivor.lifeBefore}` : ''}`);
  if (b.people.length) lines.push(`PEOPLE IN YOUR LIFE: ${b.people.map(p => `${p.name} (${p.relation}${p.where ? `; usually at ${p.where}` : ''})`).join('; ')}.`);
  lines.push(`CARRYING: ${b.carrying.join(', ') || 'nothing'}.${b.vehicle ? ` Vehicle: ${b.vehicle}.` : ''}`);
  if (b.stores.length) lines.push(`AT HOME: ${b.stores.join(', ')}.`);
  lines.push(`UTILITIES: power ${b.utilities.power ? 'on' : 'OFF'}, water ${b.utilities.water ? 'on' : 'OFF'}, phone network ${b.utilities.cell ? 'on' : 'OFF'}, internet ${b.utilities.internet ? 'on' : 'OFF'}.`);
  if (b.publicStory) {
    lines.push(`WHAT PEOPLE BELIEVE: ${b.publicStory.belief}`);
    if (b.publicStory.events.length) lines.push(`WHAT HAS HAPPENED SO FAR (public knowledge):\n${b.publicStory.events.map(e => `- ${e.date}: ${e.text}`).join('\n')}`);
    if (b.publicStory.sitrep) lines.push(`LATEST OFFICIAL PICTURE: ${b.publicStory.sitrep}`);
  }
  lines.push(`THE RECORD: ${b.goal.text}`);
  return lines.join('\n');
}
