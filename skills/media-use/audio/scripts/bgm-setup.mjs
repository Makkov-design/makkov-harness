#!/usr/bin/env node
// Added by makkov-harness (see NOTICE at the repository root). Apache-2.0, like the rest of media-use.
//
// bgm-setup.mjs: the one step that installs Python packages for local music generation.
// Generation itself never installs anything. Run this once, when you choose to:
//
//   node bgm-setup.mjs            # MusicGen (transformers, torch, soundfile, numpy)
//   node bgm-setup.mjs lyria      # Lyria (google-genai); needs a Gemini or Google API key to use
//   node bgm-setup.mjs musicgen lyria
//
// It makes a separate virtual environment in your cache folder (see bgmVenvDir in lib/bgm.mjs)
// and installs exact versions there. Your own Python stays as it is. Python 3.11 or newer.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { BGM_PINS, bgmVenvDir, bgmVenvPython } from "./lib/bgm.mjs";
import { isMainModule } from "./lib/main-module.mjs";
import { pythonInvocation } from "./lib/python.mjs";

export function setupBgm(
  backends = ["musicgen"],
  { dir = bgmVenvDir(), run = spawnSync, exists = existsSync, base } = {},
) {
  for (const name of backends)
    if (!BGM_PINS[name]) throw new Error(`unknown backend "${name}" (use musicgen or lyria)`);
  const python = bgmVenvPython(dir);
  if (!exists(python)) {
    const { cmd, args } = pythonInvocation(["-m", "venv", dir], base);
    if (run(cmd, args, { stdio: "inherit" }).status !== 0)
      throw new Error(`could not make the environment at ${dir} (needs Python 3.11 or newer)`);
  }
  const pins = backends.flatMap((name) => BGM_PINS[name]);
  const args = ["-m", "pip", "install", "--disable-pip-version-check", ...pins];
  if (run(python, args, { stdio: "inherit" }).status !== 0)
    throw new Error(`pip could not install ${pins.join(" ")} into ${dir}`);
  return { dir, python, pins };
}

if (isMainModule(import.meta.url)) {
  const backends = process.argv.slice(2);
  try {
    const { dir, pins } = setupBgm(backends.length ? backends : ["musicgen"]);
    console.error(`✓ music generation set up in ${dir} (${pins.join(", ")})`);
  } catch (e) {
    console.error(`✗ bgm setup: ${e.message}`);
    process.exit(1);
  }
}
