// Changed by makkov-harness (see NOTICE at the repository root); the original is HeyGen's, Apache-2.0.
import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { appendRecord } from "../../../scripts/lib/manifest.mjs";
import {
  BGM_BED_VOLUME,
  BGM_SILENT_VOLUME,
  BGM_PINS,
  bgmDefaultVolume,
  bgmVenvDir,
  bgmVenvPython,
  generateBgmDetached,
} from "./bgm.mjs";
import { setupBgm } from "../bgm-setup.mjs";

// Regression: narrated pipelines used to ship BGM at 0.8 (≈ -2 dB), ~16 dB
// hotter than a music bed under a voice should be. The default under narration
// must be a proper bed (≈ -18 dB); a silent film keeps the louder default.

const dbfs = (linear) => 20 * Math.log10(linear);

test("BGM under narration is a bed near -18 dB", () => {
  assert.equal(bgmDefaultVolume(true), BGM_BED_VOLUME);
  assert.equal(BGM_BED_VOLUME, 0.12);
  const db = dbfs(BGM_BED_VOLUME);
  assert.ok(db < -17 && db > -19, `bed should be ≈ -18 dB, got ${db.toFixed(1)} dB`);
});

test("a silent film (no voice) keeps BGM forward", () => {
  assert.equal(bgmDefaultVolume(false), BGM_SILENT_VOLUME);
  assert.equal(BGM_SILENT_VOLUME, 0.9);
});

test("the narrated default is well below the voice (≈ 0 dBFS)", () => {
  // Voice sits at data-volume="1" (0 dBFS); the bed must be ~16+ dB under it.
  const separation = dbfs(1) - dbfs(bgmDefaultVolume(true));
  assert.ok(
    separation >= 16,
    `bed should sit ≥16 dB under the voice, got ${separation.toFixed(1)} dB`,
  );
});

test(
  "generating music again clears the engine's old track, so waiting cannot mistake it for the new one",
  { skip: process.platform === "win32" && "the fake python is a shell script" },
  (t) => {
    const dir = mkdtempSync(join(tmpdir(), "hf-bgm-"));
    const path = process.env.PATH;
    const cache = process.env.XDG_CACHE_HOME;
    t.after(() => {
      process.env.PATH = path;
      restore("XDG_CACHE_HOME", cache);
      rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); // the detached fake python may still be writing its log
    });
    process.env.XDG_CACHE_HOME = join(dir, "cache"); // no set-up environment
    mkdirSync(join(dir, "bin"));
    for (const name of ["python3", "python"])
      writeFileSync(join(dir, "bin", name), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
    process.env.PATH = `${join(dir, "bin")}:${path}`;
    mkdirSync(join(dir, "assets/bgm"), { recursive: true });
    writeFileSync(join(dir, "assets/bgm/track.wav"), "last run's track");
    appendRecord(dir, {
      id: "bgm_001",
      type: "bgm",
      path: "assets/bgm/track.wav",
      source: "generated",
    });

    const gen = generateBgmDetached({
      prompt: "calm",
      durationS: 5,
      hyperframesDir: dir,
      anomalies: [],
    });

    assert.equal(gen.path, "assets/bgm/track.wav");
    assert.equal(existsSync(join(dir, "assets/bgm/track.wav")), false);
  },
);

function restore(name, value) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

// A fake python that logs every call and exits with `status`.
function fakePython(path, logFile, status) {
  writeFileSync(path, `#!/bin/sh\necho "$@" >> "${logFile}"\nexit ${status}\n`, { mode: 0o755 });
}

function bgmSandbox(t) {
  const dir = mkdtempSync(join(tmpdir(), "hf-bgm-"));
  const saved = { PATH: process.env.PATH, XDG_CACHE_HOME: process.env.XDG_CACHE_HOME };
  const savedKeys = { GEMINI_API_KEY: process.env.GEMINI_API_KEY, GOOGLE_API_KEY: process.env.GOOGLE_API_KEY };
  t.after(() => {
    for (const [name, value] of Object.entries({ ...saved, ...savedKeys })) restore(name, value);
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }); // the detached fake python may still be writing its log
  });
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  mkdirSync(join(dir, "bin"));
  process.env.PATH = `${join(dir, "bin")}:${saved.PATH}`;
  process.env.XDG_CACHE_HOME = join(dir, "cache");
  return dir;
}

test(
  "generating music with its packages missing installs nothing and names the setup command",
  { skip: process.platform === "win32" && "the fake python is a shell script" },
  (t) => {
    const dir = bgmSandbox(t);
    const log = join(dir, "python.log");
    for (const name of ["python3", "python"]) fakePython(join(dir, "bin", name), log, 1);

    const gen = generateBgmDetached({ prompt: "calm", durationS: 5, hyperframesDir: dir, anomalies: [] });

    assert.equal(gen.disabled, true);
    assert.match(gen.reason, /bgm-setup\.mjs/);
    assert.doesNotMatch(readFileSync(log, "utf8"), /pip/);
  },
);

test(
  "generating music uses the set-up environment when it exists",
  { skip: process.platform === "win32" && "the fake python is a shell script" },
  (t) => {
    const dir = bgmSandbox(t);
    const pathLog = join(dir, "path-python.log");
    for (const name of ["python3", "python"]) fakePython(join(dir, "bin", name), pathLog, 1);
    const venvPython = bgmVenvPython(bgmVenvDir());
    mkdirSync(join(venvPython, ".."), { recursive: true });
    const venvLog = join(dir, "venv-python.log");
    fakePython(venvPython, venvLog, 0);

    const gen = generateBgmDetached({ prompt: "calm", durationS: 5, hyperframesDir: dir, anomalies: [] });

    assert.equal(gen.provider, "musicgen");
    assert.match(readFileSync(venvLog, "utf8"), /MusicgenForConditionalGeneration/);
    assert.equal(existsSync(pathLog), false);
  },
);

test("the setup command makes its own environment and installs exact versions only", () => {
  const calls = [];
  const run = (cmd, args) => {
    calls.push([cmd, ...args]);
    return { status: 0 };
  };
  const dir = join(tmpdir(), "bgm-venv-test");
  const { python } = setupBgm(["musicgen", "lyria"], { dir, run, exists: () => false, base: ["python3"] });

  assert.deepEqual(calls[0], ["python3", "-m", "venv", dir]);
  assert.equal(python, bgmVenvPython(dir));
  assert.deepEqual(calls[1].slice(0, 4), [python, "-m", "pip", "install"]);
  const pins = calls[1].slice(4).filter((arg) => !arg.startsWith("--"));
  assert.deepEqual(pins, [...BGM_PINS.musicgen, ...BGM_PINS.lyria]);
  for (const pin of pins) assert.match(pin, /^[a-z-]+==\d+(\.\d+)+$/);
  assert.equal(calls.length, 2);
  assert.throws(() => setupBgm(["other"], { dir, run }), /unknown backend/);
});
