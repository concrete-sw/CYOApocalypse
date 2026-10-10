// Anthropic (Claude) provider. Uses the Messages API with streaming.
// The special header below is what Anthropic requires for calls made
// directly from a browser with a user-supplied key.
//
// Current Claude models (4.6 and later) reject assistant prefill and
// non-default sampling parameters, so neither is sent; JSON shape is
// enforced by the prompts and the tolerant parser. Thinking is adaptive by
// default on these models and its depth is set with output_config.effort.

import { readSSE, throwForStatus } from './sse.js';

const EFFORT_MODELS = /claude-(fable|mythos|opus|sonnet|haiku)-(4-[6-9]|[5-9])/;

export const anthropic = {
  id: 'anthropic',
  name: 'Anthropic (Claude)',
  defaultModel: 'claude-sonnet-5-5',
  models: ['claude-sonnet-5-5', 'claude-opus-5-5', 'claude-haiku-5-5'],
  keyUrl: 'https://console.anthropic.com/settings/keys',
  notes: 'Keys start with "sk-ant-". Direct browser calls are supported.',
  defaultBaseUrl: 'https://api.anthropic.com',
  allowCustomBaseUrl: true,

  async *stream({ apiKey, model, system, messages, json = false, maxTokens = 4096, effort = 'low', baseUrl, signal }) {
    const url = `${(baseUrl || this.defaultBaseUrl).replace(/\/$/, '')}/v1/messages`;
    const m = model || this.defaultModel;
    const body = {
      model: m,
      max_tokens: maxTokens,
      stream: true,
      // One cacheable system block: the long static prefix (rules + world truth) is reused across turns.
      system: system ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] : undefined,
      messages: messages.map(x => ({ role: x.role, content: x.content }))
    };
    if (EFFORT_MODELS.test(m) && effort) body.output_config = { effort };
    if (json && body.messages.length) {
      const last = body.messages[body.messages.length - 1];
      if (last.role === 'user' && typeof last.content === 'string') last.content += '\n\nReply with the JSON object only.';
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
    let stop = null;
    for await (const data of readSSE(res)) {
      let evt;
      try { evt = JSON.parse(data); } catch { continue; }
      if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') yield evt.delta.text;
      if (evt.type === 'message_delta' && evt.delta?.stop_reason) stop = evt.delta.stop_reason;
      if (evt.type === 'error') throw new Error(`${this.name}: ${evt.error?.message || 'stream error'}`);
    }
    return stop === 'max_tokens' ? 'length' : stop === 'refusal' ? 'refusal' : stop ? 'stop' : null;
  }
};
