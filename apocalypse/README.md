# Choose Your Apocalypse

A single-player, text-driven survival game that runs entirely in your browser.
You choose how the world ends, create a survivor, and live through it day by
day: scavenging, sheltering, travelling, meeting and recruiting other
survivors, making hard choices, and trying to reach whatever way out the world
offers before the deadline. An AI model, connected with **your own API key**, is
the Game Master: it narrates, voices every other person, works the radio, and
plays the factions. The interface is an emergency-operations terminal.

Everything is fictional: the regions, the people, the organisations and the
insignia are invented, by the game or by the AI at the start of each run.

## Quick start (no tools needed)

1. Download the project: on GitHub click the green **Code** button, then
   **Download ZIP**, and unzip it anywhere.
2. Open the `apocalypse` folder and **double-click `index.html`**. It opens in
   your browser. Press any key to skip the boot screen.
3. On the logon screen pick your AI provider, paste your API key (see the
   table below for where to get one), click **Test connection**, then
   **Establish uplink**.
4. Name your survivor, pick a background (or write your own), say where you
   live (or leave it blank), pick the apocalypse, when your story starts,
   difficulty and length, and click **Begin**. Building the world takes
   between thirty seconds and a couple of minutes. Read the dossier that opens
   the log: it says who you are, what day it is, what you own, who you know and
   what, if anything, is going on.

That is all. `index.html` is a single self-contained file: no install, no
server, no build. It works in current Chrome, Edge, Firefox and Safari, on a
laptop or a tablet. Your key is stored only in your browser (if you tick
"remember") and is sent only to the provider you pick.

## Getting an API key and connecting it

| Provider | Where to get a key | Notes |
| --- | --- | --- |
| Anthropic (Claude) | <https://console.anthropic.com/settings/keys> | Direct browser calls supported. Default `claude-sonnet-5-5`; thinking runs at low effort for turns and medium for building the world. |
| OpenAI | <https://platform.openai.com/api-keys> | Default `gpt-4.1`. Reasoning models (`gpt-5`, `o4-mini`) work too. |
| Google Gemini | <https://aistudio.google.com/apikey> | Free tier available. Default `gemini-2.5-flash` (thinking off for speed); `gemini-2.5-pro` thinks and is slower. |
| DeepSeek | <https://platform.deepseek.com/api_keys> | Default `deepseek-chat`. Output is capped at 8k tokens; a cut-off world is continued in a second call. |
| xAI (Grok) | <https://console.x.ai/> | Default `grok-4`. |
| Groq | <https://console.groq.com/keys> | Fast open-weight models. |
| Mistral | <https://console.mistral.ai/api-keys/> | |
| Ollama (local) | <https://ollama.com/> | No key. Start with `OLLAMA_ORIGINS="*" ollama serve`. |
| Custom | | Any OpenAI-compatible `/chat/completions` endpoint with SSE streaming. Set the base URL. |

**CORS.** The game calls the provider straight from your browser. Anthropic,
OpenAI, Gemini, DeepSeek, xAI, Groq and Mistral allow this. If a provider
rejects browser calls (the browser console shows a CORS error), run a small
proxy that adds the `Access-Control-Allow-Origin` header and point the
**Custom** provider at it.

**Cost and model choice.** Building the world is one large call (roughly 7 to
10k output tokens; if the model's output limit cuts it off, the game asks it to
continue and stitches the halves). Each turn sends the whole hidden world plus
your state, so a standard game is several thousand input tokens per turn; the
world rides in the system prompt so providers with prefix caching (Anthropic,
OpenAI, DeepSeek, Gemini) charge most of it at the cached rate. A fast mid-tier
model (Sonnet, Flash, DeepSeek, GPT-4.1) is a fine Game Master; larger models
write better people. Small open-weight models (8B local models, most free-tier
Groq models) rarely manage the long world JSON and will fail to build a world
or fall back to plain text often.

**"Could not build the world: ... not parseable JSON".** The model's reply
did not parse after three tries. Usually the output was cut off (pick a model
with a larger output limit, or a short game) or the model is too small to
write a long, strict JSON document (pick a stronger one). The raw reply is
printed to the browser console (F12) and kept at `window.cyoa.lastRawWorld`
so you can see what came back.

