// Provider registry. Every provider exposes the same interface:
//
//   { id, name, defaultModel, models, keyUrl, notes, defaultBaseUrl,
//     allowCustomBaseUrl, async *stream({ apiKey, model, system, messages,
//     json, maxTokens, temperature, baseUrl, signal }) }
//
// stream() yields text chunks. To add a provider, either create a file like
// anthropic.js / gemini.js and add it here, or (for anything that speaks the
// OpenAI chat-completions protocol) add one makeOpenAICompatible() entry.

import { anthropic } from './anthropic.js';
import { gemini } from './gemini.js';
import { makeOpenAICompatible } from './openaiCompatible.js';

export const PROVIDERS = [
  anthropic,
  makeOpenAICompatible({
    id: 'openai', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1',
    defaultModel: 'gpt-4.1', models: ['gpt-4.1', 'gpt-4.1-mini', 'gpt-4o', 'o4-mini'],
    keyUrl: 'https://platform.openai.com/api-keys', notes: 'Keys start with "sk-".'
  }),
  gemini,
  makeOpenAICompatible({
    id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com',
    defaultModel: 'deepseek-chat', models: ['deepseek-chat', 'deepseek-reasoner'],
    keyUrl: 'https://platform.deepseek.com/api_keys', notes: 'Inexpensive and capable at role-play. Output is capped at 8k tokens, so prefer short or standard games.', maxOutputTokens: 8192
  }),
  makeOpenAICompatible({
    id: 'xai', name: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1',
    defaultModel: 'grok-4', models: ['grok-4', 'grok-3', 'grok-3-mini'],
    keyUrl: 'https://console.x.ai/', notes: 'Keys start with "xai-".'
  }),
  makeOpenAICompatible({
    id: 'groq', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1',
    defaultModel: 'llama-3.3-70b-versatile', models: ['llama-3.3-70b-versatile'],
    keyUrl: 'https://console.groq.com/keys', notes: 'Very fast open-weight models.'
  }),
  makeOpenAICompatible({
    id: 'mistral', name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1',
    defaultModel: 'mistral-large-latest', models: ['mistral-large-latest', 'mistral-medium-latest'],
    keyUrl: 'https://console.mistral.ai/api-keys/'
  }),
  makeOpenAICompatible({
    id: 'ollama', name: 'Ollama (local)', baseUrl: 'http://localhost:11434/v1',
    defaultModel: 'llama3.1', models: [], keyUrl: 'https://ollama.com/',
    notes: 'No key needed. Start Ollama with OLLAMA_ORIGINS="*" so the browser may call it.',
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

/** Collect a whole streamed reply into one string, reporting chunks via onChunk. */
export async function complete(provider, opts, onChunk) {
  let text = '';
  for await (const chunk of provider.stream(opts)) {
    text += chunk;
    if (onChunk) onChunk(chunk, text);
  }
  return text;
}
