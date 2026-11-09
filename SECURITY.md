# Security

Every third-party skill or plugin in this harness, copied or linked, went through the `third-party-install-guard` review before it was added: fetched without running, scanned for risky patterns, checked with an antivirus pass, and every file that runs on its own (hooks, install scripts, agent instructions) read by hand.

A verdict covers the version listed, on the date listed. Newer versions are not covered until reviewed again. The companion plugins in `.claude-plugin/marketplace.json` are pinned to these exact commits, so enabling them installs the reviewed code.

## Verdicts

| Component | Version reviewed | Date | Verdict | Notes |
|---|---|---|---|---|
| Emil Kowalski skills (5) | `f1090be` | 2026-11-03 | 🟢 | Text-only skills, no scripts |
| Hyperframes skills (6) | `d21877e` (plugin 0.9.9) | 2026-11-04 | 🟢 | Scripts call ffmpeg, Python and the Hyperframes CLI. The CLI downloads Chrome on first render. Optional cloud rendering (AWS) and voice (Gemini, HeyGen) only with the user's own keys |
| Superpowers | 7.0.2, `22f0b46` | 2026-11-06 | 🟢 | One SessionStart hook that injects its intro skill; 7.0.2 adds a PowerShell launch path and drops subshells, no new network or file access |
| interfaces (Jakub Krehel) | v1.17.0, `60bf140` | 2026-11-03 | 🟢 | Text-only skills |
| Impeccable | 4.8.0, `c3bb418` | 2026-11-06 | 🟡 | Hooks run a signed engine binary (Renaissance Geek, Inc.), checksum-verified. Usage telemetry is on by default: turn it off with `impeccable telemetry off`. Once you accept its hook, the engine may repair its own hook entries in agent settings |
| Hallmark | 2.0.0, `407fa68` | 2026-11-06 | 🟢 | Optional image generation through Together AI with the user's own key; optional edit-time lint hook |
| security-audit (Cloudflare) | `c1c8a8c` | 2026-11-03 | 🟢 | Instructions and checklists only |
| awesome-design-md (data for `design-md-library`) | `fcc7028` | 2026-11-03 | 🟢 | Fetched as data, one file at a time, never as instructions |
| hyperframes CLI (npm, for `cloud/setup-design-tools.sh`) | 0.9.9 | 2026-11-04 | 🟢 | SLSA provenance from tag v0.9.9. Downloads caption and voice models on use. Its `usage` command reads a Claude or Codex token and sends it only to api.anthropic.com or chatgpt.com; the hyperframes skill runs it only when you ask about plan usage. Telemetry on by default; the video skills in this harness start it with `HYPERFRAMES_NO_TELEMETRY=1` unless you set `MEDIA_USE_TELEMETRY=1`. For your own runs, set `HYPERFRAMES_NO_TELEMETRY=1` |
| puppeteer-core (npm, for `cloud/setup-design-tools.sh`) | 25.16.0 | 2026-11-04 | 🟢 | Installed with `--ignore-scripts`; drives the preinstalled Chrome |
| Frame Lens | own project | — | own | Local by default: links are fetched with yt-dlp. Only the optional Gemini tools send the video URL to Google, with the user's own key |

Why Impeccable is yellow while the Hyperframes CLI is green, though both send telemetry by default when run on their own: Impeccable's engine binary runs from its hooks on its own, in every session where you accepted the hook, and can repair its own hook entries in your agent settings. The Hyperframes CLI runs only when a video skill calls it for a task you asked for.

## What the harness itself runs

