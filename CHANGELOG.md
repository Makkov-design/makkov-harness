# Changelog

Every notable change to makkov-harness, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version is the one in `.claude-plugin/plugin.json`.

## [Unreleased]

### Added

- CREDITS.md, NOTICE and the README footer say that the 19 sound effects bundled with `media-use` are under the Pixabay Content License, not Apache-2.0 or MIT: free to use in your videos, not to be distributed on their own [#61](https://github.com/Makkov-design/makkov-harness/issues/61).
- A design-only scope for the Claude plugin: with `MAKKOV_HARNESS_SCOPE=design` (for example under `env` in `~/.claude/settings.json`), the session-start hook loads the design rows of the routing map only, as `--scope design` does for the installers [#60](https://github.com/Makkov-design/makkov-harness/issues/60).

### Changed

- `harness-onboarding` writes the personal layer where the harness was installed (the manifest's instructions file; a project install stays in the project), between `<!-- makkov-harness:personal:start -->` and `<!-- makkov-harness:personal:end -->`, within the install's scope. The uninstallers take it out with the routing block, and an update keeps it [#59](https://github.com/Makkov-design/makkov-harness/issues/59).
- Claims brought in line with what ships: two hooks, not one (README, AGENTS.md); the badge and the site say the harness installs in 9 agents, as COMPATIBILITY.md separates installs tested in CI from use by hand; Frame Lens is marked as the author's own, not as a reviewed companion; ffmpeg in the cloud setup comes from Ubuntu's archive, not a pin; SECURITY.md names the site's font hosts next to GoatCounter [#58](https://github.com/Makkov-design/makkov-harness/issues/58).
- Design Score: the agent's loader carries the bundle's Subresource Integrity hash, so a browser runs the copy on GitHub Pages only when it is exactly the `mh-score.js` the skill ships, and refuses anything else. CI checks the hash against the built file; AGENTS.md says which file runs on each path [#55](https://github.com/Makkov-design/makkov-harness/issues/55).
- The Hyperframes CLI kept its own usage telemetry on when the harness started it, through the launcher or the media-use scripts. It now starts with `HYPERFRAMES_NO_TELEMETRY=1` unless you set `MEDIA_USE_TELEMETRY=1` or chose `HYPERFRAMES_NO_TELEMETRY` yourself [#57](https://github.com/Makkov-design/makkov-harness/issues/57).
- The hyperframes skill now opens with the launcher command and says every `npx hyperframes` in the skills means it, so the reviewed CLI release is what runs. It no longer tells the agent to run `npx hyperframes@latest upgrade` on its own, runs `usage` (which reads your Claude or Codex sign-in) only when you ask about plan usage, and the launcher starts the CLI with npm install scripts off [#56](https://github.com/Makkov-design/makkov-harness/issues/56).

## [0.4.0] - 2026-11-09

Verified and scoped: tests run on every pull request, the compatibility table says what was checked and how, Claude Code asks before anything installs, and a design-only scope keeps the harness out of other work. Prompted by an independent review of 0.3.1.

### Added

- An install gate for Claude Code (`hooks/install-gate`): a shell command that installs or runs third-party code (`npm install <package>`, `npx`, `pip install`, `curl … | sh` and the like) becomes a question to you, with a reminder to run the `third-party-install-guard` review first. It never blocks or runs anything; installs from an existing lockfile pass; off with `MAKKOV_HARNESS_INSTALL_GATE=off` [#25](https://github.com/Makkov-design/makkov-harness/issues/25).
- `--scope design` / `-Scope design` for the installers: a routing block for design work only, without the rows for research reports, third-party installs, general coding and project security reviews [#26](https://github.com/Makkov-design/makkov-harness/issues/26).
- CI runs the unit tests (227 across the HyperFrames launcher, media-use and its audio engine) and scores the Design Score fixtures with the Node runner at desktop and phone sizes [#23](https://github.com/Makkov-design/makkov-harness/issues/23).

### Changed

- COMPATIBILITY.md separates "installer tested in CI" (all eight installer agents, on Linux, macOS and Windows) from "used by hand" (Claude Code, daily since 2026-11-04) [#24](https://github.com/Makkov-design/makkov-harness/issues/24).
- SECURITY.md says what the install guard is and what it is not: a review procedure plus, in Claude Code, a question before installs; not a sandbox [#25](https://github.com/Makkov-design/makkov-harness/issues/25).
- Design Score: the README, the skill and the score page say plainly what a score measures (shared, checkable conventions) and what it does not (whether people can use the page) [#27](https://github.com/Makkov-design/makkov-harness/issues/27).
- README opens with a one-minute way to try Design Score with nothing installed [#28](https://github.com/Makkov-design/makkov-harness/issues/28).
- The site's security index shows the install gate as a ninth review step and lists it with the safer installers; the home page's installer panel mentions the dry run, backups, the design scope and the uninstaller.
- GitHub Actions: `actions/checkout` 7.0.1 and `actions/setup-node` 7.1.0, pinned by commit ([#3](https://github.com/Makkov-design/makkov-harness/pull/3), [#2](https://github.com/Makkov-design/makkov-harness/pull/2)).

### Fixed

- Running the full test suite found two tests that did not fit this copy of the HyperFrames skills: the telemetry tests still expected the upstream default (now opt-in, see 0.3.4), and a test scanned CLI sources that exist only upstream. Both are fixed and listed in `NOTICE`.

## [0.3.4] - 2026-11-09

Privacy and pinning: nothing in the bundle sends usage data unless you opt in, every third-party version is pinned to a commit, and our changes to copied code are listed. Prompted by an independent review of 0.3.1.

### Changed

- `media-use` (copied from HeyGen's hyperframes skills) sent usage events to PostHog unless you opted out, linked to your HeyGen account when signed in. In this harness it now sends nothing unless you set `MEDIA_USE_TELEMETRY=1` [#17](https://github.com/Makkov-design/makkov-harness/issues/17).
- AGENTS.md said "No telemetry", which was true of the routing map, the installers and Design Score but broader than the bundle. AGENTS.md, SECURITY.md and the site's security index now say exactly what sends what, and how each is turned off [#18](https://github.com/Makkov-design/makkov-harness/issues/18).

### Security

- `media-use` started the Hyperframes CLI as plain `npx hyperframes`, which resolves whatever npm has that day. Every start now asks for the reviewed release (0.9.9, from `skills/hyperframes/scripts/cli-version.json`) [#19](https://github.com/Makkov-design/makkov-harness/issues/19).
- Frame Lens was pinned to a tag, which can move; it is now pinned to its commit, and the repository check fails on any third-party plugin without a commit pin [#20](https://github.com/Makkov-design/makkov-harness/issues/20).

### Fixed

- CREDITS.md called the copied HyperFrames skills "unmodified". A root `NOTICE` now lists every file we changed or added, as Apache-2.0 asks, and each of those files says so at the top [#21](https://github.com/Makkov-design/makkov-harness/issues/21).

## [0.3.3] - 2026-11-09

Safe installs: the installers for Codex, Cursor, Gemini CLI, Copilot, Windsurf, Cline, OpenCode and Aider never lose your files. Prompted by an independent review of 0.3.1.

### Fixed

- The installers deleted a skill folder with the same name as one of ours before copying, so your own skill (or one you had edited) was lost. A folder that is not an identical copy of ours is now moved to `.makkov-harness/backups/<date>/skills/` instead, and the installer says so ([#12](https://github.com/Makkov-design/makkov-harness/issues/12)).
- The Cursor rule (`.cursor/rules/makkov-harness.mdc`) was overwritten without the `.bak-<date>` copy INSTALL.md promises for every instructions file; it now gets one ([#13](https://github.com/Makkov-design/makkov-harness/issues/13)).
- `.claude-plugin/marketplace.json` listed makkov-harness 0.3.1 while `plugin.json` said 0.3.2 ([#22](https://github.com/Makkov-design/makkov-harness/issues/22)).

### Added

- A dry run: `--dry-run` / `-DryRun` prints every folder the installer would copy or move and the file it would edit, and writes nothing ([#14](https://github.com/Makkov-design/makkov-harness/issues/14)).
- A clean uninstall: the installers write a manifest (`.makkov-harness/install-<agent>.txt`), and `install/uninstall.sh` / `install/uninstall.ps1` remove exactly what was installed, put back skills of yours the install had moved aside, take out the routing block and restore your earlier Cursor rule ([#15](https://github.com/Makkov-design/makkov-harness/issues/15)).
- End-to-end installer tests for every agent, run in CI on Linux, macOS and Windows (PowerShell 5.1 and 7) ([#16](https://github.com/Makkov-design/makkov-harness/issues/16)).

## [0.3.2] - 2026-11-09

### Changed

- ytlens is now Frame Lens (`framelens`, [Makkov-design/framelens](https://github.com/Makkov-design/framelens)), pinned to v2.0.0 in the marketplace. It studies any video or animation, not only YouTube, and works locally without a key; only its Gemini tools need one. Routing, README, SECURITY, CREDITS and the site's situations and security pages say so.

## [0.3.1] - 2026-11-07

An end-to-end test of a plain video request found that the 0.3.0 sound code was not on the path agents take.

### Fixed

- Sound effects now go through the harness's own audio engine (`media-use/audio/scripts/audio.mjs --only sfx`), so the Openverse search from 0.3.0, with its optional keys, is what runs. Before, the skills sent agents to `hyperframes media-use resolve --type sfx`, which uses the CLI's own older copy: it ignores the keys and, when signed in, tries HeyGen first. `media-use` and its sound guides now say so.
- The HyperFrames launcher (`skills/hyperframes/scripts/plugin-cli.mjs`) failed inside this plugin: it expected a plugin named `hyperframes` and would have asked npm for `hyperframes@<harness version>`. It now reads the reviewed CLI release, 0.9.9, from `skills/hyperframes/scripts/cli-version.json`.
- The sound guides said `assets/sfx/CREDITS.md` is always there; it lists CC BY sounds only, so a video with only CC0 sounds has none.

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

[0.3.1]: https://github.com/Makkov-design/makkov-harness/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/Makkov-design/makkov-harness/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Makkov-design/makkov-harness/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Makkov-design/makkov-harness/releases/tag/v0.1.0
