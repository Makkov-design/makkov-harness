// Tests for hooks/session-start: the routing map it prints, in full and with MAKKOV_HARNESS_SCOPE=design.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HOOK = join(dirname(fileURLToPath(import.meta.url)), "session-start");
function context(env = {}) {
  const r = spawnSync("bash", [HOOK], { encoding: "utf8", env: { ...process.env, MAKKOV_HARNESS_SCOPE: "", ...env } });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, "SessionStart");
  return out.hookSpecificOutput.additionalContext;
}
const OTHER = ["| Research, analysis", "| Installing, adding", "| Any new feature or creative work", "| Whole-project security review"];

test("prints the whole routing map by default", () => {
  const text = context();
  for (const row of OTHER) assert.ok(text.includes(row), row);
  assert.ok(!text.includes("Scope: design work only"));
});

test("MAKKOV_HARNESS_SCOPE=design keeps the design rows only", () => {
  const text = context({ MAKKOV_HARNESS_SCOPE: "design" });
  for (const row of OTHER) assert.ok(!text.includes(row), row);
  assert.ok(text.includes("| A design score"));
  assert.ok(text.includes("Scope: design work only (MAKKOV_HARNESS_SCOPE=design)"));
  assert.ok(text.includes("Plugin path: "));
});
