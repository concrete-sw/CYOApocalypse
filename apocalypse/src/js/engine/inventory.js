// Inventory: items with weight and condition, consumables, treatment, crafting, starting kits.

import { clamp, uid, str, num } from './util.js';
import { treatInjury, setIllness } from './body.js';

export const CATEGORIES = ['food', 'water', 'medical', 'tool', 'weapon', 'ammo', 'fuel', 'material', 'clothing', 'electronics', 'document', 'misc'];
const DEFAULT_WEIGHT = { food: 0.4, water: 1.0, medical: 0.2, tool: 1.0, weapon: 2.0, ammo: 0.03, fuel: 0.8, material: 1.2, clothing: 0.8, electronics: 0.6, document: 0.1, misc: 0.3 };
export const BASE_CARRY_KG = 18;

const TAG_RULES = [
  [/bandage|gauze|dressing|first aid|trauma kit|med kit|medkit|suture|plaster/, 'bandage'],
  [/antibiotic|amoxicillin|penicillin|doxycycline|cipro/, 'antibiotic'],
  [/splint|brace|crutch/, 'splint'],
  [/painkiller|ibuprofen|aspirin|paracetamol|acetaminophen|morphine|codeine|pills?\b|tablets?\b/, 'painkiller'],
  [/burn gel|burn cream|aloe|silvadene/, 'burn'],
  [/coat|jacket|parka|blanket|sleeping bag|sweater|fleece|thermal|gloves|hat|scarf|boots|poncho/, 'warm'],
  [/mask|respirator|hazmat|iodine|potassium|filter|goggles|suit|tyvek/, 'protective'],
  [/pistol|revolver|handgun|glock/, 'firearm'], [/rifle|carbine|ar-?15|hunting rifle/, 'firearm'], [/shotgun/, 'firearm'],
  [/knife|blade|machete|axe|hatchet|bat|crowbar|pipe|hammer|club|spear|wrench|cleaver/, 'melee'],
  [/\brounds?\b|cartridge|shells?\b|bullets?|ammo|ammunition|magazine/, 'ammo'],
  [/dirty|untreated|river|pond|stream|rain ?water|murky|unfiltered|canal|puddle/, 'dirty'],
  [/water|bottle|canteen|jerrycan of water/, 'drink'],
  [/lighter|matches|flint|ferro|firestarter|fire starter/, 'fire'],
  [/rope|cord|paracord|wire|twine|cable|chain|strap|bungee/, 'cord'],
  [/plank|wood|lumber|board|scrap|sheet metal|nails|brick|sandbag|pallet|plywood|timber|concrete|rebar|fencing|barbed/, 'build'],
  [/radio|walkie|scanner|transceiver|ham\b|receiver/, 'radio'],
  [/flashlight|torch|lantern|lamp|headlamp|glow ?stick/, 'light'],
  [/batter(y|ies)|power bank|power cell|solar charger/, 'battery'],
  [/alcohol|vodka|whisk|spirits|rubbing|disinfectant|antiseptic|bleach|peroxide|sanitizer|iodine tincture/, 'alcohol'],
  [/cloth|shirt|rag|towel|bedsheet|linen|t-shirt|fabric|curtain|tarp|plastic sheet/, 'cloth'],
  [/\btea\b|coffee|cocoa|cigarette|tobacco|chocolate|candy|sweets|whisky/, 'comfort'],
  [/\bmap\b|atlas|chart|blueprint|schematic/, 'map'],
  [/gas\b|gasoline|petrol|diesel|propane|kerosene|fuel|oil\b|lamp oil/, 'fuel'],
  [/seed|seedling|fertili/, 'seeds'],
  [/binocular|scope|telescope/, 'optics'],
  [/key|keycard|badge|pass\b|code|password|letter|note|journal|diary|log ?book|manifest|photo/, 'clue'],
  [/bottle|jar|container|canister|jerrycan|flask/, 'container']
];

