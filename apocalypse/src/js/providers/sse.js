// Minimal Server-Sent Events reader over fetch. Yields the "data:" payload of
// each event as a string. Works with every provider in this folder.

export async function* readSSE(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const dataLines = rawEvent
        .split('\n')
        .filter(l => l.startsWith('data:'))
        .map(l => l.slice(5).trimStart());
      if (dataLines.length) yield dataLines.join('\n');
    }
  }
  if (buffer.trim()) {
    const dataLines = buffer.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart());
    if (dataLines.length) yield dataLines.join('\n');
  }
}

export async function throwForStatus(response, providerName) {
  if (response.ok) return;
  let detail = '';
  try { detail = await response.text(); } catch { /* ignore */ }
  let message = `${providerName} returned HTTP ${response.status}`;
  try {
    const parsed = JSON.parse(detail);
    const m = parsed?.error?.message || parsed?.message || parsed?.error;
    if (m) message += `: ${typeof m === 'string' ? m : JSON.stringify(m)}`;
  } catch {
    if (detail) message += `: ${detail.slice(0, 300)}`;
  }
  if (response.status === 401 || response.status === 403) message += ' (check your API key)';
  if (response.status === 429) message += ' (rate limited or out of credit; wait and retry)';
  throw new Error(message);
}
