// Shared by the Node installer's commands (install, uninstall, doctor). Node standard library only.
// The behaviour is that of install/lib.sh and install/lib.ps1, rule for rule; where the two shells differ (paths,
// fingerprints), this follows the shell of the platform it runs on and reads what both of them write.
//
// Files are handled as bytes: text is read as Latin-1 ('latin1' in Node maps every byte to one character and back),
// so an instructions file in any 8-bit encoding keeps its bytes; the routing block goes in as its UTF-8 bytes.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

export const AGENTS = ['codex', 'cursor', 'gemini', 'copilot', 'windsurf', 'cline', 'opencode', 'aider'];
export const PROJECT_ONLY = ['cursor', 'copilot', 'windsurf', 'aider'];
export const START = '<!-- makkov-harness:start -->';
export const END = '<!-- makkov-harness:end -->';
export const PSTART = '<!-- makkov-harness:personal:start -->';
export const PEND = '<!-- makkov-harness:personal:end -->';
export const WIN = process.platform === 'win32';
const SEP = path.sep;

// ---- small file helpers -------------------------------------------------------------------------------------

export function lstat(p) { try { return fs.lstatSync(p); } catch { return null; } }
export function stat(p) { try { return fs.statSync(p); } catch { return null; } }
export const exists = (p) => lstat(p) !== null;                    // the entry itself, a dangling link too
export const isLink = (p) => { const s = lstat(p); return !!s && s.isSymbolicLink(); };
export const isFile = (p) => { const s = stat(p); return !!s && s.isFile(); };   // follows links, as [ -f ]
export const isDir = (p) => { const s = stat(p); return !!s && s.isDirectory(); };
export const dangling = (p) => isLink(p) && stat(p) === null;
export const readBytes = (p) => fs.readFileSync(p);
export const readText = (p) => fs.readFileSync(p).toString('latin1');
export const toRaw = (utf8) => Buffer.from(utf8, 'utf8').toString('latin1');   // UTF-8 text as Latin-1 characters

// ---- paths --------------------------------------------------------------------------------------------------

// Two paths name the same file (on Windows: not case-sensitive, either separator; elsewhere: as written).
export function samePath(a, b) {
  if (!WIN) return a === b;
  return (a ?? '').replace(/\\/g, '/').toLowerCase() === (b ?? '').replace(/\\/g, '/').toLowerCase();
}
// A path below a folder, as written.
export function under(p, dir) {
  if (!p || !dir) return false;
  if (!WIN) return p.startsWith(dir + '/') && p.length > dir.length + 1;
  const a = p.replace(/\\/g, '/').toLowerCase(), d = dir.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase() + '/';
  return a.startsWith(d) && a.length > d.length;
}
// A path relative to the base, for created_dir= lines (always with / separators).
export function rel(p, base) {
  for (const s of WIN ? ['\\', '/'] : ['/']) {
    const pre = base + s;
    if (WIN ? p.toLowerCase().startsWith(pre.toLowerCase()) : p.startsWith(pre)) return p.slice(pre.length).replace(/\\/g, '/');
  }
  return p;
}
export const join = (...a) => path.join(...a);
export const dirname = (p) => path.dirname(p);
export const basename = (p) => path.basename(p);

// Where each agent's skills and instructions file go.
export function agentPaths(agent, project, home) {
  const b = project || home;
  const skills = agent === 'cline' ? join(b, '.cline', 'skills') : agent === 'aider' ? '' : join(b, '.agents', 'skills');
  let rules;
  switch (agent) {
    case 'codex': rules = project ? join(project, 'AGENTS.md') : join(home, '.codex', 'AGENTS.md'); break;
    case 'gemini': rules = project ? join(project, 'GEMINI.md') : join(home, '.gemini', 'GEMINI.md'); break;
    case 'opencode': rules = project ? join(project, 'AGENTS.md') : join(home, '.config', 'opencode', 'AGENTS.md'); break;
    case 'cline': rules = project ? join(project, 'AGENTS.md') : join(home, '.agents', 'AGENTS.md'); break;
    case 'cursor': rules = join(project, '.cursor', 'rules', 'makkov-harness.mdc'); break;
    case 'aider': rules = join(project, 'CONVENTIONS.md'); break;
    default: rules = join(project, 'AGENTS.md');
  }
  return { skills, rules };
}