export function inferTags(name, category) {
  const n = String(name || '').toLowerCase();
  const tags = new Set();
  for (const [re, tag] of TAG_RULES) if (re.test(n)) tags.add(tag);
  if (category === 'water' && !tags.has('dirty')) tags.add('drink');
  if (category === 'food') tags.add('food');
  if (category === 'weapon' && !tags.has('firearm')) tags.add('melee');
  if (category === 'ammo') tags.add('ammo');
  if (category === 'fuel') tags.add('fuel');
  if (category === 'material') tags.add('build');
  if (category === 'clothing' && !tags.has('warm') && !tags.has('protective')) tags.add('cloth');
  return [...tags];
}

export function normalizeCategory(cat, name) {
  const c = String(cat || '').toLowerCase().trim();
  if (CATEGORIES.includes(c)) return c;
  const n = String(name || '').toLowerCase();
  if (/water|drink|juice|soda|canteen/.test(n)) return 'water';
  if (/food|can\b|canned|mre|ration|jerky|beans|rice|pasta|bar\b|bread|meat|fish|soup|crackers|cereal|fruit|vegetable|nuts|chocolate|biscuit|oats|flour|sugar|honey/.test(n)) return 'food';
  if (/bandage|gauze|medic|antibiotic|pills|tablet|splint|kit|syringe|morphine|aspirin|ibuprofen|dressing|ointment|gel\b/.test(n)) return 'medical';
  if (/pistol|rifle|shotgun|knife|machete|axe|bat|crowbar|spear|club|revolver|hatchet|bow\b/.test(n)) return 'weapon';
  if (/round|cartridge|shell|bullet|ammo|magazine/.test(n)) return 'ammo';
  if (/gas|petrol|diesel|propane|kerosene|fuel|oil/.test(n)) return 'fuel';
  if (/plank|wood|lumber|scrap|nail|brick|sandbag|sheet|wire|rope|cord|tarp|pallet|board/.test(n)) return 'material';
  if (/coat|jacket|boots|gloves|blanket|sleeping bag|poncho|mask|respirator|hat|scarf|clothes|shirt|trousers|pants/.test(n)) return 'clothing';
  if (/radio|battery|flashlight|torch|phone|scanner|charger|lantern|walkie|laptop|gps/.test(n)) return 'electronics';
  if (/map|letter|note|journal|diary|book|manifest|document|photo|key|keycard|badge|pass\b/.test(n)) return 'document';
  if (/tool|wrench|hammer|screwdriver|pliers|saw|shovel|crowbar|lighter|matches|hose|siphon|binocular|compass|tape|lock|pick|multitool|can opener|pot|pan|stove/.test(n)) return 'tool';
  return 'misc';
}

export function makeItem(spec) {
  const name = str(spec?.name, 'Unknown item').trim().slice(0, 60) || 'Unknown item';
  const category = normalizeCategory(spec?.category, name);
  const tags = [...new Set([...(Array.isArray(spec?.tags) ? spec.tags.map(t => String(t).toLowerCase()) : []), ...inferTags(name, category)])];
  const w = num(spec?.weight, NaN);
  return {
    id: uid('it'), name, category, tags,
    qty: clamp(Math.round(num(spec?.qty, 1)) || 1, 1, 999),
    weight: Number.isFinite(w) && w >= 0 ? Math.min(60, w) : DEFAULT_WEIGHT[category],
    condition: clamp(Math.round(num(spec?.condition, 100)), 5, 100)
  };
}

function stackable(a, b) {
  return a.name.toLowerCase() === b.name.toLowerCase() && a.category === b.category && Math.abs(a.condition - b.condition) <= 15;
}

export function addItem(list, spec) {
  const item = spec.id && spec.tags && spec.weight != null ? { ...spec } : makeItem(spec);
  const existing = list.find(x => stackable(x, item));
  if (existing) { existing.qty = Math.min(999, existing.qty + item.qty); return existing; }
  list.push(item);
  return item;
}

