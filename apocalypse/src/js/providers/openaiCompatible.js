// Factory for any provider that speaks the OpenAI Chat Completions protocol.
// Used for OpenAI, DeepSeek, xAI (Grok), Groq, Mistral, Ollama and the
// "custom" provider. To add another compatible provider, add an entry to the
// registry in index.js using makeOpenAICompatible().

import { readSSE, throwForStatus } from './sse.js';

export function makeOpenAICompatible({ id, name, baseUrl, defaultModel, models = [], keyUrl, notes = '', supportsJsonMode = true, allowCustomBaseUrl = false, maxOutputTokens = Infinity, maxTokensParam = 'max_tokens', noTemperatureFor = null }) {
  return {
    id, name, defaultModel, models, keyUrl, notes, allowCustomBaseUrl,
    defaultBaseUrl: baseUrl,

    async *stream({ apiKey, model, system, messages, json = false, maxTokens = 4096, temperature = 0.8, baseUrl: overrideUrl, signal }) {
      const url = `${(overrideUrl || baseUrl).replace(/\/$/, '')}/chat/completions`;
      const m = model || defaultModel;
      const body = {
        model: m,
        stream: true,
        [maxTokensParam]: Math.min(maxTokens, maxOutputTokens),
        messages: [
          ...(system ? [{ role: 'system', content: system }] : []),
          ...messages.map(x => ({ role: x.role, content: x.content }))
        ]
      };
      // Reasoning models reject sampling parameters.
      if (!(noTemperatureFor && noTemperatureFor.test(m))) body.temperature = temperature;
      if (json && supportsJsonMode) body.response_format = { type: 'json_object' };
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
      await throwForStatus(res, name);
      let finish = null;
      for await (const data of readSSE(res)) {
        if (data === '[DONE]') break;
        let evt;
        try { evt = JSON.parse(data); } catch { continue; }
        if (evt.error) throw new Error(`${name}: ${evt.error.message || JSON.stringify(evt.error)}`);
        const choice = evt.choices?.[0];
        const delta = choice?.delta?.content;
        if (delta) yield delta;
        if (choice?.finish_reason) finish = choice.finish_reason;
      }
      return finish === 'length' ? 'length' : finish === 'content_filter' ? 'refusal' : finish ? 'stop' : null;
    }
  };
}
