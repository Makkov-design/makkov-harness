#!/usr/bin/env node
// Design Score build. Bundles src/probe.js and src/ui.js into one file, mh-score.js, written to this skill folder
// and to docs/score/ (identical copies); writes docs/score/console.txt and docs/score/offline-bookmarklet.txt;
// refreshes the bookmarklet links in docs/score.html between <!-- bookmarklet:start --> and <!-- bookmarklet:end -->.
// Node only, no dependencies, no network. Deterministic: the same sources always give byte-identical files.
//
// Usage
//   node skills/design-score/build.mjs           build, write what changed, print sizes
//   node skills/design-score/build.mjs --check   build in memory only; exit 1 when a generated file is missing or stale
//
// Exit codes: 0 done (or up to date), 1 stale files (--check) or a build error.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SKILL_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(SKILL_DIR, '..', '..');
const DOCS = path.join(REPO, 'docs');
const REPO_URL = 'https://github.com/Makkov-design/makkov-harness';
const PAGES_URL = 'https://makkov-design.github.io/makkov-harness';
const SCORE_PAGE = `${PAGES_URL}/score.html`;

const SRC = { probe: path.join(SKILL_DIR, 'src', 'probe.js'), ui: path.join(SKILL_DIR, 'src', 'ui.js') };
const OUT = {
  skillBundle: path.join(SKILL_DIR, 'mh-score.js'),
  docsBundle: path.join(DOCS, 'score', 'mh-score.js'),
  console: path.join(DOCS, 'score', 'console.txt'),
  offline: path.join(DOCS, 'score', 'offline-bookmarklet.txt'),
  page: path.join(DOCS, 'score.html'),
};

