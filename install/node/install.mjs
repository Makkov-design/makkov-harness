// `makkov-harness install|update`: the Node twin of install/install.sh and install/install.ps1, same steps, same
// order. The order is the safety: everything that can fail is checked before the first change; the manifest
// (.makkov-harness/install-<agent>.txt) records what the run is about to do before it does it, so an interrupted
// run can be run again or uninstalled; the instructions file is kept once, as it was, before the harness first
// changes it; and everything under .makkov-harness/ and in the skills folder is read as untrusted input, since it may
// have come with the repository (checkInside, validManifest).
import fs from 'node:fs';
import os from 'node:os';
import * as L from './lib.mjs';
import { versionPrints } from './fingerprints.mjs';

export function install({ repo, agent, project, scope: scopeArg, dry, update, follow, out }) {
  const say = (s) => out.push(s);
  const home = L.home();
  const scopeGiven = scopeArg !== undefined;
  let scope = scopeArg ?? '';
  if (L.PROJECT_ONLY.includes(agent) && !project) throw new L.Stop(`${agent} has no user-level instructions file this installer can edit. Pass a project path.`, 2);
  if (project && (L.samePath(project, home) || L.sameFolder(project, home))) {
    throw new L.Stop('The project path is your home folder, where a user-level install keeps its manifest. Leave the project path out for a user-level install, or pass a project folder.', 2);
  }
  const base = project || home;
  const { skills: skillsDir, rules } = L.agentPaths(agent, project, home);
  const stamp = L.stampNow();
  const state = L.join(base, '.makkov-harness');
  const manifest = L.join(state, `install-${agent}.txt`);
  // One folder per run and agent: two agents installed in the same second never share a backup folder.
  const backupRoot = L.join(state, 'backups', `${stamp}-${agent}`);
  const original = L.join(state, 'backups', 'original', ...L.rel(rules, base).split('/'));
  const stop = (why) => { throw new L.Stop(`${why}\nNothing was changed.`); };
  if (dry) say('Dry run: nothing will be written.');
  // No link on the way to anything this run writes under the harness folder.
  { const why = L.checkInside(base, [state, manifest, manifest + '.new', original, original + '.mh-tmp',
    L.join(backupRoot, 'skills'), L.join(backupRoot, 'removed'), L.join(backupRoot, 'earlier-harness')]); if (why) stop(`${why}.`); }
  // One run at a time in this folder (a dry run writes nothing, so it takes no lock).
  const unlock = dry ? () => {} : L.lock(state, base);
  try {
    return run();
  } finally { unlock(); }

  function run() {

  // 0. Before anything is written. Every manifest in this folder must be one the installer wrote for this folder.
  for (const m of L.manifestsIn(state)) {
    const why = L.validManifest(m, base, project, home);
    if (why) stop(`${m} does not look like a manifest this installer wrote: ${why}. Move it out of ${state} and run this again.`);
  }
  const haveManifest = L.isFile(manifest);
  if (update && !haveManifest) throw new L.Stop(`No makkov-harness install for ${agent} found in ${base} (no ${manifest}). Run install instead.`);
  // The earlier install of this agent, with its paths moved onto this folder if the folder was moved or renamed.
  let rulesExisted = '0', rulesBackup = '', oldBackups = [], oldCreated = [], oldSkills = [];
  if (haveManifest) {
    const prev = L.readManifest(manifest, base), ob = L.oldBase(prev);
    rulesExisted = L.raw(prev, 'rules_existed'); rulesBackup = L.getPath(prev, 'rules_backup', base);
    oldBackups = prev.filter((l) => l.startsWith('backup=')).map((l) => l.slice(7)).filter(Boolean).map((b) => 'backup=' + L.rebase(b, ob, base));
    oldCreated = prev.filter((l) => l.startsWith('created_dir='));
    oldSkills = prev.filter((l) => l.startsWith('skill='));
    if (!scopeGiven) { scope = L.raw(prev, 'scope'); if (scope === 'design') say('Scope: design (kept from the earlier install; pass --scope all to change it)'); }
  }
  if (scope !== 'all' && scope !== 'design') scope = 'all';
  // Another agent installed into the same instructions file: this install shares its record of the file.
  let sharedRules = false;
  if (!haveManifest) {
    for (const m of L.manifestsIn(state)) {
      const o = L.readManifest(m, base);
      if (L.samePath(L.getPath(o, 'rules', base), rules)) { rulesExisted = L.raw(o, 'rules_existed'); rulesBackup = L.getPath(o, 'rules_backup', base); sharedRules = true; break; }
    }
  }
  // A file that is there at the first install is kept, as it was, whatever it holds. A copy an interrupted earlier
  // run left in backups/original/ is the file as it was, so it is used, never replaced. When another agent's install
  // already names the file, its record stands: the harness made the file or kept it.
  // A Cursor rule is put back from that copy as it is, so for Cursor a copy no install here recorded (it may have come
  // with the repository) is used only when it is the rule as it is now.
  let needCopy = false;
  if (!haveManifest && !sharedRules && !rulesBackup) {
    if (L.isFile(original) && agent === 'cursor' && !(L.isFile(rules) && L.readBytes(rules).equals(L.readBytes(original)))) {
      if (L.isFile(rules)) stop(`${original} is a copy of ${rules} that no install here recorded, and it differs from the file. Move it out of ${state}, then run this again.`);
    } else if (L.isFile(original)) { rulesExisted = '1'; rulesBackup = original; }
    else if (L.isFile(rules)) { rulesExisted = '1'; rulesBackup = original; needCopy = true; }
  }
  if (rulesBackup && L.samePath(rulesBackup, original) && !L.isFile(original) && L.isFile(rules)) needCopy = true;
  // Files and folders it is about to change: they must be there to change, or creatable.
  let why = L.writableFile(rules); if (why) stop(`${why}.`);
  // The file is replaced through a temporary file next to it, so its folder must be writable too.
  if (L.isFile(rules) && !L.isLink(rules)) { why = L.writableDir(L.dirname(rules)); if (why) stop(`${why}.`); }
  if (agent !== 'cursor') {
    why = L.checkMarkers(rules); if (why) throw new L.Stop(L.markersMessage(rules, why));
    if (L.wideText(rules)) stop(`${rules} is saved as UTF-16 or UTF-32. Save it as UTF-8, then run this again.`);
  }
  if (skillsDir) { why = L.writableDir(skillsDir); if (why) stop(`${why}.`); }
  why = L.writableDir(state); if (why) stop(`${why}.`);
  // In a project, no link that leads outside it (unless --follow-links).
  why = L.checkLinks(project, follow, skillsDir, rules); if (why) stop(`${why}.`);

  // What earlier installs into this skills folder put there, from every manifest that points at it.
  const earlier = new Set();
  if (skillsDir) {
    for (const m of L.manifestsIn(state)) {
      const o = L.readManifest(m, base);
      if (L.samePath(L.getPath(o, 'skills_dir', base), skillsDir)) for (const l of o) if (l.startsWith('skill=')) earlier.add(l);
    }
  }
  // This version's skills (rich-report needs Claude Artifacts, so it is skipped here) and their fingerprints.
  const names = [], fpOf = {};
  if (skillsDir) {
    // In install.sh's order: its glob sorts skills/*/ byte by byte with the slash, so animate-expo/ before animate/.
    for (const name of fs.readdirSync(L.join(repo, 'skills')).sort((a, b) => Buffer.compare(Buffer.from(a + '/'), Buffer.from(b + '/')))) {
      if (name === 'rich-report' || name.startsWith('.') || !L.isDir(L.join(repo, 'skills', name))) continue;
      names.push(name);
      fpOf[name] = versionPrints(name, L.fingerprints(L.join(repo, 'skills', name)));
      const dst = L.join(skillsDir, name);
      if (L.exists(dst) && !L.isDir(dst)) stop(`${dst} is a file, where the ${name} skill folder goes. Move it away, then run this again.`);
    }
  }
  const skillLines = (name) => fpOf[name].map((f) => `skill=${name} ${f}`);
  const ours = (name, fps) => fps.some((f) => fpOf[name].includes(f));
  const earlierHas = (name, fps) => fps.some((f) => !L.EMPTY_PRINTS.includes(f) && earlier.has(`skill=${name} ${f}`));

  // Folders this install creates, so the uninstaller can take them away again once they are empty.
  const created = [...oldCreated];
  const addCreated = (d) => { for (const r of L.missingDirs(d, base)) if (!created.includes(`created_dir=${r}`)) created.push(`created_dir=${r}`); };
  if (skillsDir) addCreated(skillsDir);
  addCreated(L.dirname(rules));

  // The manifest: what this install puts where, so the uninstaller removes exactly that.
  const writeManifest = (skillLinesAll, backupLines) => {
    L.mkdirp(state);
    const seen = new Set();
    const lines = [`agent=${agent}`, `installed=${stamp}`, `base=${base}`, `skills_dir=${skillsDir}`, `rules=${rules}`,
      `rules_existed=${rulesExisted || '0'}`, `rules_backup=${rulesBackup}`, `scope=${scope}`,
      ...backupLines.filter(Boolean),
      ...created.filter((c) => c !== 'created_dir=.makkov-harness' && !c.startsWith('created_dir=.makkov-harness/')),
      ...skillLinesAll.filter((l) => l.startsWith('skill=') && !seen.has(l) && seen.add(l))];
    fs.writeFileSync(manifest + '.new', lines.join(os.EOL) + os.EOL);
    fs.renameSync(manifest + '.new', manifest);
  };
  const appendManifest = (lines) => fs.appendFileSync(manifest, lines.map((l) => l + os.EOL).join(''));

  if (dry) {
    for (const name of names) {
      const dst = L.join(skillsDir, name);
      if (!L.exists(dst)) { say(`  would copy ${name} to ${dst}`); continue; }
      const fps = L.fingerprints(dst, true);
      if (ours(name, fps)) continue;
      if (earlierHas(name, fps)) say(`  would update ${dst} (a copy this harness put there)`);
      else if (earlier.has(`skill=${name}`)) say(`  would move ${dst} (from an install before 0.5.0) to ${L.join(backupRoot, 'earlier-harness', name)}`);
      else say(`  would move your ${dst} to ${L.join(backupRoot, 'skills', name)}, then copy ours`);
    }
    if (needCopy) say(`  would keep a copy of ${rules} as it is now in ${original}`);
    if (L.isFile(rules)) {
      if (agent === 'cursor') say(`  would rewrite ${rules} with the routing rule`);
      else if (L.readText(rules).includes(L.START)) say(`  would update the marked routing block in ${rules}`);
      else say(`  would append the marked routing block to ${rules}`);
    } else say(`  would create ${rules} with the routing block`);
    say(`Dry run done for ${agent}. Run again without --dry-run to install.`);
    return 0;
  }

  // The journal: before the first change, the manifest already lists the folders and backups this run may leave
  // behind and the earlier install's skills. Each skill of this version is added once its folder is about to go in.
  writeManifest(oldSkills, [...oldBackups, 'backup=' + L.join(backupRoot, 'skills')]);
  for (const n of fs.readdirSync(state)) if (/^install-.*\.txt\.new$/.test(n)) fs.rmSync(L.join(state, n), { force: true });
  fs.rmSync(rules + '.mh-tmp', { force: true }); fs.rmSync(original + '.mh-tmp', { force: true });

  // 1. Skills: a copy that is already ours stays; the copy an earlier install put there is replaced; one from before
  // 0.5.0 goes to backups/<date>/earlier-harness/; anything else (yours) to backups/<date>/skills/, put back by the
  // uninstaller. Each copy goes to a temporary name first and is then renamed.
  const copied = [], backed = [], older = [], dropped = [];
  if (skillsDir) {
    L.mkdirp(skillsDir);
    for (const n of fs.readdirSync(skillsDir)) if (n.startsWith('.mh-tmp-')) L.removeTree(L.join(skillsDir, n));
    for (const name of names) {
      const dst = L.join(skillsDir, name);
      let copy = true;
      if (L.exists(dst)) {
        const fps = L.fingerprints(dst, true);
        if (ours(name, fps)) copy = false;
        else if (earlierHas(name, fps)) L.dropSkill(dst);
        else if (earlier.has(`skill=${name}`)) { L.mkdirp(L.join(backupRoot, 'earlier-harness')); L.moveDir(dst, L.join(backupRoot, 'earlier-harness', name)); older.push(name); }
        else { L.mkdirp(L.join(backupRoot, 'skills')); L.moveDir(dst, L.join(backupRoot, 'skills', name)); backed.push(name); }
      }
      // Recorded before the copy goes in (your folder, if any, is already aside): a copy in place is always listed.
      appendManifest(skillLines(name));
      if (copy) {
        const tmp = L.join(skillsDir, '.mh-tmp-' + name);
        L.copyTree(L.join(repo, 'skills', name), tmp);
        fs.renameSync(tmp, dst);
      }
      copied.push(name);
      L.checkpoint('skill');
    }
    // Skills the earlier install of this agent put there that this version no longer has.
    for (const line of oldSkills) {
      const entry = line.slice(6), name = entry.split(' ')[0], fp = entry.includes(' ') ? entry.slice(entry.indexOf(' ') + 1) : '';
      if (fpOf[name] || dropped.includes(name)) continue;
      const dst = L.join(skillsDir, name);
      if (!L.exists(dst)) continue;
      if (!L.skillFolder(name, dst)) { say(`  leave ${dst} (no SKILL.md in it, so not a skill folder the harness put there)`); continue; }
      let other = false;
      for (const m of L.manifestsIn(state)) {
        if (L.samePath(m, manifest)) continue;
        const o = L.readManifest(m, base);
        if (L.samePath(L.getPath(o, 'skills_dir', base), skillsDir) && o.some((l) => l === `skill=${name}` || l.startsWith(`skill=${name} `))) other = true;
      }
      if (other) { say(`  keep ${dst} (no longer part of the harness, but another installed agent lists it)`); continue; }
      if (fp && L.fingerprints(dst, true).some((f) => !L.EMPTY_PRINTS.includes(f) && oldSkills.includes(`skill=${name} ${f}`))) L.dropSkill(dst);
      else if (fp) { L.mkdirp(L.join(backupRoot, 'removed')); L.moveDir(dst, L.join(backupRoot, 'removed', name)); }
      else { L.mkdirp(L.join(backupRoot, 'earlier-harness')); L.moveDir(dst, L.join(backupRoot, 'earlier-harness', name)); }
      dropped.push(name);
    }
  }
  L.checkpoint('skills');

  // 2. Routing block.
  let routing = fs.readFileSync(L.join(repo, 'ROUTING.md'), 'utf8').replace(/\r\n/g, '\n')
    .replace('`rich-report` (Claude with Artifacts) or `html-report` (any agent)', '`html-report`').replace(/\n+$/, '');
  if (scope === 'design') {
    // Design work only: drop the rows that route research, installs and general coding.
    routing = routing.split('\n').filter((l) => !/^\| (Research, analysis|Installing, adding|Any new feature or creative work|Whole-project security review)/.test(l)).join('\n').replace(/\n+$/, '');
    routing += '\n\nScope: design work only (installed with --scope design). For research, installs and general coding, work as you would without this harness.';
  }
  const block = L.toRaw(`${L.START}\n${routing}\n${L.END}`);
  L.mkdirp(L.dirname(rules));
  const isFileNow = L.isFile(rules);
  const old = isFileNow ? L.readText(rules) : null;
  let content;
  if (agent === 'cursor') content = L.toRaw('---\ndescription: makkov-harness routing - which skill fits which situation\nalwaysApply: true\n---\n') + block + '\n';
  else if (isFileNow && old.includes(L.START)) content = L.replaceBlock(old, block);
  else if (isFileNow && old.length > 0) content = old + (old.endsWith('\n') ? '' : '\n') + '\n' + block + '\n';
  else content = block + '\n';
  if (!(isFileNow && old === content)) {
    // A plain copy (not read-only), made under a new name with an exclusive create and renamed into place: never
    // written through a link.
    if (needCopy) {
      L.mkdirp(L.dirname(original)); fs.rmSync(original + '.mh-tmp', { force: true });
      fs.writeFileSync(original + '.mh-tmp', L.readBytes(rules), { flag: 'wx' }); fs.renameSync(original + '.mh-tmp', original);
    }
    L.writeFile(rules, Buffer.from(content, 'latin1'));
  }
  L.checkpoint('rules');

  // 3. The manifest, as it now stands.
  const finalBackups = [...oldBackups]; if (backed.length) finalBackups.push('backup=' + L.join(backupRoot, 'skills'));
  writeManifest(names.flatMap(skillLines), finalBackups);

  say(`makkov-harness installed for ${agent}`);
  if (skillsDir) say(`Skills -> ${skillsDir} :${copied.map((n) => ' ' + n).join('')}`);
  if (backed.length) say(`Kept your earlier versions of:${backed.map((n) => ' ' + n).join('')} -> ${L.join(backupRoot, 'skills')}`);
  if (older.length) say(`Moved the copies an install before 0.5.0 left of:${older.map((n) => ' ' + n).join('')} -> ${L.join(backupRoot, 'earlier-harness')} (delete them if you never edited them)`);
  if (dropped.length) say(`No longer part of the harness, taken out of ${skillsDir}:${dropped.map((n) => ' ' + n).join('')}`);
  say(`Routing -> ${rules}`);
  if (agent === 'aider') say("Add 'read: [CONVENTIONS.md]' to .aider.conf.yml in the project.");
  say('Restart the agent, then run the harness-onboarding skill to personalize it.');
  return 0;
  }
}
