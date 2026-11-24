// Unit tests of the Node installer: what the scenario suites cannot see from outside (fingerprints equal to the
// shell installers', the command line, doctor's report). Run: node --test install/node/
// Every run uses a throwaway home and project folder, never your own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const bin = path.join(repo, 'bin', 'makkov-harness.mjs');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'mh-node-'));
const has = (cmd) => spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0;
function run(args, home, opts = {}) {
  const env = { ...process.env, HOME: home, USERPROFILE: home };
  delete env.MAKKOV_HARNESS_TEST; delete env.MAKKOV_HARNESS_TEST_STOP;
  return spawnSync(process.execPath, [bin, ...args], { env, encoding: 'utf8', ...opts });
}

// (BSD cksum has no --version: probe it by running it on nothing.)
const hasCksum = spawnSync('cksum', { input: '' }).status === 0;
test('cksum matches POSIX cksum', { skip: !hasCksum && 'no cksum here' }, () => {
  for (const b of [Buffer.alloc(0), Buffer.from('a'), Buffer.from('hello world\n'), crypto256(70000)]) {
    const r = spawnSync('cksum', { input: b });
    assert.equal(String(L.cksum(b)), r.stdout.toString().split(' ')[0]);
  }
});
function crypto256(n) { const b = Buffer.alloc(n); for (let i = 0; i < n; i++) b[i] = (i * 7919) & 0xff; return b; }

// Not on Windows: there the shell installer is install.ps1 (its fingerprint is checked below); Git Bash's install.sh
// is covered by the sequence test that mixes it with the Node installer on the same folders.
test("every skill's fingerprint equals install.sh's", { skip: (process.platform === 'win32' || !has('bash')) && 'not on Windows (install.ps1 is checked below)' }, () => {
  for (const name of fs.readdirSync(path.join(repo, 'skills'))) {
    const d = path.join(repo, 'skills', name);
    const r = spawnSync('bash', ['-c', '. "$1/install/lib.sh"; mh_fingerprint "$2"', '_', repo, d], { encoding: 'utf8' });
    assert.equal(L.fingerprintSh(d), r.stdout.trim(), name);
  }
});

test('the PowerShell fingerprint is 16 hex digits and changes with the content', () => {
  const d = tmp();
  fs.mkdirSync(path.join(d, 'sub')); fs.writeFileSync(path.join(d, 'a.md'), 'x'); fs.writeFileSync(path.join(d, 'sub', 'b.md'), 'y');
  const one = L.fingerprintPs(d);
  assert.match(one, /^[0-9a-f]{16}$/);
  fs.writeFileSync(path.join(d, 'a.md'), 'z');
  assert.notEqual(L.fingerprintPs(d), one);
  fs.rmSync(d, { recursive: true });
});

test('install/node/fingerprints.json is current (node install/node/fingerprints.mjs --write after changing a skill)', async () => {
  const { compute, recorded } = await import('./fingerprints.mjs');
  // A clone with Windows line ends has other fingerprints; the file is checked where the skills are as in git.
  const crlf = fs.readFileSync(path.join(repo, 'ROUTING.md')).includes('\r\n');
  if (crlf) return;
  assert.deepEqual(recorded(), compute(repo));
});

test('the package version is the plugin version', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
  const plugin = JSON.parse(fs.readFileSync(path.join(repo, '.claude-plugin', 'plugin.json'), 'utf8'));
  assert.equal(pkg.version, plugin.version);
  assert.equal(run(['--version'], tmp()).stdout.trim(), pkg.version);
  assert.deepEqual(Object.keys(pkg.dependencies ?? {}), []);
  assert.equal(pkg.scripts, undefined, 'no install scripts');
});

test('paths written by the other platform are read in this one', () => {
  if (process.platform === 'win32') {
    assert.equal(L.convertPath('/c/Users/me/p', ''), 'C:\\Users\\me\\p');
    assert.equal(L.convertPath('/mnt/d/work', ''), 'D:\\work');
  } else {
    assert.equal(L.convertPath('C:\\Users\\me\\p', '/home/x'), '/c/Users/me/p');
    assert.equal(L.convertPath('C:\\Users\\me\\p', '/mnt/c/x'), '/mnt/c/Users/me/p');
    assert.equal(L.convertPath('/home/me/p', '/home/x'), '/home/me/p');
  }
});

