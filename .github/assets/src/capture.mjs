// Records the README pictures (all but the banner) from the site itself: one scene per run, so each browser stays short-lived.
//   node capture.mjs <scene>      scenes: before-after | routing | review | stops
// Needs puppeteer-core (PUPPETEER_DIR = the folder that holds node_modules), Chrome or Edge (CHROME_PATH),
// ffmpeg (FFMPEG_PATH) and the site served locally (SITE_URL, default http://localhost:8765/).
// Videos are recorded as WebM next to this file, then turned into GIFs in ../ by gif() below.
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

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH, headless: true, protocolTimeout: 30000,
  args: ["--no-first-run", "--disable-extensions", "--hide-scrollbars"],
});
try {
  const page = await browser.newPage();
  const vp = { "before-after": [1280, 800], routing: [1280, 800], review: [1280, 820], stops: [1360, 900] }[scene];
  if (!vp) throw new Error(`unknown scene ${scene}`);
  await page.setViewport({ width: vp[0], height: vp[1], deviceScaleFactor: scene === "stops" ? 2 : 1 });
  await page.goto(SITE, { waitUntil: "networkidle0", timeout: 30000 });
  await page.waitForFunction(() => document.documentElement.classList.contains("intro-done"), { timeout: 12000 }).catch(() => {});
  await sleep(600);
  const webm = path.join(here, `${scene}.webm`);

  if (scene === "before-after") {
    await jump(page, ".fix-track", 0); await sleep(900);
    const rec = await page.screencast({ path: webm, ffmpegPath: FFMPEG, quality: 8 });
    await sleep(900);
    await glide(page, ".fix-track", 0, 0.8, 8500);
    await sleep(3200);
    await rec.stop(); gif(webm, "before-after");
  }

  if (scene === "routing") {
    const tabs = 8, at = (i) => (i + 0.5) / tabs;
    await jump(page, ".board-track", at(0)); await sleep(1500);
    const rec = await page.screencast({ path: webm, ffmpegPath: FFMPEG, quality: 8 });
    await sleep(1300);
    for (let i = 1; i < 6; i++) { await glide(page, ".board-track", at(i - 1), at(i), 450); await sleep(1400); }
    await rec.stop(); gif(webm, "routing");
  }

  if (scene === "review") {
    // the sweep starts 0.6 s after the list comes into view; record one pass
    const box = await page.evaluate(() => { const g = document.querySelector(".gate .container"); const r = g.getBoundingClientRect(); scrollTo(0, r.top + scrollY - 96); return null; });
    await sleep(1400); // rows finish fading in before the recording starts
    const crop = await page.evaluate(() => { const r = document.querySelector(".gate .container").getBoundingClientRect(); return { x: Math.max(0, Math.round(r.left)), y: Math.max(0, Math.round(r.top) - 8), width: Math.round(Math.min(r.width, innerWidth)), height: Math.round(Math.min(innerHeight - Math.max(0, r.top - 8), r.height + 16)) }; });
    crop.width -= crop.width % 2; crop.height -= crop.height % 2;
    const rec = await page.screencast({ path: webm, ffmpegPath: FFMPEG, quality: 8, crop });
    await sleep(5600);
    await rec.stop(); gif(webm, "review");
    void box;
  }

  if (scene === "stops") {
    await page.evaluate(() => { const s = document.querySelector(".board-on"); scrollTo(0, s.getBoundingClientRect().top + scrollY - 40); });
    await sleep(800); // let the scroll handler run first, then light every step
    await page.evaluate(() => { document.querySelectorAll(".step").forEach((x) => x.classList.add("is-lit", "is-in")); document.querySelectorAll(".board-on [data-reveal]").forEach((x) => x.classList.add("is-in")); });
    await sleep(900);
    const clip = await page.evaluate(() => { const r = document.querySelector(".board-on .container").getBoundingClientRect(); return { x: r.left, y: r.top - 48, width: r.width, height: r.height + 96 }; });
    await page.screenshot({ path: path.join(out, "stops.png"), clip });
    console.log("wrote", path.join(out, "stops.png"));
  }
} finally {
  await browser.close();
}
