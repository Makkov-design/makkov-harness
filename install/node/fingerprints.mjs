// The fingerprints of this version's skills as they are in the repository (install.sh's and install.ps1's), kept in
// fingerprints.json. The npm package cannot carry every file a skill has in git (npm never packs a .gitignore), so
// a skill copied from a clone and the same skill copied from the package differ by that file; with these recorded,
// the Node installer knows both copies as this version's. They count only while the package's own copy of the skill
// is the one they were recorded from (as in git, or as npm packs it), so a stale file is ignored, never trusted.
// Rewrite after changing a skill:
//   node install/node/fingerprints.mjs --write        (install/node/node.test.mjs checks it is current)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fingerprintSh, fingerprintPs } from './lib.mjs';

// File names npm leaves out of every package.
const NOT_PACKED = (n) => n === '.gitignore' || n === '.npmrc' || n === '.DS_Store' || n === 'node_modules' || n === '.git';

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
export function recorded() { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; } }
// This version's fingerprints of a skill: those of the copy at hand and those recorded from the repository.
export function versionPrints(name, live) {
  const r = recorded()[name];
  const same = r && (live[0] === r.sh || live[0] === r.packed);
  return [...new Set([...live, ...(same ? [r.sh, process.platform === 'win32' ? r.ps_windows : r.ps] : [])])];
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv.includes('--write')) {
  fs.writeFileSync(file, JSON.stringify(compute(path.resolve(here, '..', '..')), null, 2) + '\n');
  console.log(`wrote ${file}`);
}
