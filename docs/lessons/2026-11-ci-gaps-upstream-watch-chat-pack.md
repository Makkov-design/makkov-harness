# Lessons: CI gaps, upstream-watch, chat pack, versioned Design Score bundle

Engineering record for the pull request on branch `ci/gaps-upstream-watch-chat-pack` (November 2026).

## What went wrong before, and why CI did not catch it

- **A skipped test is a green test.** The Design Score fixtures skipped themselves when Chrome or puppeteer-core was missing, which is right on a laptop and wrong in CI: a broken setup step would have left the job green with the fixtures never run. Rule: a test that skips for a missing tool reads an env switch (`DESIGN_SCORE_FIXTURES=required`) that CI sets, and then fails instead.
- **A test file nobody runs is not a test.** `gemini-auth_test.py` existed but no workflow ran Python. When adding a test in a new language or naming pattern, add the CI step in the same change, and make the step fail when it finds no files.
- **The same fact in several files drifts.** Pins and versions were repeated in `marketplace.json`, `SECURITY.md`, `cli-version.json`, the cloud setup script, the workflow and skill docs, and CHANGELOG link definitions stopped at 0.3.1 while five more releases shipped. Each repeated fact now has one source and a `check.mjs` rule that names every file repeating it. When you add a new copy of a version or pin, add the file to that rule.
- **Checks that read "the first line" or "the root folder" silently cover less over time.** The Markdown link check read only root `*.md` files, and the description check only the first line of `description:`. Prefer `git ls-files` over a folder listing, and parse the format properly enough for what the repo really contains.

## upstream-watch

- Compare a release pin with the latest release, not the default branch, or every commit after a release looks like news (the Frame Lens row in issue #73).
- GitHub's compare API returns at most 300 files. Treat a result at the limit as unknown, never as "nothing changed in this folder".
- One upstream failing must not hide the others: catch per source, report it in the issue, and exit non-zero only at the end.
- Keep the logic in exported functions that take `gh` and `npmLatest` as arguments, so tests can stub the API. The script only runs `main()` when executed directly.

## Chat pack

- Chat apps keep a file's name and drop its folder. Anything meant for upload needs unique file names, checked in CI (case-insensitively).
- Generated copies that are committed need a `--check` mode in CI, and their error message must say the command that fixes it. Editing any `skills/*/SKILL.md` or `ROUTING.md` now means running `node .github/scripts/chat-pack.mjs` too.

## Design Score bundle

- A Subresource Integrity hash only helps if the URL it pins never changes content. Pin immutable, versioned URLs (`score/<version>/mh-score.js`) and make the build refuse to change a published version: changing `src/` now needs a bump of `VERSION` in `src/probe.js` and `src/ui.js`.

## npm installs outside a project

- `npm install -g pkg@x.y.z` pins only the top level. `--before=<end of review day>` pins the whole tree to what existed at review time without a lockfile, which a global install cannot use. Keep npm's stderr: a "WARNING" with no reason costs a debugging round.
