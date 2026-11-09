# Running the probe

Exact snippets for every way to run Design Score: a browser tool that evaluates JavaScript, the Node runner, the DevTools console and the bookmarklet. The method behind the numbers is in `../rubric.md`; how to report and fix is in `../SKILL.md`.

## The pieces

| Piece | Where |
|---|---|
| Bundle (probe and panel) | `mh-score.js` in the skill folder; hosted at `https://makkov-design.github.io/makkov-harness/score/mh-score.js`, loaded only when it matches the skill's copy (Step 1A) |
| Console snippet | `https://makkov-design.github.io/makkov-harness/score/console.txt`, or the copy button next to it on the score page |
| Bookmarklets (loader and offline) | https://makkov-design.github.io/makkov-harness/score.html |
| Node runner | `scripts/score.mjs` in the skill folder |

- The bundle defines two globals: `window.MHScore` (measure, extract, format) and `window.MHScoreUI` (panel, report, card). It makes no network requests and never changes the page; only the panel, when opened, adds one host element, `#mh-score-root`.
- Set `window.MHScoreNoAuto = true` **before** loading it. Otherwise the bundle opens its panel straight away: right for a person, noise for an agent.
- A navigation or reload clears both globals. Load the bundle again after every reload, including the reload after a resize.

## Step 1: load the bundle

### A. The loader (needs the network and a page that allows outside scripts)

```js
window.MHScoreNoAuto = true;
new Promise((resolve, reject) => {
  try {
    const s = document.createElement('script');
    s.src = 'https://makkov-design.github.io/makkov-harness/score/mh-score.js?v=1.0.0';
    s.integrity = 'sha384-GEi7mc6J171ytPzTlPDl1Uru7P++eiAXhODJaXEBYUNYIFCh7MKppYpIdOg/TsFM';   // the bundle this skill ships; any other file is refused
    s.crossOrigin = 'anonymous';
    s.onload = () => resolve(window.MHScore ? 'Design Score ' + window.MHScore.version + ' loaded' : 'loaded, but MHScore is missing');
    s.onerror = () => reject(new Error('Blocked: this page does not allow outside scripts, there is no network, or the hosted bundle is not the one this skill ships. See "Strict or offline pages".'));
    document.documentElement.appendChild(s);
  } catch (e) {
    reject(new Error('Blocked: this page does not allow outside scripts (' + e.message + '). See "Strict or offline pages".'));
  }
});
```

The page fetches the bundle from this repository's GitHub Pages, and the browser runs it only if it matches the `integrity` hash: the exact `mh-score.js` in this skill folder. Anything else on Pages at that moment (a newer release, or a changed file) is refused and the loader rejects with "Blocked": then use the Node runner or a local copy ("Strict or offline pages"). Never remove the `integrity` line to get past a refusal. The bundle itself sends nothing. The `?v=` query only refreshes caches. If the tool does not wait for promises, run this, then check with the line below.

Then confirm it loaded:

```js
typeof MHScore === 'object' && MHScore.version   // "1.0.0"
```

### B. Strict or offline pages

Strict pages (GitHub, X, many admin and banking apps) block outside scripts with a Content-Security-Policy, and with no network the loader has nothing to fetch. Either way it rejects with "Blocked".

**A browser tool cannot paste the bundle in for you.** The evaluate tools under "Per tool" take the code to run as text inside the call, and `mh-score.js` is about 320 KB (roughly 90,000 tokens). The agent would have to write the whole file out, character for character, in one tool call: that does not fit in one response, and a single wrong character breaks it. Do not try, and do not paste `src/probe.js` on its own either (about 175 KB). Use one of these instead, in this order:

