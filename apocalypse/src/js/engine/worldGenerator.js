// Generates and validates the hidden world truth.

import { buildWorldGenerationPrompt } from '../prompts/worldGeneration.js';
import { validateWorld, normalizeWorld, deepClean } from './schema.js';
import { extractJSON } from './json.js';
import { complete } from '../providers/index.js';

export async function generateWorld({ provider, apiKey, model, baseUrl, settings, survivor, onProgress, maxAttempts = 3, signal }) {
  const prompt = buildWorldGenerationPrompt({ ...settings, survivor });
  let lastProblems = [];
  let lastText = '';
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    onProgress?.(`Building the world (attempt ${attempt} of ${maxAttempts})...`, 0);
    const messages = [{ role: 'user', content: prompt }];
    if (attempt > 1 && lastProblems.length) {
      messages[0].content += `\n\nYOUR PREVIOUS ATTEMPT FAILED VALIDATION. Fix every problem below and output the complete corrected JSON:\n- ${lastProblems.join('\n- ')}`;
    }
    let chars = 0;
    try {
      lastText = await complete(provider, {
        apiKey, model, baseUrl, json: true, maxTokens: 16000, temperature: 0.9, signal,
        system: 'You are a meticulous designer of survival-fiction worlds who outputs only valid JSON.',
        messages
      }, (chunk, text) => { chars = text.length; onProgress?.(`Building the world (attempt ${attempt})... ${chars} chars`, chars); });
      const parsed = deepClean(extractJSON(lastText));
      lastProblems = validateWorld(parsed);
      if (lastProblems.length === 0) return normalizeWorld(parsed, settings);
      onProgress?.(`Validation failed: ${lastProblems.slice(0, 3).join('; ')}`, chars);
    } catch (err) {
      if (signal?.aborted) throw err;
      lastProblems = [`Output was not parseable JSON (${err.message}). Output the whole object as valid JSON.`];
      onProgress?.(`Attempt ${attempt} failed: ${err.message}`, chars);
    }
  }
  throw new Error(`Could not build a valid world after ${maxAttempts} attempts. Last problems: ${lastProblems.join('; ')}`);
}
