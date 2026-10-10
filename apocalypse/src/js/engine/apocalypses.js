// The catalogue of apocalypses offered on the new-game screen, with design notes for the world generator.

export const APOCALYPSES = [
  { id: 'zombie', name: 'Zombie outbreak', hazard: 'Infection',
    notes: 'The dead, or the infected, walk. Decide the rules and keep them: speed, senses, what stops them, how infection passes, whether a bite is always fatal. The hazard meter is Infection (exposure to bites, blood, the air in dense zones). Classic twists to seed: the cure rumour, the quarantine that is a kill zone, the companion hiding a bitten loved one, the horde that follows noise.' },
  { id: 'pandemic', name: 'Engineered pandemic', hazard: 'Exposure',
    notes: 'A disease with an incubation period, a mortality rate and asymptomatic carriers. The hazard meter is Exposure (viral load). Twists: the vaccine convoy that collects rather than treats, the engineered origin and who benefits, the carrier in the group, the quarantine zone that is really a holding pen.' },
  { id: 'nuclear', name: 'Nuclear exchange and fallout', hazard: 'Radiation',
    notes: 'Burned cities, fallout plumes, ruined infrastructure. Give downwind locations high "hazard"; the Radiation meter barely decays, and iodine, masks and shelter protect. Twists: the government bunker that is full, the second strike nobody saw, the "clean" zone that is not, the convoy sorting people by usefulness.' },
  { id: 'impact', name: 'Asteroid impact winter', hazard: 'Cold',
    notes: 'A dust-darkened sky, temperatures falling day by day, crops dying, the sea strange. The hazard meter is Cold (exposure accumulating in unheated places). Twists: the geothermal site, the seed vault, the convoy south that goes nowhere, the ash that is not just ash.' },
  { id: 'ai', name: 'Runaway AI and infrastructure collapse', hazard: 'Signal',
    notes: 'Networked systems turned against people: drones, locked doors, poisoned logistics, a calm voice that negotiates. The hazard meter is Signal (how visible the survivor is to the machine; phones, cameras, lights raise it). Twists: the system\'s real goal is not extermination, the humans who serve it willingly, the offline town, the engineer who built the kill switch and lied about it.' },
  { id: 'solar', name: 'Solar storm / global EMP', hazard: 'Exposure',
    notes: 'No grid, no phones, no modern vehicles; the sky is beautiful and the water stops. No monster: weather, thirst, disease and people are the threat. Hazard is Exposure (heat, cold, dehydration, filth). Twists: the dam, the hospital generator and who controls it, the old diesel trucks, the money nobody wants, the town that organised too well.' },
  { id: 'flood', name: 'Flood and climate collapse', hazard: 'Contamination',
    notes: 'Rising water, failing levees, cholera, displaced thousands, roads gone. Hazard is Contamination (sewage, chemicals, disease in the water). Twists: the high ground that belongs to someone, the barge, the second surge the forecasts missed, the pumping station.' },
  { id: 'alien', name: 'Alien arrival (ambiguous intent)', hazard: 'Resonance',
    notes: 'Something arrived. Its intent is never stated: conquering, studying, grieving, harvesting, indifferent. Hazard is Resonance (proximity effects on body and mind). Keep it ambiguous to the end; the trueCause decides. Twists: they want one specific thing, the collaborators, the people who went up and came back different, the silence where the cities were.' },
  { id: 'supernatural', name: 'Supernatural (fog, rapture, something older)', hazard: 'Dread',
    notes: 'A fog that takes people, a rapture that left the wrong ones behind, something older than names waking under the county. The rules of the uncanny must be consistent and discoverable. Hazard is Dread (seeing too much). Twists: the thing in the church, the neighbours who are not neighbours any more, the bargain that is offered, the salt line that works.' },
  { id: 'collapse', name: 'Economic and social collapse (no monster)', hazard: 'Unrest',
    notes: 'No monster at all: currency failure, no fuel, no police, no food trucks, a government that stopped answering. Hazard is Unrest (exposure to mobs, militias and checkpoints). Every threat is human and every faction believes it is the legitimate one. Twists: the mayor\'s deal, the grain silo, the border that closed, the "relief" that is a labour draft.' },
  { id: 'fungal', name: 'Fungal bloom', hazard: 'Spores',
    notes: 'A bloom spreading through soil, lungs and, in some, minds. Hazard is Spores (airborne load; masks and dry cold protect). Decide what the infected become and whether they can be helped. Twists: the host colony that speaks, the fire that spreads it, the salt marsh refuge, the botanist who knew.' },
  { id: 'volcanic', name: 'Supervolcanic winter', hazard: 'Ash',
    notes: 'Ash falls for weeks, the sky dims, water sours, roofs collapse, lungs fail. Hazard is Ash (inhalation; masks protect). Twists: the lahar path, the mine as shelter, the ships that do not come, the airport that is a graveyard.' },
  { id: 'custom', name: 'Invent your own…', hazard: null, notes: 'Use the player\'s premise exactly, invent the rest to fit it, and choose a fitting hazardName.' },
  { id: 'random', name: 'Random', hazard: null, notes: '' }
];

export function apocalypseById(id) { return APOCALYPSES.find(a => a.id === id) || null; }
export function randomApocalypse(rnd = Math.random) {
  const pool = APOCALYPSES.filter(a => a.id !== 'custom' && a.id !== 'random');
  return pool[Math.floor(rnd() * pool.length)];
}
