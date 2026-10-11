// The survivor's body: injuries by region, illness, treatment and the penalties they impose.

import { clamp, uid, pick } from './util.js';

export const REGIONS = ['head', 'neck', 'torso', 'abdomen', 'leftArm', 'rightArm', 'leftHand', 'rightHand', 'leftLeg', 'rightLeg', 'leftFoot', 'rightFoot'];
export const REGION_LABEL = {
  head: 'Head', neck: 'Neck', torso: 'Chest', abdomen: 'Abdomen', leftArm: 'Left arm', rightArm: 'Right arm', leftHand: 'Left hand', rightHand: 'Right hand',
  leftLeg: 'Left leg', rightLeg: 'Right leg', leftFoot: 'Left foot', rightFoot: 'Right foot'
};
export const INJURY_TYPES = ['cut', 'laceration', 'puncture', 'bruise', 'fracture', 'sprain', 'burn', 'bite', 'gunshot', 'frostbite'];

// Which item tags treat which injury types.
const TREATMENTS = {
  cut: ['bandage'], laceration: ['bandage'], puncture: ['bandage'], bite: ['bandage'], gunshot: ['bandage'],
  bruise: ['painkiller', 'bandage'], fracture: ['splint'], sprain: ['splint', 'bandage'], burn: ['burn', 'bandage'], frostbite: ['warm', 'bandage']
};

export function normalizeRegion(r, rnd = Math.random) {
  const s = String(r || '').toLowerCase().replace(/[^a-z]/g, '');
  if (REGIONS.map(x => x.toLowerCase()).includes(s)) return REGIONS.find(x => x.toLowerCase() === s);
  const side = /left/.test(s) ? 'left' : /right/.test(s) ? 'right' : pick(['left', 'right'], rnd);
  if (/head|face|skull|eye|ear|jaw|scalp|forehead/.test(s)) return 'head';
  if (/neck|throat/.test(s)) return 'neck';
  if (/chest|torso|rib|shoulder|back|spine/.test(s)) return 'torso';
  if (/abdomen|stomach|belly|gut|hip|side|flank/.test(s)) return 'abdomen';
  if (/hand|finger|wrist|palm/.test(s)) return `${side}Hand`;
  if (/arm|elbow|forearm|bicep/.test(s)) return `${side}Arm`;
  if (/foot|toe|ankle|heel/.test(s)) return `${side}Foot`;
  if (/leg|knee|thigh|shin|calf/.test(s)) return `${side}Leg`;
  return pick(REGIONS, rnd);
}
export function normalizeInjuryType(t) {
  const s = String(t || '').toLowerCase();
  if (INJURY_TYPES.includes(s)) return s;
  if (/cut|slash|gash|knife|blade/.test(s)) return 'cut';
  if (/lacer|tear|torn|scrape|graze/.test(s)) return 'laceration';
  if (/punct|stab|nail|splinter|arrow/.test(s)) return 'puncture';
  if (/bruis|blunt|contus|club|beat/.test(s)) return 'bruise';
  if (/fract|broke|break|crack/.test(s)) return 'fracture';
  if (/sprain|twist|strain/.test(s)) return 'sprain';
  if (/burn|scald|chemical|acid/.test(s)) return 'burn';
  if (/bite|bitten|claw|maul/.test(s)) return 'bite';
  if (/shot|bullet|gun|round/.test(s)) return 'gunshot';
  if (/frost|cold|freez/.test(s)) return 'frostbite';
  return 'bruise';
}

export function addInjury(state, spec, rnd = Math.random) {
  const injury = {
    id: uid('inj'), region: normalizeRegion(spec.region, rnd), type: normalizeInjuryType(spec.type),
    severity: clamp(Math.round(Number(spec.severity) || 1), 1, 3), treated: false, infected: false, at: state.clock.minutes, progress: 0,
    note: typeof spec.note === 'string' ? spec.note.slice(0, 120) : ''
  };
  state.body.injuries.push(injury);
  return injury;
}

export function removeInjury(state, id) {
  const i = state.body.injuries.findIndex(x => x.id === id);
  if (i >= 0) state.body.injuries.splice(i, 1);
}

export function treatmentTagsFor(injury) {
  const tags = [...(TREATMENTS[injury.type] || ['bandage'])];
  if (injury.infected) tags.unshift('antibiotic');
  return tags;
}

