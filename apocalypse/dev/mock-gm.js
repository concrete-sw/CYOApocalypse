// Offline mock Game Master. Speaks the OpenAI chat-completions protocol with
// SSE streaming so the whole game can be exercised end to end without an API key.
//
//   node apocalypse/dev/mock-gm.js            # listens on http://localhost:8787/v1
//
// In the game pick provider "Custom (OpenAI-compatible)", base URL
// http://localhost:8787/v1, any key. The mock serves the sample world and
// scripted replies keyed on the game's ACTION tags. It is for development and
// UI testing, not for play.

import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const sampleWorld = readFileSync(path.join(here, 'sample-world.json'), 'utf8');
const PORT = Number(process.env.PORT || 8787);

const J = (narrative, extra = {}) => JSON.stringify({ narrative, speaker: 'narrator', choices: [], timeMinutes: 0, changes: {}, ...extra });

function words(text) { const m = text.match(/Survivor(?: says)?:\s*"?([^"\n]*)"?/); return m ? m[1] : ''; }

// MOCK_TRUNCATE=1 makes the world reply stop early with finish_reason "length"
// and serves the remainder (with a small repeated overlap) on the continuation
// request, to exercise the game's continue-and-stitch path.
const TRUNCATE = process.env.MOCK_TRUNCATE === '1';
const CUT = Math.floor(sampleWorld.length * 0.6);

