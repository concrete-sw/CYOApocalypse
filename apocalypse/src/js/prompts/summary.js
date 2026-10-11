// Prompt for the rolling summary of older turns.

export function buildSummaryPrompt({ previousSummary, turns }) {
  const transcript = turns.map(t => `${t.role === 'user' ? 'SURVIVOR / GAME' : 'GM'}: ${t.content}`).join('\n\n');
  return `You maintain a running summary of a survival role-play so the Game Master can remember older events. Update the summary below with the new turns. Keep it factual and compact (under 450 words): where the survivor went, what they found, who they met and what was said (including promises, lies and grudges), what they gave or took, fights and their cost, radio broadcasts heard, choices that will have consequences later, and anything a companion will remember. Write in the third person, past tense. Do not add commentary or speculation. Do not reveal anything the survivor has not learned.

PREVIOUS SUMMARY:
${previousSummary || '(none)'}

NEW TURNS:
${transcript}

Reply with the updated summary as plain text only.`;
}
