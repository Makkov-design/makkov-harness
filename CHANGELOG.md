# Changelog

Every notable change to makkov-harness, newest first. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and versions follow [Semantic Versioning](https://semver.org/spec/v2.0.0.html). The version is the one in `.claude-plugin/plugin.json`.

## [Unreleased]

### Fixed

- Chat pack: the instructions had people upload several files that are all named `SKILL.md`, and chat apps keep only a file's name, so each upload replaced the one before. `adapters/chat-pack/files/` now holds one file per skill with its own name (`html-report.md`, `third-party-install-guard.md`…), plus `ROUTING.md` and `html-report-skeleton.html`, built from `skills/` by `.github/scripts/chat-pack.mjs`; CI fails when the pack is stale or two files share a name [#7](https://github.com/Makkov-design/makkov-harness/issues/7).
- Design Score: the agent's loader pinned the bundle by hash but fetched `score/mh-score.js`, which changes with every release, so older installs would get "Blocked" once the bundle changed. Each version is now published once at `score/<version>/mh-score.js` and never changes there: `docs/score/versions.json` records each hash, the build refuses to change a published version, and CI fails if a version recorded on the base branch changed or disappeared. The loader fetches that copy. `score/mh-score.js` stays for the bookmarklets, which always load the latest, and keeps working for installs from 0.5.0 only until the next Design Score version: after that their loader reports "Blocked" until you update the harness.
- upstream-watch: a pin on a release is compared with the upstream's latest release, not the default branch, so a pin equal to the latest release no longer shows as behind; a subfolder plugin whose diff reaches GitHub's 300-file compare limit is marked "review needed" instead of skipped; one upstream that fails (a 404, a force-pushed commit) is reported in the issue while the others are still checked. It now also follows the vendored skills (Emil Kowalski, Hyperframes, awesome-design-md) and the npm pins (hyperframes, puppeteer-core), listed in `.github/upstream-watch.json`, with unit tests on stubbed API responses. Upstream tag and branch names go into the issue as inline code, so they cannot @mention anyone or add links.
- `cloud/setup-design-tools.sh`: an npm failure printed only "WARNING" because its errors went to `/dev/null`; they now show. Transitive dependencies are pinned too, with `--before` set to the end of the review day, so nothing published after the review can be installed. The pinned versions are unchanged.
- README: a stale "New in 0.2" tag on Design Score (the site's home page had it too, now fixed); CHANGELOG link definitions for 0.3.2 to 0.5.0.
- SECURITY.md: the Frame Lens row shows its pinned version (2.1.0, `94d426f`); the cloud setup script line says its npm installs are pinned with `--before` the review date; the bookmarklet loader line names the versioned copies at `score/<version>/mh-score.js`.
- `check.mjs` compares a vendored commit in full when both spellings are full 40-character SHAs, instead of by their first 7 characters.
- SECURITY.md and the security page say more about what two companions reach: Hallmark's `theme.mjs photos --save` downloads photos from Wikimedia Commons and drafts may link Commons thumbnails; interfaces' `afk` skill works unattended once you start it, reads beyond the project (saved memory, sibling projects, connected services, read-only) and runs the project's own commands. Pins unchanged.
- `check.mjs` closes the remaining short-commit gaps: the full commits in `docs/security-data.js` must equal those in `marketplace.json` and `.github/upstream-watch.json` (so a changed tail no longer passes), and a commit written in uppercase or longer than 40 characters on a line naming a vendored repository fails. The comparisons live in `.github/scripts/pins.mjs`, with tests.
- Installers, update and uninstall ([install/](install/)), each with a scenario in `install/test/` for bash and PowerShell:
  - Uninstalling one agent took the routing block (and the personal layer) out of a `<project>/AGENTS.md` another installed agent still read; Codex, Copilot, Windsurf, Cline and OpenCode all use that file. The block now stays until the last of them is uninstalled.
  - An update without `--scope` / `-Scope` dropped an earlier `--scope design`. It now keeps the scope the manifest recorded.
  - Updating the block replaced a symlinked instructions file with a regular file and reset its mode to 600. The installers now write through the existing file, and leave it untouched when it is already current.
  - A skill removed or renamed in a newer version stayed behind forever. An update now takes it out, or moves it to `backups/<date>/removed/` if you changed it, unless another installed agent still lists it.
  - A start marker without its end marker made `install.sh` cut the rest of the file and `install.ps1` add a second block. Both now check that the markers are paired, stop with the line number and change nothing; so does the uninstaller.
  - Uninstalling after the project folder was moved or renamed printed "removed", deleted the manifest and left the skills and the block. The manifest records the folder it was written for (`base=`), and paths from it, older manifests included, are read relative to the folder you pass now.
  - Several installs and an uninstall left `AGENTS.md.bak-<date>` files next to your file, empty `.agents/skills` and `.makkov-harness` folders, and a trailing blank line in your file. Now one copy of your file is kept once in `.makkov-harness/backups/original/`, the uninstall puts the file back byte for byte when you have not changed it, and removes the folders the install created once they are empty.
  - `install.ps1` / `uninstall.ps1` read a project path with `[` or `]` as a wildcard. Every path now goes through `-LiteralPath`.
  - `--scope` with no value exited silently; it now prints the usage.
  - An install that failed or was interrupted after the skills (the instructions file a folder or read-only, Ctrl-C) left no manifest, so the uninstaller refused and your same-named skill stayed in a backup folder. Everything that can fail is now checked before the first change, and the manifest is written before the first change and again at the end; an interrupted install can be run again or uninstalled. Copies go to a temporary name first.
  - `install.ps1` / `uninstall.ps1` read and wrote the instructions file as UTF-8, turning Windows-1251/1252 text into replacement characters and dropping a BOM. Both installers now pass the file's bytes through unchanged; a UTF-16 or UTF-32 file is not rewritten: they stop and say so.
  - A manifest was trusted: one naming another file as `rules=`, or `skill=../..`, `backup=` or `created_dir=` outside the folder, made the uninstaller delete or move things outside the project. Every manifest in the folder must now name exactly the paths the installer would use, with backups inside `.makkov-harness/backups/` and plain skill names; otherwise install and uninstall stop before any change. A manifest with no skills (Aider's) no longer stops the installer for the other agents.
  - A file that already held a marked block at the first install got no copy, so text between the markers was lost. The copy is now kept whenever the file is there, and it is deleted only when the uninstall puts the file back byte for byte; otherwise it stays, and the uninstaller says where.
  - A symlink to a file that does not exist: the install created that file outside the project and the uninstall deleted your link. Both now stop at a dangling link, and a symlink is never deleted.
  - Smaller: a file of only whitespace comes back byte for byte; the blank line the installer put before the block goes with it, also when you added text after the block; a failed uninstall can be run again without taking your restored skill for ours; a skill updated by another agent's newer install is still recognised as the harness's; the PowerShell fingerprint sorts file names in ordinal order, so 5.1 and 7 agree; a project path that is your home folder is refused.
  - Several agents in one folder: uninstalling one in a path with a space or `[ ]` read the other agents' manifests word by word, and could fail or touch a file outside the project named like a word of the path; an uninstall could leave a manifest the next run refused (a folder another agent created); a second agent installed into the same `AGENTS.md` took the harness's own file for yours, so its uninstall left an `AGENTS.md` and a copy behind; two agents installed in the same second shared a backup folder, so your skill could come back into the other agent's skills folder (backups are now in `backups/<date>-<agent>/`).
  - Interrupted runs: a run stopped after its first skill listed skills it had not reached, so a skill of yours with one of their names was later taken for the harness's; a skill deleted or a file written half way could be left under its real name (deletes now rename first, files are replaced in one step); half-made copies and temporary files are cleared by the next run or the uninstall.
  - An edit of only line ends or trailing spaces after the install was undone by the uninstall; it now stays (the file is put back as it was only when its bytes match, apart from the one newline the installer added).
  - A file where a skill folder goes now stops the install before any change, instead of half way.
  - The stop points the tests use are inert unless `MAKKOV_HARNESS_TEST=1` is also set.
  - A manifest written by `install.ps1` (byte order mark, CRLF, `C:\` paths) is read by `install.sh` in Git Bash and WSL, and one written by `install.sh` (`/c/…`, `/mnt/c/…`) by `install.ps1`.
- The Windows install commands in README.md and INSTALL.md used `~/…`, which Windows PowerShell 5.1 does not expand for `git`; they use `$HOME\makkov-harness` now.

### Changed

- Companion pins, after a new `third-party-install-guard` review on 2026-11-23 (both green): interfaces 1.17.0 → 1.20.0 (`6c21201`; drops the `teardown` skill and its scripts, adds the user-invoked `afk` skill, text only) and Hallmark 2.0.0 at `04977e1` (screenshot file names no longer collide, `<img>` paths use forward slashes on Windows). Frame Lens stays at v2.1.0, its latest release.
- CI: the session-start hook is tested on Linux, macOS (bash 3.2) and Windows, like the install gate; the Design Score fixtures fail instead of skipping when Chrome or puppeteer-core is missing (`DESIGN_SCORE_FIXTURES=required`); the Python tests (`*_test.py`) run; the upstream-watch tests run; Node 24 LTS instead of Node 20, which is past its end of life.
- `check.mjs` also checks: links in every Markdown file, not only those at the root; skill descriptions written over several lines; that the companion pins in `marketplace.json` match `SECURITY.md`; that the vendored sources and npm pins in `.github/upstream-watch.json` match `SECURITY.md`, and the vendored commits in `CREDITS.md`, `NOTICE` and design-md-library's URL; that the reviewed hyperframes and puppeteer-core versions are the same in every file that repeats them; that `ROUTING.md` and `skills/` list the same skills; and that every CHANGELOG version heading has a link definition.


### Added

- A Node installer, one behaviour on every operating system: `node bin/makkov-harness.mjs install|update|uninstall --agent <agent> [--project <path>] [--scope all|design] [--dry-run]` from a copy of the repository. Node 22 or later, the standard library only, no dependencies and no install scripts. It reads and writes the same manifest as `install.sh` and `install.ps1` (and those of 0.4.0 and 0.5.0), with the same checks before the first change, the same journal, the same byte-for-byte handling of your file and the same refusals and exit codes, so an install made by one installer can be updated or removed by another. The shell installers stay as the way without Node.
- `makkov-harness doctor [--project <path>] [--json]`: a report, changing nothing, of what is installed where (agents, scope, shared files and skill folders, backups), of manifests that fail the installer's checks and why, of skills missing or different from the package's, of files an interrupted run left, of a lock a stopped run left, and of leftovers of 0.5.0 and earlier; exit code 1 when something needs attention, 3 when a folder could not be read. With `--json` it always prints JSON, a usage error included. Values from a manifest are printed with their control characters escaped.
- The npm package `makkov-harness` (`package.json` at the root, with a `files` allow-list: the installer, `ROUTING.md` and `skills/` without `rich-report`) and a release workflow that publishes it only when the owner starts it or pushes a version tag, with npm trusted publishing (no token stored) as a staged version the owner approves on npmjs.com. The tests run in a job without the OIDC token; the publish job waits in the GitHub environment `npm-release` for the owner's approval. Steps for the owner: [docs/release.md](docs/release.md).
- Tests: the bash and PowerShell scenario suites and the random sequence tests also drive the Node installer (`MAKKOV_IMPL=node`), and `MAKKOV_IMPL=mixed` mixes the bash, PowerShell and Node installers on the same folders, the Node one also from the packed npm package; CI runs them on Linux, macOS and Windows with Node 22, 24 and 26.

### Fixed (installers)

- A hard-linked instructions file was replaced by a new file, so its other names kept the old content; it is now written in place, in all three installers.
- The install checks that the instructions file's folder can be written to before its first change (the file is replaced through a temporary file next to it), as the uninstall already did.
- Windows PowerShell 5.1: removing a skill folder that is a junction (or a link left under a temporary name) could delete the files of the folder it points to; links are now removed as links.
- A home folder given with a trailing slash, as `.` or as a relative path, or reached through a symlink: update and uninstall stopped (the paths in the manifest did not compare equal), and a project folder that is your home under another spelling was not refused. Paths are now resolved, and the project-is-home check compares real paths, in all three installers.
- Moving a skill folder to or from `.makkov-harness/backups/` across file systems (a skills folder that is a link to another disk) failed part way in the Node installer. Every such move now copies, checks the copy's fingerprint and only then removes the original, in the Node installer and `install.ps1`.
- Two runs at once on the same folder could interleave their changes. Each install and uninstall now holds a lock (`.makkov-harness/lock/`) for the whole run, honoured by all three installers; a second run stops before any change with "Another makkov-harness run is working in …". A lock left by a run that was killed is taken over when its process is gone or it is a day old.
- The Node installer printed a stack trace on an unexpected error; it now prints what failed and that the command can be run again (`MAKKOV_HARNESS_DEBUG=1` shows the stack). Under Node older than 22 it says which version it needs instead of failing on syntax.
- `install.ps1` / `uninstall.ps1` with a home or project folder given by its 8.3 short name (`C:\Users\RUNNER~1\…`, as `%TEMP%` and Git Bash's paths often are): the skills the harness had copied were not recognised as its own, so an update moved them aside as yours, and an uninstall took its own manifest for another agent's and left the routing block and the skills in place. Found by the random sequences that mix the three installers on Windows.

## [0.5.0] - 2026-11-09

Hardened: the install gate catches the commands people really type, updates and uninstalls know the harness's own copies, the Hyperframes CLI runs only as reviewed (pinned, its telemetry and npm install scripts off), the Design Score loader is pinned by hash, and the docs claim no more than what ships. Prompted by an independent review of 0.4.0.

### Security

- Design Score: the agent's loader carries the bundle's Subresource Integrity hash, so a browser runs the copy on GitHub Pages only when it is exactly the `mh-score.js` the skill ships, and refuses anything else. CI checks the hash against the built file; AGENTS.md says which file runs on each path [#55](https://github.com/Makkov-design/makkov-harness/issues/55).
- The Hyperframes CLI kept its own usage telemetry on when the harness started it, through the launcher or the media-use scripts. It now starts with `HYPERFRAMES_NO_TELEMETRY=1` unless you set `MEDIA_USE_TELEMETRY=1` or chose `HYPERFRAMES_NO_TELEMETRY` yourself [#57](https://github.com/Makkov-design/makkov-harness/issues/57).
- The hyperframes skill now opens with the launcher command and says every `npx hyperframes` in the skills means it, so the reviewed CLI release is what runs. It no longer tells the agent to run `npx hyperframes@latest upgrade` on its own, runs `usage` (which reads your Claude or Codex sign-in) only when you ask about plan usage, and the launcher starts the CLI with npm install scripts off [#56](https://github.com/Makkov-design/makkov-harness/issues/56).

### Fixed

- The install gate let real commands through: a multi-line command, one inside quotes (`bash -c "npm install x"`) or with options before the verb (`npm --prefix app install x`). It now decodes the hook input and matches in pure bash, starting no other program; `npx` for a tool already in the project's `node_modules/.bin` passes without a question. 54 test cases, run on Linux, macOS and Windows [#52](https://github.com/Makkov-design/makkov-harness/issues/52).
- Updating in place and then uninstalling left old harness skills behind: an update treated the previous version of each skill as yours and backed it up, and the uninstaller restored it. The manifest now records a fingerprint of every skill copied, so an update replaces the harness's own earlier copies and the uninstaller removes exactly them; copies from installs before 0.5.0 go to `backups/<date>/earlier-harness/` and are not restored [#53](https://github.com/Makkov-design/makkov-harness/issues/53).
- `uninstall.sh` split paths on spaces, so in a folder like `My Project` your own skills stayed in the backup folder. It reads the manifest line by line now [#54](https://github.com/Makkov-design/makkov-harness/issues/54).

### Added

- A design-only scope for the Claude plugin: with `MAKKOV_HARNESS_SCOPE=design` (for example under `env` in `~/.claude/settings.json`), the session-start hook loads the design rows of the routing map only, as `--scope design` does for the installers [#60](https://github.com/Makkov-design/makkov-harness/issues/60).
- CREDITS.md, NOTICE and the README footer say that the 19 sound effects bundled with `media-use` are under the Pixabay Content License, not Apache-2.0 or MIT: free to use in your videos, not to be distributed on their own [#61](https://github.com/Makkov-design/makkov-harness/issues/61).

### Changed

- `harness-onboarding` writes the personal layer where the harness was installed (the manifest's instructions file; a project install stays in the project), between `<!-- makkov-harness:personal:start -->` and `<!-- makkov-harness:personal:end -->`, within the install's scope. The uninstallers take it out with the routing block, and an update keeps it [#59](https://github.com/Makkov-design/makkov-harness/issues/59).
- Claims brought in line with what ships: two hooks, not one (README, AGENTS.md); the badge and the site say the harness installs in 9 agents, as COMPATIBILITY.md separates installs tested in CI from use by hand; Frame Lens is marked as the author's own, not as a reviewed companion; ffmpeg in the cloud setup comes from Ubuntu's archive, not a pin; SECURITY.md names the site's font hosts next to GoatCounter [#58](https://github.com/Makkov-design/makkov-harness/issues/58).

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

[Unreleased]: https://github.com/Makkov-design/makkov-harness/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/Makkov-design/makkov-harness/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/Makkov-design/makkov-harness/compare/v0.3.4...v0.4.0
[0.3.4]: https://github.com/Makkov-design/makkov-harness/compare/v0.3.3...v0.3.4
[0.3.3]: https://github.com/Makkov-design/makkov-harness/compare/v0.3.2...v0.3.3
[0.3.2]: https://github.com/Makkov-design/makkov-harness/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/Makkov-design/makkov-harness/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/Makkov-design/makkov-harness/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/Makkov-design/makkov-harness/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Makkov-design/makkov-harness/releases/tag/v0.1.0