test('the command line: usage, unknown words and missing values exit with 2 and change nothing', () => {
  const h = tmp();
  for (const args of [[], ['install'], ['frobnicate'], ['install', '--agent', 'vim'], ['install', 'codex', '--scope'], ['install', 'codex', '--scope', 'some'], ['uninstall', 'codex', '--scope', 'all'], ['install', 'codex', '--bogus']]) {
    const r = run(args, h);
    assert.equal(r.status, 2, args.join(' ') + ': ' + r.stderr);
  }
  assert.equal(run(['--help'], h).status, 0);
  assert.equal(run(['install', 'cursor'], h).status, 2, 'cursor needs a project');
  assert.deepEqual(fs.readdirSync(h), []);
  fs.rmSync(h, { recursive: true });
});

test('update needs an earlier install; uninstall without one exits 1', () => {
  const h = tmp(), p = tmp();
  const u = run(['update', '--agent', 'codex', '--project', p], h);
  assert.equal(u.status, 1); assert.match(u.stderr, /Run install instead/);
  assert.equal(run(['uninstall', '--agent', 'codex', '--project', p], h).status, 1);
  assert.deepEqual(fs.readdirSync(p), []);
  fs.rmSync(h, { recursive: true }); fs.rmSync(p, { recursive: true });
});

test('doctor reports what is installed, in text and JSON, and changes nothing', () => {
  const h = tmp(), p = tmp();
  assert.equal(run(['doctor', '--project', p], h).status, 0);
  assert.equal(run(['install', '--agent', 'codex', '--project', p], h).status, 0);
  assert.equal(run(['install', '--agent', 'copilot', '--project', p], h).status, 0);
  const before = snapshot(p);
  const t = run(['doctor', '--project', p], h);
  assert.equal(t.status, 0, t.stdout + t.stderr);
  assert.match(t.stdout, /codex: scope all/); assert.match(t.stdout, /shared with copilot/); assert.match(t.stdout, /Nothing needs attention/);
  const j = JSON.parse(run(['doctor', '--project', p, '--json'], h).stdout);
  const f = j.folders.find((x) => x.level === 'project');
  assert.deepEqual(f.installs.map((i) => i.agent).sort(), ['codex', 'copilot']);
  assert.equal(f.installs[0].routing, 'present');
  assert.equal(j.attention, 0);
  assert.equal(snapshot(p), before, 'doctor wrote nothing');
  // Things that need attention: a skill folder gone, a stray temporary file, a manifest someone edited.
  fs.rmSync(path.join(p, '.agents', 'skills', 'animate'), { recursive: true });
  let r = run(['doctor', '--project', p, '--json'], h);
  assert.equal(r.status, 1);
  assert.ok(JSON.parse(r.stdout).folders.find((x) => x.level === 'project').installs.some((i) => i.skills.missing.includes('animate')));
  fs.writeFileSync(path.join(p, '.makkov-harness', 'install-copilot.txt'), 'agent=copilot\nrules=/etc/passwd\n');
  r = run(['doctor', '--project', p, '--json'], h);
  assert.equal(r.status, 1);
  assert.match(JSON.parse(r.stdout).folders.find((x) => x.level === 'project').invalid[0].why, /instructions file is not the one/);
  // An edit of yours to a skill is reported, not counted as a problem.
  fs.rmSync(path.join(p, '.makkov-harness', 'install-copilot.txt'));
  assert.equal(run(['install', '--agent', 'codex', '--project', p], h).status, 0);
  fs.appendFileSync(path.join(p, '.agents', 'skills', 'html-report', 'SKILL.md'), '\nmine\n');
  r = run(['doctor', '--project', p, '--json'], h);
  assert.equal(r.status, 0, r.stdout);
  assert.ok(JSON.parse(r.stdout).folders.find((x) => x.level === 'project').installs[0].skills.edited.includes('html-report'));
  fs.rmSync(h, { recursive: true }); fs.rmSync(p, { recursive: true });
});

test('a manifest written by the Node installer lists every skill under both fingerprints', () => {
  const h = tmp(), p = tmp();
  assert.equal(run(['install', 'codex', p], h).status, 0);
  const m = fs.readFileSync(path.join(p, '.makkov-harness', 'install-codex.txt'), 'utf8').split(/\r?\n/);
  const animate = m.filter((l) => l.startsWith('skill=animate '));
  assert.equal(animate.length, 2);
  assert.ok(animate.some((l) => /^skill=animate \d+$/.test(l)) && animate.some((l) => /^skill=animate [0-9a-f]{16}$/.test(l)));
  fs.rmSync(h, { recursive: true }); fs.rmSync(p, { recursive: true });
});

function snapshot(dir) {
  const out = [];
  const go = (d) => { for (const n of fs.readdirSync(d).sort()) { const x = path.join(d, n), s = fs.lstatSync(x); if (s.isDirectory()) { out.push(x + '/'); go(x); } else out.push(x + ' ' + s.size + ' ' + s.mtimeMs); } };
  go(dir);
  return out.join('\n');
}