// A path with . or .. among its parts (never written by the installer).
export const dotdot = (p) => p.replace(/\\/g, '/').split('/').some((x) => x === '.' || x === '..');
// A path lies inside the base: below it as written, with no .. and no symlink (or junction) on the way.
export function inside(p, base) {
  if (!under(p, base) || dotdot(p)) return false;
  let d = base.replace(/[\\/]+$/, '');
  const restStart = base.replace(/[\\/]+$/, '').length + 1;
  for (const part of p.slice(restStart).split(/[\\/]/)) {
    if (!part) continue;
    d = join(d, part);
    if (isLink(d)) return false;
  }
  return true;
}
// The folders between the base and a folder that do not exist yet, deepest first, relative to the base.
export function missingDirs(dir, base) {
  const out = [];
  let d = dir;
  while (d && !samePath(d, base) && dirname(d) !== d && !exists(d)) {
    if (!under(d, base)) return out;
    out.push(rel(d, base));
    d = dirname(d);
  }
  return out;
}

// ---- manifests ----------------------------------------------------------------------------------------------

const PATH_KEYS = /^(base|skills_dir|rules|rules_backup|backup)=(.*)$/;
// The form a path written by the other platform's installer takes here: on Windows, /c/x (Git Bash) and
// /mnt/c/x (WSL) are C:\x; elsewhere C:\x is /c/x, or /mnt/c/x when the folder worked on is under /mnt/.
// (A path on Linux or macOS that holds a backslash is read as a Windows path: the shell installers do the same.)
export function convertPath(v, base) {
  if (WIN) {
    const m = /^\/mnt\/([a-zA-Z])(\/.*)?$/.exec(v) || /^\/([a-zA-Z])(\/.*)?$/.exec(v);
    if (m) return m[1].toUpperCase() + ':' + (m[2] ? m[2].replace(/\//g, '\\') : '\\');
    return v;
  }
  if (v.includes('\\') || /^[A-Za-z]:/.test(v)) {
    v = v.replace(/\\/g, '/');
    if (/^[A-Za-z]:\//.test(v)) v = (/^\/mnt\/[a-z]\//.test(base || '') ? '/mnt/' : '/') + v[0].toLowerCase() + v.slice(2);
  }
  return v;
}
// A manifest's lines: without a byte order mark or line ends, path keys in this platform's form.
export function readManifest(file, base) {
  let t = fs.readFileSync(file).toString('utf8');
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  const lines = t.split('\n').map((l) => l.replace(/\r$/, ''));
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines.map((l) => { const m = PATH_KEYS.exec(l); return m ? `${m[1]}=${convertPath(m[2], base)}` : l; });
}
export function raw(lines, key) {
  const l = lines.find((x) => x.startsWith(key + '='));
  return l === undefined ? '' : l.slice(key.length + 1);
}
const endsWith = (p, tail) => WIN ? p.replace(/\\/g, '/').toLowerCase().endsWith(tail.toLowerCase()) : p.endsWith(tail);
// The folder a manifest was written for (base=, or read back from older manifests' paths).
export function oldBase(lines) {
  const b = raw(lines, 'base');
  if (b) return b;
  const s = raw(lines, 'skills_dir');
  for (const t of ['/.agents/skills', '/.cline/skills']) if (s && endsWith(s, t)) return s.slice(0, s.length - t.length);
  const r = raw(lines, 'rules');
  if (r && endsWith(r, '/CONVENTIONS.md')) return r.slice(0, r.length - '/CONVENTIONS.md'.length);
  return '';
}
// A path from a manifest, moved onto the current base when the folder was moved or renamed since the install.
export function rebase(p, ob, nb) {
  if (!p || !ob || ob === nb) return p;
  if (samePath(p, ob)) return nb;
  for (const s of WIN ? ['\\', '/'] : ['/']) {
    const pre = ob + s;
    if (WIN ? p.toLowerCase().startsWith(pre.toLowerCase()) : p.startsWith(pre)) return nb + s + p.slice(pre.length);
  }
  return p;
}
export const getPath = (lines, key, base) => rebase(raw(lines, key), oldBase(lines), base);
export const manifestsIn = (state) => {
  if (!isDir(state)) return [];
  return fs.readdirSync(state).filter((n) => /^install-.*\.txt$/.test(n)).map((n) => join(state, n)).filter(isFile).sort();
};

// A manifest is input the installer does not trust. It is used only when it names exactly the paths the installer
// itself would use for that agent in this folder, its backups lie in .makkov-harness/backups/ and its skill names
// are plain folder names. Returns why not, or '' when it is fine.
export function validManifest(file, base, project, home) {
  let lines;
  try { lines = readManifest(file, base); } catch { return 'it could not be read'; }
  const st = join(base, '.makkov-harness');
  const a = raw(lines, 'agent');
  if (!AGENTS.includes(a)) return 'it names no agent';
  if (basename(file) !== `install-${a}.txt`) return `it is for ${a}, not for its file name`;
  if (!raw(lines, 'rules')) return 'it names no instructions file';
  const p = agentPaths(a, project, home);
  const ob = oldBase(lines);
  if (!samePath(rebase(raw(lines, 'rules'), ob, base), p.rules)) return `its instructions file is not the one ${a} uses here`;
  if (!samePath(rebase(raw(lines, 'skills_dir'), ob, base), p.skills)) return `its skills folder is not the one ${a} uses here`;
  const v = rebase(raw(lines, 'rules_backup'), ob, base);
  if (v) {
    const orig = join(st, 'backups', 'original');
    if (under(v, orig)) {
      if (dotdot(v)) return 'its copy of the instructions file is outside the harness folder';
      if (!inside(v, base)) return `its copy of the instructions file is outside ${base}`;
    } else if (WIN ? v.toLowerCase().startsWith((p.rules + '.bak-').toLowerCase()) : v.startsWith(p.rules + '.bak-')) {
      // a copy an install from 0.5.0 or earlier left next to the file
      if (/[\\/]/.test(v.slice(p.rules.length + 5))) return 'its copy of the instructions file is not next to the file';
    } else return 'its copy of the instructions file is not one the installer makes';
  }
  for (const l of lines.filter((x) => x.startsWith('backup='))) {
    const b = rebase(l.slice(7), ob, base);
    if (!b) continue;
    if (!under(b, join(st, 'backups'))) return 'a backup folder outside .makkov-harness/backups';
    if (dotdot(b)) return 'a backup folder with .. in its path';
    if (!inside(b, base)) return `a backup folder outside ${base}`;
  }
  for (const l of lines.filter((x) => x.startsWith('skill='))) {
    const e = l.slice(6);
    if (!e) continue;
    if (!/^[A-Za-z0-9._-]+( [0-9a-f]+)?$/.test(e) || ['.', '..'].includes(e.split(' ')[0])) return 'a skill entry that is not a plain folder name';
  }
  for (const l of lines.filter((x) => x.startsWith('created_dir='))) {
    const r = l.slice(12);
    if (!r) continue;
    if (r.startsWith('/') || r.startsWith('\\') || path.isAbsolute(r) || /^[A-Za-z]:/.test(r)) return 'a created folder given as an absolute path';
    if (dotdot(r)) return 'a created folder with .. in its path';
    // A folder on the way to any agent's skills or instructions folder here: an uninstall hands a folder still in
    // use on to the other installs in the folder, whichever agent created it.
    const d = join(base, r);
    let ok = false;
    for (const x of AGENTS) {
      if (!project && PROJECT_ONLY.includes(x)) continue;
      const q = agentPaths(x, project, home);
      if ((q.skills && (samePath(q.skills, d) || under(q.skills, d))) || samePath(dirname(q.rules), d) || under(dirname(q.rules), d)) ok = true;
    }
    if (!ok) return 'a created folder the installer would not create';
  }
  return '';
}

// ---- checks before writing ----------------------------------------------------------------------------------

function canWrite(p) { try { fs.accessSync(p, fs.constants.W_OK); return true; } catch { return false; } }
// A file that can be changed in place: absent (with a folder it can be created in), or a regular file, or a
// symlink to one, that can be written. Returns why not, or ''.
export function writableFile(f) {
  if (dangling(f)) { let t = ''; try { t = fs.readlinkSync(f); } catch { /* */ } return `${f} is a symlink to ${t}, which does not exist`; }
  if (exists(f)) {
    if (!isFile(f)) return `${f} is not a regular file`;
    if (!canWrite(f)) return `${f} is read-only`;
    return '';
  }
  return writableDir(dirname(f));
}
// A folder that exists and can be written to, or can be created.
export function writableDir(d) {
  if (exists(d)) {
    if (!isDir(d)) return `${d} is not a folder`;
    if (!canWrite(d)) return `${d} is read-only`;
    return '';
  }
  let x = d;
  while (!exists(x) && dirname(x) !== x) x = dirname(x);
  if (!isDir(x)) return `${x} is not a folder`;
  if (!canWrite(x)) return `${x} is read-only`;
  return '';
}
// A file in UTF-16 or UTF-32 (a byte order mark says so).
export function wideText(f) {
  if (!isFile(f)) return false;
  const b = readBytes(f);
  return (b.length >= 2 && ((b[0] === 0xff && b[1] === 0xfe) || (b[0] === 0xfe && b[1] === 0xff))) ||
    (b.length >= 4 && b[0] === 0 && b[1] === 0 && b[2] === 0xfe && b[3] === 0xff);
}

// ---- text: lines, blocks, markers ---------------------------------------------------------------------------

// A file's lines without their line ends (a "\r" of a CRLF file stays on the line, as in awk).
export function linesOf(text) {
  if (text.length === 0) return [];
  const l = text.split('\n');
  if (text.endsWith('\n')) l.pop();
  return l;
}
export const joinLines = (lines) => lines.length ? lines.join('\n') + '\n' : '';
// Checks the marked blocks: every start marker has its end marker after it, no block opens inside another, and
// there is at most one routing block. Returns what is wrong, or ''.
export function checkMarkers(f) {
  if (!isFile(f)) return '';
  let t; try { t = readText(f); } catch { return 'it could not be read'; }
  let open = '', at = 0, mains = 0, n = 0;
  for (const line of linesOf(t)) {
    n++;
    if (line.includes(START)) {
      if (open) return `line ${n}: a routing block starts inside another marked block`;
      open = 'main'; at = n; mains++;
      if (mains > 1) return `line ${n}: a second routing block`;
    } else if (line.includes(PSTART)) {
      if (open) return `line ${n}: a personal layer starts inside another marked block`;
      open = 'personal'; at = n;
    } else if (line.includes(END)) {
      if (open !== 'main') return `line ${n}: an end marker with no routing block open`;
      open = '';
    } else if (line.includes(PEND)) {
      if (open !== 'personal') return `line ${n}: a personal end marker with no personal layer open`;
      open = '';
    }
  }
  if (open === 'main') return `line ${at}: a routing block with no end marker`;
  if (open === 'personal') return `line ${at}: a personal layer with no end marker`;
  return '';
}
export const markersMessage = (f, why) => `${f}: the makkov-harness markers are not paired (${why}).\nNothing was changed. Fix or delete the marked lines by hand, then run this again.`;
// The text with the routing block replaced by `block`; lines outside it kept as they are.
export function replaceBlock(text, block) {
  const out = []; let skip = false;
  for (const line of linesOf(text)) {
    if (line.includes(START)) { out.push(block); skip = true; continue; }
    if (line.includes(END)) { skip = false; continue; }
    if (!skip) out.push(line);
  }
  return joinLines(out);
}
// The text with the routing block and the personal layer taken out, each with the one blank line before it.
export function removeBlocks(text) {
  const out = []; let skip = false;
  for (const line of linesOf(text)) {
    if (line.includes(START) || line.includes(PSTART)) {
      if (out.length && /^[ \t\r]*$/.test(out[out.length - 1])) out.pop();
      skip = true; continue;
    }
    if (line.includes(END) || line.includes(PEND)) { skip = false; continue; }
    if (!skip) out.push(line);
  }
  return joinLines(out);
}
// The personal layer of a text, markers included ('' when there is none).
export function personalLayer(text) {
  const out = []; let on = false;
  for (const line of linesOf(text)) {
    if (line.includes(PSTART)) on = true;
    if (on) out.push(line);
    if (line.includes(PEND)) on = false;
  }
  return joinLines(out);
}
// The file after the harness's blocks are taken out is the file as it was: the same bytes, or the same plus the
// one newline the installer added to a file that did not end in one.
export function sameText(a, b) {
  if (a.equals(b)) return true;
  return b.length > 0 && b[b.length - 1] !== 0x0a && a.equals(Buffer.concat([b, Buffer.from('\n')]));
}

// ---- writing ------------------------------------------------------------------------------------------------

// Writes bytes into a file. A regular file is replaced in one step: a copy of it (so it keeps its mode) takes the
// new content as <file>.mh-tmp and is renamed over it, so an interruption leaves the old file or the new one, never
// half of one (install and uninstall clear a .mh-tmp left behind). A symlink is written through in place, so it
// stays a symlink; so is a file with more than one hard link, so every name keeps the same file.
export function writeFile(f, bytes) {
  const s = lstat(f);
  if (s && (s.isSymbolicLink() || (s.isFile() && s.nlink > 1))) { fs.writeFileSync(f, bytes); return; }
  const t = f + '.mh-tmp';
  fs.rmSync(t, { force: true });
  if (s && s.isFile()) fs.copyFileSync(f, t);
  fs.writeFileSync(t, bytes);
  fs.renameSync(t, f);
}
// Deletes a skill folder the harness put there: renamed first to .mh-tmp-old-<name> (which install and uninstall
// clear), so an interrupted delete never leaves a half-deleted folder under the skill's name. A linked folder (a
// symlink or a junction) is removed as a link: what it points to is never touched.
export function dropSkill(d) {
  const t = join(dirname(d), '.mh-tmp-old-' + basename(d));
  removeTree(t);
  fs.renameSync(d, t);
  removeTree(t);
}
// Removes a file or folder; a link is removed as a link.
export function removeTree(p) {
  const s = lstat(p);
  if (!s) return;
  if (s.isSymbolicLink()) { try { fs.unlinkSync(p); } catch { fs.rmdirSync(p); } return; }
  fs.rmSync(p, { recursive: true, force: true });
}
export const mkdirp = (d) => fs.mkdirSync(d, { recursive: true });

// Copies a folder as `cp -R` does: files are created with the source's mode less the umask (the system applies it
// to a new file's mode), symlinks are copied as symlinks. With `keepModes`, as `mv` across file systems does, every
// file and folder gets the source's mode exactly.
export function copyTree(src, dst, keepModes = false) {
  const s = fs.lstatSync(src);
  if (s.isSymbolicLink()) { fs.symlinkSync(fs.readlinkSync(src), dst); return; }
  if (s.isDirectory()) {
    fs.mkdirSync(dst);
    for (const n of fs.readdirSync(src)) copyTree(join(src, n), join(dst, n), keepModes);
    if (keepModes) fs.chmodSync(dst, s.mode & 0o7777);
    return;
  }
  fs.writeFileSync(dst, fs.readFileSync(src), { mode: s.mode & 0o777 });
  if (keepModes) fs.chmodSync(dst, s.mode & 0o7777);
}
// Moves a folder between the skills folder and .makkov-harness/backups. A rename where it can; where the two are on
// different file systems (EXDEV: a skills folder that is a link to another volume), a copy under a temporary name
// next to the destination (.mh-tmp-move-<name>, which install and uninstall clear), checked to hold the same files,
// renamed into place, and only then the source removed: an interruption leaves the source, or both, never neither.
export function moveDir(src, dst) {
  try { fs.renameSync(src, dst); return; } catch (e) { if (e.code !== 'EXDEV') throw e; }
  const t = join(dirname(dst), '.mh-tmp-move-' + basename(dst));
  removeTree(t);
  copyTree(src, t, true);
  if (fingerprintSh(src) !== fingerprintSh(t)) { removeTree(t); throw new Stop(`${src} could not be copied to ${dst} whole. Nothing of it was removed; run this again.`); }
  fs.renameSync(t, dst);
  removeTree(src);
}

// Moves a file the same way (a rename; across file systems a copy, then the source removed).
export function moveFile(src, dst) {
  try { fs.renameSync(src, dst); return; } catch (e) { if (e.code !== 'EXDEV') throw e; }
  fs.copyFileSync(src, dst);
  fs.rmSync(src, { force: true });
}

// One run at a time in a folder: a lock folder, .makkov-harness/lock, that install.sh, install.ps1 and this
// installer all make and honour. It holds who made it (process id, computer, time). A lock whose process no longer
// runs on this computer, or that is older than a day, is left from a run that was stopped, and is taken over.
// Returns a function that removes the lock (and the harness folder, when the run left it empty), or throws Stop.
export function lock(state, base) {
  const l = join(state, 'lock');
  let made = false;
  // (Another run may make the folder at the same moment: that is not "cannot write here".)
  if (!exists(state)) { try { fs.mkdirSync(state); made = true; } catch (e) { if (e.code !== 'EEXIST') return () => {}; } }   // cannot write: pre-flight says why
  for (let i = 0; i < 3; i++) {
    try {
      fs.mkdirSync(l);
      fs.writeFileSync(join(l, 'owner'), `pid=${process.pid}\nhost=${os.hostname()}\nstarted=${Math.floor(Date.now() / 1000)}\nby=node\n`);
      let done = false;
      const release = () => {
        if (done) return; done = true;
        try { fs.rmSync(l, { recursive: true, force: true }); } catch { /* */ }
        try { if (fs.readdirSync(state).length === 0) fs.rmdirSync(state); } catch { /* */ }
      };
      process.once('exit', release);   // also when the run stops at a test point (process.exit)
      return release;
    } catch (e) {
      if (e.code !== 'EEXIST' || !isDir(l)) { if (made) try { fs.rmdirSync(state); } catch { /* */ } return () => {}; }
    }
    const o = lockOwner(l);
    if (o.stale) { removeTree(l); continue; }
    throw new Stop(`Another makkov-harness run is working in ${base} (process ${o.pid || '?'}${o.host ? ' on ' + o.host : ''}, started ${o.when || 'just now'}). Let it finish, then run this again. If none is running, delete the folder ${l} and run this again.\nNothing was changed.`);
  }
  throw new Stop(`Could not take the lock ${l}. Delete that folder if no makkov-harness run is going on, then run this again.\nNothing was changed.`);
}
// What a lock says about its run, and whether that run is over.
export function lockOwner(l) {
  let t = '';
  try { t = fs.readFileSync(join(l, 'owner'), 'utf8'); } catch { /* being written, or left half made */ }
  const get = (k) => { const m = new RegExp(`^${k}=(.*)$`, 'm').exec(t); return m ? m[1].trim() : ''; };
  const pid = Number(get('pid')), host = get('host'), started = Number(get('started'));
  const st = lstat(l);
  const age = started ? Date.now() / 1000 - started : st ? (Date.now() - st.mtimeMs) / 1000 : 0;
  let stale = age > 86400;
  if (!t) stale = stale || age > 60;   // no owner after a minute: a run stopped while making the lock
  else if (!host || host.toLowerCase() === os.hostname().toLowerCase()) {
    if (pid > 0) { try { process.kill(pid, 0); } catch (e) { if (e.code === 'ESRCH') stale = true; } }
  }
  const when = started ? new Date(started * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC' : '';
  return { pid, host, when, stale };
}

// The Node versions this installer is tested on (package.json engines).
export const NODE_MIN = 22;

// ---- fingerprints -------------------------------------------------------------------------------------------

// POSIX cksum (CRC-32, polynomial 0x04C11DB7, length appended, complemented), as install.sh computes it.
const CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) { let c = i << 24; for (let k = 0; k < 8; k++) c = c & 0x80000000 ? (c << 1) ^ 0x04c11db7 : c << 1; t[i] = c >>> 0; }
  return t;
})();
export function cksum(buf) {
  let c = 0;
  for (let i = 0; i < buf.length; i++) c = ((c << 8) ^ CRC[((c >>> 24) ^ buf[i]) & 0xff]) >>> 0;
  for (let n = buf.length; n > 0; n = Math.floor(n / 256)) c = ((c << 8) ^ CRC[((c >>> 24) ^ (n & 0xff)) & 0xff]) >>> 0;
  return (~c) >>> 0;
}
// Every regular file under a folder (links to files: `withLinks`), as [relative path parts, absolute path].
function walk(dir, withLinks, skip) {
  const out = [];
  const go = (abs, parts) => {
    let names; try { names = fs.readdirSync(abs); } catch { return; }
    for (const n of names) {
      const p = join(abs, n), s = lstat(p);
      if (!s) continue;
      if (skip && skip(n)) continue;
      if (s.isDirectory()) go(p, [...parts, n]);
      else if (s.isFile()) out.push([[...parts, n], p]);
      else if (withLinks && s.isSymbolicLink() && isFile(p)) out.push([[...parts, n], p]);
    }
  };
  go(dir, []);
  return out;
}
// install.sh's fingerprint: (cd dir && find . -type f -exec cksum {} + | LC_ALL=C sort) | cksum.
// `skip`: a file name to leave out (the files npm does not pack), for fingerprints.json.
export function fingerprintSh(dir, skip) {
  const lines = walk(dir, false, skip).map(([parts, p]) => {
    const b = readBytes(p);
    return Buffer.from(`${cksum(b)} ${b.length} ./${parts.join('/')}\n`, 'utf8');
  });
  lines.sort(Buffer.compare);
  return String(cksum(Buffer.concat(lines)));
}
// install.ps1's fingerprint: every file's path below the folder and SHA-256, in ordinal order, hashed. The paths
// use the platform's separator, as PowerShell writes them (`sep` for another platform's).
export function fingerprintPs(dir, sep = SEP) {
  const files = walk(dir, true).map(([parts, p]) => [sep + parts.join(sep), p]);
  files.sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0));
  const text = files.map(([r, p]) => r + ':' + crypto.createHash('sha256').update(readBytes(p)).digest('hex').toUpperCase()).join('\n');
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex').slice(0, 16);
}
// install.ps1 of 0.5.0 sorted the files by culture (Sort-Object FullName, not case-sensitive) before hashing.
// PowerShell 7 compares like ICU; Windows PowerShell 5.1 like Windows' word sort, which gives hyphens and
// apostrophes no weight. Both orders, to recognise a copy 0.5.0 recorded; never written.
const ICU = new Intl.Collator('en-US', { sensitivity: 'accent' });
const WORD = (a, b) => ICU.compare(a.replace(/[-']/g, ''), b.replace(/[-']/g, '')) || ICU.compare(a, b);
export function fingerprintPsCulture(dir, cmp, sep = SEP) {
  const files = walk(dir, true).map(([parts, p]) => [sep + parts.join(sep), p]);
  files.sort((x, y) => cmp(x[0], y[0]));
  const text = files.map(([r, p]) => r + ':' + crypto.createHash('sha256').update(readBytes(p)).digest('hex').toUpperCase()).join('\n');
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex').slice(0, 16);
}
export const CULTURE_SORTS = { icu: ICU.compare, word: WORD };
// The fingerprints a manifest written here lists a skill under: install.sh's and install.ps1's, so either shell
// installer recognises the copy. With `all`, also the ones only read (0.5.0's culture-sorted ids), to recognise a
// copy any of them recorded.
export const fingerprints = (dir, all = false) => {
  const f = [fingerprintSh(dir), fingerprintPs(dir)];
  if (all) for (const c of Object.values(CULTURE_SORTS)) f.push(fingerprintPsCulture(dir, c));
  return [...new Set(f)];
};

