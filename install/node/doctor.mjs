// `makkov-harness doctor`: a read-only report of what the harness has installed where. It changes nothing.
// For the home folder and a project folder (the one given, or the current folder when it holds an install) it
// lists each agent's install (scope, skills folder, instructions file, which of them other agents share), the
// backups kept, the manifests that fail the installer's own checks and why, skills that are missing or differ from
// this package's copies, files an interrupted run left, and leftovers from installs of 0.5.0 and earlier.
// Exit code 1 when something needs attention, 0 otherwise.
import fs from 'node:fs';
import * as L from './lib.mjs';
import { versionPrints } from './fingerprints.mjs';

export function doctor({ repo, project, agent }) {
  const home = L.home();
  const folders = [];
  if (project) folders.push({ base: project, project });
  else {
    const cwd = process.cwd();
    if (!L.samePath(cwd, home) && L.isDir(L.join(cwd, '.makkov-harness'))) folders.push({ base: cwd, project: cwd });
  }
  folders.unshift({ base: home, project: '' });
  const pkg = {};
  for (const name of fs.readdirSync(L.join(repo, 'skills')).sort()) {
    if (name !== 'rich-report' && !name.startsWith('.') && L.isDir(L.join(repo, 'skills', name))) pkg[name] = versionPrints(name, L.fingerprints(L.join(repo, 'skills', name)));
  }
  const report = { folders: [], attention: 0 };
  for (const { base, project: proj } of folders) {
    const state = L.join(base, '.makkov-harness');
    const f = { folder: base, level: proj ? 'project' : 'user', installs: [], invalid: [], backups: [], leftovers: [], findings: [] };
    const note = (level, text) => { f.findings.push({ level, text }); if (level === 'attention') report.attention++; };
    const manifests = L.manifestsIn(state);
    const valid = [];
    for (const m of manifests) {
      const why = L.validManifest(m, base, proj, home);
      if (why) { f.invalid.push({ manifest: m, why }); note('attention', `${m} does not look like a manifest this installer wrote: ${why}. Install and uninstall stop until it is moved out of ${state}.`); }
      else valid.push(m);
    }
    for (const m of valid) {
      const lines = L.readManifest(m, base), a = L.raw(lines, 'agent');
      if (agent && a !== agent) continue;
      const skillsDir = L.getPath(lines, 'skills_dir', base), rules = L.getPath(lines, 'rules', base);
      const i = { agent: a, scope: L.raw(lines, 'scope') || 'all', installed: L.raw(lines, 'installed'), skills_dir: skillsDir, rules,
        shares_rules_with: [], shares_skills_with: [], skills: { current: [], outdated: [], edited: [], missing: [], unrecorded: [] }, routing: '' };
      for (const o of valid) {
        if (L.samePath(o, m)) continue;
        const ol = L.readManifest(o, base), oa = L.raw(ol, 'agent');
        if (L.samePath(L.getPath(ol, 'rules', base), rules)) i.shares_rules_with.push(oa);
        if (skillsDir && L.samePath(L.getPath(ol, 'skills_dir', base), skillsDir)) i.shares_skills_with.push(oa);
      }
      if (!L.raw(lines, 'base')) note('info', `${a}: installed by a version before 0.5.1 (no base= in the manifest); the next update rewrites it.`);
      const names = [...new Set(lines.filter((l) => l.startsWith('skill=')).map((l) => l.slice(6).split(' ')[0]).filter(Boolean))];
      for (const name of names) {
        const dst = L.join(skillsDir, name);
        if (!L.isDir(dst)) { i.skills.missing.push(name); continue; }
        const fps = L.fingerprints(dst);
        if (pkg[name] && fps.some((x) => pkg[name].includes(x))) i.skills.current.push(name);
        else if (fps.some((x) => lines.includes(`skill=${name} ${x}`))) i.skills.outdated.push(name);
        else if (!lines.some((l) => l.startsWith(`skill=${name} `))) i.skills.unrecorded.push(name);
        else i.skills.edited.push(name);
      }
      if (skillsDir) for (const name of Object.keys(pkg)) if (!names.includes(name)) i.skills.missing.push(name);
      if (i.skills.missing.length) note('attention', `${a}: skills missing from ${skillsDir}: ${i.skills.missing.join(', ')}. Run update.`);
      if (i.skills.outdated.length) note('attention', `${a}: skills that differ from this package's copies (an older version, or a copy with other line ends): ${i.skills.outdated.join(', ')}. Run update.`);
      if (i.skills.edited.length) note('info', `${a}: skills changed since the install (an update moves them aside, the uninstall keeps them): ${i.skills.edited.join(', ')}.`);
      if (i.skills.unrecorded.length) note('info', `${a}: skills recorded without a fingerprint (an install before 0.5.0): ${i.skills.unrecorded.join(', ')}.`);
      if (L.dangling(rules)) { i.routing = 'dangling link'; note('attention', `${a}: ${rules} is a symlink to a file that does not exist.`); }
      else if (!L.isFile(rules)) { i.routing = 'missing'; note('attention', `${a}: ${rules} is missing. Run update.`); }
      else if (a === 'cursor') i.routing = L.readText(rules).includes(L.START) ? 'present' : 'missing';
      else {
        const why = L.checkMarkers(rules);
        if (why) { i.routing = 'markers not paired'; note('attention', `${a}: ${rules}: the markers are not paired (${why}).`); }
        else i.routing = L.readText(rules).includes(L.START) ? 'present' : 'missing';
      }
      if (i.routing === 'missing' && L.isFile(rules)) note('attention', `${a}: the routing block is not in ${rules}. Run update.`);
      f.installs.push(i);
    }
    // Backups the harness keeps: your skills it moved aside, your instructions files as they were.
    if (L.isDir(L.join(state, 'backups'))) {
      for (const n of fs.readdirSync(L.join(state, 'backups')).sort()) {
        const p = L.join(state, 'backups', n);
        if (!L.isDir(p)) continue;
        const kinds = fs.readdirSync(p).filter((k) => L.isDir(L.join(p, k)) || L.isFile(L.join(p, k)));
        f.backups.push({ path: p, holds: kinds });
      }
      if (f.backups.length) note('info', `backups kept in ${L.join(state, 'backups')}: ${f.backups.map((b) => L.basename(b.path)).join(', ')}.`);
    }
    // Left by an interrupted run.
    const tmp = [];
    if (L.isDir(state)) for (const n of fs.readdirSync(state)) if (/\.txt\.new$|\.mh-tmp$|^removed-.*\.tmp$/.test(n)) tmp.push(L.join(state, n));
    const skillDirs = new Set();
    for (const x of L.AGENTS) { if (!proj && L.PROJECT_ONLY.includes(x)) continue; const q = L.agentPaths(x, proj, home); if (q.skills) skillDirs.add(q.skills); if (L.isFile(q.rules + '.mh-tmp')) tmp.push(q.rules + '.mh-tmp'); }
    for (const d of skillDirs) if (L.isDir(d)) for (const n of fs.readdirSync(d)) if (n.startsWith('.mh-tmp-')) tmp.push(L.join(d, n));
    for (const t of [...new Set(tmp)]) { f.leftovers.push({ path: t, from: 'an interrupted run' }); }
    if (tmp.length) note('attention', `left by an interrupted run (the next install or uninstall clears them): ${[...new Set(tmp)].join(', ')}.`);
    // Leftovers of 0.5.0 and earlier: a .bak-<date> copy next to an instructions file for each run.
    const ruleFiles = new Set();
    for (const x of L.AGENTS) { if (!proj && L.PROJECT_ONLY.includes(x)) continue; ruleFiles.add(L.agentPaths(x, proj, home).rules); }
    for (const r of ruleFiles) {
      const d = L.dirname(r);
      if (!L.isDir(d)) continue;
      for (const n of fs.readdirSync(d)) if (n.startsWith(L.basename(r) + '.bak-')) f.leftovers.push({ path: L.join(d, n), from: 'an install of 0.5.0 or earlier' });
    }
    const bak = f.leftovers.filter((x) => x.from !== 'an interrupted run');
    if (bak.length) note('info', `copies an install of 0.5.0 or earlier left (delete them once you no longer need them): ${bak.map((x) => x.path).join(', ')}.`);
    // A harness folder with nothing installed.
    if (L.isDir(state) && !manifests.length) note('info', `${state} holds no install (only backups or leftovers).`);
    if (manifests.length || L.isDir(state) || f.findings.length) report.folders.push(f);
  }
  return report;
}

