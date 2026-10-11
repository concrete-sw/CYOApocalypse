// Prompt that produces the hidden world truth. The result is validated by
// engine/schema.js and regenerated with the problems fed back if invalid.
//
// Day numbers in the generated world count from the inciting event (day 0);
// the engine shifts them so that the survivor's first day of play is day 0.

import { apocalypseById, variantFor } from '../engine/apocalypses.js';
import { BACKGROUNDS } from '../engine/inventory.js';

export const WORLD_SCHEMA_TEXT = `{
  "title": "short evocative title for this apocalypse, e.g. 'The Quiet Season'",
  "apocalypse": {
    "type": "the apocalypse type requested",
    "publicBelief": "what people believe happened and is happening, as of the survivor's start day (2-3 sentences)",
    "trueCause": "the hidden real cause and what is actually going on: who knows, who benefits, what they want, and how it differs from publicBelief (a full paragraph)",
    "hazardName": "one or two words for the apocalypse-specific exposure meter shown to the player, e.g. Radiation, Exposure, Spores, Signal, Dread, Contamination, Cold, Ash",
    "hazardDescription": "what the meter measures and how it rises (one sentence)"
  },
  "region": { "name": "the region, county or district (a real area if the player gave one, invented streets and people)", "country": "", "startLocationId": "loc1", "season": "spring|summer|autumn|winter", "climate": "e.g. temperate maritime, arid, continental, tropical, subarctic", "startDate": "YYYY-MM-DD: the calendar date of the survivor's first day of play, in the stated season", "description": "a paragraph on the region in ordinary times (no mention of the catastrophe)", "descriptionNow": "one or two sentences on how it is on the survivor's start day (empty string if nothing has happened yet)" },
  "survivor": { "title": "the survivor's job or role in a few words, e.g. 'night-shift nurse', 'retired signalman'", "lifeBefore": "a paragraph on their ordinary life: work, routine, home, who they live with or see every day, money, health, habits (120-180 words, second person: 'you')", "skills": ["1-2 from the skills list (only used when the player wrote their own background)"], "kit": [ { "name": "a possession that fits the background", "category": "food|water|medical|tool|weapon|ammo|fuel|material|clothing|electronics|document|misc", "qty": 1 } ], "carry": 0, "vehicle": "what they drive or ride in ordinary life, or null" },
  "prologue": {
    "ordinaryLife": "GM guidance for the ordinary days or morning before it begins: the routine, the people, the small wrongnesses in order (120-200 words)",
    "signs": ["small wrong things the survivor may notice before it begins, in order, each one sentence (3-5)"],
    "howTheyNotice": "exactly how THIS survivor first notices that the world is breaking, in their own life (2-3 sentences; follow the OPENING seed)",
    "theMoment": "how it all goes wrong in front of them, concrete and frightening (120-200 words)",
    "firstHours": "GM guidance for the first hours: the streets, the sounds, what the survivor can plausibly do (60-120 words)"
  },
  "situationReport": "the public picture as of the survivor's start day, as an official bulletin would state it: what is believed, what is closed, where people are told to go, what to avoid. 120-200 words. Must not leak hidden facts. No dates, day numbers or clock times.",
  "timeline": [ { "day": 0, "hour": 9, "event": "what happens, concretely (no day numbers or clock times in the text)", "doom": 1, "visible": true, "contact": false, "effects": { "threatDelta": 0, "locationId": null, "capturedBy": null, "dangerDelta": 0, "revealLocationId": null, "radioFreq": null, "utilities": null } } ],
  "locations": [ { "id": "loc1", "name": "", "type": "residence|shelter|store|hospital|checkpoint|industrial|wilderness|water|camp|government|ruin|transport|religious|other", "x": 0, "y": 0, "danger": 0, "resources": { "food": 0, "water": 0, "medical": 0, "fuel": 0, "materials": 0, "weapons": 0 }, "heldBy": null, "initiallyKnown": true, "shelterQuality": 0, "hazard": 0, "description": "a paragraph of atmosphere and layout", "sharpEyeDetails": ["what a careful eye notices (a lead, not an answer)", "another"], "searchableAreas": ["area 1", "area 2", "area 3"], "hidden": [ { "what": "a specific thing hidden here", "where": "the exact spot a search must look, in plain words", "clueId": null } ], "travelNotes": "roads, hazards, how people get there" } ],
  "factions": [ { "id": "f1", "name": "", "ideology": "", "goal": "what they want (public)", "secret": "what they hide", "strength": 1, "baseLocationId": "loc4", "attitudeToStrangers": "hostile|wary|neutral|welcoming", "tradeGoods": ["what they trade away"], "wants": ["what they want in return"], "radioFreq": null, "speechStyle": "how their people talk" } ],
  "npcs": [ { "id": "n1", "name": "", "age": 0, "background": "a paragraph", "personality": "a sentence", "speechStyle": "vocabulary, rhythm, tics", "skills": ["medicine"], "secret": "", "loyaltyTendency": "loyal|steady|fickle|treacherous", "breakingPoint": "what would make them crack", "betrayal": { "will": false, "trigger": { "kind": "loyaltyBelow|dayAfter|foodDaysBelow|moraleBelow|healthBelow|factionStandingAbove|factionStandingBelow|flag|shelterClaimed", "value": 0, "factionId": null, "flag": null }, "how": "what they do, concretely", "effect": "steal|leave|sabotage|lure|kill_attempt|defect" }, "locationId": "loc2", "factionId": null, "initialDisposition": "friendly|wary|desperate|predatory", "wants": "what they want from the survivor", "knownToSurvivor": false, "relationToSurvivor": "how the survivor knows them (neighbour, colleague, sister, landlord...) or null" } ],
  "threat": { "name": "the hostile force, e.g. 'the infected', 'the Ninth Street militia', 'the drones'", "nature": "what it is", "behavior": "how it hunts, moves, when it is active", "weaknesses": ["", ""], "escalation": ["how it worsens over time", ""], "nightMultiplier": 1.5, "baseLevel": 1 },
  "ending": {
    "trueWayOut": { "what": "the real escape or resolution", "where": "locationId", "windowStartDay": 10, "windowEndDay": 20, "requirements": [ { "flag": "snake_case_flag", "description": "what must be true", "howToObtain": "how the player can plausibly achieve it in play (the GM sets the flag when they do)" } ], "description": "what it looks like when it happens", "howItPlaysOut": "what happens to the survivor and the region afterwards" },
    "clues": [ { "id": "c1", "text": "the clue as the player would learn it", "source": { "kind": "location|npc|radio", "id": "a locationId, an npc id, or a radio frequency string" } } ],
    "falseHopes": [ { "id": "fh1", "promise": "what it seems to offer", "source": "who or what spreads it", "where": "locationId or null", "whatReallyHappens": "the truth" } ]
  },
  "radio": { "channels": [ { "freq": "162.400", "kind": "government|faction|survivor|numbers|automated|pirate|military", "owner": "", "schedule": { "fromDay": 0, "toDay": null, "hours": [] }, "messages": [ { "fromDay": 0, "text": "the broadcast text, as spoken (no dates or clock times)", "truthful": true } ] } ] },
  "deadlineDay": 30
}`;

