// Prompt that produces the hidden world truth. The result is validated by
// engine/schema.js and regenerated with the problems fed back if invalid.

import { apocalypseById } from '../engine/apocalypses.js';

export const WORLD_SCHEMA_TEXT = `{
  "title": "short evocative title for this apocalypse, e.g. 'The Quiet Season'",
  "apocalypse": {
    "type": "the apocalypse type requested",
    "publicBelief": "what people believe happened and is happening (2-3 sentences)",
    "trueCause": "the hidden real cause and what is actually going on: who knows, who benefits, what they want, and how it differs from publicBelief (a full paragraph)",
    "hazardName": "one or two words for the apocalypse-specific exposure meter shown to the player, e.g. Radiation, Exposure, Spores, Signal, Dread, Contamination, Cold, Ash",
    "hazardDescription": "what the meter measures and how it rises (one sentence)"
  },
  "region": { "name": "an invented region or county name in a real country", "country": "", "startLocationId": "loc1", "season": "spring|summer|autumn|winter", "climate": "e.g. temperate maritime, arid, continental, tropical, subarctic", "description": "a paragraph on the region before and now" },
  "prologue": {
    "ordinaryMorning": "the survivor's ordinary Day 0 morning: home, routine, the people in their life, one tiny wrongness (120-200 words, written as GM guidance)",
    "theMoment": "how it all goes wrong in front of them, concrete and frightening (120-200 words)",
    "firstHours": "GM guidance for the first hours: the streets, the sounds, what the survivor can plausibly do (60-120 words)"
  },
  "situationReport": "the public picture at the end of Day 0, as an emergency broadcast would state it: what is believed, what is closed, where people are told to go, what to avoid. 120-200 words. Must not leak hidden facts.",
  "timeline": [ { "day": 0, "hour": 9, "event": "what happens, concretely", "doom": 1, "visible": true, "contact": false, "effects": { "threatDelta": 0, "locationId": null, "capturedBy": null, "dangerDelta": 0, "revealLocationId": null, "radioFreq": null } } ],
  "locations": [ { "id": "loc1", "name": "", "type": "residence|shelter|store|hospital|checkpoint|industrial|wilderness|water|camp|government|ruin|transport|religious|other", "x": 0, "y": 0, "danger": 0, "resources": { "food": 0, "water": 0, "medical": 0, "fuel": 0, "materials": 0, "weapons": 0 }, "heldBy": null, "initiallyKnown": true, "shelterQuality": 0, "hazard": 0, "description": "a paragraph of atmosphere and layout", "sharpEyeDetails": ["what a careful eye notices (a lead, not an answer)", "another"], "searchableAreas": ["area 1", "area 2", "area 3"], "hidden": [ { "what": "a specific thing hidden here", "where": "the exact spot a search must look, in plain words", "clueId": null } ], "travelNotes": "roads, hazards, how people get there" } ],
  "factions": [ { "id": "f1", "name": "", "ideology": "", "goal": "what they want (public)", "secret": "what they hide", "strength": 1, "baseLocationId": "loc4", "attitudeToStrangers": "hostile|wary|neutral|welcoming", "tradeGoods": ["what they trade away"], "wants": ["what they want in return"], "radioFreq": null, "speechStyle": "how their people talk" } ],
  "npcs": [ { "id": "n1", "name": "", "age": 0, "background": "a paragraph", "personality": "a sentence", "speechStyle": "vocabulary, rhythm, tics", "skills": ["medicine"], "secret": "", "loyaltyTendency": "loyal|steady|fickle|treacherous", "breakingPoint": "what would make them crack", "betrayal": { "will": false, "trigger": { "kind": "loyaltyBelow|dayAfter|foodDaysBelow|moraleBelow|healthBelow|factionStandingAbove|factionStandingBelow|flag|shelterClaimed", "value": 0, "factionId": null, "flag": null }, "how": "what they do, concretely", "effect": "steal|leave|sabotage|lure|kill_attempt|defect" }, "locationId": "loc2", "factionId": null, "initialDisposition": "friendly|wary|desperate|predatory", "wants": "what they want from the survivor" } ],
  "threat": { "name": "the hostile force, e.g. 'the infected', 'the Ninth Street militia', 'the drones'", "nature": "what it is", "behavior": "how it hunts, moves, when it is active", "weaknesses": ["", ""], "escalation": ["how it worsens over time", ""], "nightMultiplier": 1.5, "baseLevel": 1 },
  "ending": {
    "trueWayOut": { "what": "the real escape or resolution", "where": "locationId", "windowStartDay": 10, "windowEndDay": 20, "requirements": [ { "flag": "snake_case_flag", "description": "what must be true", "howToObtain": "how the player can plausibly achieve it in play (the GM sets the flag when they do)" } ], "description": "what it looks like when it happens", "howItPlaysOut": "what happens to the survivor and the region afterwards" },
    "clues": [ { "id": "c1", "text": "the clue as the player would learn it", "source": { "kind": "location|npc|radio", "id": "a locationId, an npc id, or a radio frequency string" } } ],
    "falseHopes": [ { "id": "fh1", "promise": "what it seems to offer", "source": "who or what spreads it", "where": "locationId or null", "whatReallyHappens": "the truth" } ]
  },
  "radio": { "channels": [ { "freq": "162.400", "kind": "government|faction|survivor|numbers|automated|pirate|military", "owner": "", "schedule": { "fromDay": 0, "toDay": null, "hours": [] }, "messages": [ { "fromDay": 0, "text": "the broadcast text, as spoken", "truthful": true } ] } ] },
  "deadlineDay": 30
}`;

