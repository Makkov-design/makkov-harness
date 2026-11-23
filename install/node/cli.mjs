// The command line of the Node installer: one behaviour on every operating system.
//   makkov-harness install|update|uninstall --agent <agent> [--project <path>] [--scope all|design] [--dry-run]
//   makkov-harness doctor [--project <path>] [--agent <agent>] [--json]
// The agent and the project path may also be given as words: `makkov-harness install codex ~/work/site`.
// Exit codes, as the shell installers: 0 done, 1 stopped (nothing changed, or an uninstall found nothing), 2 usage.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from './lib.mjs';
import { install } from './install.mjs';
import { uninstall } from './uninstall.mjs';
import { doctor, doctorText } from './doctor.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const USAGE = `Usage: makkov-harness install|update|uninstall --agent ${L.AGENTS.join('|')} [--project <path>] [--scope all|design] [--dry-run]
       makkov-harness doctor [--project <path>] [--agent <agent>] [--json]
  install     copy the skills and add the routing map to the agent's instructions file (run again to update)
  update      the same, for an agent already installed here
  uninstall   remove what the install put there, and put back what it moved aside
  doctor      report what is installed where, and what needs attention (changes nothing)
  --project   a project folder; leave it out for a user-level install (cursor, copilot, windsurf, aider need one)
  --scope design   route design work only (the skills are still copied); an update keeps the earlier scope
  --dry-run   print every change it would make and write nothing`;

export function main(argv) {
  const out = [];
  const flush = () => { if (out.length) process.stdout.write(out.join('\n') + '\n'); out.length = 0; };
  const fail = (msg, code) => { flush(); process.stderr.write(msg + '\n'); return code; };
  const words = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = (name) => {
      if (a.includes('=')) return a.slice(a.indexOf('=') + 1);
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) { opt.error = name === '--scope' ? '--scope needs a value: all or design' : `${name} needs a value`; return undefined; }
      return argv[++i];
    };
    if (a === '--dry-run') opt.dry = true;
    else if (a === '--json') opt.json = true;
    else if (a === '-h' || a === '--help' || a === 'help') opt.help = true;
    else if (a === '-v' || a === '--version') opt.version = true;
    else if (a === '--agent' || a.startsWith('--agent=')) opt.agent = val('--agent');
    else if (a === '--project' || a.startsWith('--project=')) opt.project = val('--project');
    else if (a === '--scope' || a.startsWith('--scope=')) opt.scope = val('--scope');
    else if (a.startsWith('-')) opt.error = `unknown option ${a}`;
    else words.push(a);
  }
  if (opt.version) {
    process.stdout.write(JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version + '\n');
    return 0;
  }
  const cmd = words.shift();
  if (opt.help || !cmd) { process.stdout.write(USAGE + '\n'); return opt.help ? 0 : 2; }
  if (opt.error) return fail(`${opt.error}.\n${USAGE}`, 2);
  if (!['install', 'update', 'uninstall', 'doctor'].includes(cmd)) return fail(`unknown command ${cmd}.\n${USAGE}`, 2);
  if (words.length && !opt.agent && L.AGENTS.includes(words[0])) opt.agent = words.shift();
  if (words.length && !opt.project) opt.project = words.shift();
  if (words.length) return fail(`unexpected ${words[0]}.\n${USAGE}`, 2);
  if (opt.agent !== undefined && !L.AGENTS.includes(opt.agent)) return fail(`unknown agent ${opt.agent}.\n${USAGE}`, 2);
  if (cmd !== 'doctor' && !opt.agent) return fail(`${cmd} needs an agent (--agent ${L.AGENTS.join('|')}).\n${USAGE}`, 2);
  if (opt.scope !== undefined && (cmd === 'uninstall' || cmd === 'doctor')) return fail(`--scope is for install and update.\n${USAGE}`, 2);
  if (opt.scope !== undefined && !['all', 'design'].includes(opt.scope)) return fail(`--scope is all or design.\n${USAGE}`, 2);
  let project = '';
  if (opt.project) {
    project = path.resolve(opt.project);
    if (!L.isDir(project)) return fail(`${opt.project}: no such folder.`, 1);
  }
  try {
    if (cmd === 'doctor') {
      const r = doctor({ repo, project, agent: opt.agent });
      if (opt.json) process.stdout.write(JSON.stringify(r, null, 2) + '\n');
      else process.stdout.write(doctorText(r).join('\n') + '\n');
      return r.attention ? 1 : 0;
    }
    const code = cmd === 'uninstall'
      ? uninstall({ repo, agent: opt.agent, project, dry: !!opt.dry, out })
      : install({ repo, agent: opt.agent, project, scope: opt.scope, dry: !!opt.dry, update: cmd === 'update', out });
    flush();
    return code;
  } catch (e) {
    if (e instanceof L.Stop) return fail(e.message, e.code);
    flush();
    process.stderr.write(`makkov-harness: ${e && e.stack ? e.stack : e}\n`);
    return 1;
  }
}