## How it works

The **code owns the game state; the AI narrates and role-plays inside it.**

1. **World generation.** One AI call produces a hidden *world truth* as JSON:
   the apocalypse and its real cause (which may differ from what people
   believe), a day-by-day escalation timeline with events you cannot see yet
   (each with the hour it happens and which utilities it takes down), 8 to 12
   locations with danger, resources, shelter quality and hidden things, 2 or 3
   factions with goals and secrets, 6 to 8 survivors you can meet (each with a
   voice, a secret, a loyalty tendency, a breaking point and whether and how
   they will betray you; at least one of them is someone from your own life),
   your own life before it all (job, routine, home, the people around you),
   the hostile force and its weaknesses, the true way out with its day window
   and requirements, at least 3 clues that reveal it, 2 or 3 false hopes, a
   calendar date, and a deadline. Every world is drawn from a different seed:
   a variant of the apocalypse (an AI that stops deliveries is not the one that
   locks the city down), how you first notice, what kind of place you live in,
   the tone, and how the authorities behave, so two games of the same kind do
   not tell the same story. The JSON is validated (`src/js/engine/schema.js`)
   and regenerated with the errors fed back if it is not playable; any day
   number or clock time the model writes inside an event is stripped and the
   hour it named becomes the event's real hour, so the game clock and the
   story never disagree.
2. **Every GM turn** sends the GM system prompt, the truth, your current state
   (vitals, injuries, inventory, companions with mood and loyalty and what they
   said, location, day and weather, factions, facts, clues, flags), a rolling
   summary of older turns, and the recent turns.
3. **The GM replies in JSON**: narrative first (so it streams through the
   typewriter), then state changes (vitals, items, injuries, companions met or
   recruited or lost, mood and loyalty, faction standing, locations revealed,
   facts, clues, flags, threat) and two to four suggested choices. The code
   validates every id against the truth before applying anything. Malformed
   JSON is retried once, then shown as plain text with no state change.
4. **The code runs the survival math.** Hunger, thirst, fatigue, warmth and
   the apocalypse-specific hazard meter tick on the clock; health drops when
   they bottom out. Day and night, weather, the calendar and the deadline
   advance. Power, water, phones and the internet are up until a timeline
   event takes them down; while the tap runs you drink from it, while the
   fridge is cold your food keeps, and at home with a stocked pantry you eat
   when you are hungry without being told to. Travel time (faster with the car
   or the bike while you still have them), encounter risk, combat and escape,
   scavenging yields, radio reception, walkie-talkie range, companion upkeep,
   assignments and betrayals, shelter raids and fuel are all decided by code;
   the GM is told the result and narrates it. The GM is also told the exact
   day, date and time with every action and every event, and is forbidden to
   state any other.
5. **The truth is never shown** until the game ends (death, deadline, the way
   out, or you choose to end it). Then the debrief unseals everything: what was
   really going on, the full hidden timeline, what you got right, what you
   missed, which hopes were false, and what became of everyone.

The GM rules (stay in character, never reveal, never contradict, fair play,
companions with memories and opinions, factions with their own arcs, radio that
sometimes lies, hints that cost, consequences that bite later) live in
`src/js/prompts/gmSystem.js`. Read it; it is the heart of the game.

## Starting your story

**When it starts** is yours to choose. *Before it begins* (the default) gives
you a few ordinary days: a job, a home with food in the fridge, running water,
a working phone, people who know you, and small wrong things that you will
only understand later. *The day it begins* opens on the morning of the
inciting event. *About a week in* and *Weeks in* drop you into a collapse that
is already old news, with a scavenger's pack, a thinned-out home, the history
of what has happened on your dossier, and the grid most likely gone.

**Who you are**: pick a background, or choose *Write your own* and describe
your job, age, health, family and habits in a few lines; the world builder
picks your skills and possessions from it and builds your street, your
workplace and the people in your life around it. **Where you live** can be a
real place ("Lisbon, Portugal", "a farm outside Bozeman, Montana"); the
region is set there with invented streets and people.

