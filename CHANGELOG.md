# Changelog

Every notable change to makkov-harness, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version is the one in `.claude-plugin/plugin.json`.

## [0.3.0] - 2026-11-07

Real sounds for every video.

### Added

- Optional Openverse API keys for `media-use` sound effects: with `OPENVERSE_CLIENT_ID` and `OPENVERSE_CLIENT_SECRET` in the environment, searches use a cached access token and get the higher registered limits; without them, or when the token is refused, search stays anonymous as before. How to register and where the keys go is in [`sfx.md`](skills/media-use/audio/references/sfx.md).

### Changed

- Video sound rules: effects come from real Openverse recordings first (CC0 / CC BY, credits kept), generated sound only for cues with no real recording or when asked; Openverse music (Jamendo) is a free option for a bed. Stated in [`sound.md`](skills/hyperframes/references/sound.md) and the routing rules.
- `sfx.md` notes that Freesound's CDN can refuse downloads from cloud containers, and what to do instead.

## [0.2.0] - 2026-11-07

The Design Score release: the harness gets a flagship of its own.

### Added

- **Design Score** ([`skills/design-score/`](skills/design-score/SKILL.md)), Lighthouse for design. It scores any live page from 0 to 100 on 37 checks in seven categories (accessibility 25, typography 20, colour 15, layout and spacing 20, responsive 10, motion 5, consistency 5), explains every point it takes off and writes a fix prompt for any agent. It runs inside the page, makes no network requests and never changes the page's own content.
  - A panel in its own Shadow DOM: the score ring and grade, the seven categories, issues sorted by the points they cost that light up their elements on the page, every check with its value and target, Copy fix prompt, a 1200 × 630 score card and a full self-contained HTML report with a README badge.
  - Steal the style: the palette with roles, fonts, type scale, spacing, radii, shadows and `:root` custom properties a page renders, exported as `DESIGN.md`, CSS variables, a Tailwind theme or W3C Design Tokens (DTCG) JSON.
  - The `design-score` skill for any agent: a measured pass in a real page and a judged pass from a screenshot or Figma frame, never blended; desktop and phone viewports; the score-and-fix loop through interfaces and animate; a before → after line at the end.
  - [`rubric.md`](skills/design-score/rubric.md) with every check, weight and threshold, and calibration fixtures in `test/`.
  - An optional Node runner, `scripts/score.mjs`, for when puppeteer-core and Chrome are already installed: JSON, HTML report, DESIGN.md, tokens, fix prompt, score card, a baseline comparison and `--fail-under` for CI.
  - `build.mjs` bundles the probe and the panel into `mh-score.js` and refreshes the bookmarklets; `--check` fails when a generated file is stale.
- **The Design Score page** ([score.html](https://makkov-design.github.io/makkov-harness/score.html)): a bookmarklet to drag to the bookmarks bar, an offline bookmarklet for sites that block outside scripts, a console snippet, a sample panel to explore, the rubric, export samples, the fix loop, a badge builder and a privacy FAQ.
- **The security index** ([security.html](https://makkov-design.github.io/makkov-harness/security.html)): every verdict from `SECURITY.md`, searchable and filterable, with the reviewed commit, what each piece runs, sends and needs, and how a review works.
- **Ask the router** at the top of [situations.html](https://makkov-design.github.io/makkov-harness/situations.html): describe a task in your own words and it finds the skill, how to call it and a prompt to paste, matched in the browser.
- Design Score in the situations catalog: a habit ("Want a number? Score it") and three rows in Audit and polish, 72 situations in all.
- An agent briefing in `AGENTS.md`, `docs/llms.txt` for AI agents reading the site, and a star step after install that asks once and acts only on a clear yes.
- Repository checks on every push and pull request: manifests, the hook's output, skill names and descriptions, and a scan for anything that looks like a key. This release adds: the Design Score build is up to date and its two bundle copies match, the bundle uses no network or storage API and the loader bookmarklet loads only the bundle from this site, as `SECURITY.md` says, local links and in-page anchors on the site resolve, every page is in the sitemap, situation counts and section numbering stay in step, and the plugin versions match this changelog.
- `CHANGELOG.md`, `docs/sitemap.xml` and `docs/robots.txt`.
- Page views on the website through GoatCounter: no cookies, no personal data, a pinned script checked with Subresource Integrity.

### Changed

- Home page: a Design Score section after the before/after demo, a "New" tag in the hero, Score and Security in the navigation and the footer, and a link from the gate section to the full security index.
- Website redesign: the scroll-driven before/after demo, the routing board, "Find your situation" with a picker on phones, the install guide by where you work, and an edge index for the catalog on phones.
- `ROUTING.md` sends score, rate and grade requests, and requests to extract a site's design tokens, to `design-score`.
- `README.md`, `AGENTS.md`, `INSTALL.md`, `SECURITY.md`, `CREDITS.md`, `COMPATIBILITY.md` and `llms.txt` describe Design Score. `SECURITY.md` lists what the Design Score bundle and its bookmarklet run.
- Companions reviewed again and moved to the new pins: Superpowers 7.0.2 (`22f0b46`), Impeccable 4.8.0 (`c3bb418`) and Hallmark 2.0.0 (`407fa68`).
- The key scan now also reads new files before they are committed.
- Plugin and marketplace version 0.2.0, with the keyword `design-score`.

## [0.1.0] - 2026-11-06

The first public release.

### Added

- The routing map, `ROUTING.md`, loaded at the start of every Claude Code session by a hook that only reads and prints it.
- Skills: `rich-report`, `html-report`, `third-party-install-guard`, `design-md-library` and `harness-onboarding`; Emil Kowalski's five motion skills and HeyGen's six Hyperframes skills, copied with their licenses.
- A Claude plugin marketplace that lists the companion plugins (Superpowers, interfaces, Impeccable, Hallmark, security-audit, ytlens), each third-party one pinned to the commit that was reviewed, with the verdicts in `SECURITY.md`.
- Installers for Codex, Cursor, Gemini CLI, GitHub Copilot, Windsurf, Cline, OpenCode and Aider, and a chat pack for ChatGPT, Gemini, Grok and DeepSeek.
- An optional setup script for Claude cloud sessions that installs pinned, reviewed versions of the video and browser tools, offered only when a task needs them.
- A weekly upstream watch that flags new versions of the pinned companions in one issue.
- The website on GitHub Pages, the brand mark and wordmark, an MIT license, issue and pull request templates and a code of conduct.

[0.3.0]: https://github.com/Makkov-design/makkov-harness/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Makkov-design/makkov-harness/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Makkov-design/makkov-harness/releases/tag/v0.1.0