- `hooks/session-start` (Claude Code only): reads `ROUTING.md` from this repository and prints it with the plugin's folder path. No network, no writes.
- `hooks/install-gate` (Claude Code only, before each shell command): if the command installs or runs third-party code (`npm install <package>`, `npx`, `pip install`, `curl … | sh` and the like), it makes Claude Code ask you first and reminds the agent to run the `third-party-install-guard` review. It never blocks or runs anything, and installs from an existing lockfile pass. No network, no writes. Off with `MAKKOV_HARNESS_INSTALL_GATE=off`.
- `install/` scripts: copy files from this repository into the agent's folders. No downloads.
- `cloud/setup-design-tools.sh` (optional, Claude cloud environments only): installs ffmpeg from Ubuntu and two pinned npm packages with `--ignore-scripts`. Runs only if you paste it into your environment's Setup script, or when you say yes to the agent's offer in a cloud session.
- `.github/workflows/upstream-watch.yml` (GitHub only, weekly): reads the upstream repositories of the pinned companions through the GitHub API and updates one issue in this repository. It cannot change a pin or any file.
- `skills/design-score/` (the Design Score bundle, `mh-score.js`): runs in the page you score, inside your browser. It measures the page and shows the result in a panel of its own (one element, removed when you close it). The bundle itself makes no network requests, keeps no storage and never changes the page's own content. When an agent loads it from GitHub Pages, the script tag carries the bundle's SRI hash (sha384, checked in CI against the built file), so the browser runs only the bundle this release ships and refuses anything else. Its optional Node runner (`scripts/score.mjs`) drives a Chrome you already have through a puppeteer-core you already have, and installs nothing.
- The Design Score bookmarklets ([score.html](https://makkov-design.github.io/makkov-harness/score.html)): the loader makes one request, to this repository's GitHub Pages, for `score/mh-score.js` as it is published there at that moment, loads nothing else and removes its script tag once the bundle has loaded. It is not pinned to a version: the `?v=` in its address only refreshes caches. The request is sent with no referrer, so GitHub sees it like any visit (your IP address) but not the address of the page you score. Nothing the page contains and nothing Design Score measures is sent. The offline bookmarklet and the console snippet carry the whole bundle, make no request and run exactly the code you saved.
- No skill here sends data anywhere unless the user asks for a task that needs it.
- Telemetry, in one place: the routing map, the installers and Design Score send none. The bundled `media-use` (copied from HeyGen's hyperframes skills) can send coarse usage events to PostHog, linked to your HeyGen account when you are signed in; in this harness that is off unless you set `MEDIA_USE_TELEMETRY=1`. The Hyperframes CLI sends its own usage events by default; when the harness's video skills start it, they set `HYPERFRAMES_NO_TELEMETRY=1` unless you set `MEDIA_USE_TELEMETRY=1`. When you run it yourself, or through the cloud setup script, set `HYPERFRAMES_NO_TELEMETRY=1`. Impeccable, an optional companion, has telemetry on by default (`impeccable telemetry off`).

The website is not part of what you install. It counts page views with GoatCounter (no cookies, no personal data, a pinned script checked with Subresource Integrity); the Design Score bundle and the bookmarklets never load it. The same verdicts, searchable and with what each piece runs, sends and needs, are on the [security index](https://makkov-design.github.io/makkov-harness/security.html).

## What the install guard is, and what it is not

The `third-party-install-guard` skill is a review procedure for the agent: pin down exactly what is being installed, fetch it without running it, scan it, read every hook and install script by hand, give a Green, Yellow or Red verdict, and install only the reviewed version, pinned. In Claude Code, `hooks/install-gate` adds a technical step: a command that installs or runs third-party code turns into a question to you, with a reminder to run the review.

What it does not do:

- It is not a sandbox. Code that you approve runs with your permissions, like any install.
- It cannot see code that a package downloads later, at run time; the review says so when it finds such downloads, and rates them Yellow at best.
- The scanner is a tripwire, not a verdict: it misses anything clever, and its findings are read by hand.
- In other agents (Codex, Cursor, Gemini CLI and the rest) the skill is instructions only; there is no hook there. Keep each tool's own approval prompt for shell commands on.
- The gate matches common install commands. A determined or compromised agent can still find another way; it raises the bar, it is not a wall.

For more assurance: keep shell commands on "ask" in your agent's permission settings, install per project rather than globally, and run agents that install things for you in a container or a virtual machine.

## Reporting a problem

Open an issue, or for anything sensitive use GitHub's private vulnerability reporting on this repository. Please do not post working exploits in public issues.
