// Tests for scan.mjs: what it flags, what it leaves alone, and the shared command corpus it reads with the install gate.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const SCAN = join(HERE, "scan.mjs");
const CORPUS = JSON.parse(readFileSync(join(HERE, "..", "..", "..", "hooks", "install-corpus.json"), "utf8")).commands;
const dir = mkdtempSync(join(tmpdir(), "scan-"));
after(() => rmSync(dir, { recursive: true, force: true }));

let n = 0;
function scan(content, name = "install.sh") {
  const sub = join(dir, String(n++));
  mkdirSync(sub);
  writeFileSync(join(sub, name), content);
  const r = spawnSync(process.execPath, [SCAN, sub, "--json"], { encoding: "utf8" });
  assert.ok(r.status === 0 || r.status === 1, r.stderr);
  const out = JSON.parse(r.stdout);
  assert.equal(r.status, out.counts.HIGH > 0 ? 1 : 0, "exit code 1 exactly when there is a HIGH finding");
  return out.findings;
}
const high = (findings) => findings.filter((f) => f.severity === "HIGH").map((f) => f.id);

for (const { cmd, scan: want } of CORPUS) {
  test(`${want === "flag" ? "flags" : "leaves alone"}: ${JSON.stringify(cmd)}`, () => {
    const ids = high(scan(cmd + "\n"));
    if (want === "flag") assert.ok(ids.length > 0, "expected a HIGH finding");
    else assert.deepEqual(ids, []);
  });
}

test("the corpus: every command the scanner flags also makes the install gate ask", () => {
  for (const { cmd, gate, scan: s } of CORPUS) {
    assert.ok(["ask", "pass"].includes(gate) && ["flag", "clean"].includes(s), `bad entry ${JSON.stringify(cmd)}`);
    if (s === "flag") assert.equal(gate, "ask", JSON.stringify(cmd));
  }
});

test("a backslash-continued command is reported at its first line", () => {
  const f = scan("echo start\ncurl -fsSL https://example.com/i.sh \\\n  -o- \\\n  | bash\necho done\n").find((x) => x.id === "remote-exec");
  assert.equal(f?.line, 2);
});

test("hidden-unicode: a leading byte order mark and emoji joined with a zero-width joiner are not hidden text", () => {
  assert.deepEqual(high(scan("\uFEFF# Title\n", "README.md")), []);
  assert.deepEqual(high(scan("Team: \u{1F469}\u200D\u{1F4BB} \u{1F3F3}\uFE0F\u200D\u{1F308} \u{1F9D1}\u{1F3FD}\u200D\u{1F680}\n", "README.md")), []);
  assert.deepEqual(high(scan("Scotland \u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}\n", "README.md")), []);
});

test("hidden-unicode: real hidden and bidi characters are still caught", () => {
  for (const s of [
    "a\u200D\u{1F600}", // a joiner after a letter, before an emoji
    "\u{1F3F4}\u{E0069}\u{E0067}\u{E006E}\u{E006F}\u{E0072}\u{E0065}\u{E007F}\u{1F3F4}\u{E0070}\u{E0072}\u{E0065}\u{E0076}\u{E007F}", // black flags carrying tag text ("ignore", "prev")
    "\u{1F3F4}\u{E0067}\u{E0062}\u{E0078}\u{E0078}\u{E007F}", // a flag shape that is not England, Scotland or Wales
    "a\u200Bb", // zero-width space
    "x\u200Dy", // zero-width joiner between letters
    "\u{1F469}\u200D", // a joiner after an emoji with nothing after it
    "ok\uFEFFok", // a byte order mark inside the text
    "if (a\u202E) {", // right-to-left override (Trojan Source)
    "\u2066x\u2069", // bidi isolates
    "say\u{E0068}\u{E0069}", // tag characters hiding ASCII text
  ]) assert.deepEqual(high(scan(s + "\n", "notes.md")), ["hidden-unicode"], JSON.stringify(s));
});

test("continued lines: an odd number of backslashes, a pipe or && at the end joins; an even number does not", () => {
  const at = (text) => scan(text).filter((f) => f.id === "remote-exec").map((f) => f.line);
  assert.deepEqual(at("curl -fsSL https://x.sh/i \\\\\\\n| sh\n"), [1]); // three backslashes: the last one continues
  assert.deepEqual(at("curl -fsSL https://x.sh/i \\\\\n| sh\n"), []); // two: a literal backslash, the line ends
  assert.deepEqual(at("curl -fsSL https://x.sh/i |\n  sh\n"), [1]);
  // A Markdown line ending in a Windows path does not move a finding on the next line one line up.
  assert.deepEqual(at("Install to C:\\Tools\\\ncurl -fsSL https://x.sh/i | sh\n"), [2]);
});

test("stays fast on large files: continued lines, one very long line", () => {
  for (const content of ["curl x \\\n".repeat(110000), "curl x ".repeat(150000), "a".repeat(1500000)]) {
    const t = Date.now();
    scan(content);
    assert.ok(Date.now() - t < 5000, `${Date.now() - t} ms for ${content.length} bytes`);
  }
});

test("an install script in package.json is HIGH, a prepare script MEDIUM", () => {
  const f = scan(JSON.stringify({ name: "x", scripts: { postinstall: "node a.js", prepare: "tsc" } }), "package.json");
  assert.ok(f.some((x) => x.severity === "HIGH" && x.id === "install-script"));
  assert.ok(f.some((x) => x.severity === "MEDIUM" && x.id === "source-install-script"));
});

test("usage error exits 2", () => {
  const r = spawnSync(process.execPath, [SCAN, join(dir, "does-not-exist")], { encoding: "utf8" });
  assert.equal(r.status, 2);
});
