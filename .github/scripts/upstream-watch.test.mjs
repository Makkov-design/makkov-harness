// Tests for upstream-watch.mjs with stubbed GitHub and npm responses: no network.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkSource, collect, decide, render, sources, COMPARE_FILE_LIMIT } from "./upstream-watch.mjs";

const A = "a".repeat(40), B = "b".repeat(40), C = "c".repeat(40);

// A fake GitHub API: path -> response, or an Error with a status. Unknown paths are a 404.
function fakeGh(routes) {
  const calls = [];
  const gh = async (path) => {
    calls.push(path);
    const hit = routes[path];
    if (hit === undefined) { const e = new Error(`GET ${path}: 404 Not Found`); e.status = 404; throw e; }
    if (hit instanceof Error) throw hit;
    return typeof hit === "function" ? hit() : hit;
  };
  gh.calls = calls;
  return gh;
}
const files = (n, dir = "other") => Array.from({ length: n }, (_, i) => ({ filename: `${dir}/f${i}.md` }));
const repo = (r, { release, tags = [], head, branch = "main", compare = {}, contents = [] } = {}) => ({
  ...(release ? { [`/repos/${r}/releases/latest`]: { tag_name: release.tag } } : {}),
  ...(release ? { [`/repos/${r}/commits/${encodeURIComponent(release.tag)}`]: { sha: release.sha } } : {}),
  [`/repos/${r}/tags?per_page=100`]: tags.map(([name, sha]) => ({ name, commit: { sha } })),
  [`/repos/${r}`]: { default_branch: branch },
  ...(head ? { [`/repos/${r}/commits/${branch}`]: { sha: head } } : {}),
  ...Object.fromEntries(Object.entries(compare).map(([range, v]) => [`/repos/${r}/compare/${range}`, { status: "ahead", html_url: `https://github.com/${r}/compare/${range}`, ...v }])),
  ...Object.fromEntries(contents.map(([p, ref]) => [`/repos/${r}/contents/${p}?ref=${ref}`, [{ name: "x" }]])),
});

test("a pin equal to the latest release is current, even when the default branch moved on", async () => {
  const gh = fakeGh(repo("o/framelens", { release: { tag: "v2.1.0", sha: A }, head: B }));
  assert.equal(await checkSource(gh, { name: "framelens", kind: "companion", repo: "o/framelens", sha: A, ref: "v2.1.0" }), null);
  assert.ok(!gh.calls.some((c) => c.includes("/compare/")), "no compare against the branch head");
});

test("a pin on a tag (no ref given) is compared with the latest release, not the branch head", async () => {
  const gh = fakeGh(repo("o/p", { release: { tag: "v2.0.0", sha: B }, tags: [["v2.0.0", B], ["v1.0.0", A]], head: C, compare: { [`${A}...${B}`]: { ahead_by: 4, files: files(3, "src") } } }));
  const row = await checkSource(gh, { name: "p", kind: "companion", repo: "o/p", sha: A });
  assert.equal(row.against, "release `v2.0.0`");
  assert.equal(row.target, B.slice(0, 7));
  assert.equal(row.ahead, 4);
  assert.equal(row.files, "3");
});

test("a pin that is not a release is compared with the default branch", async () => {
  const gh = fakeGh(repo("o/p", { release: { tag: "v1.0.0", sha: C }, tags: [["v1.0.0", C]], head: B, branch: "trunk", compare: { [`${A}...${B}`]: { ahead_by: 2, files: [{ filename: "hooks/run.sh" }, { filename: "README.md" }] } } }));
  const row = await checkSource(gh, { name: "p", kind: "companion", repo: "o/p", sha: A });
  assert.equal(row.against, "`trunk` (latest commit)");
  assert.equal(row.code, "1");
  assert.equal(row.note, "");
});

test("a repo with no releases is compared with the default branch", async () => {
  const gh = fakeGh(repo("o/p", { head: B, compare: { [`${A.slice(0, 7)}...${B}`]: { ahead_by: 1, files: files(1) } } }));
  const row = await checkSource(gh, { name: "p", kind: "vendored", repo: "o/p", sha: A.slice(0, 7) });
  assert.equal(row.kind, "vendored");
  assert.equal(row.pinned, A.slice(0, 7));
});

test("a subfolder plugin whose folder did not change is current", async () => {
  const gh = fakeGh(repo("o/mono", { head: B, compare: { [`${A}...${B}`]: { ahead_by: 9, files: files(12, "elsewhere") } }, contents: [["plugin", B]] }));
  assert.equal(await checkSource(gh, { name: "m", kind: "companion", repo: "o/mono", sha: A, path: "plugin" }), null);
});

test("a subfolder plugin with a diff at the 300-file limit is flagged, not skipped", async () => {
  const gh = fakeGh(repo("o/mono", { head: B, compare: { [`${A}...${B}`]: { ahead_by: 500, files: files(COMPARE_FILE_LIMIT, "elsewhere") } }, contents: [["plugin", B]] }));
  const row = await checkSource(gh, { name: "m", kind: "companion", repo: "o/mono", sha: A, path: "plugin" });
  assert.ok(row, "the row is kept");
  assert.match(row.note, /review needed/);
  assert.equal(row.files, "0+");
});

test("a subfolder that no longer exists upstream is flagged", async () => {
  const gh = fakeGh(repo("o/mono", { head: B, compare: { [`${A}...${B}`]: { ahead_by: 1, files: files(1, "elsewhere") } } }));
  const row = await checkSource(gh, { name: "m", kind: "vendored", repo: "o/mono", sha: A, path: "skills" });
  assert.match(row.note, /`skills\/` no longer exists upstream/);
});

