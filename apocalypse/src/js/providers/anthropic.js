// Anthropic (Claude) provider. Uses the Messages API with streaming.
// The special header below is what Anthropic requires for calls made
// directly from a browser with a user-supplied key.

import { readSSE, throwForStatus } from './sse.js';

export const anthropic = {
  id: 'anthropic',
  name: 'Anthropic (Claude)',
  defaultModel: 'claude-sonnet-5-5',
  models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'],
  keyUrl: 'https://console.anthropic.com/settings/keys',
  notes: 'Keys start with "sk-ant-". Direct browser calls are supported.',
  defaultBaseUrl: 'https://api.anthropic.com',
  allowCustomBaseUrl: true,

  async *stream({ apiKey, model, system, messages, json = false, maxTokens = 4096, temperature = 0.8, baseUrl, signal }) {
    const url = `${(baseUrl || this.defaultBaseUrl).replace(/\/$/, '')}/v1/messages`;
    const body = {
      model: model || this.defaultModel,
      max_tokens: maxTokens,
      temperature,
      stream: true,
      // One cacheable system block: the long static prefix (rules + world truth) is reused across turns.
      system: system ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] : undefined,
      messages: messages.map(m => ({ role: m.role, content: m.content }))
    };
    // Prefill the opening brace so the model commits to a JSON object.
    if (json && body.messages[body.messages.length - 1]?.role === 'user') {
      body.messages.push({ role: 'assistant', content: '{' });
    }
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify(body),
      signal
    });
    await throwForStatus(res, this.name);
    if (json) yield '{';
    for await (const data of readSSE(res)) {
      let evt;
      try { evt = JSON.parse(data); } catch { continue; }
      if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') yield evt.delta.text;
      if (evt.type === 'error') throw new Error(`${this.name}: ${evt.error?.message || 'stream error'}`);
    }
  }
};
