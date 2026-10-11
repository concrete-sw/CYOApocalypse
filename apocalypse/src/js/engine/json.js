// Tolerant JSON helpers. Models wrap JSON in fences, add prose, leave trailing
// commas, write comments, mis-escape quotes, and get cut off mid-object. This
// module gets the object out anyway whenever it is recoverable.

export function extractJSON(text) {
  if (!text) throw new Error('Empty reply');
  let t = String(text).replace(/^﻿/, '').trim();
  const fenced = t.match(/```(?:json|JSON)?\s*([\s\S]*?)(?:```|$)/);
  if (fenced && fenced[1].trim().startsWith('{')) t = fenced[1].trim();
  t = t.replace(/^json\s*\n/i, '');
  try { return JSON.parse(t); } catch { /* fall through */ }
  const start = t.indexOf('{');
  if (start === -1) throw new Error('Reply contained no JSON object');
  const end = t.lastIndexOf('}');
  const slice = end > start ? t.slice(start, end + 1) : t.slice(start);
  try { return JSON.parse(slice); } catch { /* fall through */ }
  try { return JSON.parse(repairJSON(slice)); } catch { /* fall through */ }
  // The last "}" may belong to a nested object of a cut-off document: repair from the start instead.
  try { return JSON.parse(repairJSON(t.slice(start))); } catch (e) { throw new Error(`Reply was not valid JSON (${e.message.slice(0, 80)})`); }
}

/** Does the text look like it stopped before the JSON ended? */
export function looksTruncated(text) {
  const t = String(text || '').trim().replace(/```\s*$/, '').trim();
  if (!t.startsWith('{') && !t.includes('{')) return false;
  return !t.endsWith('}');
}

// Repairs for the usual model slips: comments, trailing commas, raw newlines
// and control characters inside strings, invalid escapes, an unterminated
// string, and missing closing brackets.
export function repairJSON(s) {
  let out = '';
  let inStr = false;
  const stack = [];
  const VALID_ESC = '"\\/bfnrtu';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      if (ch === '\\') {
        const nxt = s[i + 1];
        if (nxt === undefined) break;
        if (nxt === 'u') {
          const hex = s.slice(i + 2, i + 6);
          if (/^[0-9a-fA-F]{4}$/.test(hex)) { out += '\\u' + hex; i += 5; } else { out += 'u'; i += 1; }
          continue;
        }
        if (VALID_ESC.includes(nxt)) { out += ch + nxt; i++; continue; }
        out += nxt; i++; // invalid escape such as \' or \x: keep the character
        continue;
      }
      if (ch === '"') { inStr = false; out += ch; continue; }
      if (ch === '\n') { out += '\\n'; continue; }
      if (ch === '\r') { out += '\\r'; continue; }
      if (ch === '\t') { out += '\\t'; continue; }
      const code = ch.charCodeAt(0);
      if (code < 0x20) { out += '\\u' + code.toString(16).padStart(4, '0'); continue; }
      out += ch;
      continue;
    }
    if (ch === '"') { inStr = true; out += ch; continue; }
    if (ch === '/' && s[i + 1] === '/') { while (i < s.length && s[i] !== '\n') i++; continue; }
    if (ch === '/' && s[i + 1] === '*') { const e = s.indexOf('*/', i + 2); i = e === -1 ? s.length : e + 1; continue; }
    if (ch === '{' || ch === '[') stack.push(ch);
    else if (ch === '}' || ch === ']') stack.pop();
    out += ch;
  }
  if (inStr) out += '"';
  out = out.replace(/,\s*([}\]])/g, '$1');
  // A cut-off document often ends mid-value: drop a dangling key or comma.
  out = out.replace(/,\s*$/, '').replace(/("[^"]*")\s*:\s*$/, '').replace(/,\s*$/, '');
  while (stack.length) out += stack.pop() === '{' ? '}' : ']';
  out = out.replace(/,\s*([}\]])/g, '$1');
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
