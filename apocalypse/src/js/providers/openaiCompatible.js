// Factory for any provider that speaks the OpenAI Chat Completions protocol.
// Used for OpenAI, DeepSeek, xAI (Grok), Groq, Mistral, Ollama and the
// "custom" provider. To add another compatible provider, add an entry to the
// registry in index.js using makeOpenAICompatible().

import { readSSE, throwForStatus } from './sse.js';

/**
 * maxOutputTokens may be a number or a function of the model id. Providers that
 * reject a parameter (a max_tokens above their cap, JSON mode, temperature on a
 * reasoning model) say so in a 400; the request is adapted and retried, and
 * what was learned is remembered for the session.
 */
export function makeOpenAICompatible({ id, name, baseUrl, defaultModel, models = [], keyUrl, notes = '', supportsJsonMode = true, allowCustomBaseUrl = false, maxOutputTokens = Infinity, maxTokensParam = 'max_tokens', noTemperatureFor = null, worldInParts = false }) {
  const learned = { caps: {}, noJson: new Set(), noTemperature: new Set() };
  const capFor = m => Math.min(learned.caps[m] ?? Infinity, typeof maxOutputTokens === 'function' ? maxOutputTokens(m) : maxOutputTokens);
  return {
    id, name, defaultModel, models, keyUrl, notes, allowCustomBaseUrl, worldInParts,
    defaultBaseUrl: baseUrl,
    /** The largest reply this model can produce, as far as the game knows (Infinity when unknown). */
    outputCap(model) { return capFor(model || defaultModel); },

    async *stream({ apiKey, model, system, messages, json = false, maxTokens = 4096, temperature = 0.8, baseUrl: overrideUrl, signal }) {
      const url = `${(overrideUrl || baseUrl).replace(/\/$/, '')}/chat/completions`;
      const m = model || defaultModel;
      const headers = { 'Content-Type': 'application/json' };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
      let res;
      for (let attempt = 0; ; attempt++) {
        const body = {
          model: m,
          stream: true,
          [maxTokensParam]: Math.min(maxTokens, capFor(m)),
          messages: [
            ...(system ? [{ role: 'system', content: system }] : []),
            ...messages.map(x => ({ role: x.role, content: x.content }))
          ]
        };
        // Reasoning models reject sampling parameters.
        if (!(noTemperatureFor && noTemperatureFor.test(m)) && !learned.noTemperature.has(m)) body.temperature = temperature;
        if (json && supportsJsonMode && !learned.noJson.has(m)) body.response_format = { type: 'json_object' };
        res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal });
        if (res.ok) break;
        let detail = '';
        try { detail = await res.clone().text(); } catch { /* ignore */ }
        const fix = attempt < 3 && res.status === 400 ? adaptTo(detail, body, m) : null;
        if (!fix) await throwForStatus(res, name);
        if (fix.cap) learned.caps[m] = fix.cap;
        if (fix.noJson) learned.noJson.add(m);
        if (fix.noTemperature) learned.noTemperature.add(m);
      }
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

  /** Read a 400 and decide what to change: a smaller output cap, no JSON mode, no temperature. Null when nothing applies. */
  function adaptTo(detail, body, m) {
    const msg = (() => { try { const p = JSON.parse(detail); const e = p?.error?.message || p?.message || p?.error; return typeof e === 'string' ? e : JSON.stringify(e || detail); } catch { return String(detail || ''); } })();
    const low = msg.toLowerCase();
    if (/max_tokens|max_completion_tokens|output tokens|maximum.*tokens|tokens.*maximum|completion length/.test(low)) {
      const nums = (msg.match(/\d{3,7}/g) || []).map(Number).filter(n => n >= 256 && n < (body[maxTokensParam] || Infinity));
      if (nums.length) return { cap: Math.max(...nums) };
    }
    if (body.response_format && /response_format|json_object|json mode|json output|json schema/.test(low)) return { noJson: true };
    if ('temperature' in body && /temperature|sampling|top_p/.test(low)) return { noTemperature: true };
    return null;
  }
}
