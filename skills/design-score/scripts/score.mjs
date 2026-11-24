#!/usr/bin/env node
// Design Score runner (optional): scores a live page 0-100 in headless Chrome with the Design Score probe.
// It uses a puppeteer-core and a Chrome or Edge that are already installed. It never installs or downloads
// anything, and the probe it injects makes no network requests. One browser, closed when the run ends.
// Usage: node score.mjs <url | localhost:3000 | page.html> [options]      (node score.mjs --help)
// Exit codes: 0 scored, 1 the page could not be scored, 2 setup or usage problem, 3 a score is under --fail-under.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_DIR = path.resolve(HERE, '..');
const SCORE_PAGE = 'https://makkov-design.github.io/makkov-harness/score.html';
const VIEWPORTS = {
  desktop: { name: 'desktop', width: 1440, height: 900, dpr: 1, mobile: false },
  phone: { name: 'phone', width: 390, height: 844, dpr: 3, mobile: true },
};

const HELP = `Design Score runner: score a live page 0-100 in headless Chrome.

Usage
  node score.mjs <url> [options]
  node score.mjs localhost:3000 --both --report
  node score.mjs https://example.com --style DESIGN.md --tokens
  node score.mjs ./dist/index.html --json before.json

Viewport
  --width <px> --height <px>   viewport size (default 1440 x 900)
  --phone                      390 x 844 at 3x with touch, like a phone
  --both                       desktop 1440 x 900, then phone 390 x 844, in one browser
  --scheme light|dark          emulate prefers-color-scheme

Output (the file name is optional; the default is shown in brackets)
  --json [file]                full result as JSON; printed to stdout when no file is given
  --report [file]              self-contained HTML report      [design-score-<host>.html]
  --style [file]               the page's style as DESIGN.md    [DESIGN.md]
  --tokens [file]              W3C design tokens (DTCG) JSON    [design-tokens-<host>.json]
  --prompt [file]              fix prompt for any agent         [design-score-<host>-prompt.md]
  --card [file]                1200 x 630 score card PNG        [design-score-<host>.png]
  --baseline <file.json>       compare with an earlier --json run ("Design Score 58 -> 86")
  --fail-under <n>             exit 3 when a score is under n (for CI)
  --force                      overwrite files that Design Score did not write

Run
  --wait <ms>                  extra wait after the page settles (default 800)
  --no-scroll                  skip the scroll pass that wakes lazy-loaded content
  --timeout <ms>               hard limit for the whole run (default 60000 per viewport)
  --max-elements <n>           probe sample size (default 4000)
  --chrome <path>              browser to use (else CHROME_PATH, PUPPETEER_EXECUTABLE_PATH, usual install paths)
  --bundle <path>              probe bundle (default: mh-score.js in the skill folder)
  --check                      find puppeteer-core, the browser and the bundle, then stop; launches nothing

Put the URL first. File names need their extension (--report out.html).
Run it from your project folder: a local page path, --baseline and every file it writes resolve against
the current folder.
puppeteer-core is looked up in PUPPETEER_DIR, HALLMARK_PUPPETEER, the current folder, the skill folder
and the global npm folder. Exit codes: 0 scored, 1 could not score, 2 setup or usage problem, 3 under --fail-under.
Other ways to score a page, with no install at all: ${SCORE_PAGE}
`;

/* ------------------------------------------------------------------ helpers */

class Fail extends Error { constructor(msg, code = 1) { super(msg); this.code = code; } }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
const oneLine = (s, max = 160) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > max ? t.slice(0, max - 1) + '…' : t; };
const errText = (e) => oneLine((e && e.message) || e, 200);

function paint(stream) {
  const on = !!stream.isTTY && !process.env.NO_COLOR && process.env.TERM !== 'dumb';
  const wrap = (a, b) => (s) => (on ? `\x1b[${a}m${s}\x1b[${b}m` : String(s));
  const p = { bold: wrap(1, 22), dim: wrap(2, 22), green: wrap(32, 39), yellow: wrap(33, 39), red: wrap(31, 39), cyan: wrap(36, 39) };
  p.tone = (score) => (score == null ? p.dim : score >= 90 ? p.green : score >= 50 ? p.yellow : p.red);
  return p;
}
const bar = (score, cells = 20) => { const n = Math.max(0, Math.min(cells, Math.round((score / 100) * cells))); return '█'.repeat(n) + '░'.repeat(cells - n); };

/* ------------------------------------------------------------------ arguments */

const OPTIONAL_FILE = { '--json': ['json', /\.json$/i], '--report': ['report', /\.html?$/i], '--style': ['style', /\.(md|markdown|txt)$/i],
  '--tokens': ['tokens', /\.json$/i], '--prompt': ['prompt', /\.(md|markdown|txt)$/i], '--card': ['card', /\.png$/i] };
const NUMBER = { '--width': 'width', '--height': 'height', '--wait': 'wait', '--timeout': 'timeout', '--max-elements': 'maxElements', '--fail-under': 'failUnder' };
const STRING = { '--scheme': 'scheme', '--baseline': 'baseline', '--chrome': 'chrome', '--bundle': 'bundle' };
const BOOL = { '--phone': 'phone', '--both': 'both', '--check': 'check', '--force': 'force', '--help': 'help', '-h': 'help' };

function parseArgs(argv) {
  const o = { url: null, width: null, height: null, wait: 800, timeout: null, maxElements: null, failUnder: null, scheme: null,
    baseline: null, chrome: null, bundle: null, phone: false, both: false, check: false, force: false, help: false, scroll: true,
    json: undefined, report: undefined, style: undefined, tokens: undefined, prompt: undefined, card: undefined };
  const toks = argv.map((a) => { const m = /^(--[a-z][a-z-]*)=([\s\S]*)$/.exec(a); return m ? { flag: m[1], value: m[2] } : { flag: /^-/.test(a) ? a : null, arg: a }; });
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], next = toks[i + 1];
    const plainNext = next && !next.flag ? next.arg : undefined;
    if (!t.flag) {
      if (o.url != null) throw new Fail(`Unexpected argument "${t.arg}". Put the URL first, and give file names their extension (for example --report report.html).`, 2);
      o.url = t.arg; continue;
    }
    const f = t.flag;
    if (f === '--no-scroll') { o.scroll = false; continue; }
    if (BOOL[f]) { o[BOOL[f]] = true; continue; }
    if (OPTIONAL_FILE[f]) {
      const [key, ext] = OPTIONAL_FILE[f];
      if (t.value != null) { if (!t.value) throw new Fail(`${f}= needs a file name.`, 2); o[key] = t.value; continue; }
      if (plainNext != null && ext.test(plainNext)) { o[key] = plainNext; i++; } else o[key] = true;
      continue;
    }
    if (NUMBER[f] || STRING[f]) {
      const v = t.value != null ? t.value : plainNext;
      if (v == null || v === '') throw new Fail(`${f} needs a value.`, 2);
      if (t.value == null) i++;
      if (STRING[f]) { o[STRING[f]] = v; continue; }
      const n = Number(v);
      if (!Number.isFinite(n)) throw new Fail(`${f} needs a number, not "${v}".`, 2);
      o[NUMBER[f]] = n; continue;
    }
    throw new Fail(`Unknown option ${f}. Run with --help for the list.`, 2);
  }
  const range = (key, lo, hi, label) => { if (o[key] != null && (o[key] < lo || o[key] > hi || !Number.isInteger(o[key]))) throw new Fail(`${label} must be a whole number from ${lo} to ${hi}.`, 2); };
  range('width', 240, 2560, '--width'); range('height', 240, 4000, '--height'); range('wait', 0, 30000, '--wait');
  range('timeout', 10000, 600000, '--timeout'); range('maxElements', 100, 20000, '--max-elements'); range('failUnder', 0, 100, '--fail-under');
  if (o.scheme != null && !/^(light|dark)$/.test(o.scheme)) throw new Fail('--scheme must be light or dark.', 2);
  if (o.both && (o.width != null || o.height != null || o.phone)) throw new Fail('--both uses 1440 x 900 and 390 x 844; drop --width, --height and --phone.', 2);
  return o;
}