const args = process.argv.slice(2);
const CHECK = args.includes('--check');
if (args.includes('--help') || args.includes('-h')) {
  console.log(fs.readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').slice(1, 11).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
  process.exit(0);
}
const unknown = args.filter((a) => !['--check'].includes(a));
if (unknown.length) die(`Unknown option ${unknown.join(' ')}. Use --check or nothing (--help for more).`);

function die(msg) { console.error(`design-score build: ${msg}`); process.exit(1); }
const rel = (p) => path.relative(REPO, p).split(path.sep).join('/');
// Text in, text out: LF line endings, no byte order mark, so a CRLF checkout builds the same bytes.
const norm = (s) => s.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
const read = (p) => norm(fs.readFileSync(p, 'utf8'));
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
const gz = (s) => zlib.gzipSync(Buffer.from(s, 'utf8'), { level: 9 }).length;

/* ------------------------------------------------------------------ sources */

for (const [name, p] of Object.entries(SRC)) if (!fs.existsSync(p)) die(`${rel(p)} is missing (the ${name} source).`);
const probe = read(SRC.probe).replace(/\s+$/, '');
const ui = read(SRC.ui).replace(/\s+$/, '');

function versionOf(src, file) {
  const m = /\bvar VERSION = '(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)'/.exec(src);
  if (!m) die(`${rel(file)} has no "var VERSION = 'x.y.z'" line.`);
  return m[1];
}
const VERSION = versionOf(probe, SRC.probe);
const uiVersion = versionOf(ui, SRC.ui);
if (uiVersion !== VERSION) die(`version mismatch: src/probe.js is ${VERSION} but src/ui.js is ${uiVersion}. Bump both together.`);

function compiles(code, filename) {
  try { new vm.Script(code, { filename }); return null; } catch (e) { return e; } // parse only, nothing runs
}
for (const [file, code] of [[SRC.probe, probe], [SRC.ui, ui]]) {
  const err = compiles(code, rel(file));
  if (err) die(`${rel(file)} does not parse: ${err.message}`);
}
if (!/window\.MHScore\b|'MHScore'/.test(probe)) die('src/probe.js does not define window.MHScore.');
if (!/'MHScoreUI'/.test(ui)) die('src/ui.js does not define window.MHScoreUI.');

/* ------------------------------------------------------------------- bundle */

const HEADER = [
  `/*! Design Score ${VERSION} | makkov-harness | MIT License | ${REPO_URL}`,
  ' *  Scores the design of the page it runs in from 0 to 100 and opens a panel that explains every point.',
  ' *  Runs locally in this tab and makes no network requests. It reads the page and never changes it; the panel',
  ' *  is one element, #mh-score-root, removed again when you close it. More: ' + SCORE_PAGE,
  ' *  Agents and scripts: set window.MHScoreNoAuto = true before loading to keep the panel closed, then call',
  ' *  MHScore.run(), MHScore.extractStyle() and MHScore.format.*, or MHScoreUI.open().',
  ' *  Built by skills/design-score/build.mjs from src/probe.js and src/ui.js. Edit those, not this file. */',
].join('\n');

const AUTORUN = [
  '// ---- autorun: open the panel unless window.MHScoreNoAuto is set ----',
  'try {',
  '  (function () {',
  "    if (typeof window === 'undefined' || window.MHScoreNoAuto) return;",
  '    var go = function () {',
  "      try { if (window.MHScoreUI && typeof window.MHScoreUI.toggle === 'function') window.MHScoreUI.toggle(); }",
  "      catch (e) { try { console.warn('Design Score:', e); } catch (e2) { /* no console */ } }",
  '    };',
  "    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go, { once: true });",
  '    else go();',
  '  })();',
  "} catch (e) { /* never throw into the page */ }",
].join('\n');

const bundle = [
  HEADER,
  ';(function () {',
  '// ---- src/probe.js ----',
  probe,
  ';',
  '// ---- src/ui.js ----',
  ui,
  ';',
  AUTORUN,
  '})();',
  '',
].join('\n');
{ const err = compiles(bundle, 'mh-score.js'); if (err) die(`the bundle does not parse: ${err.message}`); }

const consoleTxt = [
  `/* Design Score ${VERSION} console snippet | makkov-harness | MIT`,
  '   Paste all of this into the DevTools console of the page you want to score and press Enter.',
  '   Chrome may ask you to type "allow pasting" first. It runs locally and sends nothing anywhere.',
  `   Bookmarklets and the agent skill: ${SCORE_PAGE} */`,
  bundle,
].join('\n');

/* ---------------------------------------------------- compact (offline link) */
// The offline bookmarklet carries the whole bundle in its URL, so it drops what the parser ignores anyway:
// indentation, blank lines and lines that are only a // comment. It never touches the inside of a string,
// template literal or regex. A small lexer tracks where each line starts; on anything it is not sure about
// (a template literal, a newline inside a string or a regex) it gives up and the link carries the full bundle.
function compact(src) {
  const n = src.length;
  const lineStart = [0]; // mode at the start of every line
  let mode = 'code';
  let prev = null; // last significant token: 'id', 'num', 'kw', 'punc:<c>', 'regex', 'str'
  let word = '';
  let inClass = false;
  const KW = new Set(['return', 'typeof', 'instanceof', 'in', 'of', 'new', 'delete', 'void', 'throw', 'case', 'do', 'else', 'yield', 'await']);
  const flushWord = () => { if (word) { prev = KW.has(word) ? 'kw' : /^\d/.test(word) ? 'num' : 'id'; word = ''; } };
  const regexAllowed = () => prev === null || prev === 'kw' || (prev.startsWith('punc:') && !/^punc:[)\]]$/.test(prev));
  for (let i = 0; i < n; i++) {
    const c = src[i], d = src[i + 1];
    if (c === '\n') {
      if (mode === 'line') mode = 'code';
      if (mode === 'sq' || mode === 'dq' || mode === 'regex') return { ok: false, why: `newline inside a ${mode === 'regex' ? 'regex' : 'string'} near line ${lineStart.length}` };
      if (mode === 'code') flushWord();
      lineStart.push(mode);
      continue;
    }
    switch (mode) {
      case 'code':
        if (/[A-Za-z0-9_$]/.test(c) || c > '\x7f') { word += c; break; }
        flushWord();
        if (c === ' ' || c === '\t' || c === '\r') break;
        if (c === '/' && d === '/') { mode = 'line'; i++; break; }
        if (c === '/' && d === '*') { mode = 'block'; i++; break; }
        if (c === "'") { mode = 'sq'; break; }
        if (c === '"') { mode = 'dq'; break; }
        if (c === '`') return { ok: false, why: 'the sources use a template literal' };
        if (c === '/') { if (regexAllowed()) { mode = 'regex'; inClass = false; } else prev = 'punc:/'; break; }
        if (c === '.' && /\d/.test(d || '') && prev !== 'id') { word = '.'; break; }
        prev = 'punc:' + c;
        break;
      case 'line': break;
      case 'block': if (c === '*' && d === '/') { mode = 'code'; i++; } break;
      case 'sq': if (c === '\\') i++; else if (c === "'") { mode = 'code'; prev = 'str'; } break;
      case 'dq': if (c === '\\') i++; else if (c === '"') { mode = 'code'; prev = 'str'; } break;
      case 'regex':
        if (c === '\\') { if (src[i + 1] === '\n') return { ok: false, why: 'backslash-newline in a regex' }; i++; }
        else if (inClass) { if (c === ']') inClass = false; }
        else if (c === '[') inClass = true;
        else if (c === '/') { while (/[a-z]/i.test(src[i + 1] || '')) i++; mode = 'code'; prev = 'regex'; }
        break;
      default: return { ok: false, why: 'unknown state' };
    }
  }
  if (mode !== 'code' && mode !== 'line') return { ok: false, why: `the code ends inside a ${mode}` };
  const lines = src.split('\n');
  if (lines.length !== lineStart.length) return { ok: false, why: 'line count mismatch' };
  const out = [];
  for (let k = 0; k < lines.length; k++) {
    const starts = lineStart[k], next = lineStart[k + 1] ?? 'code';
    let line = lines[k];
    if (starts === 'code' || starts === 'block') line = line.replace(/^[ \t]+/, '');
    if (next === 'code' || next === 'block') line = line.replace(/[ \t]+$/, ''); // the line ends in code or a comment
    if (starts === 'code' && (line === '' || line.startsWith('//'))) continue;
    out.push(line);
  }
  return { ok: true, code: out.join('\n') };
}