1. **The Node runner** (below), when it is set up. It reads the bundle from disk and injects it through the DevTools protocol with the page's CSP bypassed, so a strict policy cannot block it and loading the bundle needs no network.
2. **A local app you are working on.** Copy `mh-score.js` into the folder its dev server serves as-is (`public/` in Vite, Next.js and Create React App, `static/` in SvelteKit; elsewhere, the folder that holds the favicon), and run the loader with `s.src = '/mh-score.js'`. The bundle then comes from the page's own origin, which a `script-src 'self'` policy allows, and no network is needed. Delete the copy when you are done, never commit it, and tell the person you added and removed it.
3. **A local `.html` file opened from disk** (`file://`) with no network: run the loader with `s.src` set to the bundle's own file URL, for example `file:///C:/path/to/skills/design-score/mh-score.js`, and without the `integrity` and `crossOrigin` lines (browsers refuse integrity checks on `file://`; the file is the skill's own copy). Or serve the folder (for example `python -m http.server`), copy the bundle into it and load it as in option 2.
4. **Ask the person.** On a strict site, the **offline bookmarklet** on https://makkov-design.github.io/makkov-harness/score.html#run carries the whole bundle; on a desktop browser, the console snippet does too (see "DevTools console" below). They run it on the page, press **Copy fix prompt** and paste the prompt to you. For a strict page behind a login, where the runner has no session, this is the route.

## Step 2: measure

### Compact result (fits any tool's output limit)

```js
(() => {
  const r = MHScore.run();
  const s = MHScore.extractStyle();
  window.__mhScore = { r, s };   // kept in the page for the next calls
  return JSON.stringify({
    url: r.url, score: r.score, grade: r.grade, viewport: r.viewport, scanned: r.scanned, error: r.error || null,
    categories: r.categories.map((c) => ({ id: c.id, label: c.label, score: c.score, summary: c.summary })),
    issues: r.issues.slice(0, 10).map((i) => ({
      severity: i.severity, impact: i.impact, category: i.category, title: i.title, fix: i.fix,
      where: [...new Set(i.examples.map((e) => e.selector))].slice(0, 4)
    })),
    skipped: r.categories.flatMap((c) => c.checks).filter((k) => k.status === 'skip').map((k) => k.id + ': ' + k.display)
  });
})()
```

### More detail when you need it

```js
MHScore.format.json(window.__mhScore.r)                                          // everything, pretty JSON (tens of KB)
JSON.stringify(window.__mhScore.r.categories.find((c) => c.id === 'typography')) // one category with every check
JSON.stringify(MHScore.run())                                                    // a fresh full run in one call
```

`JSON.stringify` is safe on a result: each example's live element sits in a non-enumerable `el` property and is skipped.

### Fix prompt, style and exports

```js
MHScore.format.promptMd(window.__mhScore.r)                         // fix prompt for any agent (Markdown)
MHScore.format.designMd(window.__mhScore.s)                         // DESIGN.md
MHScore.format.cssVars(window.__mhScore.s)                          // :root custom properties
MHScore.format.tailwind(window.__mhScore.s)                         // Tailwind theme.extend, as JS source
JSON.stringify(MHScore.format.tokens(window.__mhScore.s), null, 2)  // W3C Design Tokens (DTCG)
```

### Full report and score card

The report is a complete, self-contained HTML document and too long for one tool response. Build it once, read it in pieces, and write the pieces to `design-score-<host>.html` in order, unchanged:

```js
window.__mhReport = MHScoreUI.reportHtml(window.__mhScore.r, window.__mhScore.s);
window.__mhReport.length                 // total characters
window.__mhReport.slice(0, 30000)        // then .slice(30000, 60000), and so on to the end
```

Check that the saved file has the same number of characters. If writing pieces is not practical, use the runner's `--report`, or open the panel for the person (`MHScoreUI.open()`) and ask them to press **Open full report**.

`MHScoreUI.cardCanvas(window.__mhScore.r)` returns the 1200 × 630 score card as a canvas. Through a browser tool, let the person save it with **Download score card** in the panel; the runner writes it with `--card`.

### Options

```js
MHScore.run({ maxElements: 8000 })                        // sample more of a huge page (default 4000)
MHScore.run({ timeBudgetMs: 6000 })                       // allow more time on a slow page (default 2500 ms)
MHScore.run({ root: document.querySelector('main') })     // only one part of the page
```

With `root`, the checks about the whole document (language, viewport meta, stylesheets, horizontal scroll) still read the whole page.

## Two viewports, in order

1. Resize to 1440 × 900, reload, load the bundle, run the compact snippet. Keep the result.
2. Resize to 390 × 844, reload, load the bundle again, run it again. Keep that result too.
3. Put the size back.

