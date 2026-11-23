// Repository checks for every push and pull request. Read-only: no network, no writes.
// Read-only apart from git reads of the base commit (CHECK_BASE_SHA; see baseCommit).
// 1. plugin and marketplace manifests are valid JSON, every pinned companion has a full commit sha, and the
//    plugin's version is the same in plugin.json, its marketplace entry and the newest CHANGELOG.md entry
//    (and, where this clone has tags, a warning for a CHANGELOG.md link to a tag that does not exist yet)
// 2. the SessionStart hook prints valid JSON under 10,000 characters of context
// 3. every skill folder has a SKILL.md whose name matches the folder and whose description (one line or several) fits
//    the spec
// 4. Design Score: the generated bundle, console snippet and bookmarklets are up to date (build.mjs --check),
//    the agent's loader carries the built bundle's SRI hash and fetches the versioned copy, score/<version>/, and every
//    published version is still there, unchanged: those in docs/score/versions.json, and those recorded on the base
//    commit (CHECK_BASE_SHA in CI, else origin/main), so editing versions.json cannot hide a rewrite,
//    the two copies of mh-score.js are identical, and what SECURITY.md promises holds: the bundle uses no
//    network or storage API, and the loader bookmarklet loads only the bundle from this site, with the referrer
//    SECURITY.md describes
// 5. the website: local links, scripts, stylesheets and images exist; in-page anchors and icon references point
//    at an id; section numbers (data-hud) run 00, 01, 02…; every page is in sitemap.xml; every "N situations"
//    matches the rows in situations-data.js; every script parses
// 6. links between the Markdown files (every one in the repository) resolve (a missing README picture is a warning: screenshots come separately)
// 7. no file, tracked or new and not ignored, contains something that looks like a key or token
// 8. what is written down twice agrees: companion pins in marketplace.json and SECURITY.md; the vendored sources and
//    npm packages in .github/upstream-watch.json, SECURITY.md, and the vendored commits in CREDITS.md and NOTICE; the reviewed hyperframes and puppeteer-core versions
//    in every file that repeats them; ROUTING.md and skills/; every CHANGELOG.md version heading and its link
// 9. the chat pack (adapters/chat-pack/files/) is built from the current skills and no two files share a name
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

