// Changed by makkov-harness (see NOTICE at the repository root); the original is HeyGen's, Apache-2.0.
// In makkov-harness telemetry is opt-in (MEDIA_USE_TELEMETRY=1), so these tests check that nothing is
// sent by default and that, once opted in, every upstream opt-out still wins.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { optedOut } from "./telemetry.mjs";

// optedOut() reads ~/.hyperframes/config.json and env vars. Point HOME at a temp
// dir so the run never touches the real config, and pin the env opt-outs to a
// neutral state; restore both afterwards.
const ENV_KEYS = [
  "HOME",
  "USERPROFILE",
  "MEDIA_USE_TELEMETRY",
  "HYPERFRAMES_NO_TELEMETRY",
  "DO_NOT_TRACK",
  "CI",
  "NODE_ENV",
];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const home = mkdtempSync(join(tmpdir(), "mu-telemetry-"));
const configPath = join(home, ".hyperframes", "config.json");

function writeConfig(contents) {
  if (contents === null) {
    rmSync(configPath, { force: true });
  } else {
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, contents);
  }
}
function withOptIn(fn) {
  process.env.MEDIA_USE_TELEMETRY = "1";
  try {
    fn();
  } finally {
    delete process.env.MEDIA_USE_TELEMETRY;
  }
}

test.before(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.HOME = process.env.USERPROFILE = home;
});

test.after(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  rmSync(home, { recursive: true, force: true });
});

test("nothing is sent by default: optedOut is true with no opt-in", () => {
  writeConfig(null);
  assert.equal(optedOut(), true);
});

test("the shared config alone does not opt in", () => {
  writeConfig(JSON.stringify({ telemetryEnabled: true }));
  assert.equal(optedOut(), true);
});

test("opted in, with no config and no opt-out env: optedOut is false", () => {
  writeConfig(null);
  withOptIn(() => assert.equal(optedOut(), false));
});

test("opted in, telemetryEnabled: false in the shared config still wins", () => {
  writeConfig(JSON.stringify({ telemetryEnabled: false }));
  withOptIn(() => assert.equal(optedOut(), true));
});

test("opted in, an unreadable shared config is not an opt-out", () => {
  writeConfig("{not json");
  withOptIn(() => assert.equal(optedOut(), false));
});

test("opted in, the env opt-outs still win", () => {
  writeConfig(JSON.stringify({ telemetryEnabled: true }));
  withOptIn(() => {
    process.env.DO_NOT_TRACK = "1";
    try {
      assert.equal(optedOut(), true);
    } finally {
      delete process.env.DO_NOT_TRACK;
    }
  });
});
