// Weekly check: has any pinned companion plugin moved on since its reviewed commit?
// Reads .claude-plugin/marketplace.json, asks the GitHub API (read-only) for each upstream's latest commit,
// and keeps one issue up to date. It never changes a pin: bumping one needs a new security review.
// Env: GITHUB_TOKEN, GITHUB_REPOSITORY (owner/name). DRY_RUN=1 prints the issue instead of writing it.
import fs from "node:fs";

const TITLE = "Companion plugins: updates to review";
const token = process.env.GITHUB_TOKEN;
const self = process.env.GITHUB_REPOSITORY || "Makkov-design/makkov-harness";
const dry = process.env.DRY_RUN === "1";

async function gh(path, init = {}) {
  const res = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: { accept: "application/vnd.github+json", "x-github-api-version": "2022-11-28", ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers },
  });
  if (!res.ok) throw new Error(`${init.method || "GET"} ${path}: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const repoOf = (src) => src.repo || src.url.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "");

const market = JSON.parse(fs.readFileSync(".claude-plugin/marketplace.json", "utf8"));
const rows = [];
for (const p of market.plugins) {
  const src = p.source;
  if (typeof src !== "object" || !src.sha) continue; // local plugin or unpinned (own project)
  const repo = repoOf(src);
  const meta = await gh(`/repos/${repo}`);
  const head = await gh(`/repos/${repo}/commits/${meta.default_branch}`);
  if (head.sha === src.sha) continue;
  const cmp = await gh(`/repos/${repo}/compare/${src.sha}...${head.sha}`);
  // For a plugin that lives in a subfolder, only changes inside that folder matter.
  const files = (cmp.files || []).filter((f) => !src.path || f.filename.startsWith(src.path + "/"));
  if (src.path && files.length === 0) continue;
  let release = "";
  try { release = (await gh(`/repos/${repo}/releases/latest`)).tag_name; } catch {}
  const hooks = files.filter((f) => /(^|\/)(hooks?|scripts?|bin)\/|\.(sh|ps1|js|mjs|cjs|py)$|package\.json$/.test(f.filename));
  rows.push({ name: p.name, repo, pinned: src.sha.slice(0, 7), head: head.sha.slice(0, 7), headFull: head.sha, ahead: cmp.ahead_by, files: files.length, hooks: hooks.length, release, compare: cmp.html_url });
}

const lines = [
  "Pinned companion plugins whose upstream has new commits since the reviewed version. Pins are not changed automatically: each new version needs the `third-party-install-guard` review first.",
  "",
  "| Plugin | Pinned | Upstream now | Commits | Files changed | Of them code/hooks | Latest release | Diff |",
  "|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => `| ${r.name} | \`${r.pinned}\` | \`${r.head}\` | ${r.ahead} | ${r.files} | ${r.hooks} | ${r.release || "—"} | [compare](${r.compare}) |`),
  "",
  "**To review and bump**, open a Claude session in this repository and paste:",
  "",
  "```",
  `Review the companion updates in the issue "${TITLE}". For each plugin: run third-party-install-guard on the upstream commit listed there, and only if the verdict is green or yellow update its sha in .claude-plugin/marketplace.json and its row in SECURITY.md (version, date, verdict). Show me the verdicts before committing.`,
  "```",
  "",
  `_Checked ${new Date().toISOString().slice(0, 10)} by the weekly upstream-watch workflow._`,
];
const body = lines.join("\n");

if (dry) {
  console.log(rows.length ? body : "No pinned companion has new upstream commits.");
  process.exit(0);
}

const open = (await gh(`/repos/${self}/issues?state=open&per_page=100`)).find((i) => i.title === TITLE && !i.pull_request);
if (rows.length && open) await gh(`/repos/${self}/issues/${open.number}`, { method: "PATCH", body: JSON.stringify({ body }) });
else if (rows.length) await gh(`/repos/${self}/issues`, { method: "POST", body: JSON.stringify({ title: TITLE, body }) });
else if (open) {
  await gh(`/repos/${self}/issues/${open.number}/comments`, { method: "POST", body: JSON.stringify({ body: "All pinned companions match their upstream again. Closing." }) });
  await gh(`/repos/${self}/issues/${open.number}`, { method: "PATCH", body: JSON.stringify({ state: "closed" }) });
}
console.log(rows.length ? `${rows.length} companion(s) with updates: ${rows.map((r) => r.name).join(", ")}` : "No updates.");