export function doctorText(r) {
  const out = [];
  if (!r.folders.length) out.push('No makkov-harness install found in your home folder' + ' or this folder.');
  for (const f of r.folders) {
    out.push(`${f.folder} (${f.level} level)`);
    if (!f.installs.length) out.push('  nothing installed here');
    for (const i of f.installs) {
      out.push(`  ${i.agent}: scope ${i.scope}, installed ${i.installed || 'at an unknown time'}`);
      if (i.skills_dir) out.push(`    skills: ${i.skills_dir} (${i.skills.current.length} current${i.skills.outdated.length ? `, ${i.skills.outdated.length} older` : ''}${i.skills.edited.length ? `, ${i.skills.edited.length} changed by you` : ''}${i.skills.missing.length ? `, ${i.skills.missing.length} missing` : ''})${i.shares_skills_with.length ? `; shared with ${i.shares_skills_with.join(', ')}` : ''}`);
      out.push(`    instructions: ${i.rules} (routing block ${i.routing})${i.shares_rules_with.length ? `; shared with ${i.shares_rules_with.join(', ')}` : ''}`);
    }
    for (const x of f.findings) out.push(`  ${x.level === 'attention' ? '!' : '-'} ${x.text}`);
  }
  out.push(r.attention ? `${r.attention} thing(s) need attention.` : 'Nothing needs attention.');
  return out;
}