function viewportsFor(o) {
  if (o.both) return [VIEWPORTS.desktop, VIEWPORTS.phone];
  const base = o.phone ? VIEWPORTS.phone : VIEWPORTS.desktop;
  if (o.width == null && o.height == null) return [base];
  return [{ ...base, name: o.phone ? 'phone' : 'custom', width: o.width || base.width, height: o.height || base.height }];
}

/* ------------------------------------------------------------------ target */

function normalizeTarget(input) {
  const s = String(input || '').trim();
  if (!s) throw new Fail('No page given. Example: node score.mjs https://example.com', 2);
  // Local and LAN dev servers (localhost, *.localhost, raw IPv4 such as 192.168.1.20:5173) are opened over http.
  const hostLike = /^(localhost|\d{1,3}(?:\.\d{1,3}){3}|\[::1\]|[a-z0-9-]+\.localhost)(:\d{1,5})?([/?#].*)?$/i;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) {
    let u; try { u = new URL(s); } catch { throw new Fail(`"${s}" is not a valid URL.`, 2); }
    if (!/^(https?|file):$/.test(u.protocol)) throw new Fail(`Only http, https and file pages can be scored, not ${u.protocol}`, 2);
    return u.href;
  }
  if (hostLike.test(s)) return new URL('http://' + s).href;
  const local = path.resolve(s);
  if (fs.existsSync(local)) {
    const st = fs.statSync(local);
    if (st.isFile()) return pathToFileURL(local).href;
    const index = path.join(local, 'index.html');
    if (st.isDirectory() && fs.existsSync(index)) return pathToFileURL(index).href;
    throw new Fail(`${local} is a folder without index.html. Give a page, or serve the folder and pass its localhost URL.`, 2);
  }
  // "example.com/pricing" is a site; "index.html" or "./dist/page.html" that does not exist is a missing file.
  const host = /^([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?::\d{1,5})?(?:[/?#].*)?$/i.exec(s);
  const fileTld = host && /\.(html?|md|json|png|jpe?g|svg|js|mjs|css|txt)$/i.test(host[1]);
  if (host && !fileTld) return new URL('https://' + s).href;
  if (fileTld || /[\\/]/.test(s)) throw new Fail(`No file at ${local}.`, 2);
  throw new Fail(`Cannot tell what to open from "${s}". Give a URL (https://...), localhost:3000 or a path to an .html file.`, 2);
}

function slugFor(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'file:') return path.basename(fileURLToPath(u)).replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
    return u.host.toLowerCase().replace(/^www\./, '').replace(/[^a-z0-9.-]+/g, '-').replace(/^-+|-+$/g, '') || 'page';
  } catch { return 'page'; }
}

/* ------------------------------------------------------------------ puppeteer and browser */

function globalRoots() {
  const out = [], exe = path.dirname(process.execPath), env = process.env;
  const prefix = env.npm_config_prefix || env.NPM_CONFIG_PREFIX;
  if (prefix) out.push(path.join(prefix, 'lib', 'node_modules'), path.join(prefix, 'node_modules'));
  out.push(path.join(exe, '..', 'lib', 'node_modules'), path.join(exe, 'node_modules'));
  if (env.APPDATA) out.push(path.join(env.APPDATA, 'npm', 'node_modules'));
  out.push(path.join(os.homedir(), '.npm-global', 'lib', 'node_modules'), '/usr/local/lib/node_modules', '/usr/lib/node_modules', '/opt/homebrew/lib/node_modules');
  return out;
}

function packageRoot(file, name) {
  let dir = path.dirname(file);
  for (let i = 0; i < 8; i++) {
    const pj = path.join(dir, 'package.json');
    try { const p = JSON.parse(fs.readFileSync(pj, 'utf8')); if (p.name === name) return { dir, version: p.version || '?' }; } catch { /* keep walking */ }
    const up = path.dirname(dir); if (up === dir) break; dir = up;
  }
  return { dir: path.dirname(file), version: '?' };
}

function selfEntry(dir, name) {
  // PUPPETEER_DIR may point at the package folder itself, outside any node_modules.
  try {
    const p = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    if (p.name !== name) return null;
    let e = p.exports && (typeof p.exports === 'string' ? p.exports : p.exports['.']);
    if (e && typeof e === 'object') e = e.import || e.default || e.require;
    if (e && typeof e === 'object') e = e.default;
    const file = path.join(dir, typeof e === 'string' ? e : (p.module || p.main || 'index.js'));
    return fs.existsSync(file) ? file : null;
  } catch { return null; }
}

function findPuppeteer() {
  const bases = [], seen = new Set();
  const add = (dir, why) => { if (!dir) return; const d = path.resolve(dir); if (!seen.has(d.toLowerCase())) { seen.add(d.toLowerCase()); bases.push({ dir: d, why }); } };
  add(process.env.PUPPETEER_DIR, 'PUPPETEER_DIR');
  add(process.env.HALLMARK_PUPPETEER, 'HALLMARK_PUPPETEER');
  add(process.cwd(), 'current folder');
  add(SKILL_DIR, 'skill folder');
  for (const g of globalRoots()) if (fs.existsSync(g)) add(g, 'global npm folder');
  for (const b of bases) {
    for (const name of ['puppeteer-core', 'puppeteer']) {
      let file = selfEntry(b.dir, name);
      if (!file) { try { file = createRequire(path.join(b.dir, 'noop.js')).resolve(name); } catch { file = null; } }
      if (file) { const root = packageRoot(file, name); return { name, file, dir: root.dir, version: root.version, why: b.why, searched: bases }; }
    }
  }
  return { searched: bases };
}

function findBrowser(flag) {
  const env = process.env, list = [];
  if (flag) {
    const p = path.resolve(flag);
    if (!fs.existsSync(p)) throw new Fail(`--chrome: no browser at ${p}.`, 2);
    return { file: p, why: '--chrome' };
  }
  for (const k of ['CHROME_PATH', 'PUPPETEER_EXECUTABLE_PATH', 'CHROME_BIN']) if (env[k]) list.push([env[k], k]);
  if (process.platform === 'win32') {
    const roots = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean);
    for (const r of roots) list.push([path.join(r, 'Google', 'Chrome', 'Application', 'chrome.exe'), 'Chrome']);
    for (const r of roots) list.push([path.join(r, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), 'Edge']);
    for (const r of roots) list.push([path.join(r, 'Chromium', 'Application', 'chrome.exe'), 'Chromium'], [path.join(r, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'), 'Brave']);
  } else if (process.platform === 'darwin') {
    for (const r of ['/Applications', path.join(os.homedir(), 'Applications')]) {
      list.push([path.join(r, 'Google Chrome.app/Contents/MacOS/Google Chrome'), 'Chrome'], [path.join(r, 'Chromium.app/Contents/MacOS/Chromium'), 'Chromium'],
        [path.join(r, 'Microsoft Edge.app/Contents/MacOS/Microsoft Edge'), 'Edge'], [path.join(r, 'Brave Browser.app/Contents/MacOS/Brave Browser'), 'Brave']);
    }
  } else {
    const names = ['google-chrome-stable', 'google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge', 'microsoft-edge-stable', 'brave-browser'];
    const dirs = String(env.PATH || '').split(path.delimiter).concat(['/usr/bin', '/usr/local/bin', '/snap/bin', '/opt/google/chrome']);
    for (const d of dirs) for (const n of names) if (d) list.push([path.join(d, n), n]);
    list.push(['/opt/google/chrome/chrome', 'Chrome']);
  }
  for (const [file, why] of list) { try { if (file && fs.statSync(file).isFile()) return { file, why }; } catch { /* next */ } }
  return null;
}

function readBundle(flag) {
  if (flag) {
    const p = path.resolve(flag);
    if (!fs.existsSync(p)) throw new Fail(`--bundle: no file at ${p}.`, 2);
    return { code: fs.readFileSync(p, 'utf8'), file: p, ui: true };
  }
  const bundle = path.join(SKILL_DIR, 'mh-score.js');
  if (fs.existsSync(bundle)) return { code: fs.readFileSync(bundle, 'utf8'), file: bundle, ui: true };
  // Not built yet (a fresh clone of the source): fall back to the sources. Neither has the autorun.
  const probe = path.join(SKILL_DIR, 'src', 'probe.js'), ui = path.join(SKILL_DIR, 'src', 'ui.js');
  if (!fs.existsSync(probe)) throw new Fail(`The probe bundle is missing: ${bundle}. Run node ${path.join(SKILL_DIR, 'build.mjs')} or pass --bundle.`, 2);
  const hasUi = fs.existsSync(ui);
  return { code: fs.readFileSync(probe, 'utf8') + (hasUi ? '\n;\n' + fs.readFileSync(ui, 'utf8') : ''), file: hasUi ? `${probe} + ${ui}` : probe, ui: hasUi };
}

const MISSING_PUPPETEER = (searched) => `Design Score: puppeteer-core is not installed where this runner can find it, so nothing was launched.

This runner is optional. Ways to score a page with no install:
  1. A browser tool that runs JavaScript in the page (Claude in Chrome, the Claude app's browser,
     Playwright MCP, Chrome DevTools MCP): see ${path.join(SKILL_DIR, 'reference', 'running-the-probe.md')}
  2. The bookmarklet or console snippet: ${SCORE_PAGE}

To use this runner, review puppeteer-core with the third-party-install-guard skill first (the harness
reviewed 25.16.0, see SECURITY.md), install it with --ignore-scripts in a folder of your choice, and set
PUPPETEER_DIR to that folder. Do not install it without the person's go-ahead.

Searched: ${searched.map((b) => `${b.dir} (${b.why})`).join('; ') || 'nothing'}
`;

const MISSING_BROWSER = `Design Score: no Chrome, Edge or Chromium found, so nothing was launched.
Pass --chrome <path to the browser executable>, or set CHROME_PATH. The runner never downloads a browser.
`;

/* ------------------------------------------------------------------ files */

function withSuffix(file, suffix) { const ext = path.extname(file); return file.slice(0, file.length - ext.length) + suffix + ext; }

function ours(file, kind) {
  try {
    if (kind === 'png') return /^design-score/i.test(path.basename(file));
    const t = fs.readFileSync(file, 'utf8').slice(0, 400000);
    if (kind === 'json') { try { const j = JSON.parse(t); return !!(j && ((j.score != null && j.categories) || j.desktop || j.phone || /Design Score/.test(j.$description || ''))); } catch { return false; } }
    return /Design Score/.test(t);
  } catch { return false; }
}

function guardFile(file, kind, force) {
  const abs = path.resolve(file);
  if (fs.existsSync(abs) && (!force && !ours(abs, kind) || fs.statSync(abs).isDirectory())) {
    throw new Fail(`${abs} already exists and was not written by Design Score. Pick another name or pass --force.`, 2);
  }
  return abs;
}

function writeOut(file, data, kind, force, saved) {
  const abs = guardFile(file, kind, force);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, data);
  saved.push(abs);
}

// Every file the run will write, decided before the browser starts, so a name clash fails fast.
function plannedFiles(o, slug, viewports) {
  const multi = viewports.length > 1, out = [];
  viewports.forEach((vp, i) => {
    const sfx = i === 0 || !multi ? '' : `-${vp.name}`;
    if (o.report) out.push({ key: 'report', i, kind: 'html', file: withSuffix(o.report === true ? `design-score-${slug}.html` : o.report, sfx) });
    if (o.card) out.push({ key: 'card', i, kind: 'png', file: withSuffix(o.card === true ? `design-score-${slug}.png` : o.card, sfx) });
  });
  if (o.style) out.push({ key: 'style', i: 0, kind: 'md', file: o.style === true ? 'DESIGN.md' : o.style });
  if (o.tokens) out.push({ key: 'tokens', i: 0, kind: 'json', file: o.tokens === true ? `design-tokens-${slug}.json` : o.tokens });
  if (o.prompt) out.push({ key: 'prompt', i: -1, kind: 'md', file: o.prompt === true ? `design-score-${slug}-prompt.md` : o.prompt });
  if (typeof o.json === 'string') out.push({ key: 'json', i: -1, kind: 'json', file: o.json });
  const seen = new Set();
  for (const f of out) {
    const abs = guardFile(f.file, f.kind, o.force);
    if (seen.has(abs.toLowerCase())) throw new Fail(`Two outputs would be written to ${abs}; give them different names.`, 2);
    seen.add(abs.toLowerCase());
  }
  return out;
}

async function loadPuppeteer(pp) {
  let mod;
  try { mod = await import(pathToFileURL(pp.file).href); } catch (e) { throw new Fail(`Could not load ${pp.name} from ${pp.dir}: ${errText(e)}`, 2); }
  const api = mod && mod.default && typeof mod.default.launch === 'function' ? mod.default : mod;
  if (!api || typeof api.launch !== 'function') throw new Fail(`${pp.name} in ${pp.dir} has no launch(); is it a real puppeteer build?`, 2);
  return api;
}

// The browser found on disk, else the one puppeteer itself knows about (installed Chrome, or full puppeteer's own download).
function resolveExe(puppeteer, pp, found) {
  if (found) return found;
  try {
    const guess = pp.name === 'puppeteer' ? puppeteer.executablePath() : puppeteer.executablePath('chrome');
    if (guess && fs.existsSync(guess)) return { file: guess, why: `${pp.name} default` };
  } catch { /* none */ }
  return null;
}

/* ------------------------------------------------------------------ the result, checked in Node */

// The probe runs in an isolated world, so the page cannot replace it, but everything it reads (title, text, class
// names, font names, custom properties) is still page-controlled. Every field is checked here: known keys only,
// numbers finite and clamped, strings single-line and capped, lists capped. The files are then built in Node.
// Control, format and line-separator characters (C0, C1, soft hyphen, bidi controls, zero-width, U+2028/2029, BOM).
const CTRL_RANGES = [[0x00, 0x1f], [0x7f, 0x9f], [0xad, 0xad], [0x61c, 0x61c], [0x180e, 0x180e], [0x200b, 0x200f], [0x2028, 0x202e], [0x2060, 0x206f], [0xfeff, 0xfeff], [0xfff9, 0xfffb]];
const hx = (n) => '\\u' + n.toString(16).padStart(4, '0');
const CTRL = new RegExp('[' + CTRL_RANGES.map(([a, b]) => hx(a) + '-' + hx(b)).join('') + ']', 'g');
const CTRL_OR_TICK = new RegExp('[' + CTRL_RANGES.map(([a, b]) => hx(a) + '-' + hx(b)).join('') + '`]');
const txt = (v, max) => {
  if (typeof v !== 'string') return '';
  const t = v.slice(0, 4000).replace(CTRL, ' ').replace(/`/g, 'ˋ').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1) + '…' : t;
};
const optTxt = (v, max) => (typeof v === 'string' && v ? txt(v, max) : undefined);
const numIn = (v, lo, hi, dflt = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : dflt);
const intIn = (v, lo, hi, dflt = 0) => Math.round(numIn(v, lo, hi, dflt));
const bool = (v) => v === true;
const oneOf = (v, list, dflt) => (list.includes(v) ? v : dflt);
const ident = (v, max = 60) => (typeof v === 'string' && /^[A-Za-z][A-Za-z0-9_-]*$/.test(v) && v.length <= max ? v : '');
const list = (v, max, fn) => (Array.isArray(v) ? v.slice(0, max).map(fn).filter((x) => x != null) : []);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
const hex = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(v) ? v.toLowerCase() : null);
const isoTime = (v) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/.test(v) ? v : new Date().toISOString());
const gradeOf = (s) => (s >= 95 ? 'A+' : s >= 85 ? 'A' : s >= 75 ? 'B' : s >= 65 ? 'C' : s >= 50 ? 'D' : 'F');

// The address and host come from the browser, not from the page's answer.
function where(finalUrl) {
  try {
    const u = new URL(finalUrl);
    const host = u.hostname ? u.hostname + (u.port ? ':' + u.port : '') : (u.protocol === 'file:' ? 'local file' : 'page');
    return { url: txt(u.href.split(/[?#]/)[0], 2000), host: txt(host, 260) };
  } catch { return { url: '', host: 'page' }; }
}

const cleanRect = (v) => { const r = obj(v); return { x: numIn(r.x, -1e6, 1e6), y: numIn(r.y, -1e6, 1e6), width: numIn(r.width, 0, 1e6), height: numIn(r.height, 0, 1e6) }; };
function cleanExample(v) {
  if (!v || typeof v !== 'object') return null;
  const out = { selector: txt(v.selector, 300) };
  if (typeof v.text === 'string') out.text = txt(v.text, 120);
  if (v.rect && typeof v.rect === 'object') out.rect = cleanRect(v.rect);
  if (typeof v.note === 'string') out.note = txt(v.note, 200);
  return out;
}
// A check's raw value: flat, known shapes only (a number, boolean or short string, a short list of them, or an
// object of those).
const cleanScalar = (y, max) => (typeof y === 'number' ? numIn(y, -1e9, 1e9) : typeof y === 'boolean' ? y : typeof y === 'string' ? txt(y, max) : null);
function cleanValue(v) {
  if (v == null) return null;
  if (typeof v !== 'object') return cleanScalar(v, 200);
  if (Array.isArray(v)) return list(v, 50, (y) => cleanScalar(y, 100));
  const out = {};
  for (const k of Object.keys(v).slice(0, 40)) {
    if (!/^[A-Za-z][A-Za-z0-9]{0,39}$/.test(k)) continue;
    const x = v[k];
    if (typeof x === 'number') out[k] = numIn(x, -1e9, 1e9);
    else if (typeof x === 'boolean' || x === null) out[k] = x;
    else if (typeof x === 'string') out[k] = txt(x, 200);
    else if (Array.isArray(x)) out[k] = list(x, 50, (y) => (typeof y === 'number' ? numIn(y, -1e9, 1e9) : typeof y === 'string' ? txt(y, 100) : null));
  }
  return out;
}
function cleanCheck(v) {
  const c = obj(v);
  if (!ident(c.id)) return null;
  return { id: c.id, category: ident(c.category), label: txt(c.label, 100), status: oneOf(c.status, ['pass', 'warn', 'fail', 'skip'], 'skip'),
    score: numIn(c.score, 0, 100), value: cleanValue(c.value), display: txt(c.display, 400), target: txt(c.target, 300), why: txt(c.why, 600),
    examples: list(c.examples, 12, cleanExample) };
}
function cleanCategory(v) {
  const c = obj(v);
  if (!ident(c.id)) return null;
  return { id: c.id, label: txt(c.label, 60), weight: numIn(c.weight, 0, 100), score: c.score == null ? null : numIn(c.score, 0, 100),
    measured: bool(c.measured), summary: txt(c.summary, 400), checks: list(c.checks, 40, cleanCheck) };
}
function cleanIssue(v) {
  const i = obj(v);
  if (!ident(i.id, 80)) return null;
  return { id: i.id, checkId: ident(i.checkId), category: ident(i.category), severity: oneOf(i.severity, ['high', 'medium', 'low'], 'low'),
    title: txt(i.title, 200), detail: txt(i.detail, 600), fix: txt(i.fix, 600), impact: numIn(i.impact, 0, 100), examples: list(i.examples, 12, cleanExample) };
}

function cleanResult(raw, finalUrl) {
  const r = obj(raw), vp = obj(r.viewport), sc = obj(r.scanned);
  const out = { version: txt(r.version, 20), ...where(finalUrl), title: txt(r.title, 140), timestamp: isoTime(r.timestamp),
    viewport: { width: intIn(vp.width, 0, 100000), height: intIn(vp.height, 0, 100000), dpr: numIn(vp.dpr, 0, 16, 1) },
    scanned: { elements: intIn(sc.elements, 0, 1e8), textBlocks: intIn(sc.textBlocks, 0, 1e8), decorative: intIn(sc.decorative, 0, 1e8),
      unrendered: intIn(sc.unrendered, 0, 1e8), ms: intIn(sc.ms, 0, 1e8), truncated: bool(sc.truncated), stoppedBy: optTxt(sc.stoppedBy, 60) || null } };
  if (typeof r.error === 'string' && r.error) out.error = txt(r.error, 400);
  out.score = Math.round(numIn(r.score, 0, 100));
  out.grade = gradeOf(out.score);
  out.categories = list(r.categories, 12, cleanCategory);
  out.issues = list(r.issues, 100, cleanIssue);
  return out;
}

function cleanStyle(raw, finalUrl) {
  const s = obj(raw), roles = obj(s.roles);
  const word = (v) => (typeof v === 'string' && /^[a-z]{1,20}$/.test(v) ? v : null);
  const count = (v) => intIn(v, 0, 1e8);
  const out = { version: txt(s.version, 20), ...where(finalUrl), title: txt(s.title, 140), timestamp: isoTime(s.timestamp) };
  if (typeof s.error === 'string' && s.error) out.error = txt(s.error, 200);
  out.colors = list(s.colors, 64, (c) => { c = obj(c); const h = hex(c.hex); return h && { hex: h, count: count(c.count), roles: list(c.roles, 8, word), name: txt(c.name, 40) }; });
  out.roles = Object.fromEntries(['background', 'surface', 'text', 'muted', 'accent', 'border'].map((k) => [k, hex(roles[k])]));
  out.fonts = list(s.fonts, 16, (f) => { f = obj(f); const family = txt(f.family, 80); return family ? { family, stack: txt(f.stack, 300), roles: list(f.roles, 8, word), count: count(f.count), weights: list(f.weights, 12, (w) => intIn(w, 1, 1000)) } : null; });
  out.typeScale = list(s.typeScale, 24, (t) => { t = obj(t); return { px: numIn(t.px, 0, 2000), rem: numIn(t.rem, 0, 200), count: count(t.count), lineHeight: numIn(t.lineHeight, 0, 2000), weight: intIn(t.weight, 1, 1000, 400), sample: typeof t.sample === 'string' && /^[a-z][a-z0-9-]{0,30}$/.test(t.sample) ? t.sample : '' }; });
  out.spacing = list(s.spacing, 40, (x) => { x = obj(x); return { px: numIn(x.px, -10000, 10000), count: count(x.count) }; });
  out.radii = list(s.radii, 24, (x) => { x = obj(x); return { px: numIn(x.px, 0, 9999), count: count(x.count) }; });
  out.shadows = list(s.shadows, 16, (x) => { x = obj(x); const value = txt(x.value, 300); return value ? { value, count: count(x.count) } : null; });
  out.customProperties = list(s.customProperties, 60, (p) => {
    p = obj(p);
    if (typeof p.name !== 'string' || !/^--[A-Za-z0-9_-]{1,64}$/.test(p.name) || typeof p.value !== 'string') return null;
    const value = p.value.trim();
    return value && value.length <= 160 && !CTRL_OR_TICK.test(value) ? { name: p.name, value } : null;
  });
  return out;
}

// The files are written by the bundle's own formatters, loaded into a Node vm context with no page and no DOM,
// and fed only the checked data above. The vm is not a security boundary; it only gives the bundle a global.
function nodeFormatter(code) {
  const sandbox = { MHScoreNoAuto: true, document: {} };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
  try { vm.runInContext(code, ctx, { timeout: 10000, filename: 'mh-score.js' }); } catch (e) { throw new Fail(`The probe bundle did not load in Node: ${errText(e)}`, 2); }
  return (data, want) => {
    ctx.__mhIn = JSON.stringify({ data, want });
    const outJson = vm.runInContext(`(function () {
      var d = JSON.parse(__mhIn), r = d.data.result, s = d.data.style, w = d.want, F = window.MHScore && window.MHScore.format, U = window.MHScoreUI;
      if (!F) throw new Error('MHScore.format is not in this bundle');
      var out = { prompt: F.promptMd(r), designMd: null, tokens: null, report: null, notes: [] };
      if (w.style) out.designMd = F.designMd(s);
      if (w.tokens) out.tokens = JSON.stringify(F.tokens(s), null, 2);
      if (w.report) {
        if (!U || typeof U.reportHtml !== 'function') out.notes.push('report: MHScoreUI.reportHtml is not in this bundle');
        else out.report = U.reportHtml(r, s);
      }
      return JSON.stringify(out);
    })()`, ctx, { timeout: 10000 });
    delete ctx.__mhIn;
    const out = JSON.parse(outJson);
    for (const k of ['prompt', 'designMd', 'tokens', 'report']) if (out[k] != null && typeof out[k] !== 'string') out[k] = null;
    // The report's only script is the bundle's own copy-button code; anything else means the page got through.
    if (out.report != null && ((out.report.match(/<script\b/gi) || []).length !== 1 || (out.report.match(/<\/script/gi) || []).length !== 1)) {
      out.report = null; out.notes.push('report: refused, it would carry a script that is not Design Score\'s own');
    }
    return out;
  };
}

/* ------------------------------------------------------------------ in the page */

// Runs inside the page: scroll through once so lazy and reveal-on-scroll content mounts, then return to the top.
const SCROLL_PASS = async (budget) => {
  const t0 = Date.now(), wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const se = document.scrollingElement || document.documentElement;
  const go = (y) => { try { window.scrollTo({ top: y, left: 0, behavior: 'instant' }); } catch (e) { window.scrollTo(0, y); } };
  let y = 0;
  for (let i = 0; i < 30 && Date.now() - t0 < budget; i++) {
    const max = Math.max(0, se.scrollHeight - window.innerHeight);
    if (y >= max) break;
    y = Math.min(max, y + Math.round(window.innerHeight * 0.85));
    go(y); await wait(120);
  }
  go(0); await wait(300);
  return y;
};

// Runs in the probe's isolated world (see inWorld): measure and extract the style, and hand back plain JSON text only.
// The page's own scripts live in another world, so they cannot replace window.MHScore or anything it calls.
const MEASURE_IN_WORLD = (o) => {
  const S = window.MHScore;
  if (!S || typeof S.run !== 'function' || typeof S.extractStyle !== 'function' || !S.format) return JSON.stringify({ missing: true });
  const opts = o.maxElements ? { maxElements: o.maxElements } : {};
  const r = S.run(opts), s = S.extractStyle(opts);
  return '{"result":' + S.format.json(r) + ',"style":' + S.format.json(s) + '}';
};

// Runs in the isolated world: draw the score card from the result Node already checked.
const CARD_IN_WORLD = async (r) => {
  const U = window.MHScoreUI;
  if (!U || typeof U.cardCanvas !== 'function') return { note: 'card: MHScoreUI.cardCanvas is not in this bundle' };
  let c = U.cardCanvas(r);
  if (c && typeof c.then === 'function') c = await c;
  return c && typeof c.toDataURL === 'function' ? { png: c.toDataURL('image/png') } : { note: 'card: cardCanvas did not return a canvas' };
};

// A fresh isolated world on the page's main frame, through the DevTools protocol: it shares the DOM with the page
// but not its JavaScript globals or prototypes, and the page's CSP does not apply to it. Results come back by value.
async function inWorld(page) {
  const cdp = typeof page.createCDPSession === 'function' ? await page.createCDPSession() : await page.target().createCDPSession();
  const { frameTree } = await cdp.send('Page.getFrameTree');
  const { executionContextId } = await cdp.send('Page.createIsolatedWorld', { frameId: frameTree.frame.id, worldName: 'mh-score-' + Math.random().toString(36).slice(2) });
  const run = async (expression) => {
    const res = await cdp.send('Runtime.evaluate', { expression, contextId: executionContextId, awaitPromise: true, returnByValue: true, userGesture: false });
    if (res.exceptionDetails) throw new Error((res.exceptionDetails.exception && res.exceptionDetails.exception.description) || res.exceptionDetails.text || 'the probe threw');
    return res.result ? res.result.value : undefined;
  };
  const call = (fn, arg) => run(`(${fn.toString()})(${JSON.stringify(arg)})`);
  return { run, call, close: () => cdp.detach().catch(() => {}) };
}

const MAX_RAW = 32 * 1024 * 1024;
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function pngOf(v) {
  if (typeof v !== 'string' || v.length > MAX_RAW || !v.startsWith('data:image/png;base64,')) return null;
  const buf = Buffer.from(v.slice('data:image/png;base64,'.length), 'base64');
  return buf.length > 8 && buf.subarray(0, 8).equals(PNG_SIG) ? buf : null;
}

async function scoreViewport(browser, url, vp, o, bundle, format, remaining, log) {
  const page = await browser.newPage();
  try {
    page.setDefaultTimeout(30000);
    page.on('dialog', (d) => { d.dismiss().catch(() => {}); });
    try { await page.setBypassCSP(true); } catch { /* older puppeteer: the evaluate path below ignores CSP anyway */ }
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: vp.dpr, isMobile: vp.mobile, hasTouch: vp.mobile });
    if (o.scheme) await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: o.scheme }]);

    let resp;
    try {
      resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: Math.max(5000, Math.min(30000, remaining() - 10000)) });
    } catch (e) {
      const m = errText(e);
      const hint = /ERR_CONNECTION_REFUSED|ECONNREFUSED/.test(m) ? ' Is the dev server running?' : /ERR_NAME_NOT_RESOLVED/.test(m) ? ' Check the address.' : /timeout/i.test(m) ? ' The page did not start loading in time.' : '';
      throw new Fail(`Could not open ${url}: ${m}.${hint}`);
    }
    const status = resp && typeof resp.status === 'function' ? resp.status() : 0;
    if (status >= 400) log(`Warning: the server answered ${status} for ${url}; scoring what it rendered.`);

    const until = (cap) => Math.max(500, Math.min(cap, remaining() - 8000));
    try { await page.waitForFunction('document.readyState === "complete"', { timeout: until(15000) }); } catch { log('Note: the page was still loading; scoring what is there.'); }
    try { await page.waitForNetworkIdle({ idleTime: 500, timeout: until(5000) }); } catch { /* busy pages never go idle */ }
    try { await page.evaluate(() => Promise.race([document.fonts ? document.fonts.ready : null, new Promise((r) => setTimeout(r, 3000))])); } catch { /* ignore */ }
    if (o.scroll) { try { await page.evaluate(SCROLL_PASS, Math.min(4000, until(4000))); } catch { /* ignore */ } }
    if (o.wait) await sleep(Math.min(o.wait, until(o.wait)));

    let raw = null, world = null;
    for (let attempt = 0; attempt < 2 && raw == null; attempt++) {
      try {
        // The bundle and the call that measures run only in the isolated world. NoAuto keeps the panel closed.
        world = await inWorld(page);
        await world.run('window.MHScoreNoAuto = true;\n' + bundle.code + '\n;void 0;');
        raw = await world.call(MEASURE_IN_WORLD, { maxElements: o.maxElements });
      } catch (e) {
        if (world) { await world.close(); world = null; }
        if (attempt === 0 && /context was destroyed|navigat|detached|Cannot find context|No frame/i.test(errText(e))) {
          log('Note: the page navigated while it was being scored; trying once more.');
          try { await page.waitForFunction('document.readyState === "complete"', { timeout: until(10000) }); } catch { /* ignore */ }
          continue;
        }
        if (e instanceof Fail) throw e;
        throw new Fail(`Could not score ${url}: ${errText(e)}`);
      }
    }
    if (raw == null) throw new Fail(`Could not score ${url}: the page kept navigating (a redirect loop or a login wall?).`);
    try {
      let parsed;
      try { parsed = typeof raw === 'string' && raw.length <= MAX_RAW ? JSON.parse(raw) : null; } catch { parsed = null; }
      if (!parsed || typeof parsed !== 'object') throw new Fail('The probe returned a result that is not valid JSON.');
      if (parsed.missing) throw new Fail('The probe did not load in this page (window.MHScore is missing).');
      const finalUrl = page.url();
      const result = cleanResult(parsed.result, finalUrl);
      if (result.error) throw new Fail(oneLine(result.error, 240));
      const style = cleanStyle(parsed.style, finalUrl);
      const out = format({ result, style }, { style: !!o.style, tokens: !!o.tokens, report: !!o.report });
      out.card = null;
      if (o.card) {
        try {
          const c = await world.call(CARD_IN_WORLD, result);
          if (c && typeof c.note === 'string') out.notes.push(txt(c.note, 200));
          else if (!(out.card = pngOf(c && c.png))) out.notes.push('card: the canvas did not give a PNG');
        } catch (e) { out.notes.push('card: ' + errText(e)); }
      }
      for (const n of out.notes) log(`Note: ${n}.`);
      return { vp, result, style, out, finalUrl };
    } finally {
      await world.close();
    }
  } finally {
    await page.close().catch(() => {});
  }
}

/* ------------------------------------------------------------------ printing */

function printRun(w, run, label, p) {
  const r = run.result, vp = r.viewport || {}, sc = r.scanned || {};
  w('');
  w(`${p.bold('Design Score')}  ${p.bold(p.tone(r.score)(`${r.score}/100`))}  ${p.bold(r.grade)}   ${r.host} · ${vp.width}×${vp.height}${label ? ` (${label})` : ''}`);
  w(p.dim(`  ${oneLine(r.title || r.url, 90)}`));
  w(p.dim(`  Measured ${fmt(sc.elements)} elements and ${fmt(sc.textBlocks)} text blocks in ${fmt(sc.ms)} ms${sc.truncated ? '; the page is huge, so only its first elements were sampled' : ''}.`));
  w('');
  for (const c of r.categories || []) {
    const name = String(c.label).padEnd(20);
    if (c.score == null) w(`  ${name}  ${p.dim('  —')}  ${p.dim(oneLine(c.summary, 90))}`);
    else w(`  ${name}  ${p.tone(c.score)(String(c.score).padStart(3))}  ${p.tone(c.score)(bar(c.score))}  ${p.dim(`weight ${c.weight}`)}`);
  }
  const issues = (r.issues || []).slice(0, 5);
  w('');
  if (!issues.length) w(`  ${p.green('No measured issues.')} Judge hierarchy, primary action, density, consistency and polish by eye (rubric.md).`);
  else {
    w(p.bold('  Top fixes'));
    issues.forEach((is, i) => {
      const sev = is.severity === 'high' ? p.red : is.severity === 'medium' ? p.yellow : p.dim;
      w(`  ${i + 1}. ${sev(String(is.severity).padEnd(6))} ${oneLine(is.title, 100)}  ${p.dim(`costs ${is.impact} pts`)}`);
      w(`     ${p.dim('Fix:')} ${oneLine(is.fix, 150)}`);
      const where = [...new Set((is.examples || []).map((e) => e && e.selector).filter(Boolean))].slice(0, 3);
      if (where.length) w(`     ${p.dim('Where:')} ${where.map((s) => oneLine(s, 60)).join(', ')}`);
    });
  }
  const skipped = (r.categories || []).flatMap((c) => c.checks || []).filter((k) => k.status === 'skip');
  if (skipped.length) {
    w('');
    w(p.dim(`  Not measured (${skipped.length}):`));
    skipped.slice(0, 8).forEach((k) => w(p.dim(`  - ${k.label}: ${oneLine(String(k.display).replace(/^Not measured:?\s*/i, ''), 110)}`)));
    if (skipped.length > 8) w(p.dim(`  - and ${skipped.length - 8} more (see --report or --json)`));
  }
}

function pickBaseline(base, run, index) {
  if (!base) return null;
  if (base.score != null && base.categories) return index === 0 ? base : null;
  return base[run.vp.name] || (index === 0 ? base.desktop || base.custom : null) || null;
}

function printDelta(w, before, after, label, p) {
  const sign = (d) => (d > 0 ? p.green(`+${d}`) : d < 0 ? p.red(String(d)) : p.dim('±0'));
  w('');
  w(p.bold(`  Before → after${label ? ` (${label})` : ''}: Design Score ${before.score} → ${after.score} (${sign(after.score - before.score)}), ${before.grade} → ${after.grade}`));
  for (const c of after.categories || []) {
    const b = (before.categories || []).find((x) => x.id === c.id);
    if (!b) continue;
    const bs = b.score == null ? '—' : b.score, as = c.score == null ? '—' : c.score;
    const d = b.score != null && c.score != null ? sign(c.score - b.score) : '';
    w(`  ${String(c.label).padEnd(20)}  ${String(bs).padStart(3)} → ${String(as).padStart(3)}  ${d}`);
  }
  if (before.viewport && after.viewport && (before.viewport.width !== after.viewport.width || before.viewport.height !== after.viewport.height)) {
    w(p.yellow(`  The baseline was measured at ${before.viewport.width}×${before.viewport.height}, this run at ${after.viewport.width}×${after.viewport.height}: compare like with like.`));
  }
}

/* ------------------------------------------------------------------ main */

async function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) throw new Fail(`The Design Score runner needs Node 18 or newer (puppeteer-core 25 needs 22.12); this is ${process.versions.node}.`, 2);
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { process.stdout.write(HELP); return 0; }

  const pp = findPuppeteer();
  const browserPath = findBrowser(o.chrome);
  const bundle = readBundle(o.bundle);

  const probeVersion = (/VERSION\s*=\s*['"]([^'"]+)['"]/.exec(bundle.code) || [])[1] || '?';

  if (o.check) {
    const w = (s) => process.stdout.write(s + '\n');
    w(`puppeteer: ${pp.file ? `${pp.name} ${pp.version} in ${pp.dir} (${pp.why})` : 'not found'}`);
    const api = pp.file ? await loadPuppeteer(pp) : null;
    const exe = api ? resolveExe(api, pp, browserPath) : browserPath;
    w(`browser:   ${exe ? `${exe.file} (${exe.why})` : 'not found'}`);
    w(`bundle:    ${bundle.file} (probe ${probeVersion})${bundle.ui ? '' : ' (no ui.js: --report and --card are unavailable)'}`);
    w(`node:      ${process.versions.node}`);
    if (!pp.file) { process.stderr.write('\n' + MISSING_PUPPETEER(pp.searched)); return 2; }
    if (!exe) { process.stderr.write('\n' + MISSING_BROWSER); return 2; }
    w('\nReady. Nothing was launched.');
    return 0;
  }

  if (!o.url) throw new Fail('No page given. Example: node score.mjs https://example.com (or --help).', 2);
  const url = normalizeTarget(o.url);
  const slug = slugFor(url);
  const viewports = viewportsFor(o);
  if ((o.report || o.card) && !bundle.ui) throw new Fail('--report and --card need ui.js, which is not in this bundle. Build mh-score.js first (build.mjs).', 2);
  plannedFiles(o, slug, viewports);

  let baseline = null;
  if (o.baseline) {
    try { baseline = JSON.parse(fs.readFileSync(path.resolve(o.baseline), 'utf8')); } catch (e) { throw new Fail(`--baseline: cannot read ${o.baseline} as JSON (${errText(e)}).`, 2); }
    if (!baseline || !((baseline.score != null && baseline.categories) || baseline.desktop || baseline.phone || baseline.custom)) throw new Fail(`--baseline: ${o.baseline} is not a Design Score result (save one with --json file.json).`, 2);
  }
  if (!pp.file) { process.stderr.write(MISSING_PUPPETEER(pp.searched)); return 2; }

  const puppeteer = await loadPuppeteer(pp);
  const exeFound = resolveExe(puppeteer, pp, browserPath);
  if (!exeFound) { process.stderr.write(MISSING_BROWSER); return 2; }
  const exe = exeFound.file;
  const format = nodeFormatter(bundle.code);

  const jsonToStdout = o.json === true;
  const ws = jsonToStdout ? process.stderr : process.stdout;
  const p = paint(ws);
  const w = (s) => ws.write(s + '\n');
  const pe = paint(process.stderr);
  const log = (s) => process.stderr.write(pe.dim(s) + '\n');

  const hardLimit = o.timeout || 60000 * viewports.length;
  const t0 = Date.now();
  const remaining = () => hardLimit - (Date.now() - t0);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-score-'));
  let browser = null;
  const cleanup = () => {
    try { const proc = browser && browser.process && browser.process(); if (proc && proc.exitCode == null) proc.kill('SIGKILL'); } catch { /* gone */ }
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 200 }); } catch { /* the OS cleans temp */ }
  };
  const watchdog = setTimeout(() => {
    process.stderr.write(`Design Score: stopped after ${hardLimit} ms (--timeout). The browser was closed.\n`);
    cleanup(); process.exit(1);
  }, hardLimit);
  const onSignal = () => { cleanup(); process.exit(130); };
  process.once('SIGINT', onSignal); process.once('SIGTERM', onSignal);

  const runs = [];
  const saved = [];
  try {
    const args = ['--no-first-run', '--no-default-browser-check', '--disable-extensions', '--disable-background-networking', '--disable-sync', '--disable-default-apps', '--mute-audio'];
    if (url.startsWith('file:')) args.push('--allow-file-access-from-files');
    if (process.platform === 'linux' && typeof process.getuid === 'function' && process.getuid() === 0) { // Chrome refuses its sandbox as root (cloud containers)
      args.push('--no-sandbox');
      log('Warning: running as root, so Chrome runs without its sandbox (--no-sandbox). Score only pages you trust, or run as a normal user.');
    }
    log(`Scoring ${url} with ${path.basename(exe)} at ${viewports.map((v) => `${v.width}×${v.height}`).join(' and ')}...`);
    browser = await puppeteer.launch({
      headless: true, executablePath: exe, userDataDir: profile, args,
      defaultViewport: { width: viewports[0].width, height: viewports[0].height },
      timeout: 30000, protocolTimeout: 45000, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
    });
    for (const vp of viewports) {
      if (remaining() < 9000) throw new Fail(`Not enough time left for the ${vp.name} run; raise --timeout.`);
      runs.push(await scoreViewport(browser, url, vp, o, bundle, format, remaining, log));
    }
  } finally {
    clearTimeout(watchdog);
    if (browser) { await Promise.race([browser.close().catch(() => {}), sleep(5000)]); }
    cleanup();
  }

  // Files. With --both the phone report and card get a "-phone" suffix; DESIGN.md and tokens come from the first run;
  // the prompt holds every run; the JSON is one result, or { desktop, phone } with --both.
  const multi = runs.length > 1;
  const jsonData = multi ? Object.fromEntries(runs.map((run) => [run.vp.name, run.result])) : runs[0].result;
  for (const f of plannedFiles(o, slug, viewports)) {
    const run = runs[Math.max(0, f.i)];
    let data = null;
    if (f.key === 'report') data = run.out.report;
    else if (f.key === 'card') data = run.out.card;
    else if (f.key === 'style') data = run.out.designMd && run.out.designMd + '\n';
    else if (f.key === 'tokens') data = run.out.tokens && run.out.tokens + '\n';
    else if (f.key === 'prompt') data = runs.map((x) => x.out.prompt).join('\n\n---\n\n') + '\n';
    else if (f.key === 'json') data = JSON.stringify(jsonData, null, 2) + '\n';
    if (data) writeOut(f.file, data, f.kind, o.force, saved);
    else log(`Note: nothing to write for --${f.key}.`);
  }

  // Summary (stderr when the JSON goes to stdout).
  runs.forEach((run, i) => {
    printRun(w, run, multi || run.vp.name !== 'desktop' ? run.vp.name : '', p);
    const before = pickBaseline(baseline, run, i);
    if (before) printDelta(w, before, run.result, multi ? run.vp.name : '', p);
  });
  if (baseline && !runs.some((run, i) => pickBaseline(baseline, run, i))) w(p.yellow('\n  The baseline has no run for this viewport, so there is nothing to compare.'));
  if (saved.length) { w(''); w(p.bold('  Saved')); saved.forEach((f) => w(`  ${f}`)); }
  if (!o.json && !baseline) w(p.dim('\n  Before you fix: save this run with --json before.json, then re-run with --baseline before.json.'));
  w('');
  w(runs.map((run) => `Design Score ${run.result.score}/100 (${run.result.grade}) for ${run.result.host} at ${run.result.viewport.width}×${run.result.viewport.height}`).join('; '));
  if (jsonToStdout) process.stdout.write(JSON.stringify(jsonData, null, 2) + '\n');

  if (o.failUnder != null) {
    const low = runs.filter((run) => run.result.score < o.failUnder);
    if (low.length) { process.stderr.write(`Design Score under ${o.failUnder}: ${low.map((run) => `${run.vp.name} ${run.result.score}`).join(', ')}.\n`); return 3; }
  }
  return 0;
}

main().then((code) => { process.exitCode = code; setTimeout(() => process.exit(code), 50).unref(); }, (e) => {
  const code = e instanceof Fail ? e.code : 1;
  process.stderr.write(`Design Score: ${e instanceof Fail ? e.message : errText(e)}\n`);
  process.exitCode = code;
  setTimeout(() => process.exit(code), 50).unref();
});
