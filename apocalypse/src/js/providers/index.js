// Provider registry. Every provider exposes the same interface:
//
//   { id, name, defaultModel, models, keyUrl, notes, defaultBaseUrl,
//     allowCustomBaseUrl, async *stream({ apiKey, model, system, messages,
//     json, maxTokens, temperature, effort, baseUrl, signal }) }
//
// stream() yields text chunks and finally RETURNS a finish reason:
// 'stop' (natural end), 'length' (cut off at the output limit), 'refusal'
// (the model declined), or null (unknown). To add a provider, either create a
// file like anthropic.js / gemini.js and add it here, or (for anything that
// speaks the OpenAI chat-completions protocol) add one makeOpenAICompatible() entry.

import { anthropic } from './anthropic.js';
import { gemini } from './gemini.js';
import { makeOpenAICompatible } from './openaiCompatible.js';

export const PROVIDERS = [
  anthropic,
  makeOpenAICompatible({
    id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1', models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'gpt-5', 'o4-mini'],
    keyUrl: 'https://platform.openai.com/api-keys', notes: 'Keys start with "sk-".', maxTokensParam: 'max_completion_tokens', noTemperatureFor: /^(o\d|gpt-5)/
  }),
  gemini,
  makeOpenAICompatible({
    id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner'],
    keyUrl: 'https://platform.deepseek.com/api_keys', notes: 'Inexpensive and capable at role-play. deepseek-chat replies are capped at 8k tokens, so the world is built in three parts; deepseek-reasoner thinks for a while before any text appears.',
    maxOutputTokens: m => (/reasoner/.test(m) ? 65536 : 8192), worldInParts: true
  }),
  makeOpenAICompatible({
    id: 'xai', name: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4', models: ['grok-4', 'grok-3', 'grok-3-mini'],
    keyUrl: 'https://console.x.ai/', notes: 'Keys start with "xai-".'
  }),
  makeOpenAICompatible({
    id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile', models: ['llama-3.3-70b-versatile'],
    keyUrl: 'https://console.groq.com/keys', notes: 'Very fast open-weight models. Smaller models struggle with the long world JSON; expect retries.'
  }),
  makeOpenAICompatible({
    id: 'mistral', name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest', models: ['mistral-large-latest', 'mistral-medium-latest'],
    keyUrl: 'https://console.mistral.ai/api-keys/'
  }),
  makeOpenAICompatible({
    id: 'ollama', name: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.1', models: [], keyUrl: 'https://ollama.com/',
    notes: 'No key needed. Start Ollama with OLLAMA_ORIGINS="*" so the browser may call it. Small local models rarely manage the world JSON; use a 30B+ model.',
    allowCustomBaseUrl: true
  }),
  makeOpenAICompatible({
    id: 'custom', name: 'Custom (OpenAI-compatible)', baseUrl: 'https://example.com/v1',
    defaultModel: '', models: [], keyUrl: '',
    notes: 'Any endpoint that implements POST {baseUrl}/chat/completions with SSE streaming.',
    allowCustomBaseUrl: true
  })
];

export function getProvider(id) {
  return PROVIDERS.find(p => p.id === id) || PROVIDERS[0];
}

/** Collect a whole streamed reply, reporting chunks via onChunk. Returns { text, finishReason }. */
export async function completeWithMeta(provider, opts, onChunk) {
  let text = '';
  const it = provider.stream(opts);
  for (;;) {
    const { value, done } = await it.next();
    if (done) return { text, finishReason: typeof value === 'string' ? value : null };
    if (value) { text += value; if (onChunk) onChunk(value, text); }
  }
}

/** Collect a whole streamed reply into one string, reporting chunks via onChunk. */
export async function complete(provider, opts, onChunk) {
  return (await completeWithMeta(provider, opts, onChunk)).text;
}
