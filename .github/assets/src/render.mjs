// Renders each <section class="art" id="..."> of art.html to ../<id>.png at 2x.
// Needs puppeteer-core (set PUPPETEER_DIR to the folder that holds node_modules) and Chrome (CHROME_PATH).
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(process.env.PUPPETEER_DIR || here, "x.js"));
const puppeteer = require("puppeteer-core");
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH,
  headless: true,
  protocolTimeout: 30000,
  args: ["--no-first-run", "--disable-extensions"],
});
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1360, height: 900, deviceScaleFactor: 2 });
  await page.goto(pathToFileURL(path.join(here, "art.html")).href, { waitUntil: "networkidle0", timeout: 30000 });
  await page.evaluate(() => document.fonts.ready);
  for (const id of await page.$$eval("section.art", (s) => s.map((x) => x.id))) {
    const el = await page.$(`#${id}`);
    const out = path.join(here, "..", `${id}.png`);
    await el.screenshot({ path: out });
    console.log("wrote", out);
  }
} finally {
  await browser.close();
}