export function removeItem(list, idOrName, qty = 1) {
  const i = list.findIndex(x => x.id === idOrName || x.name.toLowerCase() === String(idOrName).toLowerCase());
  if (i < 0) return null;
  const item = list[i];
  const take = Math.min(item.qty, qty);
  const removed = { ...item, qty: take, id: uid('it') };
  item.qty -= take;
  if (item.qty <= 0) list.splice(i, 1);
  return removed;
}

export function findItem(list, query) {
  if (!query) return null;
  const q = String(query).toLowerCase().trim();
  return list.find(x => x.id === q) || list.find(x => x.name.toLowerCase() === q) || list.find(x => x.name.toLowerCase().startsWith(q))
    || list.find(x => x.name.toLowerCase().includes(q)) || list.find(x => x.tags.includes(q)) || list.find(x => x.category === q) || null;
}

export function listWeight(list) { return Math.round(list.reduce((a, x) => a + x.qty * x.weight, 0) * 10) / 10; }
export function totalWeight(state) { return listWeight(state.inventory.items); }
export function maxWeight(state) {
  const bg = BACKGROUNDS.find(b => b.id === state.survivor.background);
  const companions = Object.values(state.companions).filter(c => c.status === 'with').length;
  return BASE_CARRY_KG + (bg?.carry || 0) + companions * 6;
}
export function overweightFactor(state) { return totalWeight(state) / Math.max(1, maxWeight(state)); }

export function itemValue(item) {
  const base = { medical: 6, weapon: 6, ammo: 1.5, food: 3, water: 3, fuel: 2.5, tool: 3, electronics: 3, clothing: 2, material: 1, document: 1, misc: 1 }[item.category] || 1;
  return base * item.qty * (item.tags.includes('firearm') ? 2 : 1) * (item.tags.includes('antibiotic') ? 1.5 : 1);
}

export function foodUnits(list) { return list.filter(x => x.category === 'food').reduce((a, x) => a + x.qty, 0); }
export function waterUnits(list) { return list.filter(x => x.category === 'water' && !x.tags.includes('dirty')).reduce((a, x) => a + x.qty, 0); }
/** Days of supply for a group at 2.5 meals and 3 drinks per person per day. */
export function supplyDays(state) {
  const lists = [state.inventory.items, ...(state.shelter?.stash ? [state.shelter.stash] : [])];
  const group = 1 + Object.values(state.companions).filter(c => c.status === 'with' || c.status === 'away').length;
  const food = lists.reduce((a, l) => a + foodUnits(l), 0);
  const water = lists.reduce((a, l) => a + waterUnits(l), 0);
  return { food: Math.round(food / (2.5 * group) * 10) / 10, water: Math.round(water / (3 * group) * 10) / 10, foodUnits: food, waterUnits: water, group };
}

function foodEffect(item) {
  const n = item.name.toLowerCase();
  if (/mre|ration pack|full meal|stew|feast/.test(n)) return 45;
  if (/can|canned|beans|soup|rice|pasta|meat|fish|bread|oats/.test(n)) return 30;
  if (/bar|snack|crackers|biscuit|jerky|nuts|fruit|chocolate|candy/.test(n)) return 16;
  return 25;
}

/**
 * Use an item from the inventory. Consumables are resolved by code and need no GM call.
 * Returns { ok, notice, consumed, needsGm }.
 */
