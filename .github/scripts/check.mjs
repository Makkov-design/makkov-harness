// Repository checks for every push and pull request. Read-only: no network, no writes.
// 1. plugin and marketplace manifests are valid JSON, every pinned companion has a full commit sha, and the
//    plugin's version is the same in plugin.json, its marketplace entry and the newest CHANGELOG.md entry
//    (and, where this clone has tags, a warning for a CHANGELOG.md link to a tag that does not exist yet)
// 2. the SessionStart hook prints valid JSON under 10,000 characters of context
// 3. every skill folder has a SKILL.md whose name matches the folder and whose description fits the spec
// 4. Design Score: the generated bundle, console snippet and bookmarklets are up to date (build.mjs --check),
//    the two copies of mh-score.js are identical, and what SECURITY.md promises holds: the bundle uses no
//    network or storage API, and the loader bookmarklet loads only the bundle from this site, with the referrer
//    SECURITY.md describes
// 5. the website: local links, scripts, stylesheets and images exist; in-page anchors and icon references point
//    at an id; section numbers (data-hud) run 00, 01, 02…; every page is in sitemap.xml; every "N situations"
//    matches the rows in situations-data.js; every script parses
// 6. links between the Markdown files resolve (a missing README picture is a warning: screenshots come separately)
// 7. no file, tracked or new and not ignored, contains something that looks like a key or token
import { execFileSync } from "node:child_process";
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

/* 1. manifests and versions */
for (const f of [".claude-plugin/plugin.json", ".claude-plugin/marketplace.json"]) {
  try { JSON.parse(fs.readFileSync(f, "utf8")); ok(`${f} is valid JSON`); } catch (e) { fail(`${f}: ${e.message}`); }
}
try {
  const m = JSON.parse(fs.readFileSync(".claude-plugin/marketplace.json", "utf8"));
  for (const p of m.plugins) if (typeof p.source === "object" && "sha" in p.source && !/^[0-9a-f]{40}$/.test(p.source.sha)) fail(`marketplace: ${p.name} sha is not a full 40-character commit`);
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
for (const dir of fs.readdirSync("skills", { withFileTypes: true }).filter((d) => d.isDirectory())) {
  const file = path.join("skills", dir.name, "SKILL.md");
  if (!fs.existsSync(file)) { fail(`${file} is missing`); continue; }
  const head = fs.readFileSync(file, "utf8").split(/^---\s*$/m)[1] || "";
  const name = (head.match(/^name:\s*(.+)$/m) || [])[1]?.trim().replace(/^["']|["']$/g, "");
  const desc = (head.match(/^description:\s*(.+)$/m) || [])[1]?.trim() || "";
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
  const docs = fs.readdirSync(".").filter((f) => f.endsWith(".md"));
  let refs = 0, bad = 0;
  for (const f of docs) {
    const text = read(f).replace(/^```[\s\S]*?^```/gm, "");
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