**Length** sets the deadline: the day the way out of the region closes for
good. Reaching it alive is not the goal; getting out is. If you are still
standing when the deadline passes you choose between closing the record
(the debrief unseals the truth) and keeping on with no clock: the world then
goes on, and when its scripted events run out the GM writes the next weeks of
history for it. *Open-ended* games have no deadline from the start.

## Playing

- **Dossier**: who you are, the date and time, where you live, what you own
  and what is at home, the people in your life, which utilities still work,
  what the public knows so far, and what the record is for. It opens the log
  and lives in its own panel. Everything in it is built by the code from the
  world, never improvised.
- **Log**: the narrative, world events, the situation report, and the choice
  buttons. The choices are suggestions, not a menu: type anything at the
  `SURVIVOR>` prompt and the world attempts exactly what you describe, in
  your words, speech included. The GM decides what is possible and what it
  costs. A handful of shortcuts (`map`, `inventory`, `rest 4 hours`, `go to
  the marina`, `tune 162.4`, `save`) fire only when their target is real;
  anything else goes to the GM untouched. Start a line with `/` to force a
  shortcut.
- **Status**: vitals as bars, conditions, the body diagram (regions tint by
  injury, pulse when infected, dash when treated), injuries with treatment
  buttons, illness, the clock, the alert level, and tasks resolving later.
- **Inventory**: items with weight and condition. Eat, drink, treat, give,
  drop, store at your shelter, and craft (bandages, boiled water, splints,
  torches, firebombs, barricade kits, a rain catcher, a mask).
- **Companions**: profiles, skills, mood, loyalty, everything they have said.
  Talk freely, give items, send them to scout, scavenge, hunt or stand guard.
  They eat from your stores every day. They remember.
- **Map**: known locations plotted by position; scroll or pinch to zoom, drag
  to pan, arrow keys to move, `0` to fit. Travel (shows time and risk), look
  around, search specific areas, claim a shelter, trade with whoever holds
  the place, recover a cache.
- **Shelter**: base or nomad. Defense, noise, stash, fortify, abandon. Bases
  can be raided at night; nomads are colder and rest worse.
- **Radio**: exists only while you carry a radio (or sit at a shelter that
  holds one): take the kitchen radio from home, find one, or trade for it.
  Tune a frequency or scan. Broadcasts keep schedules; some lie. The way out
  is in there, in pieces. A **walkie-talkie** is separate gear: hand the
  paired unit to a companion and you can call them from a few kilometres
  away, and anyone else listening nearby may answer.
- **Journal**: clues and facts logged automatically, world events you have
  witnessed, your own notes.
- **Factions**: who holds what, how they see you, what they trade and want.
- **Settings**: four themes (green, amber, cold blue, red blackout),
  typewriter speed, reduce motion, scanlines, noise, contrast, five save slots,
  export and import as JSON, and "End my story".
- **Clock**: the top bar carries the day, the calendar date and the time.
  Time of day matters. Nights multiply danger. The deadline counts down (or
  reads OPEN-ENDED, or NO CLOCK once you have chosen to go on past it) and the
  alert chip changes colour as the world worsens.
- **Debrief**: the outcome, a rating, the epitaph, the hidden story, the
  timeline, the people, the factions, and what comes next: after getting out,
  **Continue the story** builds a new region of the same world around your
  arrival, with your pack and whoever came with you (chapter two); or continue
  as a new survivor in the same region, where everything you used up, built
  or broke persists.

Difficulty (Survivor, Hardened, Nightmare) changes how fast the clocks run,
how much there is to find, how hostile strangers are, and how many companions
will betray you. Length runs from 7 days to a year, any number in between,
or open-ended.

Keyboard: `/` focuses the command bar, `1` to `4` pick a choice, `Alt+1..9`
opens panels, `Esc` closes the focused panel, `Tab` moves through everything,
and clicking streaming text skips the typewriter. Windows remember where you
put them; double-click a title bar to maximize, and the Tile button arranges
every open window. The live vitals strip at the bottom shows your numbers
without opening Status. The Help panel lists the shortcuts.

## Adding a provider

All adapters live in `src/js/providers/` and share one interface:

```js
{
  id, name, defaultModel, models, keyUrl, notes, defaultBaseUrl, allowCustomBaseUrl,
  async *stream({ apiKey, model, system, messages, json, maxTokens, temperature, baseUrl, signal })
  // yields text chunks
}
```

- **OpenAI-compatible endpoint**: add one `makeOpenAICompatible({...})` entry to
  the `PROVIDERS` array in `src/js/providers/index.js`, then rebuild. That is all.
- **Different protocol**: copy `src/js/providers/gemini.js` or `anthropic.js`,
  implement `stream()` (use `readSSE` and `throwForStatus` from `sse.js`), and
  add the object to `PROVIDERS`.

`messages` is `[{ role: 'user' | 'assistant', content }]`; `system` is a
string; when `json` is true ask the API for a JSON object if it supports that.

## Project layout

```
apocalypse/
  index.html              BUILT single-file game (double-click this). Do not edit by hand.
  src/index.html          source page (ES modules; needs a local server to run)
  src/css/style.css       terminal theme, themes, windows, body figure, map, responsive rules
  src/assets/insignia.svg original fictional insignia (also inlined in the page)
  src/js/main.js          entry point
  src/js/providers/       AI provider adapters and registry
  src/js/prompts/         GM system prompt, world generation, timeline extension, debrief, summary
  src/js/engine/          schema, world generator, state, clock, calendar and weather, survival math,
                          body, inventory and crafting, companions, factions, shelter, radio and
                          walkie-talkies, encounters, GM turn loop, briefing (the dossier), ending, storage
  src/js/ui/              app controller, window manager, panels, body figure, map, typewriter
  dev/build.js            bundles src/ into index.html
  dev/mock-gm.js          offline mock GM for UI testing, with dev/sample-world.json
  dev/engine-check.mjs    engine smoke test (no browser, no key)
  dev/provider-check.mjs  provider layer test against the mock, including cut-off replies
  dev/playthrough.mjs     Playwright playthrough of the built file over file://
```

## Developing

Edit the files under `src/`, then rebuild the single-file version:

```bash
node apocalypse/dev/build.js
```

Browsers refuse to load ES modules from `file://`, so the bundler wraps each
module in a function and inlines them all, plus the stylesheet, as one classic
script. Commit the rebuilt `index.html` with your source changes so the
double-click version stays current.

While developing you can also serve `src/` directly so changes show without a
rebuild (ES modules need a server):

```bash
cd apocalypse/src && python3 -m http.server 8080   # then open http://localhost:8080
```

## Testing without spending tokens

`dev/mock-gm.js` is a tiny OpenAI-compatible server that returns the sample
world and scripted replies:

```bash
node apocalypse/dev/mock-gm.js        # http://localhost:8787/v1
```

In the game choose **Custom**, base URL `http://localhost:8787/v1`, any key.
It exercises every panel and state transition; it is not a game.

Three automated checks:

```bash
node apocalypse/dev/engine-check.mjs     # the code-owned systems and the tolerant JSON parser, in Node
node apocalypse/dev/provider-check.mjs   # streaming, finish reasons, and a cut-off world being continued and stitched
node apocalypse/dev/build.js && node apocalypse/dev/playthrough.mjs   # full UI playthrough with Playwright
```

Start the mock with `MOCK_TRUNCATE=1` to have it cut the world reply short
the way a model with a small output limit does; the game then asks for the
rest and stitches the halves together.

The playthrough needs Playwright with Chromium (`npm i -g playwright && npx
playwright install chromium`). It opens the built `index.html` over `file://`,
plays through the dossier, the prologue, travel, a companion, inventory, the
radio appearing when a radio is picked up, a walkie-talkie call, shelter, save
and load, tablet width, the deadline passing and the record staying open, the
timeline being extended, the way out, a second chapter, and the debrief, and
fails on any console error.

## Content notes

The GM is instructed to keep violence restrained, to use only invented people
and organisations, and to redirect out-of-character or rule-breaking requests
in character. The provider's own safety systems still apply. This is a work of
fiction for entertainment; nothing in it is survival, medical or emergency
advice.