/** Treat an injury with an item (by its tags). Returns { ok, notice }. */
export function treatInjury(state, injuryId, item) {
  const inj = state.body.injuries.find(x => x.id === injuryId);
  if (!inj) return { ok: false, notice: 'No such injury.' };
  const tags = item?.tags || [];
  if (inj.infected && tags.includes('antibiotic')) {
    inj.infected = false; inj.treated = true;
    return { ok: true, notice: `Antibiotics for the infected ${inj.type} on the ${REGION_LABEL[inj.region].toLowerCase()}. The fever should break within a day.` };
  }
  const ok = treatmentTagsFor(inj).some(t => tags.includes(t) && t !== 'antibiotic');
  if (!ok) return { ok: false, notice: `${item?.name || 'That'} does nothing for a ${inj.type}. It needs: ${treatmentTagsFor(inj).filter(t => t !== 'antibiotic').join(' or ')}.` };
  if (inj.treated) return { ok: false, notice: 'Already treated. Give it time.' };
  inj.treated = true;
  return { ok: true, notice: `${item.name} applied to the ${inj.type} on the ${REGION_LABEL[inj.region].toLowerCase()}.` };
}

export function setIllness(state, spec) {
  if (!spec) { state.body.illness = null; return; }
  const sev = clamp(Math.round(Number(spec.severity) || 1), 1, 3);
  const cur = state.body.illness;
  if (cur && cur.name.toLowerCase() === String(spec.name || '').toLowerCase()) { cur.severity = Math.max(cur.severity, sev); return cur; }
  state.body.illness = { name: String(spec.name || 'sickness').slice(0, 60), severity: sev, treated: false, at: state.clock.minutes, nextStageAt: state.clock.minutes + 72 * 60 };
  return state.body.illness;
}

/** Highest severity per region plus infection/treatment flags, for the figure. */
export function regionStatus(state) {
  const out = {};
  for (const inj of state.body.injuries) {
    const r = out[inj.region] || (out[inj.region] = { severity: 0, infected: false, treated: true, count: 0 });
    r.severity = Math.max(r.severity, inj.severity);
    r.infected = r.infected || inj.infected;
    r.treated = r.treated && inj.treated;
    r.count++;
  }
  return out;
}

export function movementPenalty(state) {
  let p = 0;
  for (const i of state.body.injuries) if (/Leg|Foot/.test(i.region)) p += 0.15 * i.severity * (i.treated ? 0.6 : 1);
  return Math.min(0.7, p);
}
export function combatPenalty(state) {
  let p = 0;
  for (const i of state.body.injuries) if (/Arm|Hand/.test(i.region)) p += 0.1 * i.severity * (i.treated ? 0.6 : 1);
  if (state.body.injuries.some(i => i.region === 'head' && i.severity >= 2)) p += 0.15;
  return Math.min(0.6, p);
}

export function describeInjuries(state) {
  return state.body.injuries.map(i => `${i.type} (${REGION_LABEL[i.region]}, severity ${i.severity}${i.treated ? ', treated' : ', UNTREATED'}${i.infected ? ', INFECTED' : ''})`);
}

export function conditions(state) {
  const v = state.vitals; const out = [];
  if (v.health < 25) out.push('critical'); else if (v.health < 50) out.push('badly hurt');
  if (v.hunger <= 0) out.push('starving'); else if (v.hunger < 25) out.push('very hungry'); else if (v.hunger < 45) out.push('hungry');
  if (v.thirst <= 0) out.push('dehydrated'); else if (v.thirst < 25) out.push('very thirsty'); else if (v.thirst < 45) out.push('thirsty');
  if (v.fatigue <= 0) out.push('collapsing'); else if (v.fatigue < 20) out.push('exhausted'); else if (v.fatigue < 40) out.push('tired');
  if (v.warmth < 20) out.push('hypothermic'); else if (v.warmth < 35) out.push('cold'); else if (v.warmth > 90) out.push('overheating');
  if (v.morale < 20) out.push('despairing'); else if (v.morale < 40) out.push('low');
  if (state.body.injuries.some(i => i.infected)) out.push('feverish (infection)');
  if (state.body.illness) out.push(`ill: ${state.body.illness.name}`);
  const hz = state.truth?.apocalypse?.hazardName || 'Hazard';
  if (v.hazard > 80) out.push(`${hz.toLowerCase()} critical`); else if (v.hazard > 50) out.push(`${hz.toLowerCase()} high`);
  return out;
}