Read `viewport` in each result: a browser window's viewport is a little smaller than the window. Report both scores with their sizes.

## Per tool

Tool names below are the ones these tools publish at the time of writing. If yours differ, use the tool that opens a URL, the one that sets the viewport size, and the one that evaluates JavaScript in the page.

### Claude in Chrome (the person's own Chrome)

- Load its browser tools first, work in a new tab, and follow its own safety rules.
- `navigate` to the page, then `javascript_tool` (action `javascript_exec`) with the snippets above as `text`.
- `resize_window` with width and height changes the person's real window: put it back afterwards.
- Best for pages behind a login, because it uses the person's own session. Never type a password.

### The Claude app's built-in browser

- `navigate`, then `javascript_tool` with the snippets as `text`. It awaits promises and returns the last expression, so option A works in one call.
- Phone: `resize_window` with width 390 and height 844 (a width under 768 also emulates a touch phone; the `mobile` preset is 375 × 812), then reload. Desktop: width 1440, height 900. When done, `resize_window` with preset `desktop`.
- For a local app, start its dev server with `preview_start` first. Local files and static previews always render in the light theme.

### Playwright MCP

- `browser_navigate` with the URL; `browser_resize` with width and height.
- `browser_evaluate` takes a function. Wrap each snippet: `() => { … return value; }`, and `async () => { … }` for the loader.

### Chrome DevTools MCP

- `navigate_page` with the URL; `resize_page` with width and height.
- `evaluate_script` takes a function and returns JSON-serialisable values: wrap the snippets the same way as for Playwright.

### Node runner: `scripts/score.mjs`

For agents with a shell when puppeteer-core and a Chrome, Edge or Chromium are already installed. It installs nothing and downloads nothing.

Run it from the project folder, with the skill folder's path in front of the script: a local target such as `./dist/index.html`, `--baseline` and every file it writes (reports, `DESIGN.md`, `before.json`) resolve against the current folder.

```bash
node <skill folder>/scripts/score.mjs --check                                    # find everything, launch nothing
node <skill folder>/scripts/score.mjs https://example.com                        # summary and top 5 fixes
node <skill folder>/scripts/score.mjs localhost:3000 --both --json before.json --report
node <skill folder>/scripts/score.mjs localhost:3000 --both --baseline before.json --card   # after fixing: 58 → 86
node <skill folder>/scripts/score.mjs https://example.com --style DESIGN.md --tokens       # steal the style
node <skill folder>/scripts/score.mjs ./dist/index.html --json                   # JSON on stdout, summary on stderr
```

| Option | Does |
|---|---|
| `--width`, `--height` | Viewport (default 1440 × 900) |
| `--phone` | 390 × 844 at 3×, with touch and the page's viewport meta applied |
| `--both` | Desktop, then phone, in one browser; the JSON becomes `{ "desktop": …, "phone": … }` |
| `--scheme light\|dark` | Emulate `prefers-color-scheme` |
| `--json [file]` | The full result; on stdout when no file is given |
| `--report [file]` | Self-contained HTML report (`design-score-<host>.html`; `-phone` added for the phone run) |
| `--style [file]` | DESIGN.md (`DESIGN.md`) |
| `--tokens [file]` | DTCG tokens (`design-tokens-<host>.json`) |
| `--prompt [file]` | The fix prompt (`design-score-<host>-prompt.md`) |
| `--card [file]` | 1200 × 630 PNG score card (`design-score-<host>.png`) |
| `--baseline <file>` | Compare with an earlier `--json` file and print before → after per category |
| `--fail-under <n>` | Exit 3 when a score is under n, for CI |
| `--force` | Overwrite files Design Score did not write (it refuses by default) |
| `--wait <ms>`, `--no-scroll` | Extra wait after load (800 ms); skip the scroll pass that wakes lazy content |
| `--timeout <ms>` | Hard limit for the whole run (60 s per viewport); the browser is closed when it is hit |
| `--max-elements <n>` | Probe sample size (4000) |
| `--chrome <path>`, `--bundle <path>` | Browser and bundle to use |