const packed = compact(bundle);
let offlineCode = bundle, packNote = 'full bundle (not compacted)';
if (packed.ok) {
  const err = compiles(packed.code, 'mh-score.compact.js');
  if (err) packNote = `full bundle (the compacted copy did not parse: ${err.message})`;
  else { offlineCode = packed.code; packNote = 'indentation and comment lines dropped'; }
} else packNote = `full bundle (${packed.why})`;

/* --------------------------------------------------------------- bookmarklets */

// The loader: a second click toggles the panel; a click while the bundle is still downloading does nothing (a second
// copy would toggle the new panel shut), unless the first download has hung for 15 s. The request carries no referrer,
// so GitHub Pages never learns which page is being scored. It names one URL only (.github/scripts/check.mjs holds it
// to that and to what SECURITY.md says about the referrer).
const loaderCode = [
  "(function(){var w=window,d=document;",
  "if(w.MHScoreUI&&typeof w.MHScoreUI.toggle==='function'){w.MHScoreUI.toggle();return}",
  "if(w.__mhScoreLoading&&Date.now()-w.__mhScoreLoading<15000)return;",
  `var m='Design Score could not load on this site: it blocks scripts from other sites. Use the offline bookmarklet or the console snippet from ${SCORE_PAGE.replace(/^https:\/\//, '')}';`,
  "try{var s=d.createElement('script');s.referrerPolicy='no-referrer';",
  `s.src='${PAGES_URL}/score/mh-score.js?v=${VERSION}';`,
  "s.async=true;s.onload=function(){w.__mhScoreLoading=0;s.remove()};s.onerror=function(){w.__mhScoreLoading=0;s.remove();alert(m)};",
  "w.__mhScoreLoading=Date.now();(d.head||d.documentElement).appendChild(s)}catch(e){w.__mhScoreLoading=0;alert(m)}})();void 0",
].join('');
{ const err = compiles(loaderCode, 'loader-bookmarklet.js'); if (err) die(`the loader bookmarklet does not parse: ${err.message}`); }
if ((loaderCode.match(/\/\//g) || []).length !== 1) die('the loader bookmarklet must name exactly one URL (the bundle on GitHub Pages).');

function asBookmarklet(code) {
  try { return 'javascript:' + encodeURIComponent(code); } catch (e) { die(`cannot encode the bookmarklet: ${e.message}`); }
}
const LINKS = {
  loader: asBookmarklet(loaderCode),
  offline: asBookmarklet(offlineCode + '\n;void 0'),
};
// The offline link is about 400 KB, too heavy to ship inside score.html to every visitor (phones can't even drag it).
// It lives in its own file; score-page.js fetches it from this site when someone reaches for the pill and puts it in
// the href. The ?h= is a hash of the link, so a changed bundle is never served from a stale cache.
const OFFLINE_FILE = 'score/offline-bookmarklet.txt';
const offlineTxt = LINKS.offline + '\n';
const OFFLINE_SRC = `${OFFLINE_FILE}?h=${crypto.createHash('sha256').update(LINKS.offline).digest('hex').slice(0, 12)}`;
const OFFLINE_PLACEHOLDER = '#run'; // until the script fills it in: the section that explains the offline bookmarklet
{
  const decoded = decodeURIComponent(LINKS.offline.slice('javascript:'.length));
  const err = compiles(decoded, 'offline-bookmarklet.js');
  if (err) die(`the offline bookmarklet does not parse once decoded: ${err.message}`);
}

/* --------------------------------------------------------------- score.html */

// "about 410 KB" for the label next to a bookmarklet (what the browser stores for the bookmark)
const SIZE_LABEL = (href) => `about ${Math.max(1, Math.round(Buffer.byteLength(href, 'utf8') / 10240) * 10)} KB`;
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ATTR = /\s([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function setAttrs(tag, values) {
  const close = /\/?>$/.exec(tag)[0];
  const name = /^<([a-zA-Z][\w-]*)/.exec(tag)[1];
  const body = tag.slice(1 + name.length, tag.length - close.length);
  const attrs = [];
  let m;
  ATTR.lastIndex = 0;
  while ((m = ATTR.exec(body))) attrs.push([m[1], m[2] ?? m[3] ?? m[4] ?? null]);
  for (const [k, v] of Object.entries(values)) {
    const at = attrs.find((a) => a[0].toLowerCase() === k);
    if (at) at[1] = v; else attrs.push([k, v]);
  }
  return '<' + name + attrs.map(([k, v]) => (v == null ? ` ${k}` : ` ${k}="${escAttr(v)}"`)).join('') + close;
}

function updatePage(html) {
  const START = '<!-- bookmarklet:start -->', END = '<!-- bookmarklet:end -->';
  let out = '', pos = 0, regions = 0;
  const found = { loader: 0, offline: 0 };
  for (;;) {
    const a = html.indexOf(START, pos);
    if (a < 0) break;
    const b = html.indexOf(END, a + START.length);
    if (b < 0) die(`${rel(OUT.page)}: a ${START} marker has no ${END}.`);
    regions++;
    const region = html.slice(a + START.length, b).replace(/<a\b[^>]*>/g, (tag) => {
      const kind = /\sdata-bookmarklet\s*=\s*["']?(loader|offline)\b/.exec(tag);
      if (!kind) return tag;
      found[kind[1]]++;
      if (kind[1] === 'offline') return setAttrs(tag, { href: OFFLINE_PLACEHOLDER, 'data-bookmarklet-src': OFFLINE_SRC, 'data-version': VERSION });
      return setAttrs(tag, { href: LINKS.loader, 'data-version': VERSION });
    }).replace(/(<span\b[^>]*\sdata-bookmarklet-size\s*=\s*["']?(loader|offline)\b[^>]*>)[^<]*(<\/span>)/g,
      (m, open, kind, close) => open + SIZE_LABEL(LINKS[kind]) + close);
    out += html.slice(pos, a + START.length) + region + END;
    pos = b + END.length;
  }
  out += html.slice(pos);
  if (!regions) die(`${rel(OUT.page)} has no ${START} … ${END} markers.`);
  if (!new RegExp(`\\sid="${OFFLINE_PLACEHOLDER.slice(1)}"`).test(html)) die(`${rel(OUT.page)} has no id="${OFFLINE_PLACEHOLDER.slice(1)}" for the offline link's placeholder ${OFFLINE_PLACEHOLDER}.`);
  if (!found.loader || !found.offline) die(`${rel(OUT.page)}: the markers need at least one <a data-bookmarklet="loader"> and one <a data-bookmarklet="offline"> (found ${found.loader} and ${found.offline}).`);
  return { html: out, found };
}

if (!fs.existsSync(OUT.page)) die(`${rel(OUT.page)} is missing.`);
const pageBefore = read(OUT.page);
const page = updatePage(pageBefore);

/* -------------------------------------------------------------- write / check */

const outputs = [
  [OUT.skillBundle, bundle],
  [OUT.docsBundle, bundle],
  [OUT.console, consoleTxt],
  [OUT.offline, offlineTxt],
  [OUT.page, page.html],
];

if (CHECK) {
  const stale = outputs.filter(([p, text]) => !fs.existsSync(p) || read(p) !== text).map(([p]) => rel(p));
  if (stale.length) {
    console.error(`design-score build --check: ${stale.length} generated file(s) are stale or missing:\n  ${stale.join('\n  ')}\nRun: node skills/design-score/build.mjs`);
    process.exit(1);
  }
  console.log(`design-score build --check: up to date (Design Score ${VERSION}).`);
  process.exit(0);
}

let wrote = 0;
for (const [p, text] of outputs) {
  if (fs.existsSync(p) && read(p) === text) continue;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text, 'utf8');
  wrote++;
}

const row = (label, s, extra = '') => console.log(`  ${label.padEnd(22)} ${kb(Buffer.byteLength(s, 'utf8')).padStart(9)}  gzip ${kb(gz(s)).padStart(8)}${extra}`);
console.log(`Design Score ${VERSION}: ${wrote ? `wrote ${wrote} file(s)` : 'everything was up to date'}`);
row('mh-score.js', bundle, `  ${rel(OUT.skillBundle)} = ${rel(OUT.docsBundle)}`);
row('console.txt', consoleTxt, `  ${rel(OUT.console)}`);
row('loader bookmarklet', LINKS.loader, `  ${LINKS.loader.length} characters`);
row('offline bookmarklet', LINKS.offline, `  ${rel(OUT.offline)}, ${packNote}`);
row('score.html', page.html, `  ${page.found.loader} loader and ${page.found.offline} offline link(s) refreshed`);
