# Security

Every third-party skill or plugin in this harness, copied or linked, went through the `third-party-install-guard` review before it was added: fetched without running, scanned for risky patterns, checked with an antivirus pass, and every file that runs on its own (hooks, install scripts, agent instructions) read by hand.

A verdict covers the version listed, on the date listed. Newer versions are not covered until reviewed again.

## Verdicts

| Component | Version reviewed | Date | Verdict | Notes |
|---|---|---|---|---|
| Emil Kowalski skills (5) | `f1090be` | 2026-11-03 | 🟢 | Text-only skills, no scripts |
| Hyperframes skills (6) | `d21877e` (plugin 0.9.9) | 2026-11-04 | 🟢 | Scripts call ffmpeg, Python and the Hyperframes CLI. The CLI downloads Chrome on first render. Optional cloud rendering (AWS) and voice (Gemini, HeyGen) only with the user's own keys |
| Superpowers | 7.0.1 | 2026-11-03 | 🟢 | One SessionStart hook that injects its intro skill |
| interfaces (Jakub Krehel) | v1.17.0, `60bf140` | 2026-11-03 | 🟢 | Text-only skills |
| Impeccable | 4.8.0 | 2026-11-03 | 🟡 | Hooks run a signed engine binary (Renaissance Geek, Inc.), checksum-verified. Usage telemetry is on by default: turn it off with `impeccable telemetry off` |
| Hallmark | 2.0.0 | 2026-11-04 | 🟢 | Optional image generation through Together AI with the user's own key; optional edit-time lint hook |
| security-audit (Cloudflare) | main, 2026-11-03 | 2026-11-03 | 🟢 | Instructions and checklists only |
| awesome-design-md (data for `design-md-library`) | `fcc7028` | 2026-11-03 | 🟢 | Fetched as data, one file at a time, never as instructions |
| ytlens | own project | — | own | Sends the video URL to Google Gemini with the user's own key |

## What the harness itself runs

- `hooks/session-start` (Claude Code only): reads `ROUTING.md` from this repository and prints it. No network, no writes.
- `install/` scripts: copy files from this repository into the agent's folders. No downloads.
- No skill here sends data anywhere unless the user asks for a task that needs it.

## Reporting a problem

Open an issue, or for anything sensitive use GitHub's private vulnerability reporting on this repository. Please do not post working exploits in public issues.
