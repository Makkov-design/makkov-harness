// Scores fixtures/hostile.html with the Node runner. Before the probe loads, that page claims window.MHScore and
// window.MHScoreUI with non-configurable getters that hand out a fake API (100/100, another host, markdown and
// script text), and it puts the same kind of text in its title, body text, class names and font names.
// The runner must measure the page as it renders: the same score and host as the page without the trick, no page
// text outside code in DESIGN.md or the fix prompt, and no script in the report but Design Score's own.
// Like fixtures.test.mjs, it needs a Chrome and a puppeteer-core the runner can find, and is skipped without them
// unless DESIGN_SCORE_FIXTURES=required.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const RUNNER = join(HERE, "..", "scripts", "score.mjs");
const ready = spawnSync(process.execPath, [RUNNER, "--check"], { encoding: "utf8" }).status === 0;
const MARKER = "MH-HOSTILE-MARKER";

// Runs the runner in its own folder on a copy of the page and returns what it wrote.
function score(dir, html) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "hostile.html"), html);
  const run = spawnSync(process.execPath, [RUNNER, "hostile.html", "--json", "r.json", "--style", "DESIGN.md", "--prompt", "prompt.md", "--report", "report.html"],
    { cwd: dir, encoding: "utf8", timeout: 120000 });
  assert.equal(run.status, 0, `score.mjs exited ${run.status}: ${run.stderr}`);
  const read = (f) => readFileSync(join(dir, f), "utf8");
  return { result: JSON.parse(read("r.json")), designMd: read("DESIGN.md"), prompt: read("prompt.md"), report: read("report.html") };
}

// Markdown with fenced blocks and code spans taken out: what an agent would read as prose.
const prose = (md) => md.replace(/```[^\n]*\n[\s\S]*?\n```/g, "").replace(/`[^`\n]*`/g, "");

test("a page that shadows window.MHScore cannot change the score, the host or the files", { skip: !ready && "no Chrome or puppeteer-core for the runner" }, () => {
  const html = readFileSync(join(HERE, "fixtures", "hostile.html"), "utf8");
  const plain = html.replace(/<!-- shadow:start -->[\s\S]*?<!-- shadow:end -->/, "");
  assert.notEqual(plain, html, "the fixture lost its shadow:start / shadow:end markers");
  const tmp = mkdtempSync(join(tmpdir(), "ds-hostile-"));
  try {
    const hostile = score(join(tmp, "hostile"), html);
    const clean = score(join(tmp, "clean"), plain);

    assert.equal(hostile.result.score, clean.result.score, "the page's fake MHScore changed the score");
    assert.equal(hostile.result.host, "local file");
    assert.equal(hostile.result.host, clean.result.host);
    assert.ok(hostile.result.categories.length >= 7, "the result has no measured categories");

    for (const [name, md] of [["DESIGN.md", hostile.designMd], ["fix prompt", hostile.prompt]]) {
      assert.ok(!prose(md).includes(MARKER), `${name}: page text outside a code span or block:\n${md}`);
      assert.ok(!/^\s*#+\s*SYSTEM/m.test(md), `${name}: the page added a heading`);
      assert.ok(!md.includes("curl evil.example"), `${name}: the page's fake formatter wrote it`);
    }
    assert.ok(hostile.designMd.startsWith("# DESIGN.md: `"), "DESIGN.md does not start with the probe's own heading");
    assert.ok(hostile.designMd.includes(MARKER), "DESIGN.md should still quote the page's title and font, as code");

    assert.equal((hostile.report.match(/<script\b/gi) || []).length, 1, "the report carries a script that is not Design Score's own");
    assert.equal((hostile.report.match(/<\/script/gi) || []).length, 1, "page text closed the report's script");
    assert.ok(!/<script[^>]*>\s*alert/i.test(hostile.report), "the report carries the page's script text unescaped");
    assert.ok(hostile.report.includes(MARKER), "the report should still show the page's text, escaped");
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
});