test("a pin ahead of the latest release is current", async () => {
  const gh = fakeGh(repo("o/p", { release: { tag: "v1.0.0", sha: B }, tags: [["v1.0.1", A]], compare: { [`${A}...${B}`]: { status: "behind", ahead_by: 0, files: [] } } }));
  assert.equal(await checkSource(gh, { name: "p", kind: "companion", repo: "o/p", sha: A }), null);
});

test("one failing upstream is reported and the others are still checked", async () => {
  const gone = Object.assign(new Error("GET /repos/o/gone/releases/latest: 500 boom"), { status: 500 });
  const gh = fakeGh({
    "/repos/o/gone/releases/latest": gone,
    ...repo("o/ok", { head: B, compare: { [`${A}...${B}`]: { ahead_by: 1, files: files(1) } } }),
  });
  const market = { plugins: [
    { name: "self", source: "./" },
    { name: "gone", source: { source: "github", repo: "o/gone", sha: A } },
    { name: "ok", source: { source: "github", repo: "o/ok", sha: A } },
  ] };
  const result = await collect({ market, watch: {}, gh, npmLatest: async () => "1.0.0" });
  assert.deepEqual(result.rows.map((r) => r.name), ["ok"]);
  assert.equal(result.errors.length, 1);
  assert.equal(result.errors[0].name, "gone");
  assert.equal(decide(result, null), "create");
  assert.match(render(result, "2026-01-01"), /Could not check[\s\S]*gone \(o\/gone\): `GET \/repos\/o\/gone\/releases\/latest: 500 boom`/);
});

test("a force-pushed (missing) pinned commit is an error row, not a crash", async () => {
  const gh = fakeGh(repo("o/p", { head: B })); // the compare path is unknown: 404
  const market = { plugins: [{ name: "p", source: { source: "github", repo: "o/p", sha: A } }] };
  const result = await collect({ market, watch: {}, gh, npmLatest: async () => "1.0.0" });
  assert.equal(result.rows.length, 0);
  assert.match(result.errors[0].error, /compare.*404/);
});

test("npm pins: a newer release is a row, an equal one is not, a registry failure is an error", async () => {
  const latest = { hyperframes: "0.10.0", "puppeteer-core": "25.16.0" };
  const npmLatest = async (n) => { if (!(n in latest)) throw new Error(`npm registry ${n}: 404`); return latest[n]; };
  const watch = { npm: [{ name: "hyperframes", version: "0.9.9" }, { name: "puppeteer-core", version: "25.16.0" }, { name: "gone", version: "1.0.0" }] };
  const result = await collect({ market: { plugins: [] }, watch, gh: fakeGh({}), npmLatest });
  assert.deepEqual(result.npmRows, [{ name: "hyperframes", pinned: "0.9.9", latest: "0.10.0" }]);
  assert.equal(result.errors.length, 1);
  assert.match(render(result), /\| hyperframes \| 0\.9\.9 \| `0\.10\.0` \|/);
});

test("vendored sources are followed alongside companions", () => {
  const list = sources(
    { plugins: [{ name: "self", source: "./" }, { name: "sub", source: { source: "git-subdir", url: "https://github.com/o/mono.git", path: "plugin", sha: A } }] },
    { vendored: [{ name: "v", repo: "o/v", sha: "f1090be", path: "skills" }] },
  );
  assert.deepEqual(list.map((s) => [s.name, s.kind, s.repo, s.path]), [["sub", "companion", "o/mono", "plugin"], ["v", "vendored", "o/v", "skills"]]);
});

test("the issue is closed only when everything is current and nothing failed", () => {
  const none = { rows: [], npmRows: [], errors: [] };
  assert.equal(decide(none, { number: 1 }), "close");
  assert.equal(decide(none, null), "none");
  assert.equal(decide({ ...none, errors: [{ name: "x" }] }, { number: 1 }), "update");
  assert.equal(decide({ ...none, npmRows: [{ name: "x" }] }, null), "create");
});

test("upstream-controlled names cannot mention, link or break the table", async () => {
  const evil = "@octocat]](x)`|y";
  const gh = fakeGh(repo("o/p", { release: { tag: evil, sha: B }, tags: [["v1", A]], compare: { [`${A}...${B}`]: { ahead_by: 1, files: files(1) } } }));
  const row = await checkSource(gh, { name: "p", kind: "companion", repo: "o/p", sha: A });
  const body = render({ rows: [row], npmRows: [], errors: [{ name: "q", repo: "o/q", error: "@someone `x`" }] });
  assert.ok(body.includes("release `@octocat]](x)\\|y`"), body);
  assert.ok(body.includes("`@someone x`"), body);
  assert.ok(!/(^|[^`])@octocat/.test(body.replace(/`[^`]*`/g, "")), "no bare @mention outside code");
});

test("the repository's own watch list is well formed", async () => {
  const fs = await import("node:fs");
  const watch = JSON.parse(fs.readFileSync(new URL("../upstream-watch.json", import.meta.url), "utf8"));
  for (const v of watch.vendored) { assert.match(v.repo, /^[\w.-]+\/[\w.-]+$/); assert.match(v.sha, /^[0-9a-f]{7,40}$/); }
  for (const p of watch.npm) assert.match(p.version, /^\d+\.\d+\.\d+$/);
});
