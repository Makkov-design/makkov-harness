<!-- Changed by makkov-harness (see NOTICE at the repository root); the original is HeyGen's, Apache-2.0. -->
# Skill installation and freshness

Read this reference when installing or updating skills, diagnosing unexpected skill behavior, or running HyperFrames setup in CI.

For a plugin installation, follow [plugin execution rules](plugin-installation.md); the plugin manager owns updates and every skill is bundled. The commands below apply only to standalone skills.

- **Core set, installed eagerly:** `/hyperframes`, `/hyperframes-cli`, `/hyperframes-registry` and `/media-use`.
- **On demand:** `/figma`, `/slideshow`, `/remotion-to-hyperframes` and `/reverse-any-video`, installed with `npx hyperframes skills update <name>`.

## What `init` does

`npx hyperframes init` installs the core set when it is missing and leaves every skill that is already installed as it is: it never refreshes, replaces or removes one. Updating is `npx hyperframes skills update`, run by you. Offline or rate-limited checks degrade gracefully and do not fail project scaffolding.

`--skip-skills` makes `init` leave skills alone. `HYPERFRAMES_SKIP_SKILLS=1` does the same for CI and tests.

`HYPERFRAMES_SKIP_SKILLS=1` also makes `skills update` (bare or named) and bare `skills` exit 0 without installing, so an install pinned to one commit stays pinned.

## Stale-skills notice

After `render`, `lint` and `validate`, the CLI prints `N HyperFrames skills out of date or missing` to stderr when the cached check finds stale skills, so an agent run without a terminal sees it too. It is off in CI, in dev, with `HYPERFRAMES_NO_UPDATE_CHECK=1` and with `HYPERFRAMES_SKIP_SKILLS=1`, and runs with `--json` too, since it only writes stderr and leaves `--json` stdout untouched.

## Diagnose and update

```bash
npx hyperframes skills check
npx hyperframes skills check --json
npx hyperframes skills update
npx hyperframes skills update <name>
npx hyperframes skills
```

- `skills check` exits non-zero when an installed skill is stale or the core set is incomplete. Skills available on demand but not installed are not failures.
- Bare `skills update` refreshes the core set and the HyperFrames skills already installed. It never removes a skill, and it leaves a skill the install record attributes to another publisher alone, even when the name matches one of ours.
- Named `skills update <name...>` also installs those named skills.
- Bare `skills` installs the full published set explicitly.

If the HyperFrames CLI is unavailable, use `npx skills add heygen-com/hyperframes --skill <name>` for one skill or `npx skills add heygen-com/hyperframes --all` for the full published set.

The CLI may print a one-line stale-skill reminder during `render`, `lint`, or `check`. Treat a failed update as a visible tool failure; do not continue from a remembered skill.

## Keep the project's CLI current

In makkov-harness the CLI is pinned: the launcher runs the release named in `scripts/cli-version.json`, the one the harness reviewed (see SECURITY.md at the repository root). Do not run `npx hyperframes@latest …` or `upgrade --project` on your own: both fetch whatever npm calls latest that day, which nobody has reviewed.

A scaffolded project also pins `hyperframes@<version>` in its `package.json` scripts. When that pin differs from the harness's release, name both versions once in the run's summary and leave the pin as it is. Change it only when the person asks, to the harness's release, then verify with `npx hyperframes check`. A passing check confirms the compositions still validate on that version, not that renders are frame-identical. If the check fails, revert the `package.json` change, continue on the project's version, and report which version the project stays on and why.
