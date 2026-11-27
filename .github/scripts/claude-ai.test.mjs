import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { claudeAiErrors, binOnDisk } from "./claude-ai.mjs";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SHA = "04227d4000000000000000000000000000000000";
const none = () => false;

test("a top-level bin/ in a ./ plugin root fails, as claude.ai's Sync skips that plugin", () => {
  const m = { plugins: [{ name: "self", source: "./" }] };
  const errs = claudeAiErrors(m, (rel) => rel === "./");
  assert.equal(errs.length, 1);
  assert.match(errs[0], /top-level bin\//);
  assert.deepEqual(claudeAiErrors(m, none), []);
});

test("binOnDisk sees a bin folder, a bin file and a bin link, and nothing else", () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "mh-bin-"));
  try {
    const has = binOnDisk(d);
    fs.mkdirSync(path.join(d, "cli"));
    assert.equal(has("./"), false);
    fs.mkdirSync(path.join(d, "bin"));
    assert.equal(has("./"), true);
    fs.rmSync(path.join(d, "bin"), { recursive: true });
    fs.writeFileSync(path.join(d, "bin"), "");
    assert.equal(has("./"), true);
    fs.mkdirSync(path.join(d, "plugins", "a", "bin"), { recursive: true });
    assert.equal(has("./plugins/a"), true);
    assert.equal(has("./plugins/b"), false);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test("source types: github, url, git-subdir and ./ paths pass; anything else fails", () => {
  const ok = { plugins: [
    { name: "a", source: "./plugins/a" },
    { name: "b", source: { source: "github", repo: "o/r", sha: SHA } },
    { name: "c", source: { source: "git-subdir", url: "https://github.com/o/r.git", path: "p", sha: SHA } },
    { name: "d", source: { source: "url", url: "https://gitlab.com/o/r.git", sha: SHA } },
  ] };
  assert.deepEqual(claudeAiErrors(ok, none), []);
  for (const source of ["deploy-tools", "plugins/a", "../a", "./a/../../b", { source: "npm", package: "x" }, { source: "directory", path: "/x" }, null]) {
    assert.equal(claudeAiErrors({ plugins: [{ name: "x", source }] }, none).length, 1, JSON.stringify(source));
  }
});

test("a url or git-subdir source must be on a host claude.ai fetches public plugins from", () => {
  for (const url of ["https://example.com/o/r.git", "https://github.com.evil.test/o/r.git", "not a url"]) {
    assert.equal(claudeAiErrors({ plugins: [{ name: "x", source: { source: "git-subdir", url, path: "p", sha: SHA } }] }, none).length, 1, url);
  }
  assert.deepEqual(claudeAiErrors({ plugins: [{ name: "x", source: { source: "url", url: "https://bitbucket.org/o/r.git", sha: SHA } }] }, none), []);
});

test("this repository's marketplace passes, and its plugin root has no top-level bin/", () => {
  const m = JSON.parse(fs.readFileSync(path.join(repo, ".claude-plugin", "marketplace.json"), "utf8"));
  assert.deepEqual(claudeAiErrors(m, binOnDisk(repo)), []);
  assert.equal(fs.existsSync(path.join(repo, "bin")), false);
});