export function useItem(state, itemId, { injuryId = null } = {}, rnd = Math.random) {
  const list = state.inventory.items;
  const item = list.find(x => x.id === itemId);
  if (!item) return { ok: false, notice: 'You do not have that.' };
  const v = state.vitals;
  if (item.category === 'food') {
    if (v.hunger > 95) return { ok: false, notice: 'You are not hungry.' };
    const spoiled = item.condition < 30 && rnd() < 0.5;
    v.hunger = clamp(v.hunger + foodEffect(item));
    v.morale = clamp(v.morale + (item.tags.includes('comfort') ? 5 : 2));
    removeItem(list, item.id, 1);
    if (spoiled) { setIllness(state, { name: 'food poisoning', severity: 1 }); return { ok: true, consumed: true, notice: `You eat the ${item.name}. It tasted wrong. Within the hour your stomach agrees.` }; }
    return { ok: true, consumed: true, notice: `You eat the ${item.name}.` };
  }
  if (item.category === 'water') {
    if (v.thirst > 95) return { ok: false, notice: 'You are not thirsty.' };
    v.thirst = clamp(v.thirst + 35);
    removeItem(list, item.id, 1);
    if (item.tags.includes('dirty') && rnd() < 0.3) { setIllness(state, { name: 'stomach sickness', severity: 1 }); return { ok: true, consumed: true, notice: `You drink the ${item.name}. Cramps follow within hours: it was not clean.` }; }
    return { ok: true, consumed: true, notice: `You drink the ${item.name}.` };
  }
  if (item.category === 'medical') {
    if (item.tags.includes('painkiller') && !injuryId) {
      v.morale = clamp(v.morale + 8); v.fatigue = clamp(v.fatigue + 5);
      removeItem(list, item.id, 1);
      return { ok: true, consumed: true, notice: `You take the ${item.name}. The edges soften for a while.` };
    }
    if (item.tags.includes('antibiotic') && state.body.illness && !state.body.illness.treated && !injuryId) {
      state.body.illness.treated = true; removeItem(list, item.id, 1);
      return { ok: true, consumed: true, notice: `You take the ${item.name} for the ${state.body.illness.name}.` };
    }
    const target = injuryId || pickInjuryFor(state, item);
    if (!target) return { ok: false, notice: `Nothing to treat with ${item.name} right now.` };
    const res = treatInjury(state, target, item);
    if (res.ok) removeItem(list, item.id, 1);
    return { ...res, consumed: res.ok };
  }
  if (item.tags.includes('comfort')) {
    v.morale = clamp(v.morale + 6); v.warmth = clamp(v.warmth + 4);
    removeItem(list, item.id, 1);
    return { ok: true, consumed: true, notice: `You allow yourself the ${item.name}. A small, human minute.` };
  }
  return { ok: true, needsGm: true, notice: '' };
}

function pickInjuryFor(state, item) {
  const inj = state.body.injuries;
  const infected = inj.find(i => i.infected);
  if (item.tags.includes('antibiotic')) return infected?.id || null;
  const candidates = inj.filter(i => !i.treated).sort((a, b) => b.severity - a.severity);
  for (const i of candidates) { const r = treatInjury({ body: { injuries: [JSON.parse(JSON.stringify(i))] } }, i.id, item); if (r.ok) return i.id; }
  return null;
}

