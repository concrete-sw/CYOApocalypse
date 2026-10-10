// Bundles src/ into a single self-contained ../index.html that works when
// double-clicked (file://). Browsers refuse to load ES modules from local
// files, so every module is wrapped in a function and inlined as one classic
// script, and the stylesheet is inlined too.
//
//   node apocalypse/dev/build.js

import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', 'src');
const out = path.join(here, '..', 'index.html');

const modules = new Map(); // abs path -> { code, deps: [abs], exports: [names] }
const IMPORT_RE = /^import\s+(\{[^}]*\}|\*\s+as\s+\w+)\s+from\s+'([^']+)';\s*$/gm;

function load(file) {
  if (modules.has(file)) return;
  let code = readFileSync(file, 'utf8');
  const deps = [];
  const prologue = [];
  code = code.replace(IMPORT_RE, (m, what, spec) => {
    const dep = path.resolve(path.dirname(file), spec);
    deps.push(dep);
    const ref = `__m[${JSON.stringify(path.relative(src, dep))}]`;
    if (what.startsWith('*')) prologue.push(`const ${what.replace(/\*\s+as\s+/, '')} = ${ref};`);
    else prologue.push(`const ${what.replace(/\s+as\s+/g, ': ')} = ${ref};`);
    return '';
  });
  const exports = [];
  code = code.replace(/^export\s+(async\s+function\*?|function\*?|class|const|let)\s+([$\w]+)/gm, (m, kind, name) => { exports.push(name); return `${kind} ${name}`; });
  if (/^export\s/m.test(code)) throw new Error(`Unhandled export form in ${file}`);
  modules.set(file, { code: prologue.join('\n') + '\n' + code, deps, exports });
  for (const d of deps) load(d);
}

load(path.join(src, 'js', 'main.js'));

// Dependency order (post-order DFS).
const ordered = [];
const seen = new Set();
function visit(f) { if (seen.has(f)) return; seen.add(f); for (const d of modules.get(f).deps) visit(d); ordered.push(f); }
visit(path.join(src, 'js', 'main.js'));

let js = '"use strict";\nconst __m = {};\n';
for (const f of ordered) {
  const m = modules.get(f);
  const key = JSON.stringify(path.relative(src, f));
  js += `\n// ---- ${path.relative(src, f)} ----\n__m[${key}] = (() => {\n${m.code}\nreturn { ${m.exports.join(', ')} };\n})();\n`;
}

let html = readFileSync(path.join(src, 'index.html'), 'utf8');
const css = readFileSync(path.join(src, 'css', 'style.css'), 'utf8');
// Function replacers: a string replacement would treat "$$" in the code as an escape.
html = html.replace('<link rel="stylesheet" href="css/style.css">', () => `<style>\n${css}\n</style>`);
html = html.replace('<script type="module" src="js/main.js"></script>', () => `<script>\n${js.replace(/<\/script/gi, '<\\/script')}\n</script>`);
html = html.replace('<head>', '<head>\n<!-- BUILT FILE: edit the sources in src/ and run: node dev/build.js -->');
writeFileSync(out, html);
console.log(`built ${path.relative(process.cwd(), out)} (${(html.length / 1024).toFixed(0)} KB, ${ordered.length} modules)`);