test("the npm package holds the installer, the routing map and the skills, and nothing else of the repository", () => {
  // One command string: on Windows npm is a .cmd, which needs a shell, and Node warns (DEP0190) when arguments are
  // passed to a shell as a list.
  const r = spawnSync('npm pack --dry-run --json --ignore-scripts', { cwd: repo, encoding: 'utf8', shell: true });
  assert.equal(r.status, 0, r.stderr);
  const pkg = JSON.parse(r.stdout)[0];
  const files = pkg.files.map((f) => f.path.replace(/\\/g, '/'));
  for (const f of ['bin/makkov-harness.mjs', 'install/node/cli.mjs', 'install/node/lib.mjs', 'install/node/install.mjs', 'install/node/uninstall.mjs',
    'install/node/doctor.mjs', 'install/node/fingerprints.mjs', 'install/node/fingerprints.json', 'ROUTING.md', 'LICENSE', 'package.json']) assert.ok(files.includes(f), f);
  // Every skill file as tracked, except rich-report (Claude only) and what npm never packs (.gitignore).
  const tracked = spawnSync('git', ['ls-files', 'skills'], { cwd: repo, encoding: 'utf8' });
  if (tracked.status === 0) {
    const want = tracked.stdout.split('\n').filter((f) => f && !f.startsWith('skills/rich-report/') && !/(^|\/)\.gitignore$/.test(f));
    assert.deepEqual(files.filter((f) => f.startsWith('skills/')).sort(), want.sort());
    // Nothing goes into the package that git does not track (a stray or ignored file in a packed folder).
    const all = new Set(spawnSync('git', ['ls-files'], { cwd: repo, encoding: 'utf8' }).stdout.split('\n').filter(Boolean));
    for (const f of files) assert.ok(all.has(f), `packed but not tracked by git: ${f}`);
  }
  for (const f of files) assert.ok(!/^(\.github|docs|hooks|adapters|cloud|install\/test)\/|\.test\.mjs$|^install\/[^/]+\.(sh|ps1)$/.test(f) || f.startsWith('skills/'), `not in the package: ${f}`);
  assert.ok(pkg.unpackedSize < 10 * 1024 * 1024, `unpacked ${pkg.unpackedSize} bytes`);
});

// install.ps1's own fingerprint code (lib.ps1), in every PowerShell installed (on Windows both Windows PowerShell 5.1
// and PowerShell 7): for this repository's skills and for a copy under a temporary path with a space in it (on
// Windows that path holds 8.3 short names, RUNNER~1 and the like); and 0.5.0's culture-sorted id (Sort-Object
// FullName), which the Node installer must recognise in a manifest 0.5.0 wrote.
const shells = ['pwsh', ...(process.platform === 'win32' ? ['powershell'] : [])].filter((c) => spawnSync(c, ['-NoProfile', '-Command', 'exit 0'], { stdio: 'ignore' }).status === 0);
for (const sh of shells.length ? shells : ['']) {
  test(`the PowerShell fingerprints equal install.ps1's (${sh || 'no PowerShell'})`, { skip: !sh && 'no PowerShell here', timeout: 300000 }, () => {
    const t = tmp(), copy = path.join(t, 'My Project', '.agents', 'skills');
    fs.mkdirSync(copy, { recursive: true });
    const names = fs.readdirSync(path.join(repo, 'skills')).filter((n) => n !== 'rich-report');
    for (const n of ['animate', 'media-use', 'design-score']) fs.cpSync(path.join(repo, 'skills', n), path.join(copy, n), { recursive: true });
    const repoDirs = names.map((n) => path.join(repo, 'skills', n));
    const dirs = [...repoDirs, ...['animate', 'media-use', 'design-score'].map((n) => path.join(copy, n))];
    const script = `. '${path.join(repo, 'install', 'lib.ps1').replace(/'/g, "''")}'
foreach ($d in $input) {
  $root = (Resolve-Path -LiteralPath $d).ProviderPath.TrimEnd([IO.Path]::DirectorySeparatorChar)
  $leg = Get-MhId ((Get-ChildItem -LiteralPath $root -Recurse -File -Force | Sort-Object FullName | ForEach-Object { $_.FullName.Substring($root.Length) + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }) -join "\`n")
  "$((@(Get-MhTreeIds $d))[0]) $leg"
}`;
    // Windows PowerShell 5.1 started from PowerShell 7 (CI's shell) inherits 7's PSModulePath and cannot load
    // Get-FileHash, which this test's own lines use; it gets the module path it would have had on its own.
    const env = { ...process.env, HOME: t }; if (sh === 'powershell') for (const k of Object.keys(env)) if (k.toLowerCase() === 'psmodulepath') delete env[k];
    const r = spawnSync(sh, ['-NoProfile', '-NonInteractive', '-Command', script], { input: dirs.join('\n'), encoding: 'utf8', env });
    assert.equal(r.status, 0, r.stderr);
    const rows = r.stdout.split(/\r?\n/).filter(Boolean).map((l) => l.split(' '));
    assert.equal(rows.length, dirs.length, r.stdout + r.stderr);
    // On a difference, the lines each side hashed, so the log says which file or which character differs.
    const bad = dirs.filter((d, i) => L.fingerprintPs(d) !== rows[i][0]);
    if (bad.length) {
      const dbg = `. '${path.join(repo, 'install', 'lib.ps1').replace(/'/g, "''")}'
$PSVersionTable.PSVersion.ToString()
foreach ($d in $input) {
  $root = (Resolve-Path -LiteralPath $d).ProviderPath.TrimEnd([IO.Path]::DirectorySeparatorChar)
  "root=$root"
  foreach ($f in [IO.Directory]::GetFiles($root, '*', [IO.SearchOption]::AllDirectories)) { $f.Substring($root.Length) + ':' + (Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash }
}`;
      const r2 = spawnSync(sh, ['-NoProfile', '-NonInteractive', '-Command', dbg], { input: bad[0], encoding: 'utf8', env });
      assert.fail(`${bad.length} of ${dirs.length} ordinal ids differ (${sh}), first ${bad[0]}: Node ${L.fingerprintPs(bad[0])}, PowerShell ${rows[dirs.indexOf(bad[0])][0]}\nPowerShell hashed:\n${r2.stdout}${r2.stderr}\nNode hashed:\n${L.fingerprintPsLines(bad[0]).join('\n')}`);
    }
    dirs.forEach((d, i) => {
      if (i < repoDirs.length) assert.ok(L.fingerprints(d, true).includes(rows[i][1]), `0.5.0's culture-sorted id of ${d} (${sh}): ${rows[i][1]} not among ${L.fingerprints(d, true).join(' ')}`);
    });
    fs.rmSync(t, { recursive: true, force: true });
  });
}