// Variety seeds: drawn at random for each new world so that two games of the
// same apocalypse do not open the same way or in the same kind of place.
const OPENINGS = [
  'through their work: the first sign reaches them on the job, as a professional problem before it is anyone\'s catastrophe',
  'a neighbour\'s crisis: someone two doors down is the first thing that goes wrong',
  'an animal behaving wrongly: the dogs, the birds, the livestock know before the people do',
  'the sound of it before the sight of it',
  'a phone call from someone they love, who is somewhere worse',
  'a silence where there should be noise: traffic, a factory, the school bell, the sea',
  'a routine errand interrupted: a queue, a shop, a bank, a clinic that is not working the way it did yesterday',
  'the sky: something seen, not told',
  'an official at the door with a clipboard and no good answers',
  'a screen that stops updating mid-sentence, and what people do next',
  'the water: the taps, the river, the rain',
  'the first death they see is someone they know by name',
  'nothing at all until it is in the street in front of them, with no warning of any kind',
  'the roads: traffic that is all going one way',
  'money: the cards stop, the prices change, the shop decides who it serves',
  'a relative or friend who turns up unannounced, already running from it'
];
const REGION_TYPES = ['the centre of a large city', 'a commuter suburb', 'a small market town', 'open farmland with one town', 'a fishing coast', 'a mountain valley with a single road in', 'an island with a ferry', 'a desert city and its outskirts', 'a river delta', 'an industrial belt along a river', 'a holiday resort out of season', 'a university town', 'a border town', 'a northern settlement at the end of the railway', 'a tropical port', 'a high plateau of mines and sheep'];
const COUNTRIES = ['the United States', 'Canada', 'the United Kingdom', 'Ireland', 'Australia', 'New Zealand', 'Germany', 'France', 'Spain', 'Portugal', 'Italy', 'Poland', 'the Netherlands', 'Norway', 'Finland', 'Japan', 'South Korea', 'Chile', 'Argentina', 'Mexico', 'South Africa', 'Kenya', 'India', 'Turkey', 'Greece'];
const TONES = ['slow dread: the world fails one small thing at a time', 'chaos: everything goes at once and nobody is in charge', 'bureaucratic: forms, checkpoints, announcements, a system that keeps working after it has stopped making sense', 'intimate: a few streets, a few people, everything else is rumour', 'procedural: the authorities respond competently for a while, and that is the trap', 'eerie: quiet, wrong, and beautiful in places'];
const RESPONSES = ['competent at first, then overwhelmed', 'absent from the first hour', 'overzealous: curfews and cordons before anyone knows why', 'corrupt: the people in charge are already dealing', 'fragmented: three agencies, three sets of orders, no phones between them', 'honest and helpless'];
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

