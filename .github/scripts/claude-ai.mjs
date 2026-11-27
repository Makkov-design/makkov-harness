// What claude.ai organization sync (Sync on a marketplace in claude.ai's Plugins settings) refuses, checked from
// .claude-plugin/marketplace.json and the plugin folders this repository holds. Each rule is written down in
// Claude's documentation; nothing here is guessed:
//   https://claude.com/docs/plugins/org-sync ("Plugin sources that organization sync accepts", "Keep executables
//   out of the top-level bin directory") and https://code.claude.com/docs/en/plugins-reference ("Path rules",
//   "Standard layout": claude.ai and Cowork don't install a plugin that has a top-level bin/).
// 0.6.0 and 0.6.1 shipped bin/makkov-harness.mjs at the plugin root (the repository root); Sync marked the plugin
// "Skipped" and kept 0.5.0. Used by check.mjs; tests in claude-ai.test.mjs.
import fs from "node:fs";
import path from "node:path";

// Hosts organization sync fetches a public plugin source from without credentials.
export const PUBLIC_HOSTS = ["github.com", "gitlab.com", "bitbucket.org"];
const TYPES = ["github", "url", "git-subdir"];

// Errors for one marketplace: a list of strings, empty when claude.ai would take every plugin.
// hasTopLevelBin(rel) says whether the plugin folder rel (relative to the marketplace root) has an entry named bin.
export function claudeAiErrors(market, hasTopLevelBin) {
  const errs = [];
  for (const p of (market && market.plugins) || []) {
    const s = p.source, name = p.name || "(no name)";
    if (typeof s === "string") {
      if (!s.startsWith("./")) { errs.push(`${name}: source "${s}" is not a relative path that starts with ./ (claude.ai rejects a bare name or any other form)`); continue; }
      if (s.split(/[\\/]/).includes("..")) { errs.push(`${name}: source "${s}" contains ".." (a plugin path must stay inside the marketplace)`); continue; }
      if (hasTopLevelBin(s)) errs.push(`${name}: the plugin root ${s === "./" ? "(the repository root)" : s} has a top-level bin/; claude.ai skips a plugin that has one ("Plugin contains a top-level bin/ directory"). Move executables to another folder and reference them from hooks, commands or mcpServers`);
      continue;
    }
    if (!s || typeof s !== "object" || !TYPES.includes(s.source)) { errs.push(`${name}: source type ${JSON.stringify(s && typeof s === "object" ? s.source : s)} is not one claude.ai syncs (${TYPES.join(", ")} or a ./ path)`); continue; }
    if (s.source === "url" || s.source === "git-subdir") {
      let host = null;
      try { host = new URL(s.url).hostname.toLowerCase(); } catch {}
      if (!host) errs.push(`${name}: source url ${JSON.stringify(s.url)} is not a URL`);
      else if (!PUBLIC_HOSTS.includes(host)) errs.push(`${name}: source host ${host} is not one claude.ai fetches a public plugin from (${PUBLIC_HOSTS.join(", ")})`);
    }
  }
  return errs;
}

// hasTopLevelBin for plugin folders on disk under root. Any entry named bin counts (a folder, a file or a link).
export const binOnDisk = (root) => (rel) => {
  try { fs.lstatSync(path.join(root, rel, "bin")); return true; } catch { return false; }
};
