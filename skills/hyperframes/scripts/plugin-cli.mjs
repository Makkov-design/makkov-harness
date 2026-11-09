#!/usr/bin/env node
// Changed by makkov-harness (see NOTICE at the repository root); the original is HeyGen's, Apache-2.0.
// Run from the user's project; locate the release from this installed file.
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, win32 } from "node:path";
import { fileURLToPath } from "node:url";
import { isMainModule } from "./lib/main-module.mjs";

const root = fileURLToPath(new URL("../../../", import.meta.url));
// makkov-harness bundles these skills inside its own plugin, so its manifest names the harness
// and its version, not HyperFrames. This file pins the HyperFrames CLI release the harness
// reviewed (see SECURITY.md); it is read before any plugin manifest.
const manifests = [
  "skills/hyperframes/scripts/cli-version.json",
  "plugin.json",
  ".claude-plugin/plugin.json",
  ".codex-plugin/plugin.json",
  ".cursor-plugin/plugin.json",
  "gemini-extension.json",
];

export function pluginVersion(pluginRoot = root) {
  for (const path of manifests) {
    const file = join(pluginRoot, path);
    if (!existsSync(file)) continue;
    const manifest = JSON.parse(readFileSync(file, "utf8"));
    if (
      manifest.name !== "hyperframes" ||
      !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(manifest.version ?? "")
    ) {
      throw new Error(`Invalid HyperFrames plugin release: ${file}`);
    }
    return manifest.version;
  }
  throw new Error(
    "No HyperFrames plugin manifest found. Use the standalone skills installation instructions.",
  );
}

export function invocation(
  args,
  {
    version = pluginVersion(),
    env = process.env,
    platform = process.platform,
    node = process.execPath,
    pathExists = existsSync,
  } = {},
) {
  if (args[0] === "skills")
    throw new Error(
      "Update HyperFrames through your agent's plugin manager; bundled skills are release-managed.",
    );
  const childEnv = {
    ...env,
    HYPERFRAMES_SKIP_SKILLS: "1",
    HYPERFRAMES_SKILL_PKG_VERSION: version,
    HYPERFRAMES_PLUGIN_VERSION: version,
    HYPERFRAMES_NO_UPDATE_CHECK: "1",
  };
  if (args[0] === "--script") {
    if (!args[1]) throw new Error("--script requires a Node script path.");
    return { command: node, args: args.slice(1), env: childEnv };
  }
  const cliArgs = ["--yes", `hyperframes@${version}`, ...args];
  if (platform !== "win32") return { command: "npx", args: cliArgs, env: childEnv };
  const candidates = [
    env.npm_execpath && win32.join(win32.dirname(env.npm_execpath), "npx-cli.js"),
    win32.join(win32.dirname(node), "node_modules", "npm", "bin", "npx-cli.js"),
  ].filter(Boolean);
  const npx = candidates.find(pathExists);
  if (!npx)
    throw new Error(
      "Cannot find npx-cli.js. Install Node.js with npm or run from an npm environment.",
    );
  return { command: node, args: [npx, ...cliArgs], env: childEnv };
}

if (isMainModule(import.meta.url)) {
  try {
    const command = invocation(process.argv.slice(2));
    const result = spawnSync(command.command, command.args, {
      env: command.env,
      stdio: "inherit",
      windowsHide: true,
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