// ------------------------------------------------------------------ crafting
export const RECIPES = [
  { id: 'bandages', name: 'Clean bandages', needs: [{ tag: 'cloth' }, { tag: 'alcohol', keep: true }], makes: { name: 'Bandage', qty: 2, category: 'medical', tags: ['bandage'] }, minutes: 20, blurb: 'Cloth boiled or soaked in alcohol. The alcohol is not used up.' },
  { id: 'boilwater', name: 'Boil water', needs: [{ tag: 'dirty' }, { tag: 'fire', keep: true }], makes: { name: 'Clean water', qty: 1, category: 'water' }, minutes: 30, blurb: 'Dirty water plus a fire source.' },
  { id: 'splint', name: 'Splint', needs: [{ tag: 'build' }, { tag: 'cloth' }], makes: { name: 'Splint', qty: 1, category: 'medical', tags: ['splint'] }, minutes: 25, blurb: 'A straight length of something and cloth to bind it.' },
  { id: 'torch', name: 'Torch', needs: [{ tag: 'cloth' }, { tag: 'fuel' }], makes: { name: 'Torch', qty: 1, category: 'tool', tags: ['light', 'fire'] }, minutes: 10, blurb: 'Light and fire, for a while.' },
  { id: 'firebomb', name: 'Firebomb', needs: [{ tag: 'fuel' }, { tag: 'cloth' }, { tag: 'container' }], makes: { name: 'Firebomb', qty: 1, category: 'weapon', tags: ['thrown', 'fire'] }, minutes: 15, blurb: 'Fuel, a rag, a bottle. Loud and bright.' },
  { id: 'spikedclub', name: 'Spiked club', needs: [{ tag: 'build' }, { tag: 'cord' }], makes: { name: 'Spiked club', qty: 1, category: 'weapon', tags: ['melee'] }, minutes: 40, blurb: 'Ugly, heavy, works.' },
  { id: 'raincatcher', name: 'Rain catcher', needs: [{ tag: 'cloth' }, { tag: 'cord' }, { tag: 'container' }], makes: { name: 'Rain catcher', qty: 1, category: 'tool', tags: ['watercollector'] }, minutes: 45, requiresShelter: true, blurb: 'Set up at your shelter; collects water on wet days.' },
  { id: 'barricade', name: 'Barricade kit', needs: [{ tag: 'build' }, { tag: 'build' }], makes: { name: 'Barricade kit', qty: 1, category: 'material', tags: ['barricade'] }, minutes: 60, blurb: 'Two loads of building material become one fortification step.' },
  { id: 'filtermask', name: 'Improvised mask', needs: [{ tag: 'cloth' }, { tag: 'cord' }], makes: { name: 'Improvised mask', qty: 1, category: 'clothing', tags: ['protective'] }, minutes: 15, blurb: 'Better than nothing against what is in the air.' }
];

/** Which inventory items satisfy a recipe; null if it cannot be made. */
export function matchRecipe(list, recipe) {
  const used = new Set();
  const picks = [];
  for (const need of recipe.needs) {
    const item = list.find(x => !used.has(x.id) && (x.tags.includes(need.tag) || x.category === need.tag));
    if (!item) return null;
    used.add(item.id);
    picks.push({ item, keep: !!need.keep });
  }
  return picks;
}
export function availableRecipes(state) {
  return RECIPES.filter(r => (!r.requiresShelter || (state.shelter && state.shelter.locationId === state.location)) && matchRecipe(state.inventory.items, r));
}
export function craft(state, recipeId) {
  const recipe = RECIPES.find(r => r.id === recipeId);
  if (!recipe) return { ok: false, notice: 'Unknown recipe.' };
  if (recipe.requiresShelter && !(state.shelter && state.shelter.locationId === state.location)) return { ok: false, notice: 'That needs to be built at your shelter.' };
  const picks = matchRecipe(state.inventory.items, recipe);
  if (!picks) return { ok: false, notice: `Missing: ${recipe.needs.map(n => n.tag).join(', ')}.` };
  for (const p of picks) if (!p.keep) removeItem(state.inventory.items, p.item.id, 1);
  const made = addItem(state.inventory.items, recipe.makes);
  return { ok: true, notice: `Made ${recipe.makes.qty > 1 ? recipe.makes.qty + ' × ' : ''}${made.name} (${recipe.minutes} min).`, minutes: recipe.minutes };
}

