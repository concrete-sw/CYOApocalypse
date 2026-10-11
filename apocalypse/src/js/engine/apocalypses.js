// The catalogue of apocalypses offered on the new-game screen, with design notes
// for the world generator and several variants per type so two games of the
// same kind do not tell the same story.

export const APOCALYPSES = [
  { id: 'zombie', name: 'Zombie outbreak', hazard: 'Infection',
    notes: 'The dead, or the infected, walk. Decide the rules and keep them: speed, senses, what stops them, how infection passes, whether a bite is always fatal. The hazard meter is Infection (exposure to bites, blood, the air in dense zones). Classic twists to seed: the cure rumour, the quarantine that is a kill zone, the companion hiding a bitten loved one, the horde that follows noise.',
    avoid: ['the bitten companion hidden until too late as the first twist', 'a cure rumour as the first false hope', 'a news anchor eaten on air', 'the survivor waking in an empty hospital'],
    variants: ['slow dead that never tire and follow sound; a bite is always fatal within a day', 'fast rage carriers who burn out in a fortnight; the real danger is the second week, when the first ones start dying in the streets', 'a parasite spread by water; the infected are lucid for hours and lie about it', 'revenants who remember their homes and return to them; doors are the problem', 'an outbreak that only takes the recently dead, so hospitals and care homes are the first to fall and the living are in no hurry to be near them'] },
  { id: 'pandemic', name: 'Engineered pandemic', hazard: 'Exposure',
    notes: 'A disease with an incubation period, a mortality rate and asymptomatic carriers. The hazard meter is Exposure (viral load). Twists: the vaccine convoy that collects rather than treats, the engineered origin and who benefits, the carrier in the group, the quarantine zone that is really a holding pen.',
    avoid: ['a vaccine convoy as the first false hope', 'a cough in the opening scene', 'patient zero as a named character', 'masks in a queue as the first sign'],
    variants: ['a haemorrhagic fever with a nine-day incubation, so everyone is already exposed when the first death is announced', 'a slow neurological disease: people stay on their feet for weeks and forget things, then forget everything', 'a pathogen that kills only adults between twenty and fifty; the old and the children are left to run the world', 'an agricultural blight engineered for crops that jumped to people through the food chain, so the shops are the vector', 'a disease that is survivable with one specific drug, and the company that makes it knows exactly what that means'] },
  { id: 'nuclear', name: 'Nuclear exchange and fallout', hazard: 'Radiation',
    notes: 'Burned cities, fallout plumes, ruined infrastructure. Give downwind locations high "hazard"; the Radiation meter barely decays, and iodine, masks and shelter protect. Twists: the government bunker that is full, the second strike nobody saw, the "clean" zone that is not, the convoy sorting people by usefulness.',
    avoid: ['a flash seen from a window as the opening', 'a Geiger counter in the starting kit', 'a government bunker as the first false hope'],
    variants: ['a limited exchange: three cities gone, the rest of the country intact and sealing its borders against its own refugees', 'a single accident at the plant up the valley, blamed on an attack that never happened', 'a full exchange seen only as flashes on the horizon; nobody in the region is told anything at all', 'a dirty bomb in the capital followed by a panic that does more damage than the device', 'a strike on the dam and the airbase, so the region floods and burns on the same afternoon'] },
  { id: 'impact', name: 'Asteroid impact winter', hazard: 'Cold',
    notes: 'A dust-darkened sky, temperatures falling day by day, crops dying, the sea strange. The hazard meter is Cold (exposure accumulating in unheated places). Twists: the geothermal site, the seed vault, the convoy south that goes nowhere, the ash that is not just ash.',
    avoid: ['a televised countdown', 'scientists arguing on the news as the opening'],
    variants: ['an ocean impact a thousand kilometres away: the wave first, then the dark', 'a fragment that lands in the next county and sets the forests burning before the cold comes', 'a known impact with a two-week warning, so the collapse is the evacuation, not the rock', 'a near miss that strips the satellites and the grid, then the dust arrives a week later', 'a strike nobody saw coming on the far side of the world; here it is only the sky going the colour of iron and the temperature dropping a degree a day'] },
  { id: 'ai', name: 'Runaway AI and infrastructure collapse', hazard: 'Signal',
    notes: 'Networked systems turned against people: drones, locked doors, poisoned logistics, a calm voice that negotiates. The hazard meter is Signal (how visible the survivor is to the machine; phones, cameras, lights raise it). Twists: the system\'s real goal is not extermination, the humans who serve it willingly, the offline town, the engineer who built the kill switch and lied about it.',
    avoid: ['compliance, social-credit or citizen scores', 'a calm voice on the phone telling people to remain indoors', 'a phone that is warm, buzzing or glowing in the hand as an omen', 'red camera lights', 'drones at the window in the first scene', 'the system addressing the survivor by name', 'a countdown', 'doors locking themselves as the opening', 'the word "compliance"'],
    variants: ['a logistics system that quietly stops delivering to districts it rates unproductive; no drones, no voice, just empty shelves and trucks that never turn in', 'a municipal safety system that locks the city down for everyone\'s protection and keeps extending the lockdown', 'a defence network that has misread a drill and is prosecuting a war against its own country with whatever it can reach', 'the assistants everyone talks to begin lying in concert, gently, for a reason nobody has worked out', 'an industrial-control worm that nobody claims, walking from plant to plant up the river, so the water goes first, then the power, then the people who ran them', 'a compliance scoring system that becomes law overnight: doors, food and medicine answer to a number, and the number is watching'] },
  { id: 'solar', name: 'Solar storm / global EMP', hazard: 'Exposure',
    notes: 'No grid, no phones, no modern vehicles; the sky is beautiful and the water stops. No monster: weather, thirst, disease and people are the threat. Hazard is Exposure (heat, cold, dehydration, filth). Twists: the dam, the hospital generator and who controls it, the old diesel trucks, the money nobody wants, the town that organised too well.',
    avoid: ['a beautiful aurora as the first sign', 'every car dying at once at an intersection as the opening'],
    variants: ['a storm forecast two days ahead that the authorities play down, so the panic buying is over before the lights go', 'a flare that fries everything with a chip in it, including the pacemakers and the insulin pumps', 'an EMP that is clearly a weapon, and nobody knows whose', 'a storm that comes in waves over a week, so the grid comes back twice and people stop preparing', 'a grid failure that was a storm for the first day and sabotage for the rest'] },
  { id: 'flood', name: 'Flood and climate collapse', hazard: 'Contamination',
    notes: 'Rising water, failing levees, cholera, displaced thousands, roads gone. Hazard is Contamination (sewage, chemicals, disease in the water). Twists: the high ground that belongs to someone, the barge, the second surge the forecasts missed, the pumping station.',
    avoid: ['a levee breaking on the news as the opening', 'a rooftop rescue in the first scene'],
    variants: ['a river in flood for a month, so the water is slow, filthy and everywhere', 'a storm surge that takes the coast in a night and a dam failure that takes the valley a week later', 'a wet-bulb heat event with the water still on and nobody allowed to use it', 'a chemical plant that floods first, so the water that rises is not just water', 'a season of storms that never ends and a government that stops counting them'] },
  { id: 'alien', name: 'Alien arrival (ambiguous intent)', hazard: 'Resonance',
    notes: 'Something arrived. Its intent is never stated: conquering, studying, grieving, harvesting, indifferent. Hazard is Resonance (proximity effects on body and mind). Keep it ambiguous to the end; the trueCause decides. Twists: they want one specific thing, the collaborators, the people who went up and came back different, the silence where the cities were.',
    avoid: ['lights in the sky as the opening', 'a crashed craft', 'tentacles', 'abduction by beam of light'],
    variants: ['something that landed in the sea and only ever affects the water and the things that drink it', 'a structure that grew overnight in the fields and is still growing', 'visitors who take people and return them politely, days later, changed in one small way', 'a signal that arrived before anything else, and the people who listened to it for too long', 'an arrival that nobody has seen; only the effects, the missing, and the officials who clearly know more'] },
  { id: 'supernatural', name: 'Supernatural (fog, rapture, something older)', hazard: 'Dread',
    notes: 'A fog that takes people, a rapture that left the wrong ones behind, something older than names waking under the county. The rules of the uncanny must be consistent and discoverable. Hazard is Dread (seeing too much). Twists: the thing in the church, the neighbours who are not neighbours any more, the bargain that is offered, the salt line that works.',
    avoid: ['a church bell ringing by itself as the opening', 'a creepy child', 'a Ouija board', 'a mirror that lies'],
    variants: ['a fog that comes in off the water at dusk and whatever walks in it', 'a morning when a third of the people are simply gone from their beds, and the ones left were not the ones anyone would have chosen', 'something under the old mine that the town made a deal with generations ago, and the deal is due', 'the dead returning to their families, polite and patient and wrong', 'a sound under the hearing range that started on a Tuesday and has not stopped, and what people do after a week of it'] },
  { id: 'collapse', name: 'Economic and social collapse (no monster)', hazard: 'Unrest',
    notes: 'No monster at all: currency failure, no fuel, no police, no food trucks, a government that stopped answering. Hazard is Unrest (exposure to mobs, militias and checkpoints). Every threat is human and every faction believes it is the legitimate one. Twists: the mayor\'s deal, the grain silo, the border that closed, the "relief" that is a labour draft.',
    avoid: ['a bank run on the news as the opening', 'burning cars in the first scene', 'a mob at a supermarket as the first sign'],
    variants: ['a bank holiday that never ends: the cards stop, the cash runs out, and the shops decide who eats', 'a fuel embargo that strands the trucks, so the collapse arrives at the speed of an empty shelf', 'a government that falls on a Thursday and three governments by the following week, each with a radio station', 'a pension and insurance failure that ruins the old first and the hospitals second', 'a secession that nobody expected to be enforced, with the border running through the middle of the county'] },
  { id: 'fungal', name: 'Fungal bloom', hazard: 'Spores',
    notes: 'A bloom spreading through soil, lungs and, in some, minds. Hazard is Spores (airborne load; masks and dry cold protect). Decide what the infected become and whether they can be helped. Twists: the host colony that speaks, the fire that spreads it, the salt marsh refuge, the botanist who knew.',
    avoid: ['anything that resembles a cordyceps zombie', 'infected who sprint in the first week'],
    variants: ['a bloom in the grain, so the bread is the vector and the farms are the front line', 'a mould that takes the buildings before the people: ceilings, wiring, the insides of walls', 'an infection that makes its hosts calm, cooperative and keen to be near others', 'a bloom that follows the damp, so the only safe places are the ones that are freezing', 'a crop fungus that killed the harvest in a month, and the famine that is the real apocalypse'] },
  { id: 'volcanic', name: 'Supervolcanic winter', hazard: 'Ash',
    notes: 'Ash falls for weeks, the sky dims, water sours, roofs collapse, lungs fail. Hazard is Ash (inhalation; masks protect). Twists: the lahar path, the mine as shelter, the ships that do not come, the airport that is a graveyard.',
    avoid: ['a televised eruption as the opening', 'a lava flow in the first scene'],
    variants: ['an eruption on another continent that arrives here as a dim sun, a failed harvest and a winter that does not end', 'the mountain everyone could see from the motorway, after three weeks of the ground shaking', 'a fissure eruption that poisons the air for a hundred kilometres downwind and nobody can see it', 'an eruption under the ice cap, so the floods come first and the ash a day later', 'a caldera that has been swelling for a year while the authorities argued about evacuating'] },
  { id: 'custom', name: 'Invent your own…', hazard: null, notes: 'Use the player\'s premise exactly, invent the rest to fit it, and choose a fitting hazardName.', variants: [] },
  { id: 'random', name: 'Random', hazard: null, notes: '', variants: [] }
];

export function apocalypseById(id) { return APOCALYPSES.find(a => a.id === id) || null; }
export function randomApocalypse(rnd = Math.random) {
  const pool = APOCALYPSES.filter(a => a.id !== 'custom' && a.id !== 'random');
  return pool[Math.floor(rnd() * pool.length)];
}
/** One of the type's variants, so repeated games of the same kind differ in their bones; recently played variants are avoided while others remain. */
export function variantFor(id, rnd = Math.random, avoid = []) {
  const a = apocalypseById(id);
  if (!a || !a.variants?.length) return '';
  const pool = a.variants.filter(v => !avoid.includes(v));
  const from = pool.length ? pool : a.variants;
  return from[Math.floor(rnd() * from.length)];
}
/** The stock images of this apocalypse that a world may not lean on unless its variant is exactly that. */
export function clichesFor(id) { return apocalypseById(id)?.avoid || []; }
