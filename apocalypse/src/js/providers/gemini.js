// Google Gemini provider. Uses the Generative Language API with SSE streaming.
//
// Gemini 2.5 and later models think before answering and the thinking counts
// against maxOutputTokens, so those models get a generous output budget and
// the Flash models have thinking turned off for speed and predictable JSON.

import { readSSE, throwForStatus } from './sse.js';

export const gemini = {
  id: 'gemini',
  name: 'Google Gemini',
  defaultModel: 'gemini-2.5-flash',
  models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-2.0-flash'],
  keyUrl: 'https://aistudio.google.com/apikey',
  notes: 'Create a key in Google AI Studio. Free tier available.',
  defaultBaseUrl: 'https://generativelanguage.googleapis.com',
  allowCustomBaseUrl: false,

  async *stream({ apiKey, model, system, messages, json = false, maxTokens = 8192, temperature = 0.8, baseUrl, signal }) {
    const m = model || this.defaultModel;
    const url = `${(baseUrl || this.defaultBaseUrl).replace(/\/$/, '')}/v1beta/models/${encodeURIComponent(m)}:streamGenerateContent?alt=sse`;
    const thinking = /gemini-(2\.5|[3-9])/.test(m);
    const cap = thinking ? 65536 : 8192;
    const maxOutputTokens = Math.min(cap, thinking ? Math.max(maxTokens, 16384) : maxTokens);
    const generationConfig = { maxOutputTokens, temperature, ...(json ? { responseMimeType: 'application/json' } : {}) };
    if (/gemini-2\.5-flash/.test(m)) generationConfig.thinkingConfig = { thinkingBudget: 0 };
    const body = {
      contents: messages.map(x => ({ role: x.role === 'assistant' ? 'model' : 'user', parts: [{ text: x.content }] })),
      generationConfig,
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' }
      ]
    };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal
    });
    await throwForStatus(res, this.name);
    let finish = null;
    for await (const data of readSSE(res)) {
      let evt;
      try { evt = JSON.parse(data); } catch { continue; }
      const text = evt.candidates?.[0]?.content?.parts?.filter(p => !p.thought).map(p => p.text || '').join('');
      if (text) yield text;
      const reason = evt.promptFeedback?.blockReason || evt.candidates?.[0]?.finishReason;
      if (reason) finish = reason;
      if (reason && reason !== 'STOP' && reason !== 'MAX_TOKENS') throw new Error(`${this.name}: generation stopped (${reason})`);
    }
    return finish === 'MAX_TOKENS' ? 'length' : finish === 'STOP' ? 'stop' : null;
  }
};