export function buildWorldGenerationPrompt({ apocalypseId, apocalypseName, customPremise, difficulty, length, survivor }) {
  const apo = apocalypseById(apocalypseId);
  const typeLine = apocalypseId === 'custom'
    ? `APOCALYPSE: the player's own premise. Use it exactly and build everything around it: """${customPremise || 'an unspecified catastrophe'}"""`
    : `APOCALYPSE: ${apocalypseName || apo?.name}\nDESIGN NOTES FOR THIS TYPE: ${apo?.notes || ''}`;

  const lengthGuide = {
    short: 'SHORT game: deadlineDay 14. Timeline of 10-11 entries. The way-out window opens between day 7 and day 10 and lasts 3-4 days.',
    standard: 'STANDARD game: deadlineDay 30. Timeline of 12-14 entries. The way-out window opens between day 14 and day 22 and lasts 5-7 days.',
    long: 'LONG game: deadlineDay 60. Timeline of 16-18 entries. The way-out window opens between day 30 and day 45 and lasts 7-10 days.'
  }[length] || 'STANDARD game: deadlineDay 30. Timeline of 12-14 entries. The way-out window opens between day 14 and day 22 and lasts 5-7 days.';

  const difficultyGuide = {
    survivor: 'SURVIVOR difficulty: resources average 2-3 per category at most places; only ONE npc betrays; false hopes have visible cracks; the way-out window is generous; strangers are mostly wary rather than predatory.',
    hardened: 'HARDENED difficulty: resources average 1-2; TWO npcs betray, with different triggers; false hopes are convincing; one clue requires talking to a specific npc; one clue is only on the radio.',
    nightmare: 'NIGHTMARE difficulty: resources average 0-1 and the best caches are in dangerous places; THREE npcs betray, one of them likeable and early; false hopes are very convincing and one is pushed by a faction; the way-out window is narrow and one requirement needs a faction\'s help or a dangerous place.'
  }[difficulty] || 'HARDENED difficulty.';

  return `You are designing the hidden ground truth for a grounded survival game. The player is ${survivor?.name || 'a survivor'}, a ${survivor?.background || 'civilian'} with skills: ${(survivor?.skills || []).join(', ') || 'none in particular'}. Produce ONE complete, internally consistent world as JSON matching the schema below exactly. This JSON is never shown to the player; it is the secret the Game Master plays from. Be specific and concrete everywhere: names, streets, objects, times. Vague entries make the game unplayable.

${typeLine}
${lengthGuide}
${difficultyGuide}

DESIGN REQUIREMENTS
1. publicBelief and trueCause must differ in a way that matters. The truth is discoverable from the clues; it is never told outright.
2. LOCATIONS: 8 to 12, ids loc1..loc12, spread across the map with x and y from 0 to 100 (the start location near the middle). Give each a type, danger 0-5, resources 0-5 per category (food, water, medical, fuel, materials, weapons), a holder faction or null, shelterQuality 0-5 (how livable as a base), hazard 0-5 (apocalypse-specific exposure there), a paragraph of description, 2 sharpEyeDetails, 3-5 searchableAreas, and 0-2 hidden things with an exact "where". The start location (region.startLocationId) is the survivor's home: initiallyKnown true, shelterQuality at least 1. At least 3 locations initiallyKnown; the rest are discovered in play. At least 2 locations with shelterQuality 3 or more. At least 6 hidden things in total.
3. FACTIONS: 2 or 3, ids f1..f3, each with a public goal, a real secret, a base location, an attitude to strangers, trade goods and wants, and a speech style. One faction spreads or guards a false hope.
4. NPCS: 6 to 8, ids n1..n8, each at a location (spread them out), with background, personality, a distinct speechStyle, 1-2 skills from: medicine, mechanics, combat, scavenging, stealth, leadership, survival, electronics, farming, negotiation; a secret; a loyaltyTendency; a breakingPoint; and a betrayal object. For those who WILL betray, give a concrete trigger from the allowed kinds (with "value", and "factionId" for faction triggers), "how" they do it, and an "effect". Make at least two npcs genuinely good people. One npc should be essential or very helpful to the way out (reflect that in requirements.howToObtain).
5. THREAT: the hostile force with nature, behaviour, 2+ weaknesses the player can exploit, 2+ escalation steps, nightMultiplier (1-3) and baseLevel (0-5).
6. TIMELINE: at least 10 entries sorted by day then hour. The FIRST entry is the inciting event on day 0 at hour 9-12. Doom levels run 1-5 (1 unease, 2 breakdown, 3 regional collapse, 4 continental dark, 5 extinction) and should rise over the game, reaching 4 or 5 before deadlineDay. At least 3 entries have visible false (things the player does not witness: a lab evacuated, a deal struck, a dam failing elsewhere). Exactly one or two entries have contact true: an incoming radio contact from a named voice who wants something time-critical (set effects.radioFreq to a channel frequency). Use effects to capture locations (locationId + capturedBy), raise threat (threatDelta), change danger, or reveal a location.
7. ENDING: trueWayOut names what, where (a locationId), a day window within the deadline, and 1-3 requirements as snake_case flags with how the player obtains them. clues: at least 3 independent clues that TOGETHER reveal the way out and the window: at least one with source.kind "location" (and that location's hidden array MUST contain an entry whose clueId equals the clue id), at least one with source.kind "npc", and one with source.kind "radio" (its frequency must exist in radio.channels and one of that channel's messages must carry the clue). falseHopes: 2 or 3 convincing wrong paths (a convoy, a safe zone, a cure, a bunker) with where and whatReallyHappens.
8. RADIO: 4 to 7 channels with frequencies as strings (e.g. "162.400", "146.520", "7.200", "1610"), each with owner, kind, a schedule (fromDay, toDay or null, hours as a list of 0-23 or empty for always) and 1-4 messages with fromDay increasing. Include: an official or automated channel, a faction channel with truthful false messages, a survivor net, and the channel that carries the radio clue. Write messages as spoken, with the texture of real broadcasts.
9. Everything is fictional. Invent names, companies and agencies. No real people. Keep violence described with restraint.
10. Where a value is absent use JSON null, never the string "null", "none" or "N/A". Numbers are numbers, not strings.
11. Keep the whole document under about 6000 words: descriptions and backgrounds are one paragraph of 3-5 sentences, prologue and situationReport within their word counts, radio messages one to three sentences. Specific beats long.

SCHEMA (follow exactly; no extra top-level keys):
${WORLD_SCHEMA_TEXT}

Reply with the JSON object only. No markdown fences, no commentary.`;
}
