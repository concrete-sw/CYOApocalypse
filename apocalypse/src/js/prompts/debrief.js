// Prompt for the final debrief, written once the game has ended and the truth may be unsealed.

export function buildDebriefPrompt({ state, stats }) {
  const t = state.truth; const e = state.ended || { kind: 'retired' };
  const kind = { death: 'The survivor DIED.', escape: 'The survivor REACHED THE TRUE WAY OUT.', deadline: 'The survivor was still alive when the deadline passed; the world moved on without an answer.', retired: 'The survivor chose to end their story here.' }[e.kind] || e.kind;
  return `You are the Game Master of a survival game that has now ENDED. Write the full debrief. You may now reveal everything in the world truth.

WORLD TRUTH (JSON):
${JSON.stringify(t)}

HOW IT ENDED: ${kind}${e.cause ? ` Cause: ${e.cause}.` : ''}
SURVIVOR: ${state.survivor.name} (${state.survivor.background}).

STATISTICS (computed by the game; treat as fact):
- Days survived: ${stats.daysSurvived} of ${stats.deadlineDay}
- Clues found (${stats.cluesFound.length} of ${stats.cluesTotal}): ${stats.cluesFound.join(' | ') || 'none'}
- Clues never found: ${stats.cluesMissed.join(' | ') || 'none'}
- False hopes pursued: ${stats.falseHopesPursued.join(' | ') || 'none recorded'}
- Companions: ${stats.companions.map(c => `${c.name} (${c.status}, loyalty ${c.loyalty})`).join(', ') || 'none'}
- Factions known: ${stats.factions.map(f => `${f.name} (${f.standing})`).join(', ') || 'none'}
- Places visited: ${stats.locationsVisited} of ${stats.locationsTotal}; hidden things found: ${stats.hiddenFound} of ${stats.hiddenTotal}
- Encounters: ${stats.encounters}, fights won: ${stats.kills}, nights without shelter: ${stats.nightsOutside}, hints taken: ${stats.hints}
- Shelter at the end: ${stats.shelter || 'none (nomad)'}
- Flags set during play: ${stats.flags.join(', ') || 'none'}
- Facts recorded: ${stats.facts}

SUMMARY OF PLAY:
${state.summary || '(short game; see the recent log)'}

RECENT LOG (most recent last):
${state.log.slice(-30).map(l => `[Day ${Math.floor(l.at / 1440)}] ${l.speaker || l.kind}: ${String(l.text).slice(0, 400)}`).join('\n')}

Write the debrief as JSON with exactly these keys:
{
  "epitaph": "two or three sentences on how this person lived and what their choices cost and saved; honest, not cruel, not sentimental",
  "verdict": "the Game Master's spoken verdict on the run, 3-6 sentences, referencing specific things the survivor actually did",
  "whatReallyHappened": "the full hidden story: the true cause, who knew, what the factions were really doing, what the way out was and when it was open, and how the world's timeline unfolded. 200-350 words.",
  "gotRight": ["specific good calls the survivor made, with what they led to"],
  "missed": ["specific things never found or never understood: clues, people, places, the window, and what they would have changed"],
  "falseHopes": ["each false hope: what it promised, who spread it, what it really was, and whether the survivor fell for it"],
  "companionFates": ["each companion met: what became of them and why, including betrayals and their triggers"],
  "regionAfter": "one paragraph: what becomes of the region and its factions after the story ends",
  "ifYouHad": "one paragraph: the single most consequential alternative path, told as 'if you had...'"
}
Reply with the JSON object only.`;
}
