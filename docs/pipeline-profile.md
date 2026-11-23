# Pipeline profile: makkov-harness

How changes to this repository are built, checked and shipped. It records only what the repository already
states (CONTRIBUTING.md, `.github/`, CHANGELOG.md); for anything not here, follow CONTRIBUTING.md.

## What the repository is

Markdown skills, a routing map, two Claude Code hooks, installers and a static site (`docs/`, GitHub Pages).
No service runs. Anything that runs on a user's machine (`hooks/`, `install/`) gets a slower, careful review.

## Checks

| What | Command | Where it runs in CI (`.github/workflows/check.yml`) |
|---|---|---|
| Plugin, skills, links, key scan, site | `node .github/scripts/check.mjs` | ubuntu |
| Unit tests and Design Score fixtures | `node --test $(find skills hooks -name '*.test.mjs' -not -path '*/node_modules/*')` | ubuntu (puppeteer-core in a temp folder) |
| Install gate hook | `node --test hooks/install-gate.test.mjs` | ubuntu, macOS (bash 3.2), Windows |
| Installers, bash | `bash install/test/test-install.sh` | ubuntu, macOS |
| Installers, PowerShell | `./install/test/test-install.ps1` | Windows, in Windows PowerShell 5.1 and PowerShell 7 |

Shell code must run in macOS's bash 3.2 and BSD tools (no `mapfile`, no associative arrays, no `sed -i`,
no GNU-only `grep` syntax). PowerShell code must run in 5.1 and 7.

## Changes

- One topic per pull request, using `.github/pull_request_template.md`.
- CHANGELOG.md: entries go under `## [Unreleased]` at the top; the version and its date are set at release,
  together with `.claude-plugin/plugin.json` and `marketplace.json`.
- Third-party skills and plugins: `third-party-install-guard` review, then SECURITY.md and CREDITS.md.
- No personal data, company names, keys or machine-specific paths anywhere (the key scan checks for keys).

## Installers

`install/install.sh` and `install/install.ps1` are twins, and so are the uninstallers and `install/lib.sh` /
`install/lib.ps1`: a behaviour change lands in both, with a scenario in both `install/test/test-install.sh` and
`install/test/test-install.ps1`. The tests never touch the real home folder: every scenario runs in a fresh
temporary home and project. `install/test/legacy-0.5.0/` holds the released 0.5.0 installers, so a manifest
written by a released version is checked to still update and uninstall cleanly.

Lessons from past changes: [lessons.md](lessons.md).
