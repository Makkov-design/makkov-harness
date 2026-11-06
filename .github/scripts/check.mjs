// Repository checks for every push and pull request. Read-only: no network, no writes.
// 1. plugin and marketplace manifests are valid JSON, and every pinned companion has a full commit sha
// 2. the SessionStart hook prints valid JSON under 10,000 characters of context
// 3. every skill folder has a SKILL.md whose name matches the folder and whose description fits the spec
// 4. no file contains something that looks like a key or token
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

let failed = 0;
const fail = (m) => { failed++; console.log(`::error::${m}`); };
const ok = (m) => console.log(`ok  ${m}`);

for (const f of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]) {
  try { JSON.parse(fs.readFileSync(f, "utf8")); ok(`${f} is valid JSON`); } catch (e) { fail(`${f}: ${e.message}`); }
}
try {
  const m = JSON.parse(fs.readFileSync(".claude-plugin/marketplace.json", "utf8"));
  for (const p of m.plugins) if (typeof p.source === "object" && "sha" in p.source && !/^[0-9a-f]{40}$/.test(p.source.sha)) fail(`marketplace: ${p.name} sha is not a full 40-character commit`);
  ok(`marketplace lists ${m.plugins.length} plugins`);
} catch {}

try {
  const out = execFileSync("bash", ["hooks/session-start"], { encoding: "utf8", env: { ...process.env, CLAUDE_PLUGIN_ROOT: process.cwd() } });
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  ctx.length > 10000 ? fail(`hook context is ${ctx.length} characters (over 10000)`) : ok(`hook prints valid JSON, ${ctx.length} characters`);
} catch (e) { fail(`hooks/session-start: ${e.message.split("\n")[0]}`); }

for (const dir of fs.readdirSync("skills", { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const file = path.join("skills", dir.name, "SKILL.md");
  if (!fs.existsSync(file)) { fail(`${file} is missing`); continue; }
  const head = fs.readFileSync(file, "utf8").split(/^---\s*$/m)[1] || "";
  const name = (head.match(/^name:\s*(.+)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, "");
  const desc = (head.match(/^description:\s*(.+)$/m) || [])[1]?.trim() || "";
  if (name !== dir.name) fail(`${file}: name "${name}" does not match the folder`);
  if (!desc || desc.length > 1024) fail(`${file}: description is empty or over 1024 characters`);
}
ok("skills have matching names and descriptions");

const SECRET = [/sk-[A-Za-z0-9_-]{20,}/, /gh[pousr]_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{30,}/, /AIza[0-9A-Za-z_-]{30,}/, /xox[abpr]-[A-Za-z0-9-]{10,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
const files = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter((f) => f && /\.(md|json|ya?ml|js|mjs|cjs|ts|sh|ps1|py|html|css|txt|toml)$/i.test(f));
let hits = 0;
for (const f of files) { const t = fs.readFileSync(f, "utf8"); for (const re of SECRET) if (re.test(t)) { fail(`${f}: looks like a key or token (${re.source.slice(0, 16)})`); hits++; } }
if (!hits) ok(`${files.length} text files: nothing that looks like a key`);

console.log(failed ? `\n${failed} problem(s)` : "\nall checks passed");
process.exit(failed ? 1 : 0);
