// Records the README pictures (all but the banner) from the site itself: one scene per run, so each browser stays short-lived.
//   node capture.mjs <scene>      scenes: before-after | routing | review | steps | social
//   steps takes WAY=claude|agents|chat and writes ../install-<way>.png
// The site's header and scroll line are hidden, and every picture is cropped to the block itself.
// Needs puppeteer-core (PUPPETEER_DIR = the folder that holds node_modules), Chrome or Edge (CHROME_PATH),
// ffmpeg (FFMPEG_PATH) and the site served locally (SITE_URL, default http://localhost:8765/).
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, "..");
const require = createRequire(path.join(process.env.PUPPETEER_DIR || here, "x.js"));
const puppeteer = require("puppeteer-core");
const SITE = process.env.SITE_URL || "http://localhost:8765/";
const FFMPEG = process.env.FFMPEG_PATH || "ffmpeg";
const scene = process.argv[2];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a GIF that stays small: 15 fps, 960 px wide, a palette built from what changes between frames
function gif(webm, name, width = 960) {
  const dst = path.join(out, `${name}.gif`);
  execFileSync(FFMPEG, ["-y", "-loglevel", "error", "-i", webm, "-vf",
    `fps=15,scale=${width}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=160:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle`,
    "-loop", "0", dst]);
  console.log("wrote", dst);
}

// scroll the page to a share of a tall scroll track, eased, over ms
const glide = (page, sel, from, to, ms) => page.evaluate(async (sel, from, to, ms) => {
  const t = document.querySelector(sel), top = t.getBoundingClientRect().top + scrollY, span = t.offsetHeight - innerHeight;
  const ease = (x) => (x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2);
  const t0 = performance.now();
  await new Promise((done) => { const f = (now) => { const q = Math.min(1, (now - t0) / ms); scrollTo(0, top + span * (from + (to - from) * ease(q))); q < 1 ? requestAnimationFrame(f) : done(); }; requestAnimationFrame(f); });
}, sel, from, to, ms);
const jump = (page, sel, p) => page.evaluate((sel, p) => { const t = document.querySelector(sel); scrollTo(0, t.getBoundingClientRect().top + scrollY + (t.offsetHeight - innerHeight) * p); }, sel, p);
// the visible box around some elements, in viewport pixels, padded and even-sized for the video encoder
const boxOf = (page, sels, pad) => page.evaluate((sels, pad) => {
  const rs = sels.map((s) => document.querySelector(s).getBoundingClientRect());
  const x0 = Math.max(0, Math.min(...rs.map((r) => r.left)) - pad), y0 = Math.max(0, Math.min(...rs.map((r) => r.top)) - pad);
  const x1 = Math.min(innerWidth, Math.max(...rs.map((r) => r.right)) + pad), y1 = Math.min(innerHeight, Math.max(...rs.map((r) => r.bottom)) + pad);
  const w = Math.floor((x1 - x0) / 2) * 2, h = Math.floor((y1 - y0) / 2) * 2;
  return { x: Math.round(x0), y: Math.round(y0), width: w, height: h };
}, sels, pad);

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH, headless: true, protocolTimeout: 30000,
  args: ["--no-first-run", "--disable-extensions", "--hide-scrollbars"],
});
try {
  const page = await browser.newPage();
  if (scene === "social") {
    // the share card: the site's own picture for links, and the repository's social preview
    await page.setViewport({ width: 1280, height: 640, deviceScaleFactor: 1 });
    await page.goto(new URL("social-card.html", SITE).href, { waitUntil: "networkidle0", timeout: 30000 });
    await page.evaluate(() => document.fonts.ready);
    const site = path.join(out, "..", "..", "docs", "img", "social.png"), repo = path.join(out, "social-preview.png");
    await page.screenshot({ path: site }); await page.screenshot({ path: repo });
    console.log("wrote", site, "and", repo);
  } else {
  const vp = { "before-after": [1280, 820], routing: [1280, 820], review: [1280, 860], steps: [1360, 1000], social: [1280, 640] }[scene];
  if (!vp) throw new Error(`unknown scene ${scene}`);
  await page.setViewport({ width: vp[0], height: vp[1], deviceScaleFactor: scene === "steps" ? 2 : 1 });
  await page.goto(SITE, { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.classList.contains("intro-done"), { timeout: 12000 }).catch(() => {});
  // a picture of the block, not of the website around it
  await page.addStyleTag({ content: ".nav, .hud { display: none !important; }" });
  await sleep(600);
  const webm = path.join(here, `${scene}.webm`);

  if (scene === "before-after") {
    await jump(page, ".fix-track", 0); await sleep(900);
    const crop = await boxOf(page, [".fix-head", ".fix-body"], 28);
    const rec = await page.screencast({ path: webm, ffmpegPath: FFMPEG, quality: 8, crop });
    await sleep(900);
    await glide(page, ".fix-track", 0, 0.8, 8500);
    await sleep(3200);
    await rec.stop(); gif(webm, "before-after");
  }

  if (scene === "routing") {
    // the design requests: make it feel like Linear, animate this card, review this screen, build a landing page
    const tabs = 8, at = (i) => (i + 0.5) / tabs, order = [2, 3, 5, 6];
    await jump(page, ".board-track", at(order[0])); await sleep(1500);
    const crop = await boxOf(page, [".board-head", ".switch"], 28);
    const rec = await page.screencast({ path: webm, ffmpegPath: FFMPEG, quality: 8, crop });
    await sleep(1600);
    for (const i of order.slice(1)) { await jump(page, ".board-track", at(i)); await sleep(1900); }
    await rec.stop(); gif(webm, "routing");
  }

  if (scene === "review") {
    // the sweep starts 0.6 s after the list comes into view; record one pass
    await page.evaluate(() => { const g = document.querySelector(".gate .container"); scrollTo(0, g.getBoundingClientRect().top + scrollY - 40); });
    await sleep(1400); // rows finish fading in before the recording starts
    const crop = await boxOf(page, [".gate .container"], 8);
    const rec = await page.screencast({ path: webm, ffmpegPath: FFMPEG, quality: 8, crop });
    await sleep(5600);
    await rec.stop(); gif(webm, "review");
  }

  if (scene === "steps") {
    const way = process.env.WAY || "claude";
    await page.evaluate(() => { const s = document.querySelector(".board-on"); scrollTo(0, s.getBoundingClientRect().top + scrollY + 120); });
    if (way !== "claude") await page.click(`#way-${way}`);
    await page.evaluate(() => document.querySelectorAll(".board-on [data-reveal]").forEach((x) => x.classList.add("is-in")));
    await page.addStyleTag({ content: ".path.is-in .step, .path.is-in .path-then { animation: none !important; }" });
    await sleep(900);
    const clip = await page.evaluate(() => { const r = document.querySelector(".path:not([hidden]) .steps").getBoundingClientRect(); return { x: r.left + scrollX - 24, y: r.top + scrollY - 28, width: r.width + 48, height: r.height + 52 }; }); // page coordinates
    const file = path.join(out, `install-${way}.png`);
    await page.screenshot({ path: file, clip });
    console.log("wrote", file);
  }
  }
} finally {
  await browser.close();
}