// ---- the rest -----------------------------------------------------------------------------------------------

// The home folder: $HOME (USERPROFILE on Windows), made absolute and normalised once (a trailing slash, `.` or a
// relative path would otherwise be spelled two ways in one manifest, and the next run would refuse it).
export const home = () => path.resolve(os.homedir());
// Two folders are the same folder: compared through their real paths (a symlinked home, a trailing slash), as
// `cd … && pwd` lets the shell installers compare them; as written when one of them cannot be resolved.
export function sameFolder(a, b) {
  const real = (p) => { try { return fs.realpathSync.native(p); } catch { return path.resolve(p); } };
  return samePath(real(a), real(b));
}
export function stampNow() {
  const s = process.env.MAKKOV_HARNESS_TEST_STAMP;
  if (s && /^\d{8}-\d{6}$/.test(s)) return s;   // tests: the same second for several runs
  const d = new Date(), z = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`;
}
// Test hook, inert in normal use: with both MAKKOV_HARNESS_TEST=1 and MAKKOV_HARNESS_TEST_STOP=<point> set, the run
// stops at that point, as an interruption would.
export function checkpoint(name) {
  if (process.env.MAKKOV_HARNESS_TEST === '1' && process.env.MAKKOV_HARNESS_TEST_STOP === name) {
    process.stderr.write(`(test) stopped after ${name}\n`);
    process.exit(1);
  }
}
export class Stop extends Error { constructor(msg, code = 1) { super(msg); this.code = code; } }
