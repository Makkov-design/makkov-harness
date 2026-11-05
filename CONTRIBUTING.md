# Contributing

Issues and pull requests are welcome. A few rules keep the harness safe for everyone who installs it.

## Adding or updating a third-party skill or plugin

1. Run the `third-party-install-guard` review on the exact version.
2. Add or update its row in `SECURITY.md` (version, date, verdict, notes) and in `CREDITS.md`.
3. Copy it into `skills/` only if its license allows it and linking is not practical; keep its `LICENSE` file in the folder. Otherwise link it from `README.md` and `ROUTING.md`.

## Updating companion pins

The `upstream-watch` workflow runs every Monday and keeps one issue, "Companion plugins: updates to review", listing pinned companions whose upstream moved on (with a compare link and how many changed files are code or hooks). It never changes a pin. To bump one: run `third-party-install-guard` on the new commit, then update its `sha` in `.claude-plugin/marketplace.json` and its row in `SECURITY.md`. The issue closes itself on the next run once every pin matches upstream.

## Editing skills

- Follow the [Agent Skills spec](https://agentskills.io/specification): `name` matches the folder, lowercase with hyphens; `description` under 1024 characters and says when to use the skill; `SKILL.md` under 500 lines.
- `rich-report` and `html-report` share one house style. If you change `skeleton.html` in one, copy it to the other.
- Add a new skill to `ROUTING.md`, or agents will not know when to use it.
- No personal data, company names, client details, keys or machine-specific paths.

## Pull requests

- One topic per PR. Say what changed and how you checked it.
- Changes to `hooks/`, `install/` or anything that runs on users' machines get a slower, careful review.
