// Help: how to survive, the command bar, and keys.

import { h, append } from '../dom.js';

export function registerHelp(app, { reg }) {
  reg({
    id: 'help', sub: 'FIELD MANUAL', title: 'Help', icon: '?', size: { w: 620, h: 540 }, x: 340, y: 40,
    render(body) {
      append(body, h('h3', {}, 'How to stay alive'),
        h('ol', { class: 'small' },
          h('li', {}, 'Water first, then food, then warmth, then sleep. The bars in Status tick down on their own; empty bars cost health.'),
          h('li', {}, 'Travel by day. Nights multiply every danger. Fog hides you and them.'),
          h('li', {}, 'Search specific places, not "around". Places run dry. Hidden things are where a sensible person would hide them.'),
          h('li', {}, 'Treat wounds. Untreated cuts fester; bites fester fast. Antibiotics clear infection.'),
          h('li', {}, 'People are the game. Feed them, consult them, keep promises. Hungry companions leave or steal. Some were never yours.'),
          h('li', {}, 'A base can be fortified and stocked, and it can be raided. A nomad is harder to find and colder at night.'),
          h('li', {}, 'Listen to the radio at odd hours. Some of it lies. The way out is in there somewhere, in pieces.'),
          h('li', {}, 'Everything that happened on day 3 is still happening on day 20. Watch the EVENT lines.'),
          h('li', {}, 'Read your Dossier first: who you are, where, when, what you own, who you know, and what the public knows. The clock and the calendar in the top bar are the only true time.'),
          h('li', {}, 'Before the collapse, live: shops, phones and taps work until the EVENT lines say they do not. Fill the bath, charge things, buy what you can while money means something.'),
          h('li', {}, 'The Radio panel exists only while you carry a radio (or sit at a shelter that holds one). A walkie-talkie is not a radio: it talks to the companions you handed its pair to, a few kilometres at most.'),
          h('li', {}, 'The deadline is when the way out closes. Miss it alive and you choose: close the record, or keep surviving with no clock. Get out, and the story can continue in a new region.'),
          h('li', {}, 'You can type anything at the SURVIVOR> prompt. The world answers in its own terms.')),
        h('h3', {}, 'Command bar'),
        h('p', { class: 'small' }, 'Type anything. The world attempts exactly what you describe, and what is impossible fails in its own way. The shortcuts below are optional conveniences that fire only when their target is real (a place you know, an item you carry, a person you have met); anything else goes to the Game Master as written. Start a line with / to force a shortcut.'),
        h('table', { class: 'small' }, h('tbody', {}, [
          ['go <place>', 'travel to a known place'], ['look', 'look around where you are'], ['search <area>', 'search a specific spot here'],
          ['rest [hours]', 'sleep (6h default)'], ['wait [hours]', 'let time pass'], ['skip', 'skip ahead to the next development'],
          ['eat <item> · drink <item> · use <item>', 'consume or use something from your pack'], ['craft <recipe>', 'make something (see Inventory)'],
          ['give <item> to <name>', 'give an item to a companion'], ['talk <name> <words>', 'speak to someone'], ['assign <name> scout|scavenge|hunt|guard [place]', 'send a companion on a task'],
          ['tune <frequency> · scan', 'work the radio (if you have one)'], ['call <words>', 'transmit on the walkie-talkie (if you have one)'], ['dossier', 'open your dossier'], ['claim · fortify · abandon', 'manage your shelter'], ['trade <words>', 'barter with whoever holds this place'],
          ['stock', 'take stock (full report)'], ['hint', 'ask for a nudge (costs morale and time)'], ['note <text>', 'add to your journal'],
          ['fight · run · hide · talk', 'during an encounter'], ['open <panel>', 'open a panel'], ['end my story', 'close the record'], ['<anything else>', 'a free action, narrated by the world']
        ].map(([c, d]) => h('tr', {}, h('td', {}, h('code', {}, c)), h('td', {}, d))))),
        h('h3', {}, 'Keys'),
        h('p', { class: 'small' }, h('kbd', {}, '/'), ' focus the command bar · ', h('kbd', {}, '1'), '–', h('kbd', {}, '4'), ' pick a choice · ', h('kbd', {}, 'Alt+1..9'), ' open panels · ', h('kbd', {}, 'Esc'), ' close the focused panel · double-click a title bar to maximize · ', h('kbd', {}, 'tile'), ' arranges windows · on the map: scroll to zoom, drag to pan, arrows to move, ', h('kbd', {}, '0'), ' to fit · click streaming text to skip the typewriter.'),
        h('p', { class: 'small muted' }, 'The Game Master is an AI model using your API key; the key never leaves your browser except to that provider. Autosave runs after every turn; five manual slots and a JSON export live in Settings.'));
    }
  });
}