// ------------------------------------------------------------- backgrounds
export const BACKGROUNDS = [
  { id: 'nurse', name: 'Nurse', skills: ['medicine'], carry: 0, blurb: 'Keeps people alive. Knows what a wound will do if it is ignored.', kit: [{ name: 'Trauma kit', category: 'medical', tags: ['bandage'], qty: 3 }, { name: 'Antibiotics', category: 'medical', tags: ['antibiotic'], qty: 2 }] },
  { id: 'mechanic', name: 'Mechanic', skills: ['mechanics'], carry: 3, blurb: 'Can make a dead thing run and a weak door hold.', kit: [{ name: 'Tool roll', category: 'tool' }, { name: 'Siphon hose', category: 'tool', tags: ['container'] }, { name: 'Scrap metal', category: 'material', qty: 2 }] },
  { id: 'teacher', name: 'Teacher', skills: ['leadership'], carry: 0, blurb: 'People listen. Groups hold together a little longer.', kit: [{ name: 'First aid kit', category: 'medical', tags: ['bandage'], qty: 2 }, { name: 'Notebook and pens', category: 'document' }] },
  { id: 'soldier', name: 'Soldier (discharged)', skills: ['combat'], carry: 6, blurb: 'Trained for this, or for something like it. Carries more, fights better.', kit: [{ name: 'Hunting knife', category: 'weapon' }, { name: 'Field dressing', category: 'medical', tags: ['bandage'], qty: 2 }, { name: 'Paracord', category: 'material', tags: ['cord'] }] },
  { id: 'teenager', name: 'Teenager', skills: ['stealth'], carry: -3, blurb: 'Small, quick, underestimated. Carries less.', kit: [{ name: 'Dead phone', category: 'electronics' }, { name: 'Energy bars', category: 'food', qty: 3 }, { name: 'Hoodie', category: 'clothing', tags: ['warm'] }] },
  { id: 'retiree', name: 'Retiree', skills: ['survival'], carry: -4, blurb: 'Has seen hard years before. Slower, patient, resourceful.', kit: [{ name: 'Heart pills', category: 'medical', tags: ['painkiller'], qty: 4 }, { name: 'Hand-crank radio', category: 'electronics', tags: ['radio'] }, { name: 'Wool blanket', category: 'clothing', tags: ['warm'] }] },
  { id: 'farmer', name: 'Farmer', skills: ['farming', 'survival'], carry: 2, blurb: 'Knows weather, animals, soil and how long food really lasts.', kit: [{ name: 'Hatchet', category: 'weapon' }, { name: 'Seed packets', category: 'misc', tags: ['seeds'] }, { name: 'Jerrycan of water', category: 'water', qty: 2 }] },
  { id: 'engineer', name: 'Radio engineer', skills: ['electronics'], carry: 0, blurb: 'Can find a voice in the static and keep a battery alive.', kit: [{ name: 'Handheld scanner', category: 'electronics', tags: ['radio'] }, { name: 'Battery pack', category: 'electronics', tags: ['battery'], qty: 2 }, { name: 'Multitool', category: 'tool' }] },
  { id: 'officer', name: 'Patrol officer', skills: ['combat', 'negotiation'], carry: 2, blurb: 'Armed, used to talking people down, used to being lied to.', kit: [{ name: 'Service pistol', category: 'weapon', tags: ['firearm'] }, { name: 'Pistol rounds', category: 'ammo', qty: 15 }, { name: 'Handcuffs', category: 'tool' }] },
  { id: 'cook', name: 'Line cook', skills: ['scavenging'], carry: 1, blurb: 'Knows every back door, pantry and walk-in in town.', kit: [{ name: "Chef's knife", category: 'weapon' }, { name: 'Canned goods', category: 'food', qty: 3 }, { name: 'Cooking pot', category: 'tool', tags: ['container'] }] },
  { id: 'courier', name: 'Bike courier', skills: ['scavenging', 'stealth'], carry: 1, blurb: 'Fast, knows the shortcuts, travels light.', kit: [{ name: 'Bolt cutters', category: 'tool' }, { name: 'Rain poncho', category: 'clothing', tags: ['warm'] }, { name: 'Protein bars', category: 'food', qty: 2 }] },
  { id: 'student', name: 'Medical student', skills: ['medicine', 'electronics'], carry: -1, blurb: 'Half-trained in two useful things and sure of neither.', kit: [{ name: 'Textbook first aid kit', category: 'medical', tags: ['bandage'], qty: 2 }, { name: 'Laptop (dead)', category: 'electronics' }] }
];
const COMMON_KIT = [{ name: 'Water bottle', category: 'water' }, { name: 'Lighter', category: 'tool', tags: ['fire'] }, { name: 'Jacket', category: 'clothing', tags: ['warm'] }, { name: 'Granola bar', category: 'food' }];