Put the URL first, and give file names their extension (`--report out.html`). The target can be a URL, `localhost:3000` (opened over http), a bare domain (opened over https) or a path to an `.html` file.

- **Finding puppeteer-core**: `PUPPETEER_DIR` (a folder that contains `node_modules/puppeteer-core`, or the package folder itself), then `HALLMARK_PUPPETEER` (shared with the Hallmark companion), the current folder, the skill folder and the global npm folder. Full `puppeteer` works too.
- **Finding the browser**: `--chrome`, then `CHROME_PATH`, `PUPPETEER_EXECUTABLE_PATH`, `CHROME_BIN`, then the usual install paths for Chrome, Edge, Chromium and Brave on Windows, macOS and Linux.
- **What a run does**: one headless browser with a fresh temporary profile; opens the page; waits for load, fonts and a quiet network (each capped); scrolls once to wake lazy content and returns to the top; injects the bundle through the DevTools protocol, so the page's CSP cannot block it; measures; writes the files; closes the browser and deletes the profile, also on timeout or Ctrl+C.
- **Exit codes**: 0 scored, 1 the page could not be scored (not reachable, redirect loop, probe error), 2 setup or usage problem (puppeteer-core or browser missing, bad option, a file it will not overwrite), 3 a score under `--fail-under`.
- **Limits**: no login session (use Claude in Chrome for those). For a local `.html` file, linked stylesheets may count as cross-origin and the focus and reduced-motion checks may skip; serve the folder (for example `python -m http.server`) and score its localhost URL for full results. Run one at a time; if your environment asks for an outer limit, wrap it, for example `timeout 150 node <skill folder>/scripts/score.mjs … --timeout 120000`.

### DevTools console (by hand)

For the person, on any desktop browser: open the page, open DevTools (F12 or Cmd+Option+I), go to Console, paste the console snippet (or the contents of `mh-score.js`) and press Enter. The panel opens. Chrome asks to type `allow pasting` the first time.

### The bookmarklet (the person)

1. Open https://makkov-design.github.io/makkov-harness/score.html and drag **Design Score** to the bookmarks bar.
2. Open the page to score and click the bookmark. The panel opens on the right.
3. **Copy fix prompt** and paste it to the agent. The **Style** tab copies DESIGN.md, CSS variables, the Tailwind theme or tokens JSON.

- **On a phone or tablet** there is no bookmarks bar to drag to and no DevTools console: the score page's "On a phone or tablet" steps (https://makkov-design.github.io/makkov-harness/score.html#run) add the bookmarklet by hand, by pasting its code as a bookmark's address.
- **Sites with a strict CSP** (GitHub, X) block the regular bookmarklet's loader: use the offline bookmarklet from the same section, which carries the whole bundle, or the console snippet on desktop.

## Troubleshooting

| Symptom | Cause | What to do |
|---|---|---|
| `MHScore is not defined` | The bundle is not loaded, or the page reloaded or navigated | Load it again (step 1) |
| The loader rejects with "Blocked" | The page's Content-Security-Policy, or no network | Step 1 B: the runner, a same-origin copy on a local app, or the person's offline bookmarklet. Never paste the bundle through a tool call |
| `error` is set on the result | The probe could not run on this page | Report that, with no score |
| Focus or reduced-motion checks skip, mentioning stylesheets | Stylesheets served from another domain cannot be read | Say so; those checks are not part of the score |
| `scanned.truncated` is true | A huge or slow page; a limit cut the sample short | Say so, and read `scanned.stoppedBy`. `"elements"`: `MHScore.run({ maxElements: 8000 })`, or score parts with `root`; `"time"`: `MHScore.run({ timeBudgetMs: 6000 })`, or score parts with `root` |
| Scores differ by a few points between runs | Late fonts, lazy content or animations in progress | Wait for the page to settle, run again, report the settled run |
| The phone run looks like desktop | The viewport was not changed, or the page was not reloaded | Resize, reload, load the bundle again; check `viewport.width` |
| An embedded iframe is not measured | The probe reads the top document only | Open the iframe's own URL and score that |
| The runner exits with 2 | puppeteer-core or the browser is missing, or a file would be overwritten | Run `--check` and read the message; or use a browser tool or the bookmarklet |