let failed = 0;
const fail = (m) => { failed++; console.log(`::error::${m}`); };
const warn = (m) => console.log(`::warning::${m}`);
const ok = (m) => console.log(`ok  ${m}`);
const read = (f) => fs.readFileSync(f, "utf8").replace(/^﻿/, "").replace(/\r\n?/g, "\n");
const isExternal = (u) => /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(u); // http:, https:, mailto:, javascript:, data:, //host
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// The commit this tree is compared with for checks that must not trust files the same change can edit.
// CI passes CHECK_BASE_SHA: the pull request's base, or on a push the commit before it. Locally: origin/main.
function baseCommit() {
  const has = (rev) => { try { return execFileSync("git", ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; } };
  const env = (process.env.CHECK_BASE_SHA || "").trim();
  if (env && !/^0+$/.test(env)) {
    const sha = has(env);
    return sha ? { sha, from: process.env.CHECK_BASE_FROM || "the base commit" } : { why: `CHECK_BASE_SHA ${env.slice(0, 12)} is not in this clone; fetch it (actions/checkout with fetch-depth: 0)` };
  }
  if (env) return { why: "CHECK_BASE_SHA is all zeros (a new branch has no previous commit)" };
  const main = has("origin/main");
  return main ? { sha: main, from: "origin/main" } : { why: "CHECK_BASE_SHA is not set and there is no origin/main" };
}

/* 1. manifests and versions */
for (const f of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]) {
  try { JSON.parse(fs.readFileSync(f, "utf8")); ok(`${f} is valid JSON`); } catch (e) { fail(`${f}: ${e.message}`); }
}
try {
  const m = JSON.parse(fs.readFileSync(".claude-plugin/marketplace.json", "utf8"));
  // Every third-party plugin is pinned to the full commit that was reviewed; a tag or branch can move.
  for (const p of m.plugins) {
    if (typeof p.source !== "object") continue;
    if (!("sha" in p.source)) fail(`marketplace: ${p.name} is not pinned to a commit (add "sha": the reviewed commit)`);
    else if (!/^[0-9a-f]{40}$/.test(p.source.sha)) fail(`marketplace: ${p.name} sha is not a full 40-character commit`);
  }
  ok(`marketplace lists ${m.plugins.length} plugins`);
} catch {}
try {
  const plugin = JSON.parse(fs.readFileSync(".claude-plugin/plugin.json", "utf8"));
  const market = JSON.parse(fs.readFileSync(".claude-plugin/marketplace.json", "utf8"));
  const self = market.plugins.find((p) => p.name === plugin.name);
  const top = fs.existsSync("CHANGELOG.md") ? (read("CHANGELOG.md").match(/^## \[(\d+\.\d+\.\d+[^\]]*)\]/m) || [])[1] : null;
  let bad = 0;
  if (!self) { bad++; fail(`marketplace.json has no entry for ${plugin.name}`); }
  else if (self.version !== plugin.version) { bad++; fail(`marketplace.json lists ${plugin.name} ${self.version}, plugin.json says ${plugin.version}`); }
  if (!top) { bad++; fail('CHANGELOG.md is missing or has no "## [x.y.z]" entry'); }
  else if (top !== plugin.version) { bad++; fail(`CHANGELOG.md starts at ${top}, plugin.json says ${plugin.version}`); }
  if (!bad) ok(`version ${plugin.version} in plugin.json, marketplace.json and CHANGELOG.md`);
} catch {}
// The version links at the foot of CHANGELOG.md point at tags, which exist only once the release is tagged. CI clones
// carry no tags, so this speaks only where tags were fetched (a local clone) and never fails the run.
try {
  const tags = new Set(execFileSync("git", ["tag", "--list", "v*"], { encoding: "utf8" }).split("\n").map((t) => t.trim()).filter(Boolean));
  if (tags.size && fs.existsSync("CHANGELOG.md")) {
    for (const [line, v] of read("CHANGELOG.md").matchAll(/^\[(\d+\.\d+\.\d+[^\]]*)\]:\s*\S+/gm)) {
      if (line.includes(`v${v}`) && !tags.has(`v${v}`)) warn(`CHANGELOG.md links the tag v${v}, which does not exist yet: tag the release commit and push it (git tag v${v} && git push origin v${v})`);
    }
  }
} catch {}

/* 2. the hook */
try {
  const out = execFileSync("bash", ["hooks/session-start"], { encoding: "utf8", env: { ...process.env, CLAUDE_PLUGIN_ROOT: process.cwd() } });
  const ctx = JSON.parse(out).hookSpecificOutput.additionalContext;
  ctx.length > 10000 ? fail(`hook context is ${ctx.length} characters (over 10000)`) : ok(`hook prints valid JSON, ${ctx.length} characters`);
} catch (e) { fail(`hooks/session-start: ${e.message.split("\n")[0]}`); }

/* 3. skills */
// One value from YAML front matter, as a string: a plain or quoted scalar on one line, a plain scalar continued on
// indented lines, or a block scalar (| or >, with optional chomping and indent indicators). Enough for SKILL.md files;
// not a YAML parser.
function frontmatterValue(head, key) {
  const lines = head.split("\n");
  const at = lines.findIndex((l) => l.startsWith(`${key}:`));
  if (at < 0) return "";
  const first = lines[at].slice(key.length + 1).trim();
  const more = [];
  for (const l of lines.slice(at + 1)) { if (l.trim() && !/^\s/.test(l)) break; more.push(l); }
  while (more.length && !more[more.length - 1].trim()) more.pop();
  if (/^[|>][+-]?\d*$/.test(first)) {
    const body = more.map((l) => l.trim());
    return (first[0] === "|" ? body.join("\n") : body.join(" ").replace(/ {2,}/g, " ")).trim();
  }
  const text = [first, ...more.map((l) => l.trim())].filter(Boolean).join(" ");
  return text.replace(/^"([\s\S]*)"$/, "$1").replace(/^'([\s\S]*)'$/, "$1").trim();
}
for (const dir of fs.readdirSync("skills", { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const file = path.join("skills", dir.name, "SKILL.md");
  if (!fs.existsSync(file)) { fail(`${file} is missing`); continue; }
  const head = read(file).split(/^---\s*$/m)[1] || "";
  const name = frontmatterValue(head, "name");
  const desc = frontmatterValue(head, "description");
  if (name !== dir.name) fail(`${file}: name "${name}" does not match the folder`);
  if (!desc || desc.length > 1024) fail(`${file}: description is empty or over 1024 characters`);
}
ok("skills have matching names and descriptions");

/* 4. Design Score: generated files are fresh, and the site serves the same bundle the skill ships */
const DS = "skills/design-score";
const SITE = "docs", BASE = "https://makkov-design.github.io/makkov-harness/";
if (fs.existsSync(`${DS}/build.mjs`)) {
  try {
    execFileSync(process.execPath, [`${DS}/build.mjs`, "--check"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 120000 });
    ok("design-score: mh-score.js, console.txt and the score.html bookmarklets are up to date");
  } catch (e) {
    const why = String(e.stderr || e.stdout || e.message).trim().replace(/\s*\n\s*/g, " ");
    fail(`design-score build --check: ${why || "failed"}`);
  }
  const ship = `${DS}/mh-score.js`, site = "docs/score/mh-score.js";
  if (!fs.existsSync(ship) || !fs.existsSync(site)) fail(`design-score: ${!fs.existsSync(ship) ? ship : site} is missing; run node ${DS}/build.mjs`);
  else if (read(ship) !== read(site)) fail(`${site} differs from ${ship}; run node ${DS}/build.mjs`);
  else ok(`${site} is identical to ${ship}`);

  // SECURITY.md's promises, held against what ships. A scan, not a proof: it catches a network or storage API slipping
  // into the bundle, and the loader reaching past this site or drifting from how SECURITY.md describes its referrer.
  const API = [
    [/\bfetch\s*\(/, "fetch()"], [/\bXMLHttpRequest\b/, "XMLHttpRequest"], [/\bsendBeacon\b/, "sendBeacon"],
    [/\bWebSocket\b/, "WebSocket"], [/\bEventSource\b/, "EventSource"], [/\bRTCPeerConnection\b/, "RTCPeerConnection"],
    [/\bimport\s*\(/, "import()"], [/\bimportScripts\b/, "importScripts"], [/\bnew\s+(?:Shared)?Worker\b/, "a Worker"],
    [/\bnew\s+Image\s*\(/, "new Image()"], [/\blocalStorage\b/, "localStorage"], [/\bsessionStorage\b/, "sessionStorage"],
    [/\bindexedDB\b/, "indexedDB"], [/\bdocument\.cookie\b/, "document.cookie"], [/\bcaches\.open\b/, "the Cache API"],
  ];
  if (fs.existsSync(ship)) {
    const code = read(ship), used = API.filter(([re]) => re.test(code)).map(([, name]) => name);
    if (used.length) fail(`${ship} uses ${used.join(", ")}, but SECURITY.md says the bundle makes no network requests and keeps no storage`);
    else ok("design-score: the bundle uses no network or storage API");
  }
  // The agent's loader pins the bundle with Subresource Integrity: every sha384 in the skill's docs must be the
  // built bundle's, and the GitHub Pages loader must carry one, or the browser runs whatever Pages serves.
  if (fs.existsSync(ship)) {
    const sri = "sha384-" + createHash("sha384").update(fs.readFileSync(ship)).digest("base64");
    const docs = [`${DS}/SKILL.md`, ...fs.readdirSync(`${DS}/reference`).filter((f) => f.endsWith(".md")).map((f) => `${DS}/reference/${f}`)];
    let pinned = 0, bad = 0;
    for (const f of docs) {
      const text = read(f);
      for (const m of text.matchAll(/sha384-[A-Za-z0-9+/=]+/g)) { pinned++; if (m[0] !== sri) { bad++; fail(`${f}: integrity ${m[0]} is not the built bundle's; set it to ${sri}`); } }
      for (const m of text.matchAll(/\.src\s*=\s*'https:\/\/makkov-design\.github\.io[^']*mh-score\.js[^']*';\n(?!\s*s\.integrity\s*=)/g)) { bad++; fail(`${f}: a loader of the hosted bundle without s.integrity on the next line`); }
    }
    if (!pinned) fail(`${DS}: no loader carries the bundle's integrity hash (${sri})`);
    else if (!bad) ok(`design-score: the agent's loader pins the bundle with its SRI hash (${plural(pinned, "place")})`);

    // Each version is published once at score/<version>/mh-score.js and never changes, so an install that pinned it
    // keeps loading it. The agent's loader must fetch the versioned copy, not score/mh-score.js, which moves on.
    const version = (read(ship).match(/^\/\*! Design Score (\S+)/) || [])[1];
    let vbad = 0, loaders = 0;
    for (const f of docs) {
      for (const m of read(f).matchAll(/\.src\s*=\s*'(https:\/\/makkov-design\.github\.io[^']*mh-score\.js[^']*)'/g)) {
        loaders++;
        if (m[1] !== `${BASE}score/${version}/mh-score.js`) { vbad++; fail(`${f}: the loader fetches ${m[1]}; it must fetch ${BASE}score/${version}/mh-score.js, which never changes`); }
      }
    }
    let published = {};
    try { published = JSON.parse(read("docs/score/versions.json")); } catch (e) { vbad++; fail(`docs/score/versions.json: ${e.code === "ENOENT" ? "missing" : e.message}; run node ${DS}/build.mjs`); }
    if (published[version] !== sri) { vbad++; fail(`docs/score/versions.json does not record Design Score ${version} as ${sri}; run node ${DS}/build.mjs`); }
    for (const [v, hash] of Object.entries(published)) {
      const f = `docs/score/${v}/mh-score.js`;
      if (!fs.existsSync(f)) { vbad++; fail(`${f} is missing: a published version must stay on the site`); continue; }
      const got = "sha384-" + createHash("sha384").update(fs.readFileSync(f)).digest("base64");
      if (got !== hash) { vbad++; fail(`${f} changed since it was published (${hash}); a published version never changes`); }
    }
    for (const d of fs.readdirSync("docs/score", { withFileTypes: true })) {
      if (d.isDirectory() && !(d.name in published)) { vbad++; fail(`docs/score/${d.name}/ is not recorded in docs/score/versions.json`); }
    }
    // versions.json is in the same tree a change can edit, so it cannot vouch for itself: every version recorded on
    // the base commit must still be on the site with the same hash, whatever versions.json says now.
    const base = baseCommit();
    if (base.sha) {
      let before = null;
      try { before = JSON.parse(execFileSync("git", ["show", `${base.sha}:docs/score/versions.json`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })); }
      catch (e) { if (!/does not exist|exists on disk, but not in/.test(String(e.stderr))) { vbad++; fail(`design-score: cannot read docs/score/versions.json at the base ${base.sha.slice(0, 7)} (${base.from}): ${String(e.stderr || e.message).trim().split("\n")[0]}`); } }
      if (before) {
        for (const [v, hash] of Object.entries(before)) {
          const f = `docs/score/${v}/mh-score.js`;
          const got = fs.existsSync(f) ? "sha384-" + createHash("sha384").update(fs.readFileSync(f)).digest("base64") : null;
          if (got !== hash) { vbad++; fail(`${f}: Design Score ${v} was published at ${base.from} (${base.sha.slice(0, 7)}) as ${hash}, now ${got ? `it is ${got}` : "it is gone"}. A published version never changes: restore it, bump VERSION in ${DS}/src/probe.js and src/ui.js, and build again`); }
          if (published[v] !== hash) { vbad++; fail(`docs/score/versions.json: the record of Design Score ${v} differs from ${base.from} (${base.sha.slice(0, 7)}); never edit it by hand`); }
        }
        if (!vbad) ok(`design-score: the ${plural(Object.keys(before).length, "version")} published at ${base.from} (${base.sha.slice(0, 7)}) are unchanged`);
      } else if (!vbad) ok(`design-score: ${base.from} (${base.sha.slice(0, 7)}) has no docs/score/versions.json yet, so no earlier version to hold`);
    } else if (process.env.CI) { vbad++; fail(`design-score: no base commit to compare published versions with (${base.why}); in CI that would let a published version change unnoticed`); }
    else warn(`design-score: published versions compared with this tree only (${base.why}); CI compares them with the base commit`);
    if (!vbad) ok(`design-score: ${plural(Object.keys(published).length, "published version")} unchanged; the agent's loader fetches score/${version}/mh-score.js (${plural(loaders, "place")})`);
  }
  const page = path.join(SITE, "score.html");
  if (fs.existsSync(page)) {
    const tag = (read(page).match(/<a\b[^>]*\sdata-bookmarklet="loader"[^>]*>/) || [])[0] || "";
    const href = (tag.match(/\shref="javascript:([^"]*)"/) || [])[1];
    let loader = null;
    try { if (href) loader = decodeURIComponent(href.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")); } catch {}
    const bullet = fs.existsSync("SECURITY.md") ? read("SECURITY.md").split("\n").find((l) => /^- .*\bloader\b/i.test(l)) : undefined;
    if (loader === null) fail(`${page}: no loader bookmarklet to check (an <a data-bookmarklet="loader" href="javascript:…">)`);
    else if (!bullet) fail('SECURITY.md has no line about the Design Score loader under "What the harness itself runs"');
    else {
      let bad = 0;
      const urls = loader.match(/(?:\b[a-z][a-z0-9+.-]*:)?\/\/[^\s'"`)]+/gi) || [];
      const bundle = `${BASE}score/mh-score.js`;
      if (urls.length !== 1 || urls[0].split(/[?#]/)[0] !== bundle) { bad++; fail(`the loader bookmarklet loads ${urls.join(", ") || "nothing it names"}; SECURITY.md says it loads only ${bundle}`); }
      const sendsNone = /\breferrerPolicy\s*=\s*['"]no-referrer['"]/.test(loader);
      const saysNone = /\bno referrer\b|\bwithout (?:a|any) referrer\b/i.test(bullet);
      if (sendsNone && !saysNone) { bad++; fail("the loader bookmarklet sends no referrer now: say so in SECURITY.md's loader line, which still describes the referrer the page's policy allows"); }
      if (!sendsNone && saysNone) { bad++; fail("SECURITY.md says the loader sends no referrer, but the loader bookmarklet does not set referrerPolicy to 'no-referrer'"); }
      if (!bad) ok(`design-score: the loader bookmarklet loads only score/mh-score.js from this site, ${sendsNone ? "with no referrer" : "with the page's own referrer policy"}, as SECURITY.md says`);
    }
  }
}

/* 5. the website */
const UNLISTED = new Set(["social-card.html"]); // the source of img/social.png, captured once; not a page for people
const pages = fs.readdirSync(SITE).filter((f) => f.endsWith(".html")).sort();
const html = new Map(pages.map((p) => [p, read(path.join(SITE, p))]));
const idsIn = new Map([...html].map(([p, h]) => [p, new Set([...h.matchAll(/\sid\s*=\s*"([^"]+)"/g)].map((m) => m[1]))]));
{
  let refs = 0; const broken = [];
  for (const [page, full] of html) {
    const h = full.replace(/(<script\b[^>]*>)[\s\S]*?(<\/script>)/gi, "$1$2"); // inline scripts build their own links
    for (const m of h.matchAll(/\s(?:href|src)\s*=\s*"([^"]*)"/g)) {
      const url = m[1].replace(/&amp;/g, "&");
      if (!url || isExternal(url)) continue;
      refs++;
      const [beforeHash, frag = ""] = url.split("#");
      const file = beforeHash.split("?")[0];
      if (!file) { if (frag && !idsIn.get(page).has(frag)) broken.push(`${page}: #${frag} has no element with that id`); continue; }
      let target = path.join(SITE, file);
      if (file.endsWith("/")) target = path.join(target, "index.html");
      if (!fs.existsSync(target)) { broken.push(`${page}: ${file} does not exist`); continue; }
      const linked = path.relative(SITE, target).split(path.sep).join("/");
      if (frag && idsIn.has(linked) && !idsIn.get(linked).has(frag)) broken.push(`${page}: ${linked}#${frag} has no element with that id`);
    }
  }
  broken.forEach(fail);
  if (!broken.length) ok(`${plural(pages.length, "page")}: ${refs} local links, scripts, styles, images and anchors resolve`);
}
{
  let bad = 0;
  for (const [page, h] of html) {
    const huds = [...h.matchAll(/\sdata-hud\s*=\s*"([^"]*)"/g)].map((m) => m[1]);
    huds.forEach((label, i) => {
      const n = (label.match(/^(\d{2}) · \S/) || [])[1];
      if (n !== String(i).padStart(2, "0")) { bad++; fail(`${page}: section ${i + 1} is numbered "${label}", expected "${String(i).padStart(2, "0")} · …"`); }
    });
  }
  if (!bad) ok("section numbers (data-hud) run in order on every page");
}
try {
  const xml = read(path.join(SITE, "sitemap.xml"));
  const locs = [...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map((m) => m[1]);
  let bad = 0; const listed = new Set();
  for (const loc of locs) {
    if (!loc.startsWith(BASE)) { bad++; fail(`sitemap.xml: ${loc} is outside ${BASE}`); continue; }
    const file = loc.slice(BASE.length).split(/[?#]/)[0] || "index.html";
    listed.add(file);
    if (!fs.existsSync(path.join(SITE, file))) { bad++; fail(`sitemap.xml: ${loc} has no file docs/${file}`); }
  }
  for (const p of pages) if (!UNLISTED.has(p) && !listed.has(p)) { bad++; fail(`sitemap.xml does not list ${p}`); }
  if (!bad) ok(`sitemap.xml lists ${plural(locs.length, "page")}, every one of them exists`);
} catch (e) { fail(`docs/sitemap.xml: ${e.code === "ENOENT" ? "missing" : e.message}`); }
try {
  const box = { window: {} };
  vm.runInNewContext(read(path.join(SITE, "situations-data.js")), box, { filename: "situations-data.js", timeout: 2000 });
  const rows = box.window.SITUATIONS.groups.reduce((n, g) => n + g.rows.length, 0);
  let bad = 0;
  for (const f of [...pages.map((p) => path.join(SITE, p)), path.join(SITE, "llms.txt"), "README.md"]) {
    if (!fs.existsSync(f)) continue;
    for (const m of read(f).matchAll(/\b(\d+)(?:<\/span>)?\s+situations\b/g)) if (Number(m[1]) !== rows) { bad++; fail(`${f.split(path.sep).join("/")}: says "${m[1]} situations", situations-data.js has ${rows}`); }
  }
  if (!bad) ok(`situations-data.js has ${rows} situations, and every count on the site says so`);
} catch (e) { fail(`docs/situations-data.js: ${e.message.split("\n")[0]}`); }
{
  const scripts = [
    ...fs.readdirSync(SITE).filter((f) => /\.m?js$/.test(f)).map((f) => path.join(SITE, f)),
    ...[".github/scripts", `${DS}/src`, `${DS}/scripts`].filter((d) => fs.existsSync(d)).flatMap((d) => fs.readdirSync(d).filter((f) => /\.m?js$/.test(f)).map((f) => path.join(d, f))),
    `${DS}/build.mjs`, `${DS}/mh-score.js`,
  ].filter((f) => fs.existsSync(f));
  let bad = 0;
  for (const f of scripts) {
    try { execFileSync(process.execPath, ["--check", f], { stdio: ["ignore", "pipe", "pipe"], timeout: 30000 }); }
    catch (e) { bad++; fail(`${f.split(path.sep).join("/")} does not parse: ${String(e.stderr || e.message).trim().split("\n").find((l) => /Error/.test(l)) || "syntax error"}`); }
  }
  if (!bad) ok(`${plural(scripts.length, "script")} on the site and in design-score parse`);
}

/* 6. links between the Markdown files */
{
  // every Markdown file in the repository, tracked or new and not ignored, not only the ones at the root
  const docs = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "*.md"], { encoding: "utf8" })
    .split("\n").filter((f, i, all) => f && all.indexOf(f) === i && fs.existsSync(f))
    .filter((f) => !f.startsWith("adapters/chat-pack/files/")); // generated copies; their sources are checked in skills/
  let refs = 0, bad = 0;
  for (const f of docs) {
    const text = read(f).replace(/^\s*(```|~~~)[\s\S]*?^\s*\1/gm, "").replace(/`[^`\n]*`/g, "");
    const urls = [...text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g), ...text.matchAll(/\s(?:href|src)="([^"]+)"/g)].map((m) => m[1]);
    for (const url of urls) {
      if (isExternal(url) || url.startsWith("#")) continue;
      refs++;
      const target = path.join(path.dirname(f), decodeURIComponent(url.split("#")[0].split("?")[0]));
      if (fs.existsSync(target)) continue;
      if (/\.(png|jpe?g|gif|webp|svg|mp4)$/i.test(target)) warn(`${f}: picture ${url} is not in the repository yet`);
      else { bad++; fail(`${f}: link to ${url}, which does not exist`); }
    }
  }
  if (!bad) ok(`${plural(docs.length, "Markdown file")}: ${refs} local links checked`);
}

/* 8. what is written down in more than one place agrees */
// SECURITY.md's verdict table, one row per component: [component, version reviewed, date, verdict, notes]
const SEC = fs.existsSync("SECURITY.md") ? read("SECURITY.md").split("\n").filter((l) => /^\| /.test(l) && !/^\|\s*(Component|---)/.test(l)).map((l) => l.split("|").slice(1, -1).map((c) => c.trim())) : [];
const key = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const secRow = (name) => SEC.find((r) => key(r[0]).startsWith(key(name)));
// a. the companion pins in marketplace.json are the ones SECURITY.md reviewed
try {
  const market = JSON.parse(fs.readFileSync(".claude-plugin/marketplace.json", "utf8"));
  let bad = 0, n = 0;
  for (const p of market.plugins) {
    if (typeof p.source !== "object") continue;
    n++;
    const row = secRow(p.name);
    if (!row) { bad++; fail(`SECURITY.md has no verdict row for the companion ${p.name} (marketplace.json pins it)`); continue; }
    if (/\bown\b/i.test(row[3])) continue; // the author's own project: pinned, not reviewed as third-party
    const sha = (p.source.sha || "").slice(0, 7);
    if (!sha || !row[1].includes(sha)) { bad++; fail(`${p.name}: marketplace.json pins ${sha || "no commit"}, SECURITY.md reviewed "${row[1]}"`); }
    const version = (p.source.ref || "").replace(/^v/, "") || ((p.description || "").match(/\((\d+\.\d+\.\d+)\)/) || [])[1];
    if (version && !row[1].includes(version)) { bad++; fail(`${p.name}: marketplace.json says version ${version}, SECURITY.md reviewed "${row[1]}"`); }
  }
  if (!bad) ok(`the ${plural(n, "companion pin")} in marketplace.json match SECURITY.md`);
} catch (e) { fail(`marketplace.json against SECURITY.md: ${e.message}`); }
// b. the vendored sources and npm packages upstream-watch follows are the ones SECURITY.md reviewed
// Two spellings of a commit agree when the shorter is a prefix of the longer: in full when both are 40 characters.
const sameCommit = (a, b) => { const n = Math.min(a.length, b.length); return n >= 7 && a.slice(0, n) === b.slice(0, n); };
try {
  const watch = JSON.parse(fs.readFileSync(".github/upstream-watch.json", "utf8"));
  let bad = 0;
  for (const v of watch.vendored || []) {
    const row = secRow(v.security);
    if (!row) { bad++; fail(`.github/upstream-watch.json: SECURITY.md has no row "${v.security}"`); }
    else if (!row[1].includes(v.sha.slice(0, 7))) { bad++; fail(`.github/upstream-watch.json: ${v.name} is at ${v.sha.slice(0, 7)}, SECURITY.md reviewed "${row[1]}"`); }
  }
  for (const pkg of watch.npm || []) {
    const row = secRow(pkg.security);
    if (!row) { bad++; fail(`.github/upstream-watch.json: SECURITY.md has no row "${pkg.security}"`); }
    else if (row[1] !== pkg.version) { bad++; fail(`.github/upstream-watch.json: ${pkg.name} ${pkg.version}, SECURITY.md reviewed "${row[1]}"`); }
  }
  // CREDITS.md, NOTICE and design-md-library's pinned URL repeat the vendored commits: every commit named on a line
  // that names the upstream repository must be the watched one.
  for (const f of ["CREDITS.md", "NOTICE", "skills/design-md-library/SKILL.md"].filter((x) => fs.existsSync(x))) {
    for (const line of read(f).split("\n")) {
      for (const v of watch.vendored || []) {
        if (!line.includes(v.repo)) continue;
        for (const sha of line.match(/\b[0-9a-f]{7,40}\b/g) || []) if (!sameCommit(sha, v.sha)) { bad++; fail(`${f}: names ${v.repo} at ${sha}, .github/upstream-watch.json says ${v.sha}`); }
      }
    }
  }
  if (!bad) ok(`.github/upstream-watch.json: ${plural((watch.vendored || []).length, "vendored source")} and ${plural((watch.npm || []).length, "npm package")} match SECURITY.md, CREDITS.md, NOTICE and design-md-library`);
} catch (e) { fail(`.github/upstream-watch.json: ${e.code === "ENOENT" ? "missing" : e.message}`); }
// c. the reviewed hyperframes and puppeteer-core versions, repeated in several files, are the same everywhere
{
  const hf = (() => { try { return JSON.parse(fs.readFileSync("skills/hyperframes/scripts/cli-version.json", "utf8")).version; } catch { return null; } })();
  const pp = secRow("puppeteer-core")?.[1];
  const PINS = [
    { pkg: "hyperframes", want: hf, from: "skills/hyperframes/scripts/cli-version.json", re: /\bhyperframes(?:@|\s+CLI\s+|\s+)v?(\d+\.\d+\.\d+)\b/g,
      files: ["cloud/setup-design-tools.sh", ".github/upstream-watch.json"], also: [["SECURITY.md", () => secRow("hyperframes CLI")?.[1]], ["skills/media-use/scripts/lib/hyperframes-pin.mjs", (t) => (t.match(/const REVIEWED = "([^"]+)"/) || [])[1]]] },
    { pkg: "puppeteer-core", want: pp, from: "SECURITY.md", re: /\bpuppeteer-core(?:@|\s+)v?(\d+\.\d+\.\d+)\b|\breviewed (\d+\.\d+\.\d+)\b/g,
      files: ["cloud/setup-design-tools.sh", ".github/workflows/check.yml", ".github/upstream-watch.json", "skills/design-score/SKILL.md", "skills/design-score/scripts/score.mjs"], also: [] },
  ];
  for (const { pkg, want, from, re, files, also } of PINS) {
    if (!want) { fail(`${from}: no reviewed ${pkg} version found`); continue; }
    let bad = 0;
    for (const f of files) {
      if (!fs.existsSync(f)) { bad++; fail(`${f} is missing (it repeats the reviewed ${pkg} version)`); continue; }
      const text = read(f).replace(/"name":\s*"([^"]+)",\s*"security":\s*"[^"]*",\s*"version":\s*"([^"]+)"/g, (m, n, v) => `${n}@${v}`);
      const found = [...text.matchAll(re)].map((m) => m[1] || m[2]);
      if (!found.length) { bad++; fail(`${f} no longer names a ${pkg} version; check.mjs expects ${want} there`); }
      for (const v of found) if (v !== want) { bad++; fail(`${f} says ${pkg} ${v}, ${from} says ${want}`); }
    }
    for (const [f, get] of also) {
      const v = fs.existsSync(f) ? get(read(f)) : null;
      if (v !== want) { bad++; fail(`${f} says ${pkg} ${v ?? "nothing"}, ${from} says ${want}`); }
    }
    if (!bad) ok(`${pkg} ${want} is the same in ${plural(files.length + also.length + 1, "file")}`);
  }
}
// d. every skill in ROUTING.md exists in skills/, and every skill folder is in ROUTING.md
try {
  const routing = read("ROUTING.md");
  const section = (routing.split(/^## /m).find((s) => s.startsWith("Skills in this repository")) || "");
  const named = new Set(section.split("\n").filter((l) => /^\| /.test(l) && !/^\|\s*(Situation|---)/.test(l))
    .flatMap((l) => [...(l.split("|")[2] || "").matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1])));
  const folders = new Set(fs.readdirSync("skills", { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name));
  let bad = 0;
  if (!named.size) { bad++; fail('ROUTING.md: no skills found under "## Skills in this repository"'); }
  for (const s of named) if (!folders.has(s)) { bad++; fail(`ROUTING.md routes to \`${s}\`, which is not a folder in skills/`); }
  for (const s of folders) if (!named.has(s)) { bad++; fail(`skills/${s} is not in ROUTING.md's "Skills in this repository" table, so no request is routed to it`); }
  if (!bad) ok(`ROUTING.md and skills/ list the same ${plural(folders.size, "skill")}`);
} catch (e) { fail(`ROUTING.md: ${e.message}`); }
// e. every version heading in CHANGELOG.md has a link definition at the foot
if (fs.existsSync("CHANGELOG.md")) {
  const log = read("CHANGELOG.md");
  const heads = [...log.matchAll(/^## \[([^\]]+)\]/gm)].map((m) => m[1]);
  const defs = new Set([...log.matchAll(/^\[([^\]]+)\]:\s*\S+/gm)].map((m) => m[1]));
  const missing = heads.filter((h) => !defs.has(h));
  missing.forEach((h) => fail(`CHANGELOG.md: "## [${h}]" has no link definition; add "[${h}]: https://github.com/Makkov-design/makkov-harness/compare/…" at the foot`));
  if (!missing.length) ok(`CHANGELOG.md: ${plural(heads.length, "version heading")}, each with its link`);
}

/* 9. the chat pack is built from the current skills, and every file in it has its own name */
try {
  const out = execFileSync(process.execPath, [".github/scripts/chat-pack.mjs", "--check"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 60000 });
  ok(out.trim());
} catch (e) {
  fail(String(e.stderr || e.stdout || e.message).trim().replace(/\s*\n\s*/g, " ") || "chat-pack --check failed");
}
{
  const dir = "adapters/chat-pack/files";
  const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const lower = names.map((n) => n.toLowerCase());
  const dupes = names.filter((n, i) => lower.indexOf(n.toLowerCase()) !== i);
  if (!names.length) fail(`${dir} is empty or missing; run node .github/scripts/chat-pack.mjs`);
  else if (dupes.length || lower.includes("skill.md")) fail(`${dir}: file names must be unique and none may be SKILL.md (chat apps drop folders): ${[...dupes, ...names.filter((n) => n.toLowerCase() === "skill.md")].join(", ")}`);
  else ok(`${dir}: ${plural(names.length, "file")}, every name unique`);
}

/* 7. nothing that looks like a key */
const SECRET = [/sk-[A-Za-z0-9_-]{20,}/, /gh[pousr]_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{30,}/, /AIza[0-9A-Za-z_-]{30,}/, /xox[abpr]-[A-Za-z0-9-]{10,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
// tracked files, plus new files that are not ignored, so a key is caught before its first commit
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], { encoding: "utf8" }).split("\n")
  .filter((f, i, all) => f && /\.(md|json|ya?ml|js|mjs|cjs|ts|sh|ps1|py|html|css|txt|toml|xml)$/i.test(f) && all.indexOf(f) === i && fs.existsSync(f));
let hits = 0;
for (const f of files) { const t = fs.readFileSync(f, "utf8"); for (const re of SECRET) if (re.test(t)) { fail(`${f}: looks like a key or token (${re.source.slice(0, 16)})`); hits++; } }
if (!hits) ok(`${files.length} text files: nothing that looks like a key`);

console.log(failed ? `\n${failed} problem(s)` : "\nall checks passed");
process.exit(failed ? 1 : 0);