export function startingItems(backgroundId) {
  const bg = BACKGROUNDS.find(b => b.id === backgroundId) || BACKGROUNDS[0];
  const list = [];
  for (const spec of [...COMMON_KIT, ...bg.kit]) addItem(list, spec);
  return list;
}
export function backgroundSkills(backgroundId) { return (BACKGROUNDS.find(b => b.id === backgroundId) || BACKGROUNDS[0]).skills; }

/** Best weapon rating: 0 none, 1-2 melee, 3 firearm with ammo, 1.5 firearm without. */
export function weaponRating(list) {
  let best = 0;
  const ammo = list.filter(x => x.category === 'ammo').reduce((a, x) => a + x.qty, 0);
  for (const x of list) {
    if (x.category !== 'weapon') continue;
    if (x.tags.includes('firearm')) best = Math.max(best, ammo > 0 ? 3 : 1.5);
    else if (x.tags.includes('thrown')) best = Math.max(best, 2);
    else best = Math.max(best, /machete|axe|hatchet|spear|club/i.test(x.name) ? 2 : 1.3);
  }
  return best;
}
export function spendAmmo(list, n) {
  let left = n;
  for (const x of [...list]) { if (x.category !== 'ammo' || left <= 0) continue; const take = Math.min(x.qty, left); removeItem(list, x.id, take); left -= take; }
  return n - left;
}
export function clothingWarmth(list) {
  return Math.min(30, list.filter(x => x.tags.includes('warm')).reduce((a, x) => a + 12, 0));
}
export function protectionLevel(list) {
  return list.some(x => x.tags.includes('protective')) ? (list.some(x => /hazmat|suit|respirator/i.test(x.name)) ? 3 : 1.5) : 0;
}

// Generic finds, used when the code (not the GM) names what a companion brings back,
// and offered to the GM as suggestions so names stay grounded.
export const GENERIC_ITEMS = {
  food: ['Canned beans', 'Tinned fish', 'Dry pasta', 'Bag of rice', 'Crackers', 'Instant noodles', 'Canned soup', 'Peanut butter', 'Canned peaches', 'Oatmeal'],
  water: ['Bottled water', 'Water jug', 'Canteen of water', 'Sports drink'],
  medical: ['Bandages', 'Painkillers', 'Antiseptic wipes', 'Antibiotics', 'Gauze pads', 'Splint kit'],
  fuel: ['Jerrycan of fuel', 'Propane canister', 'Lamp oil', 'Lighter fluid'],
  material: ['Planks', 'Scrap metal', 'Box of nails', 'Rope', 'Tarp', 'Plastic sheeting', 'Sandbags', 'Wire spool'],
  weapon: ['Crowbar', 'Kitchen knife', 'Baseball bat', 'Hatchet', 'Hunting rifle', 'Machete'],
  ammo: ['Loose rounds', 'Box of shells'],
  tool: ['Flashlight', 'Duct tape', 'Lighter', 'Can opener', 'Multitool', 'Hand saw'],
  clothing: ['Wool coat', 'Rain poncho', 'Work gloves', 'Boots', 'Dust mask'],
  electronics: ['Batteries', 'Hand-crank radio', 'Headlamp'],
  misc: ['Playing cards', 'Candles', 'Soap', 'Fishing line']
};
export function genericItem(category, rnd = Math.random, quality = 'fair') {
  const list = GENERIC_ITEMS[category] || GENERIC_ITEMS.misc;
  const name = list[Math.floor(rnd() * list.length)];
  const qty = category === 'ammo' ? 6 + Math.floor(rnd() * 10) : quality === 'good' ? 2 : 1;
  return { name, category, qty, condition: quality === 'poor' ? 40 + Math.floor(rnd() * 30) : 70 + Math.floor(rnd() * 30) };
}
