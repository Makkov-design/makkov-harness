# Contributing

Issues and pull requests are welcome. A few rules keep the harness safe for everyone who installs it.

## Adding or updating a third-party skill or plugin

1. Run the `third-party-install-guard` review on the exact version.
2. Add or update its row in `SECURITY.md` (version, date, verdict, notes) and in `CREDITS.md`.
3. Copy it into `skills/` only if its license allows it and linking is not practical; keep its `LICENSE` file in the folder. Otherwise link it from `README.md` and `ROUTING.md`.

## Updating pins

The `upstream-watch` workflow runs every Monday and keeps one issue, "Companion plugins: updates to review". It lists everything pinned whose upstream has moved on: the companions in `.claude-plugin/marketplace.json`, and the vendored skills and npm packages in `.github/upstream-watch.json`. A pin on a release is compared with the upstream's latest release; any other pin with the default branch. Each row has a compare link and how many changed files are code or hooks, and a row marked "review needed" means GitHub could not list the whole diff. It never changes a pin. To bump one, run `third-party-install-guard` on the new version first, then:

- a companion: its `sha` (and `ref`, if any) in `.claude-plugin/marketplace.json` and its row in `SECURITY.md`;
- a vendored skill: copy the new version into `skills/`, then update its `sha` in `.github/upstream-watch.json`, its row in `SECURITY.md`, and the commit in `CREDITS.md` and `NOTICE` (for awesome-design-md, also the URL in `skills/design-md-library/SKILL.md`);
- an npm package: its version in `.github/upstream-watch.json`, its row in `SECURITY.md`, and every file `check.mjs` names for it (for hyperframes, `skills/hyperframes/scripts/cli-version.json` first).

`node .github/scripts/check.mjs` fails until all of them agree. The issue closes itself on the next run once every pin matches upstream and nothing failed.

## Design Score

- Edit `skills/design-score/src/`, never the built files, then run `node skills/design-score/build.mjs`.
- Any change to `src/` needs a new version: bump `VERSION` in both `src/probe.js` and `src/ui.js`, build, and set the new `integrity` hash and `score/<version>/` path in `reference/running-the-probe.md`. Each version is published once at `docs/score/<version>/mh-score.js`, and installs pin it by hash, so it must never change.
- Never edit or delete `docs/score/versions.json` or a `docs/score/<version>/` folder by hand. CI compares them with the base branch and fails if a published version changed or disappeared.

## Editing skills

- Follow the [Agent Skills spec](https://agentskills.io/specification): `name` matches the folder, lowercase with hyphens; `description` under 1024 characters and says when to use the skill; `SKILL.md` under 500 lines.
- `rich-report` and `html-report` share one house style. If you change `skeleton.html` in one, copy it to the other.
- Add a new skill to `ROUTING.md`, or agents will not know when to use it (CI checks that `ROUTING.md` and `skills/` list the same skills).
- After changing any `SKILL.md`, `skills/html-report/skeleton.html` or `ROUTING.md`, run `node .github/scripts/chat-pack.mjs` to rebuild the chat pack in `adapters/chat-pack/files/`. CI fails when it is out of date.
- After changing any file in `skills/`, run `node install/node/fingerprints.mjs --write`: the Node installer keeps the fingerprints of this version's skills as they are in the repository (the npm package cannot carry a `.gitignore`), and its unit test fails when they are stale.
- The installers come in three that behave the same: `install/*.sh`, `install/*.ps1` and the Node one (`bin/makkov-harness.mjs`, `install/node/`, the standard library only). A change lands in all three, with a scenario in `install/test/`; the suites run against the Node one with `MAKKOV_IMPL=node`.
- No personal data, company names, client details, keys or machine-specific paths.

## Pull requests

- One topic per PR. Say what changed and how you checked it.
- Changes to `hooks/`, `install/` or anything that runs on users' machines get a slower, careful review.
