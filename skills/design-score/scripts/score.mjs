#!/usr/bin/env node
// Design Score runner (optional): scores a live page 0-100 in headless Chrome with the Design Score probe.
// It uses a puppeteer-core and a Chrome or Edge that are already installed. It never installs or downloads
// anything, and the probe it injects makes no network requests. One browser, closed when the run ends.
// Usage: node score.mjs <url | localhost:3000 | page.html> [options]      (node score.mjs --help)
// Exit codes: 0 scored, 1 the page could not be scored, 2 setup or usage problem, 3 a score is under --fail-under.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

// Runs inside the page: measure, extract the style and format everything the caller asked for.
const SCORE_IN_PAGE = async (o) => {
  const S = window.MHScore, U = window.MHScoreUI;
  const r = S.run(o.maxElements ? { maxElements: o.maxElements } : {});
  const s = S.extractStyle(o.maxElements ? { maxElements: o.maxElements } : {});
  const out = { json: S.format.json(r), prompt: S.format.promptMd(r), designMd: null, tokens: null, report: null, card: null, notes: [] };
  if (o.style) out.designMd = S.format.designMd(s);
  if (o.tokens) out.tokens = JSON.stringify(S.format.tokens(s), null, 2);
  if (o.report) {
    if (!U || typeof U.reportHtml !== 'function') out.notes.push('report: MHScoreUI.reportHtml is not in this bundle');
    else {
      try { out.report = U.reportHtml(r, s); } catch (e) { out.notes.push('report: ' + (e && e.message)); }
      if (out.report != null && typeof out.report !== 'string') { out.report = null; out.notes.push('report: reportHtml did not return text'); }
    }
  }
  if (o.card) {
    if (!U || typeof U.cardCanvas !== 'function') out.notes.push('card: MHScoreUI.cardCanvas is not in this bundle');
    else {
      try {
        let c = U.cardCanvas(r);
        if (c && typeof c.then === 'function') c = await c;
        if (c && typeof c.toDataURL === 'function') out.card = c.toDataURL('image/png');
        else out.notes.push('card: cardCanvas did not return a canvas');
      } catch (e) { out.notes.push('card: ' + (e && e.message)); }
    }
  }
  return out;
};

async function scoreViewport(browser, url, vp, o, bundle, remaining, log) {
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

    let out = null;
    for (let attempt = 0; attempt < 2 && !out; attempt++) {
      try {
        // Evaluated through the DevTools protocol, so the page's CSP cannot block it. NoAuto keeps the panel closed.
        await page.evaluate('window.MHScoreNoAuto = true;\n' + bundle.code + '\n;void 0;');
        const ready = await page.evaluate(() => !!(window.MHScore && typeof window.MHScore.run === 'function'));
        if (!ready) throw new Fail('The probe did not load in this page (window.MHScore is missing).');
        out = await page.evaluate(SCORE_IN_PAGE, { maxElements: o.maxElements, style: !!o.style, tokens: !!o.tokens, report: !!o.report, card: !!o.card });
      } catch (e) {
        if (attempt === 0 && /context was destroyed|navigat|detached/i.test(errText(e))) {
          log('Note: the page navigated while it was being scored; trying once more.');
          try { await page.waitForFunction('document.readyState === "complete"', { timeout: until(10000) }); } catch { /* ignore */ }
          continue;
        }
        if (e instanceof Fail) throw e;
        throw new Fail(`Could not score ${url}: ${errText(e)}`);
      }
    }
    if (!out) throw new Fail(`Could not score ${url}: the page kept navigating (a redirect loop or a login wall?).`);
    let result;
    try { result = JSON.parse(out.json); } catch { throw new Fail('The probe returned a result that is not valid JSON.'); }
    if (result.error) throw new Fail(oneLine(result.error, 240));
    for (const n of out.notes) log(`Note: ${n}.`);
    return { vp, result, out, finalUrl: page.url() };
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
    if (process.platform === 'linux' && typeof process.getuid === 'function' && process.getuid() === 0) args.push('--no-sandbox'); // Chrome refuses its sandbox as root (cloud containers)
    log(`Scoring ${url} with ${path.basename(exe)} at ${viewports.map((v) => `${v.width}×${v.height}`).join(' and ')}...`);
    browser = await puppeteer.launch({
      headless: true, executablePath: exe, userDataDir: profile, args,
      defaultViewport: { width: viewports[0].width, height: viewports[0].height },
      timeout: 30000, protocolTimeout: 45000, handleSIGINT: false, handleSIGTERM: false, handleSIGHUP: false,
    });
    for (const vp of viewports) {
      if (remaining() < 9000) throw new Fail(`Not enough time left for the ${vp.name} run; raise --timeout.`);
      runs.push(await scoreViewport(browser, url, vp, o, bundle, remaining, log));
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
    else if (f.key === 'card') data = run.out.card ? Buffer.from(String(run.out.card).split(',')[1] || '', 'base64') : null;
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
