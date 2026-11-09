// Scores the two fixture pages with the Node runner and checks the ranges in expect.md:
// good.html 85 or more, bad.html under 45, at desktop (1440 x 900) and phone (390 x 844) sizes.
// It needs a Chrome and a puppeteer-core the runner can find (see scripts/score.mjs --help); without
// them the test is skipped, so it only runs where they were set up on purpose, as in CI.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, "..", "scripts", "score.mjs");
const ready = spawnSync(process.execPath, [RUNNER, "--check"], { encoding: "utf8" }).status === 0;

function score(page, flags) {
  const dir = mkdtempSync(join(tmpdir(), "ds-fixture-"));
  try {
    const out = join(dir, "result.json");
    const run = spawnSync(process.execPath, [RUNNER, join(HERE, "fixtures", page), ...flags, "--json", out], { encoding: "utf8", timeout: 120000 });
    assert.equal(run.status, 0, `score.mjs ${page} ${flags.join(" ")} exited ${run.status}: ${run.stderr}`);
    const data = JSON.parse(readFileSync(out, "utf8"));
    return (Array.isArray(data) ? data[0] : data).score;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

for (const [label, flags] of [["desktop", []], ["phone", ["--phone"]]]) {
  test(`good.html scores 85 or more (${label})`, { skip: !ready && "no Chrome or puppeteer-core for the runner" }, () => {
    const s = score("good.html", flags);
    assert.ok(s >= 85, `good.html scored ${s}`);
  });
  test(`bad.html scores under 45 (${label})`, { skip: !ready && "no Chrome or puppeteer-core for the runner" }, () => {
    const s = score("bad.html", flags);
    assert.ok(s < 45, `bad.html scored ${s}`);
  });
}
