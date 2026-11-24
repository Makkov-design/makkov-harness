// The fingerprints of this version's skills as they are in the repository (install.sh's and install.ps1's), kept in
// fingerprints.json. The npm package cannot carry every file a skill has in git (npm never packs a .gitignore), so
// a skill copied from a clone and the same skill copied from the package differ by that file; with these recorded,
// the Node installer knows both copies as this version's. They count only while the package's own copy of the skill
// is the one they were recorded from (as in git, or as npm packs it), so a stale file is ignored, never trusted.
// Rewrite after changing a skill:
//   node install/node/fingerprints.mjs --write        (install/node/node.test.mjs checks it is current; both read
//   only the files git tracks, so a local test run's leftovers never change them)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { fingerprintSh, fingerprintPs } from './lib.mjs';

// File names npm leaves out of every package, and the tests and fixtures package.json's "files" leaves out.
const NOT_PACKED = (n) => n === '.gitignore' || n === '.npmrc' || n === '.DS_Store' || n === 'node_modules' || n === '.git'
  || n.endsWith('.test.mjs') || n.endsWith('_test.py') || n === 'fixtures';

const here = path.dirname(fileURLToPath(import.meta.url));
export const file = path.join(here, 'fingerprints.json');
export function compute(repo) {
  const out = {};
  for (const name of fs.readdirSync(path.join(repo, 'skills')).sort()) {
    const d = path.join(repo, 'skills', name);
    if (name === 'rich-report' || name.startsWith('.') || !fs.statSync(d).isDirectory()) continue;
    out[name] = { sh: fingerprintSh(d), ps: fingerprintPs(d, '/'), ps_windows: fingerprintPs(d, '\\'), packed: fingerprintSh(d, NOT_PACKED) };
  }
  return out;
}
// The same, from the skills' files git tracks only, so files a local run left in a clone (a Python __pycache__, an
// editor's backup, anything git ignores) never get into fingerprints.json. Without git (no checkout): compute(repo).
export function computeTracked(repo) {
  const ls = spawnSync('git', ['ls-files', '-z', '--', 'skills'], { cwd: repo, encoding: 'buffer' });
  if (ls.status !== 0 || !ls.stdout.length) return compute(repo);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mh-fp-'));
  try {
    for (const rel of ls.stdout.toString('utf8').split('\0').filter(Boolean)) {
      const src = path.join(repo, rel), dst = path.join(tmp, rel);
      if (!fs.existsSync(src)) continue;   // deleted in the working tree: not part of the skill as it is now
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }
    return compute(tmp);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
}
export function recorded() { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } }
// This version's fingerprints of a skill: those of the copy at hand and those recorded from the repository.
export function versionPrints(name, live) {
  const r = recorded()[name];
  const same = r && (live[0] === r.sh || live[0] === r.packed);
  return [...new Set([...live, ...(same ? [r.sh, process.platform === 'win32' ? r.ps_windows : r.ps] : [])])];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--write')) {
  fs.writeFileSync(file, JSON.stringify(computeTracked(path.resolve(here, '..', '..')), null, 2) + '\n');
  console.log(`wrote ${file}`);
}