// The lock's clauses (install/node/lib.mjs, lock()): 4, the release removes only its own owner file, and the harness
// folder only when this run made it or the caller asks; 5, clearLockOnly takes over a stale lock left alone in the
// harness folder and removes the folder, and leaves a live one as it is; 2, a live lock refuses without removing.
test('the lock: release, refusal and a lock left alone in the harness folder', () => {
  const t = tmp(), st = path.join(t, '.makkov-harness'), own = path.join(st, 'lock', 'owner');
  let release = L.lock(st, t);
  fs.writeFileSync(own, 'pid=1\nhost=elsewhere\nstarted=1\nby=test\n');
  release();
  assert.ok(fs.readFileSync(own, 'utf8').includes('host=elsewhere'), "another run's owner file stays");
  fs.rmSync(st, { recursive: true });
  release = L.lock(st, t); release();
  assert.ok(!fs.existsSync(st), 'its own owner file, the lock and the folder it made go');
  fs.mkdirSync(st); release = L.lock(st, t); release();
  assert.ok(fs.existsSync(st) && fs.readdirSync(st).length === 0, 'a folder it did not make stays');
  release = L.lock(st, t); release(true);
  assert.ok(!fs.existsSync(st), 'release(true) takes an empty harness folder away');
  fs.mkdirSync(path.join(st, 'lock'), { recursive: true });
  fs.writeFileSync(own, `pid=${process.pid}\nhost=${os.hostname()}\nstarted=${Math.floor(Date.now() / 1000)}\nby=test\n`);
  assert.throws(() => L.lock(st, t), /Another makkov-harness run/);
  L.clearLockOnly(st, t);
  assert.ok(fs.existsSync(own), 'a live lock is left as it is');
  const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout;
  fs.writeFileSync(own, `pid=${dead}\nhost=${os.hostname()}\nstarted=${Math.floor(Date.now() / 1000)}\nby=test\n`);
  fs.writeFileSync(path.join(st, 'install-cline.txt.new'), 'agent=cline\n');
  L.clearLockOnly(st, t);
  assert.ok(!fs.existsSync(st), 'a stale lock and a manifest being written, alone in the harness folder, are cleared and the folder removed');
  fs.mkdirSync(path.join(st, 'lock'), { recursive: true }); fs.writeFileSync(own, `pid=${dead}\nhost=${os.hostname()}\nstarted=1\nby=test\n`);
  fs.writeFileSync(path.join(st, 'install-codex.txt'), 'agent=codex\n');
  L.clearLockOnly(st, t);
  assert.ok(fs.existsSync(own), 'not when the harness folder holds anything else');
  fs.rmSync(t, { recursive: true, force: true });
});