function reply(text, msgs) {
  if (text.includes('Reply with the single word READY')) return 'READY';
  if (text.includes('Continue EXACTLY from where it stopped')) {
    const partial = [...msgs].reverse().find(m => m.role === 'assistant')?.content || '';
    return { text: sampleWorld.slice(Math.max(0, partial.length - 24)), finish: 'stop' };
  }
  if (text.includes('designing the hidden ground truth')) return TRUNCATE ? { text: sampleWorld.slice(0, CUT), finish: 'length' } : sampleWorld;
  if (text.includes('survival game that has now ENDED')) {
    return JSON.stringify({
      epitaph: 'They kept moving when staying would have been easier, and they listened when the radio told the truth.',
      verdict: 'A fair run. You found the nurse, you fed her, and you did not go to the fairgrounds. The cove was always the way; you got there with diesel in hand.',
      whatReallyHappened: 'Harrow fever was Meridian\'s sterilising agent, loose since late September. The convoy collected the sick; the Wardens sold the rest. The Marit left Dunmore Cove while the cutters were north.',
      gotRight: ['Recruited Maya Okonkwo and kept her fed.', 'Stayed away from the fairgrounds.'],
      missed: ['Never read Dr. Osei\'s notes on the fourth floor.', 'Never heard the survivor net at night.'],
      falseHopes: ['The convoy: a collection run. You did not report.', 'Blackwater: a camp with a sick pastor. It burned on day 24.'],
      companionFates: ['Maya Okonkwo: with you to the end.', 'Rico Delgado: never met.'],
      regionAfter: 'The Reach burned block by block. The capital never came back for it.',
      ifYouHad: 'If you had gone to the fairgrounds on day 15, you would have been sorted and never seen again.'
    });
  }
  if (text.includes('running summary')) return 'The survivor woke on Day 0, saw the outbreak begin, reached the pharmacy and met Maya Okonkwo, who joined them.';

  const w = words(text);
  const events = text.includes('[EVENTS SINCE THE LAST TURN') ? 'Word comes of something changing in the Reach. ' : '';
  const encounterBegins = /ENCOUNTER BEGINS/.test(text);
  const encounterTail = encounterBegins ? '\n\nThen figures step out of the rain ahead of you, and everything stops. [What do you do?]' : '';

  if (text.includes('[PROLOGUE: OPENING]')) return J('Rain on the fire escape. The neighbour\'s television is too loud again. You make coffee with the last of the milk and read a text about a sick coworker.\n\nOn the stairs the building manager is taping up a notice about the water. Outside, the pharmacy has a line.', { choices: ['Go down to the pharmacy', 'Check on the neighbour in 3B', 'Turn on the radio'] });
  if (text.includes('[PROLOGUE: ORDINARY ACTION]')) return J(`You ${w.toLowerCase() || 'go about the morning'}. Nothing is wrong, exactly. A helicopter passes low over the port, heading inland, which it never does.`, { choices: ['Go down to the pharmacy', 'Call your sister', 'Pack a bag, just in case'] });
  if (text.includes('[PROLOGUE: THE MOMENT]')) return J(`You ${w.toLowerCase() || 'head out'}, and at the corner of Harrow and Third a city bus stops in the middle of the intersection and does not move. The driver is slumped against the glass, coughing blood. Someone runs. Then everyone runs.\n\nA Guard truck comes up Third with a loudspeaker. The pharmacy window gives way under the crowd. A woman from the second floor falls and does not get up. Your phone buzzes once and loses signal.\n\nBy dark the streets are empty, then full of people carrying things.`, { choices: ['Run home and lock the door', 'Help the woman who fell', 'Grab what you can from the pharmacy'], changes: { vitals: { morale: -10 } } });
  if (text.includes('[NEW SURVIVOR]')) return J('You have been surviving in the Reach since the start. Today you stand in the rain and decide to move.', { choices: ['Search the apartments', 'Head for the pharmacy'] });

  if (/\[ACTION: TRAVEL to location=loc2/.test(text)) return J(`${events}The pharmacy's front window is gone and the shelves are swept half bare. Glass crunches under your boots. A steel door at the back opens a crack and a woman with a nurse's watch looks you over.\n\n"If you're sick, stay there. If you're hurt, come in. If you're neither, say what you want."${encounterTail}`, encounterBegins ? {} : { choices: ['Talk to Maya', 'Search the pharmacy counter', 'Search the back office'], changes: { companionsMet: ['n1'], factsLearned: ['A nurse named Maya Okonkwo is holed up in the pharmacy back office.'] } });
  if (/\[ACTION: TRAVEL to location=loc8/.test(text)) return J(`${events}The goat path drops to a shingle cove under a rock overhang. A smokehouse, a freshwater seep, bootprints on the stones. Under the overhang, out of sight of the water, a fishing boat rides at a single line.${encounterTail}`, encounterBegins ? {} : { choices: ['Call out to the boat', 'Wait and watch', 'Look under the overhang'], changes: { companionsMet: ['n4'] } });
  if (/\[ACTION: TRAVEL/.test(text)) { const m = text.match(/\("([^"]+)"\)/); return J(`${events}You reach ${m ? m[1] : 'the place'} with the light going. It is quieter than it should be.${encounterTail}`, encounterBegins ? {} : { choices: ['Look around', 'Search the obvious places', 'Keep moving'] }); }
  if (/\[ACTION: LOOK AROUND/.test(text)) return J(`${events}You take it in: the doors, the windows, who has been here before you and what they left.`, { choices: ['Search the nearest building', 'Move on'] });
  if (/\[ACTION: SEARCH/.test(text)) {
    if (/SCAVENGE RESULT \(decided by the game\): NOTHING/.test(text)) return J(`${events}You search ${(text.match(/area="([^"]+)"/) || [])[1] || 'the place'} and find nothing you can use. Someone was here first.${text.includes('HIDDEN FIND') ? '\n\nBut under the mess your hand finds something that was not meant to be found.' : ''}${encounterTail}`, encounterBegins ? {} : { choices: ['Try another spot', 'Move on'] });
    const cats = ((text.match(/categories: ([^.]+)\./) || [])[1] || '').split(',').map(s => s.trim()).filter(Boolean);
    const sugg = ((text.match(/suggestions: ([^)]+)\)/) || [])[1] || '').split(';').map(s => s.trim()).filter(Boolean);
    const items = cats.map((c, i) => ({ name: sugg[i] || `Found ${c}`, qty: 1, category: c }));
    return J(`${events}You work through ${(text.match(/area="([^"]+)"/) || [])[1] || 'the place'} methodically. ${items.length ? `You come away with ${items.map(x => x.name.toLowerCase()).join(' and ')}.` : ''}${text.includes('HIDDEN FIND') ? '\n\nAnd something else, where a careful person would hide it.' : ''}${encounterTail}`, encounterBegins ? { changes: { itemsGained: items } } : { changes: { itemsGained: items }, choices: ['Search somewhere else here', 'Move on'] });
  }
  if (/\[ACTION: TALK to npc=(\w+)/.test(text)) {
    const id = text.match(/\[ACTION: TALK to npc=(\w+)/)[1];
    const joins = /join|come with|with me|together|travel with/i.test(w);
    if (id === 'n1') return J(joins ? '[She looks at the door, then at you.] "Fine. But I\'m not leaving the insulin behind, and if someone\'s sick we stop. Deal?" She shoulders a bag that is mostly bandages.' : `"${w.length > 40 ? 'That\'s a lot of questions.' : 'Mm.'}" Maya Okonkwo does not stop sorting pill bottles. "Ask me something useful. Where\'s the water. Who\'s bleeding."`, { speaker: 'npc:n1', choices: ['Ask her to come with you', 'Ask about the hospital', 'Ask what she needs'], changes: joins ? { companionsRecruited: ['n1'], npcMood: { n1: 'hopeful' }, loyaltyDelta: { n1: 2 } } : { loyaltyDelta: { n1: 1 } } });
    if (id === 'n4') return J('"Copy." Annie Kolar does not look up from the engine. "You bring diesel, you don\'t lie to me, you don\'t talk about the cove. Then we\'ll see." She tells you the Marit can cross with two cans, from here, not the marina.', { speaker: 'npc:n4', choices: ['Offer her the diesel', 'Ask about the blockade'], changes: { cluesFound: ['c3'], flags: /diesel|help|trust|honest|truth/i.test(w) ? ['annie_trusts_you'] : [] } });
    return J('They listen, and answer carefully, and give nothing away they do not have to.', { speaker: `npc:${id}`, choices: ['Press them', 'Let it go'] });
  }
  if (/\[ACTION: GIVE/.test(text)) return J('"Huh." A pause. "Thank you." It is said like it costs something.', { speaker: 'npc:n1' });
  if (/\[ACTION: RADIO (TUNE|SCAN)/.test(text)) {
    const m = text.match(/"""([\s\S]*?)"""/);
    if (m) return J(`[static, then a voice, flat and looped] "${m[1]}" [static]`, { speaker: 'radio', changes: /eighteenth|the cove, not the harbour/.test(m[1]) ? { cluesFound: ['c4'] } : {} });
    if (/carrier or dead air/.test(text)) return J('[a carrier hum, no voice; something keys up here at other hours]', { speaker: 'radio' });
    return J('[static. nothing. the sea in a shell]', { speaker: 'radio' });
  }
  if (/\[ACTION: REST/.test(text)) return J(`${events}You sleep badly and wake stiff. Rain again.${encounterTail}`, encounterBegins ? {} : { choices: ['Eat something', 'Check the radio', 'Get moving'] });
  if (/\[ACTION: WAIT/.test(text)) return J(`${events}Time passes. The light changes. Nothing comes.`, { choices: ['Keep waiting', 'Move'] });
  if (/\[ACTION: SKIP AHEAD/.test(text)) return J(`${events}The hours go by in small tasks: water, watch, the radio hiss. The body keeps its own count.`, { choices: ['Eat', 'Check the map', 'Listen to the radio'] });
  if (/\[ACTION: CLAIM SHELTER/.test(text)) return J(/NOT POSSIBLE/.test(text) ? 'No. Not here.' : 'You drag the shelves across the broken window and wedge the back door. It is not much. It is yours.', { choices: ['Fortify it', 'Sort the stores', 'Rest'] });
  if (/\[ACTION: FORTIFY/.test(text)) return J(/NOT POSSIBLE/.test(text) ? 'You have nothing to build with.' : 'Three hours of hammering that everyone for a block can hear. The door will hold now.', { choices: ['Rest', 'Go scavenging for more material'] });
  if (/\[ACTION: ABANDON/.test(text)) return J('You leave it the way you found it, more or less.', { choices: ['Move on'] });
  if (/\[ACTION: ASSIGN/.test(text)) return J(/REFUSED|NOT POSSIBLE/.test(text) ? '"No." That is the whole answer.' : '[A nod.] "Back by dark." And then the door, and the rain.', { speaker: 'npc:n1', choices: ['Wait for them', 'Get on with your own work'] });
  if (/\[ACTION: HINT REQUESTED\]/.test(text)) return J('You think about the harbourmaster\'s office, and the papers nobody has bothered to loot. People loot food. They do not loot schedules.', { changes: { hintGiven: true }, choices: ['Head for the marina', 'Think about something else'] });
  if (/\[ACTION: TRADE/.test(text)) return J('"Show us what you\'ve got." They take their time. In the end a deal is struck, badly for you.', { speaker: 'faction:f1', changes: { factionsMet: ['f1'], factionDelta: { f1: 3 } }, choices: ['Walk away', 'Ask about the convoy'] });
  if (/\[ACTION: USE/.test(text)) return J('You try it. It does roughly what you hoped.', { choices: ['Carry on'] });
  if (/\[ACTION: END MY STORY\]/.test(text)) return J('You sit down on the shingle and watch the grey water for a long time. The radio hisses. Somewhere north, the cutters are moving. You are done moving.');
  if (/\[ENCOUNTER RESOLVED BY THE GAME\]/.test(text)) return J(`${events}It is over quickly, the way these things are. ${(text.match(/outcome: ([A-Z_ ]+)\./) || [])[1] ? `It went: ${text.match(/outcome: ([A-Z_ ]+)\./)[1].toLowerCase()}.` : ''} You get your breath back and check yourself over.`, { choices: ['Keep going', 'Find somewhere to hide', 'Check your wounds'] });
  if (/ENDING CONDITIONS ARE MET/.test(text) && /boat|marit|sail|leave|cove|cross|go/i.test(w)) return J('The old engine catches on the third try. The overhang slides away behind you, then the point, then the whole grey coast of the Reach, and ahead there is nothing where the cutters used to be.', { changes: { escape: true } });
  if (/DEATH POSSIBLE THIS TURN: yes/.test(text) && /jump off the roof|walk into the horde/i.test(w)) return J('There is a moment of air, and then there is nothing.', { changes: { death: { cause: 'A fall' } } });
  if (/\[ACTION: (CHOICE|FREE)\]/.test(text)) return J(`${events}You ${w.toLowerCase().replace(/^i\s+/, '') || 'act'}. The world takes note and gives a little, grudgingly.${encounterTail}`, encounterBegins ? {} : { timeMinutes: 20, choices: ['Look around', 'Check the radio', 'Take stock and rest'] });
  return J(`${events}(mock GM) Noted. The rain keeps falling.`, { choices: ['Look around', 'Move on'] });
}

const server = http.createServer((req, res) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (req.method !== 'POST' || !req.url.endsWith('/chat/completions')) { res.writeHead(404, cors); return res.end('not found'); }
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    let msgs = [];
    try { msgs = JSON.parse(body).messages || []; } catch { /* ignore */ }
    const last = [...msgs].reverse().find(m => m.role === 'user')?.content || '';
    const out = reply(typeof last === 'string' ? last : JSON.stringify(last), msgs);
    const text = typeof out === 'string' ? out : out.text;
    const finish = typeof out === 'string' ? 'stop' : out.finish;
    res.writeHead(200, { ...cors, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    const chunks = text.match(/[\s\S]{1,80}/g) || [];
    let i = 0;
    const tick = () => {
      if (i < chunks.length) { res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: chunks[i++] } }] })}\n\n`); setTimeout(tick, 2); }
      else { res.write(`data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finish }] })}\n\n`); res.write('data: [DONE]\n\n'); res.end(); }
    };
    tick();
  });
});
server.listen(PORT, () => console.log(`mock GM listening on http://localhost:${PORT}/v1`));
