// Generates and validates the hidden world truth. A reply cut off at the
// model's output limit is continued in a follow-up call and stitched together;
// invalid worlds are regenerated with the validation errors fed back.

import { buildWorldGenerationPrompt } from '../prompts/worldGeneration.js';
import { validateWorld, normalizeWorld, deepClean } from './schema.js';
import { extractJSON, looksTruncated } from './json.js';
import { completeWithMeta } from '../providers/index.js';

const MAX_CONTINUATIONS = 2;

export async function generateWorld({ provider, apiKey, model, baseUrl, settings, survivor, onProgress, maxAttempts = 3, signal }) {
  const prompt = buildWorldGenerationPrompt({ ...settings, survivor });
  const system = 'You are a meticulous designer of survival-fiction worlds who outputs only valid JSON: no markdown fences, no commentary, no comments inside the JSON.';
  let lastProblems = [];
  let lastText = '';
  let truncated = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    onProgress?.(`Building the world (attempt ${attempt} of ${maxAttempts})...`, 0);
    const messages = [{ role: 'user', content: prompt }];
    if (attempt > 1 && lastProblems.length) {
      messages[0].content += `\n\nYOUR PREVIOUS ATTEMPT FAILED VALIDATION. Fix every problem below and output the complete corrected JSON:\n- ${lastProblems.join('\n- ')}`;
    }
    let chars = 0;
    try {
      const opts = { apiKey, model, baseUrl, json: true, maxTokens: 32000, temperature: 0.9, effort: 'medium', signal, system };
      let { text, finishReason } = await completeWithMeta(provider, { ...opts, messages }, (chunk, t) => { chars = t.length; onProgress?.(`Building the world (attempt ${attempt})... ${chars} chars`, chars); });
      if (finishReason === 'refusal') throw new Error('The model declined to write this world. Try another apocalypse or model.');
      // Continue a reply that stopped at the output limit.
      for (let c = 0; c < MAX_CONTINUATIONS && (finishReason === 'length' || (finishReason == null && looksTruncated(text))); c++) {
        onProgress?.(`The reply was cut off at ${chars} chars; asking the model to continue (${c + 1} of ${MAX_CONTINUATIONS})...`, chars);
        const cont = await completeWithMeta(provider, {
          ...opts, json: false,
          messages: [...messages, { role: 'assistant', content: text }, { role: 'user', content: 'Your output was cut off before the JSON ended. Continue EXACTLY from where it stopped, starting with the very next character. Output only the remaining JSON: do not repeat anything already written, do not restart the object, no fences, no commentary.' }]
        }, (chunk, t) => { onProgress?.(`Continuing the world... ${chars + t.length} chars`, chars + t.length); });
        // A model that restarts the whole document instead of continuing it is taken at its word.
        text = /^\s*\{\s*"title"\s*:/.test(cont.text) ? cont.text : stitch(text, cont.text);
        chars = text.length;
        finishReason = cont.finishReason;
      }
      lastText = text;
      truncated = finishReason === 'length' || looksTruncated(text);
      const parsed = deepClean(extractJSON(text));
      lastProblems = validateWorld(parsed);
      if (lastProblems.length === 0) return normalizeWorld(parsed, settings);
      if (truncated) lastProblems.unshift('Your output was cut off at the output token limit: write a more compact world (shorter descriptions, no padding) so the whole JSON fits.');
      onProgress?.(`Validation failed: ${lastProblems.slice(0, 3).join('; ')}`, chars);
    } catch (err) {
      if (signal?.aborted) throw err;
      if (/declined/.test(err.message)) throw err;
      const tail = lastText ? ` The reply ended with: …${lastText.slice(-120).replace(/\s+/g, ' ')}` : '';
      lastProblems = [truncated || looksTruncated(lastText)
        ? 'Your output was cut off at the output token limit and could not be parsed: write a more compact world (shorter descriptions, no padding) so the whole JSON fits.'
        : `Output was not parseable JSON (${err.message}).${tail} Output the whole object as valid JSON with no comments, fences or trailing text.`];
      onProgress?.(`Attempt ${attempt} failed: ${err.message}`, chars);
    }
  }
  const hint = truncated || looksTruncated(lastText)
    ? ' The model\'s output limit is too small for a world of this size: pick a model with a larger output limit, or a shorter game.'
    : ' The model is not producing valid JSON; a stronger model (Claude Sonnet, GPT-4.1, Gemini 2.5 Flash, DeepSeek) usually fixes this.';
  const error = new Error(`Could not build a valid world after ${maxAttempts} attempts. Last problems: ${lastProblems.join('; ')}${hint}`);
  error.raw = lastText;
  throw error;
}

/** Join a cut-off reply and its continuation, dropping any overlap the model repeated. */
export function stitch(head, tail) {
  let t = String(tail || '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
  const max = Math.min(400, head.length, t.length);
  for (let k = max; k >= 3; k--) {
    if (head.endsWith(t.slice(0, k))) return head + t.slice(k);
  }
  return head + t;
}
