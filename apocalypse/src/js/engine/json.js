// Tolerant JSON helpers. Models sometimes wrap JSON in fences or add prose.

export function extractJSON(text) {
  if (!text) throw new Error('Empty reply');
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end > start) {
    const slice = t.slice(start, end + 1);
    try { return JSON.parse(slice); } catch { /* fall through */ }
    try { return JSON.parse(repairJSON(slice)); } catch { /* fall through */ }
  }
  throw new Error('Reply was not valid JSON');
}

// Small repairs for the usual model slips: trailing commas, unescaped newlines
// inside strings, a missing closing brace.
export function repairJSON(s) {
  let out = '';
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (inStr) {
      if (esc) { out += ch; esc = false; continue; }
      if (ch === '\\') { out += ch; esc = true; continue; }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      out += ch;
      continue;
    }
    if (ch === '"') inStr = true;
    out += ch;
  }
  out = out.replace(/,\s*([}\]])/g, '$1');
  let depth = 0;
  for (const ch of out) { if (ch === '{') depth++; else if (ch === '}') depth--; }
  while (depth-- > 0) out += '}';
  return out;
}

// Pull the (possibly incomplete) "narrative" string out of a partial JSON
// stream so it can be typed out while the rest of the reply is still arriving.
export function extractPartialNarrative(buffer) {
  const m = buffer.match(/"narrative"\s*:\s*"/);
  if (!m) return null;
  let i = m.index + m[0].length;
  let out = '';
  while (i < buffer.length) {
    const ch = buffer[i];
    if (ch === '\\') {
      const nxt = buffer[i + 1];
      if (nxt === undefined) break;
      if (nxt === 'n') out += '\n';
      else if (nxt === 't') out += '\t';
      else if (nxt === '"') out += '"';
      else if (nxt === '\\') out += '\\';
      else if (nxt === 'u') {
        const hex = buffer.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        out += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      } else out += nxt;
      i += 2;
      continue;
    }
    if (ch === '"') break;
    out += ch;
    i++;
  }
  return out;
}