export function pickSeed(rnd = Math.random) {
  const pick = a => a[Math.floor(rnd() * a.length)];
  return { opening: pick(OPENINGS), regionType: pick(REGION_TYPES), country: pick(COUNTRIES), tone: pick(TONES), response: pick(RESPONSES), season: pick(SEASONS) };
}

export const START_LABEL = { before: 'before it begins', onset: 'the day it begins', early: 'about a week in', deep: 'weeks in' };
/** How many days after the inciting event the survivor's story starts (negative: before). */
export function resolveStartDay(start, rnd = Math.random) {
  const r = n => Math.floor(rnd() * n);
  switch (start) {
    case 'before': return -(2 + r(4));      // 2-5 days before
    case 'onset': return 0;
    case 'early': return 5 + r(5);          // 5-9 days in
    case 'deep': return 18 + r(13);         // 18-30 days in
    default: return resolveStartDay(['before', 'onset', 'early', 'deep'][r(4)], rnd);
  }
}

export function buildWorldGenerationPrompt({ apocalypseId, apocalypseName, customPremise, difficulty, lengthDays, openEnded, startDay = 0, homePlace, customBackground, survivor, seed, variant, continuation }) {
  const apo = apocalypseById(apocalypseId);
  const S = Math.round(Number(startDay) || 0);
  const L = Math.max(7, Math.min(730, Math.round(Number(lengthDays) || 30)));
  const sd = seed || pickSeed();
  const typeLine = apocalypseId === 'custom'
    ? `APOCALYPSE: the player's own premise. Use it exactly and build everything around it: """${customPremise || 'an unspecified catastrophe'}"""`
    : `APOCALYPSE: ${apocalypseName || apo?.name}\nDESIGN NOTES FOR THIS TYPE: ${apo?.notes || ''}${variant ? `\nTHIS TIME IT IS SPECIFICALLY: ${variant}. Build the mechanics, the timeline and the truth around that version, not the generic one.` : ''}`;

  const bg = BACKGROUNDS.find(b => b.id === survivor?.background);
  const survivorLine = survivor?.background === 'custom'
    ? `THE SURVIVOR: ${survivor?.name || 'a survivor'}. The player wrote their own background: """${customBackground || 'an ordinary person'}""". Honour every detail of it (job, age, health, family, habits). Choose their 1-2 skills from the list in survivor.skills, 2-4 possessions that fit in survivor.kit, a carry modifier (-4 to 6 kg) and what they drive or ride (or null).`
    : `THE SURVIVOR: ${survivor?.name || 'a survivor'}, a ${bg?.name || survivor?.background || 'civilian'} (${bg?.blurb || ''}) with skills: ${(survivor?.skills || []).join(', ') || 'none in particular'}. Write survivor.title and survivor.lifeBefore for this person; leave survivor.skills and survivor.kit empty (the game supplies them).`;

  const homeLine = homePlace
    ? `WHERE: the player lives in or near """${homePlace}""". Set the region there (a real area; invent streets, businesses and people; no real people). Season: ${sd.season}; choose a startDate in that season and a climate that fits the place.`
    : `WHERE: ${sd.regionType}, in ${sd.country}. Invent the region's name, towns and streets. Season: ${sd.season}; choose a startDate in that season and a climate that fits.`;

  const startLine = S < 0
    ? `WHEN THE STORY STARTS: ${-S} days BEFORE the inciting event (startDay ${S}). The survivor's first days of play are ordinary life. The timeline MUST contain 2-3 entries on days ${S} to -1: small, deniable warning signs (a news item, a sick colleague, strange traffic, a cancelled delivery, an official visit) with doom 1, and the inciting event on day 0. publicBelief, situationReport and region.descriptionNow describe the start day, when nothing has happened: keep them to what a sensible person would notice (situationReport can be an ordinary local bulletin with one odd item). The prologue fields and prologue.signs matter most in this mode.`
    : S === 0
      ? 'WHEN THE STORY STARTS: the morning of the inciting event (startDay 0). The timeline\'s first entry is the inciting event on day 0 at hour 9-12; the ordinary morning before it is the prologue.'
      : `WHEN THE STORY STARTS: ${S} days AFTER the inciting event (startDay ${S}). The survivor has been surviving since day 0. The timeline MUST contain at least 3 entries between day 0 and day ${S} (what has already happened: these become the survivor's known history) and at least 5 entries after day ${S}. publicBelief, situationReport and region.descriptionNow describe day ${S}. The way-out window and all contact events must come after day ${S}. survivor.lifeBefore still describes life before day 0.`;

  const lengthLine = `LENGTH: deadlineDay MUST be exactly ${S + L} (the survivor starts on day ${S} and plays ${L} days). Timeline: ${L <= 14 ? '10-12' : L <= 45 ? '12-15' : '15-20'} entries in total, spread across the whole span to day ${S + L} and rising to doom 4-5 before the deadline. The way-out window opens between day ${S + Math.round(L * 0.45)} and day ${S + Math.round(L * 0.7)} and lasts ${Math.max(3, Math.round(L / 6))} days.${openEnded ? ' This game is OPEN-ENDED: after the deadline the world simply goes on, so make the last entries a state the region can live in, not a full stop.' : ''}`;

  const difficultyGuide = {
    survivor: 'SURVIVOR difficulty: resources average 2-3 per category at most places; only ONE npc betrays; false hopes have visible cracks; the way-out window is generous; strangers are mostly wary rather than predatory.',
    hardened: 'HARDENED difficulty: resources average 1-2; TWO npcs betray, with different triggers; false hopes are convincing; one clue requires talking to a specific npc; one clue is only on the radio.',
    nightmare: 'NIGHTMARE difficulty: resources average 0-1 and the best caches are in dangerous places; THREE npcs betray, one of them likeable and early; false hopes are very convincing and one is pushed by a faction; the way-out window is narrow and one requirement needs a faction\'s help or a dangerous place.'
  }[difficulty] || 'HARDENED difficulty.';

  const contLine = continuation ? `
THIS IS CHAPTER ${continuation.chapter} OF A CONTINUING STORY. The same world, a new region. The previous chapter, "${continuation.previousTitle}", ended like this: ${continuation.howItEnded} The survivor arrives in this new region that way, on day ${S} of the collapse, with their pack and the people below. The hidden cause is the SAME as before and must be reused verbatim in trueCause (publicBelief may differ here): """${continuation.trueCause}""". The companions travelling with the survivor MUST appear in npcs with exactly these ids, names and histories, located at the start location, knownToSurvivor true, relationToSurvivor "travelling companion": ${continuation.companions.map(c => `${c.id}: ${c.name} (${c.background})`).join('; ') || 'none'}. Make the start location a place of arrival (a harbour, a station, a roadhead, a camp at the border) and this region's history over the last ${S} days its own.` : '';

  return `You are designing the hidden ground truth for a grounded survival game. Produce ONE complete, internally consistent world as JSON matching the schema below exactly. This JSON is never shown to the player; it is the secret the Game Master plays from. Be specific and concrete everywhere: names, streets, objects, times. Vague entries make the game unplayable.

${typeLine}
${survivorLine}
${homeLine}
${startLine}
${lengthLine}
${difficultyGuide}${contLine}

VARIETY (follow these; they are what makes this world different from the last one):
- OPENING: the survivor first notices it ${sd.opening}. Write prologue.howTheyNotice from this. Do not open with an emergency alert on a phone, a television bulletin or the survivor waking up unless the opening seed says so.
- TEXTURE: ${sd.tone}.
- THE AUTHORITIES ARE: ${sd.response}.
- Avoid the stock version of this apocalypse. No scene, faction, false hope or ending that could be lifted from a film; invent from the specifics of this place and these people.

DESIGN REQUIREMENTS
1. publicBelief and trueCause must differ in a way that matters. The truth is discoverable from the clues; it is never told outright.
2. LOCATIONS: 8 to 12, ids loc1..loc12, spread across the map with x and y from 0 to 100 (the start location near the middle). Give each a type, danger 0-5, resources 0-5 per category (food, water, medical, fuel, materials, weapons), a holder faction or null, shelterQuality 0-5 (how livable as a base), hazard 0-5 (apocalypse-specific exposure there), a paragraph of description, 2 sharpEyeDetails, 3-5 searchableAreas, and 0-2 hidden things with an exact "where". The start location (region.startLocationId) is the survivor's HOME (or, in a continuation, their point of arrival): initiallyKnown true, shelterQuality at least 1, type residence unless the continuation says otherwise. At least 3 locations initiallyKnown (their workplace, their shops, the places of their ordinary life); the rest are discovered in play. At least 2 locations with shelterQuality 3 or more. At least 6 hidden things in total.
3. FACTIONS: 2 or 3, ids f1..f3, each with a public goal, a real secret, a base location, an attitude to strangers, trade goods and wants, and a speech style. One faction spreads or guards a false hope. Before the collapse (startDay below zero) factions may not exist yet as factions: describe what they were (a church, a company's security contractor, a hunting club, the council) and let the timeline turn them into what they become.
4. NPCS: 6 to 8, ids n1..n8, each at a location (spread them out), with background, personality, a distinct speechStyle, 1-2 skills from: medicine, mechanics, combat, scavenging, stealth, leadership, survival, electronics, farming, negotiation; a secret; a loyaltyTendency; a breakingPoint; and a betrayal object. For those who WILL betray, give a concrete trigger from the allowed kinds (with "value", and "factionId" for faction triggers), "how" they do it, and an "effect". Make at least two npcs genuinely good people. One npc should be essential or very helpful to the way out (reflect that in requirements.howToObtain). AT LEAST ONE, preferably two, are people from the survivor's own ordinary life (knownToSurvivor true with relationToSurvivor: a neighbour, a colleague, a relative, a friend, a landlord, an ex) and live at or near the start location.
5. THREAT: the hostile force with nature, behaviour, 2+ weaknesses the player can exploit, 2+ escalation steps, nightMultiplier (1-3) and baseLevel (0-5).
6. TIMELINE: at least 10 entries sorted by day then hour. Day 0 is the inciting event, at hour 9-12 unless the start is before it. Doom levels run 1-5 (1 unease, 2 breakdown, 3 regional collapse, 4 continental dark, 5 extinction) and should rise over the game, reaching 4 or 5 before deadlineDay. At least 3 entries have visible false (things the player does not witness: a lab evacuated, a deal struck, a dam failing elsewhere). Exactly one or two entries AFTER the start day have contact true: an incoming radio contact from a named voice who wants something time-critical (set effects.radioFreq to a channel frequency). Use effects to capture locations (locationId + capturedBy), raise threat (threatDelta), change danger, reveal a location, and to END UTILITIES: the entries where the phone network, the internet, the power and the water fail must set effects.utilities, e.g. {"power": false, "water": false}; decide realistically when each goes (cell towers die with the grid; water pressure lasts a day or two after power). Set "hour" for every entry. NEVER write day numbers or clock times inside event text; the game stamps every event with its real time.
7. ENDING: trueWayOut names what, where (a locationId), a day window within the deadline, and 1-3 requirements as snake_case flags with how the player obtains them. clues: at least 3 independent clues that TOGETHER reveal the way out and the window: at least one with source.kind "location" (and that location's hidden array MUST contain an entry whose clueId equals the clue id), at least one with source.kind "npc", and one with source.kind "radio" (its frequency must exist in radio.channels and one of that channel's messages must carry the clue). falseHopes: 2 or 3 convincing wrong paths (a convoy, a safe zone, a cure, a bunker) with where and whatReallyHappens.
8. RADIO: 4 to 7 channels with frequencies as strings (e.g. "162.400", "146.520", "7.200", "1610"), each with owner, kind, a schedule (fromDay, toDay or null, hours as a list of 0-23 or empty for always) and 1-4 messages with fromDay increasing. Include: an official or automated channel, a faction channel with truthful false messages, a survivor net, and the channel that carries the radio clue. Write messages as spoken, with the texture of real broadcasts, and with no dates or clock times in them.
9. Everything is fictional. Invent names, companies and agencies. No real people. Keep violence described with restraint.
10. Where a value is absent use JSON null, never the string "null", "none" or "N/A". Numbers are numbers, not strings. Day numbers everywhere count from the inciting event (day 0).
11. SIZE MATTERS: the whole document must stay under about 3800 words (roughly 6500 tokens) or it will be cut off. Location descriptions and npc backgrounds are 2-4 sentences, travelNotes and personality one sentence, radio messages one to three sentences, the prologue and situationReport within their word counts. Hit the minimum counts in the schema and stop; specific beats long.

SCHEMA (follow exactly; no extra top-level keys):
${WORLD_SCHEMA_TEXT}

Reply with the JSON object only. No markdown fences, no commentary.`;
}
