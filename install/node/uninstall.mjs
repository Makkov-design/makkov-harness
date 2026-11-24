// `makkov-harness uninstall`: the Node twin of install/uninstall.sh and install/uninstall.ps1, same steps, same
// order. Removes what an install put in place for one agent, using the manifest it wrote: skill folders still as
// the harness put them, the routing block and the personal layer; puts back the skills it moved aside and the
// instructions file as it was. A manifest that names paths the installer would not use is refused.
import fs from 'node:fs';
import os from 'node:os';
import * as L from './lib.mjs';
import { versionPrints } from './fingerprints.mjs';

export function uninstall({ repo, agent, project, dry, out }) {
  const say = (s) => out.push(s);
  const home = L.home();
  if (project && (L.samePath(project, home) || L.sameFolder(project, home))) throw new L.Stop('The project path is your home folder. For a user-level install, leave the project path out.', 2);
  const base = project || home;
  const state = L.join(base, '.makkov-harness');
  const manifest = L.join(state, `install-${agent}.txt`);
  const stamp = L.stampNow();
  const { skills: skillsDir, rules } = L.agentPaths(agent, project, home);
  // Everything under .makkov-harness/ and in the skills folder may have come with the repository (lib.mjs): no link
  // on the way to anything this run changes there.
  const removedDir = L.join(state, 'backups', `${stamp}-${agent}`, 'removed');
  { const why = L.checkInside(base, [state, manifest, manifest + '.new', removedDir, skillsDir]); if (why) throw new L.Stop(`${why}.\nNothing was changed.`); }
  if (!L.isFile(manifest)) {
    if (!dry) L.clearLockOnly(state, base);
    throw new L.Stop(`No makkov-harness install for ${agent} found in ${base} (no ${manifest}).\nIf you installed before 0.3.3, remove the skill folders and the marked block by hand; see INSTALL.md.`);
  }
  const stop = (why) => { throw new L.Stop(`${why}\nNothing was changed.`); };
  // One run at a time in this folder (a dry run changes nothing, so it takes no lock).
  const unlock = dry ? () => {} : L.lock(state, base);
  let dropState = false;
  try {
    return run();
  } finally { unlock(dropState); }

  function run() {

  // 0. Before anything is changed: every manifest here must be one the installer wrote for this folder, and the
  //    files to change must be changeable.
  for (const m of L.manifestsIn(state)) {
    const why = L.validManifest(m, base, project, home);
    if (why) stop(`${m} does not look like a manifest this installer wrote: ${why}. Move it out of ${state} and run this again.`);
  }
  let lines = L.readManifest(manifest, base);
  const ob = L.oldBase(lines);
  const rulesExisted = L.raw(lines, 'rules_existed'), rulesBackup = L.getPath(lines, 'rules_backup', base);
  if (ob && !L.samePath(ob, base)) say(`Installed in ${ob}, which is now ${base}: reading the install from here.`);
  const s = (x) => say('  ' + x);
  const append = (file, line) => { if (!dry) fs.appendFileSync(file, line + os.EOL); };

  // Other installs in the same folder that read the same skills folder or the same instructions file.
  const others = () => L.manifestsIn(state).filter((m) => !L.samePath(m, manifest)).map((m) => ({ file: m, lines: L.readManifest(m, base) }));
  const sameSkills = (o) => L.samePath(L.getPath(o.lines, 'skills_dir', base), skillsDir);
  const rulesUsers = others().filter((o) => L.samePath(L.getPath(o.lines, 'rules', base), rules)).map((o) => L.raw(o.lines, 'agent'));
  let editRules = false;
  if (!rulesUsers.length && L.isFile(rules)) {
    const t = L.readText(rules);
    if (agent === 'cursor' || t.includes(L.START) || t.includes(L.PSTART)) editRules = true;
  }
  if (editRules) {
    let why = L.writableFile(rules); if (why) stop(`${why}.`);
    why = L.writableDir(L.dirname(rules)); if (why) stop(`${why}.`);
    if (agent !== 'cursor') {
      why = L.checkMarkers(rules); if (why) throw new L.Stop(L.markersMessage(rules, why));
      if (L.wideText(rules)) stop(`${rules} is saved as UTF-16 or UTF-32. Save it as UTF-8, then run this again.`);
    }
  }
  if (skillsDir && L.isDir(skillsDir)) { const why = L.writableDir(skillsDir); if (why) stop(`${why}.`); }
  { const why = L.writableDir(state); if (why) stop(`${why}.`); }
  if (dry) say('Dry run: nothing will be changed.');

  // 1. Skills. A folder is ours when it matches a fingerprint the harness recorded for it here (in this manifest or
  // another agent's) or this package's copy; one that changed since is moved aside.
  if (skillsDir) {
    const names = [...new Set(lines.filter((l) => l.startsWith('skill=')).map((l) => l.slice(6).split(' ')[0]).filter(Boolean))];
    for (const name of names) {
      const dst = L.join(skillsDir, name);
      if (!L.exists(dst) || L.dangling(dst)) continue;
      // Only a skill folder (a SKILL.md in it) is taken for one the harness put there.
      if (!L.skillFolder(name, dst)) { s(`leave ${dst} (no SKILL.md in it, so not a skill folder the harness put there)`); continue; }
      const shared = others().filter((o) => sameSkills(o) && o.lines.some((l) => l === `skill=${name}` || l.startsWith(`skill=${name} `)));
      if (shared.length) {
        s(`keep ${dst} (another installed agent uses it)`);
        // Hand on the fingerprints recorded here, so the last uninstall still knows this copy is the harness's.
        const mine = lines.filter((l) => new RegExp(`^skill=${name.replace(/[.]/g, '\\.')} [0-9a-f]+$`).test(l));
        for (const o of shared) for (const l of mine) if (!o.lines.includes(l)) append(o.file, l);
        continue;
      }
      // (A folder with no regular file in it has the fingerprint of any empty folder: never taken for ours.)
      const fps = L.fingerprints(dst, true).filter((f) => !L.EMPTY_PRINTS.includes(f));
      let ours = fps.some((f) => lines.includes(`skill=${name} ${f}`));
      const mineCopy = L.join(repo, 'skills', name);
      if (!ours && L.isDir(mineCopy)) { const r = versionPrints(name, L.fingerprints(mineCopy)); ours = fps.some((f) => r.includes(f)); }
      if (!ours) for (const o of others()) if (sameSkills(o) && fps.some((f) => o.lines.includes(`skill=${name} ${f}`))) ours = true;
      if (ours) { s(`remove ${dst}`); if (!dry) L.dropSkill(dst); }
      else {
        s(`move ${dst} to ${L.join(removedDir, name)} (you changed it)`);
        if (!dry) { L.mkdirp(removedDir); L.moveDir(dst, L.join(removedDir, name)); }
      }
    }
    // 2. Put back the skills the install moved aside. While another agent still uses this skills folder, hand the
    //    record of those backups on to its manifest, so its uninstall restores them.
    const myBackups = lines.filter((l) => l.startsWith('backup=')).map((l) => l.slice(7)).filter(Boolean).map((b) => L.rebase(b, ob, base));
    for (const o of others()) {
      if (!sameSkills(o)) continue;
      for (const b of myBackups) if (!o.lines.some((l) => l === `backup=${b}` || (l.startsWith('backup=') && L.samePath(l.slice(7), b)))) {
        s(`hand the backup record on to ${L.basename(o.file)}`); append(o.file, `backup=${b}`);
      }
    }
    for (const b of myBackups) {
      if (!L.isDir(b)) continue;
      for (const n of fs.readdirSync(b).sort()) {
        if (n.startsWith('.') || !L.isDir(L.join(b, n))) continue;
        const dst = L.join(skillsDir, n);
        if (L.exists(dst)) s(`leave your earlier ${n} in ${b} (${dst} exists)`);
        else { s(`restore your ${n} to ${dst}`); if (!dry) L.moveDir(L.join(b, n), dst); }
      }
    }
    // Copies an interrupted install left half made under a temporary name are the harness's own.
    if (L.isDir(skillsDir)) for (const n of fs.readdirSync(skillsDir)) if (n.startsWith('.mh-tmp-')) {
      s(`remove ${L.join(skillsDir, n)} (left by an interrupted install)`); if (!dry) L.removeTree(L.join(skillsDir, n));
    }
    // The skills are done: a run after an interruption from here on does not take them up again.
    if (!dry) {
      lines = lines.filter((l) => !l.startsWith('skill=') && !l.startsWith('backup='));
      fs.writeFileSync(manifest + '.new', lines.map((l) => l + os.EOL).join(''));
      fs.renameSync(manifest + '.new', manifest);
    }
  }
  L.checkpoint('u-skills');

  // 3. Routing, and the personal layer harness-onboarding wrote next to it.
  const kept = removedDir;
  const personalRule = L.join(L.dirname(rules), 'makkov-harness-personal.mdc');
  if (agent === 'cursor' && L.isFile(personalRule)) {
    s(`delete ${personalRule} (a copy stays in ${kept}${L.WIN ? '' : '/'})`);
    if (!dry) { L.mkdirp(kept); L.moveFile(personalRule, L.join(kept, 'makkov-harness-personal.mdc')); }
  }
  // The copy of the file from before the first install, if this uninstall is the one to use it (a *.bak-<date>
  // copy an install from 0.5.0 or earlier left next to the file is used but left where it is).
  const oursBackup = !!rulesBackup && L.under(rulesBackup, L.join(state, 'backups', 'original'));
  const haveBackup = !!rulesBackup && L.isFile(rulesBackup);
  if (rulesUsers.length) {
    s(`keep the routing block in ${rules} (also installed there for:${rulesUsers.map((a) => ' ' + a).join('')})`);
  } else if (L.dangling(rules)) {
    s(`leave ${rules} alone (a symlink to a file that does not exist)`);
  } else if (editRules && agent === 'cursor') {
    if (haveBackup) { s(`restore your earlier rule from ${rulesBackup}`); if (!dry) L.writeFile(rules, L.readBytes(rulesBackup)); }
    else if (L.isLink(rules)) { s(`empty ${rules} (a symlink, so it is left in place)`); if (!dry) L.writeFile(rules, Buffer.alloc(0)); }
    else { s(`delete ${rules}`); if (!dry) fs.rmSync(rules, { force: true }); }
  } else if (editRules) {
    s(`take the routing block and the personal layer out of ${rules}`);
    if (!dry) {
      const t = L.readText(rules);
      const layer = L.personalLayer(t);
      if (layer) {
        L.mkdirp(kept); fs.writeFileSync(L.join(kept, 'personal-layer.md'), Buffer.from(layer, 'latin1'), { flag: 'wx' });
        s(`your personal layer is kept in ${L.join(kept, 'personal-layer.md')}`);
      }
      let next = Buffer.from(L.removeBlocks(t), 'latin1');
      // Unchanged since the install apart from the harness's blocks: put back byte for byte.
      if (haveBackup && L.sameText(next, L.readBytes(rulesBackup))) next = L.readBytes(rulesBackup);
      if (rulesExisted !== '1' && !/[^ \t\n\v\f\r]/.test(next.toString('latin1')) && !L.isLink(rules)) {
        fs.rmSync(rules, { force: true }); s(`delete ${rules} (the install created it and it is now empty)`);
      } else L.writeFile(rules, next);
    }
  }
  L.checkpoint('u-rules');
  if (!dry) fs.rmSync(rules + '.mh-tmp', { force: true });
  // The copy of the file as it was goes once the file is back as it was; otherwise it stays, and you are told.
  if (!rulesUsers.length && oursBackup && haveBackup) {
    if (L.isFile(rules) && L.readBytes(rules).equals(L.readBytes(rulesBackup))) { if (!dry) fs.rmSync(rulesBackup, { force: true }); }
    else if (!dry) s(`your ${rules} as it was before the first install is kept in ${rulesBackup} (it differs from the file now)`);
  }

  // 4. The manifest, then the folders the install created, once empty (deepest first). A folder still in use is
  // handed on to another install in the same place, so the last uninstall takes it away.
  const createdDirs = lines.filter((l) => l.startsWith('created_dir=')).map((l) => l.slice(12)).filter(Boolean)
    .sort((a, b) => b.length - a.length || (a < b ? 1 : a > b ? -1 : 0));
  if (!dry) fs.rmSync(manifest, { force: true });
  const left = [];
  for (const r of createdDirs) {
    const d = L.join(base, ...r.split('/'));
    if (L.isDir(d) && !L.isLink(d) && fs.readdirSync(d).length === 0) { s(`remove the empty folder ${d}`); if (!dry) fs.rmdirSync(d); }
    else if (L.isDir(d)) left.push(`created_dir=${r}`);
  }
  if (left.length) for (const o of others()) for (const l of left) if (!o.lines.includes(l)) append(o.file, l);
  if (!dry && L.isDir(state)) {
    for (const n of fs.readdirSync(state)) if (/^install-.*\.txt\.new$/.test(n) || /^removed-.*\.tmp$/.test(n)) fs.rmSync(L.join(state, n), { force: true });
    const sweep = (d) => {
      for (const n of fs.readdirSync(d)) {
        const p = L.join(d, n), st = L.lstat(p);
        if (st.isDirectory() && n.startsWith('.mh-tmp-')) L.removeTree(p);   // a copy an interrupted move left
        else if (st.isDirectory() && n !== 'lock') { sweep(p); if (fs.readdirSync(p).length === 0) fs.rmdirSync(p); }
        else if (st.isFile() && n.endsWith('.mh-tmp')) fs.rmSync(p, { force: true });
      }
    };
    sweep(state);
    if (fs.readdirSync(state).length === 0) fs.rmdirSync(state);
    // The lock is still in it: the release takes the folder away once the lock is gone, if nothing else is left.
    dropState = true;
  }
  say(dry ? `Dry run done for ${agent}. Run again without --dry-run to uninstall.` : `makkov-harness removed for ${agent}. Restart the agent.`);
  return 0;
  }
}
