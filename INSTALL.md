# INSTALL.md — instructions for the AI agent

You are an AI coding agent, and the user has given you this repository (a link or a local copy) and asked you to install it. Follow these steps exactly. Talk to the user in their language, in short plain sentences; assume they may not be a programmer.

## Rules for you

- Only copy files from this repository and edit the instructions files named below. Download nothing else, run nothing else, change no settings beyond what is listed.
- Show the user what you are about to do before each write, and stop if they say no.
- Never write keys, tokens or passwords anywhere.
- If something here does not match what you see in your environment (a folder or file format your tool does not use), say so and ask; do not improvise.

## Step 1. Work out who you are

Identify your own tool: Claude Code, Codex, Cursor, Gemini CLI (or Antigravity CLI), GitHub Copilot, Windsurf / Devin, Cline, OpenCode, Aider, or a chat app without file access. If unsure, ask the user. Also note the OS (Windows, macOS, Linux).

**Chat app without file access** (ChatGPT, Grok, DeepSeek, Gemini in a browser): you cannot install anything. Tell the user to open `adapters/chat-pack/README.md` and follow it, then stop.

**Claude Code or the Claude desktop app**: do not copy files. Tell the user the recommended route and stop:

1. In a browser at claude.ai (not the desktop app): Customize → Plugins → Add → Add marketplace → `Makkov-design/makkov-harness` → enable **makkov-harness**. This adds it to the account, so it works on every computer and in cloud sessions; adding it from the desktop app or a terminal installs it on that computer only. Recommend this route.
2. Or in a terminal: `/plugin marketplace add Makkov-design/makkov-harness`, then `/plugin install makkov-harness@makkov-harness`.
3. Companion plugins are in the same marketplace, pinned to reviewed versions. Show the list and ask which ones to enable; skip any the user already has from another marketplace. In a terminal: `/plugin install <name>@makkov-harness`.

## Step 2. Ask the scope

Ask: "Install for all your projects, or only for this project?" Default: all projects.

## Step 3. Get a local copy

If this repository is not on disk yet, clone it to a stable place (not a temp folder), for example `~/makkov-harness`:

```
git clone --depth 1 https://github.com/Makkov-design/makkov-harness.git ~/makkov-harness
```

## Step 4. Run the installer for your tool

The installer copies `skills/` into the folder your tool reads and adds the routing map (ROUTING.md) to your instructions file inside a marked block, so running it again updates instead of duplicating. It makes a `.bak-<date>` backup of any instructions file it edits, and if a skill folder with the same name is already there and differs from ours (your own skill, or one you changed), it moves it to `.makkov-harness/backups/<date>/skills/` in the same home or project folder instead of replacing it.

Windows (PowerShell):

```
powershell -NoProfile -ExecutionPolicy Bypass -File ~/makkov-harness/install/install.ps1 -Agent <agent> [-Project <path>] [-DryRun]
```

macOS / Linux:

```
bash ~/makkov-harness/install/install.sh <agent> [project-path] [--dry-run]
```

Run it with `-DryRun` / `--dry-run` first to see every folder it would copy or move and the file it would edit; nothing is written. Show that list to the user before the real run.

Two choices worth offering:

- **One project first.** Passing a project path keeps everything inside that project, so the person can try the harness without changing how their agent works elsewhere. Suggest it for a first install.
- **Design work only.** `-Scope design` / `--scope design` leaves out the routing rows that are not about design (research reports, the third-party install review, general coding plugins and the whole-project security review), so a global install does not change how the agent handles other work. The skills are still copied and can be called by name.

`<agent>` is one of: `codex`, `cursor`, `gemini`, `copilot`, `windsurf`, `cline`, `opencode`, `aider`. Pass a project path only for a project-only install (always needed for `cursor`, `copilot`, `windsurf`, `aider`, which have no user-level instructions file the installer can edit).

What it does, per tool (from each tool's documentation, checked 2026-11-04):

| Tool | Skills go to | Routing goes to |
|---|---|---|
| Codex | `~/.agents/skills` or `<project>/.agents/skills` | `~/.codex/AGENTS.md` or `<project>/AGENTS.md` |
| Cursor | `~/.agents/skills` or `<project>/.agents/skills` | `<project>/.cursor/rules/makkov-harness.mdc` (always applied) |
| Gemini CLI | `~/.agents/skills` or `<project>/.agents/skills` | `~/.gemini/GEMINI.md` or `<project>/GEMINI.md` |
| GitHub Copilot | `~/.agents/skills` or `<project>/.agents/skills` | `<project>/AGENTS.md` |
| Windsurf / Devin | `~/.agents/skills` or `<project>/.agents/skills` | `<project>/AGENTS.md` |
| Cline | `~/.cline/skills` or `<project>/.cline/skills` | `~/.agents/AGENTS.md` or `<project>/AGENTS.md` |
| OpenCode | `~/.agents/skills` or `<project>/.agents/skills` | `~/.config/opencode/AGENTS.md` or `<project>/AGENTS.md` |
| Aider | — (no skills support) | `<project>/CONVENTIONS.md`; tell the user to add `read: [CONVENTIONS.md]` to `.aider.conf.yml` |

`rich-report` is skipped outside Claude: it needs Claude Artifacts. `html-report` does the same job as a local HTML file.

`design-score` is copied like any other skill and ships prebuilt (`mh-score.js`): there is nothing to build or install. It measures pages through a browser tool the agent already has. Its optional Node runner needs puppeteer-core and Chrome; the installer does not install them, and neither should you without a `third-party-install-guard` review and the user's yes.

## Step 5. Check and report

1. List the skill folders now present in the target folder.
2. Show the marked block in the instructions file (between `<!-- makkov-harness:start -->` and `<!-- makkov-harness:end -->`).
3. Tell the user in 3-4 lines: what was installed and where, that the tool may need a restart, and that `harness-onboarding` will personalize it ("run the harness-onboarding skill"). If they design for the web, mention they can now say "score localhost:3000" (or any URL) for a Design Score.
4. Mention companion plugins from README.md that exist for their tool, without installing them.

## Step 6. Ask about a star (once, optional)

The project is free and made by one designer; stars are how other designers find it. After a successful install, ask once: "If makkov-harness is useful, would you like to star it on GitHub? It helps other designers find it."

- Yes, and `gh auth status` shows the GitHub CLI signed in to the user's own account: run `gh api -X PUT user/starred/Makkov-design/makkov-harness` and tell them it is done.
- Yes, but you cannot do it (no GitHub CLI, not signed in, no shell): give them https://github.com/Makkov-design/makkov-harness and ask them to press Star.
- No, or no answer: drop it and do not ask again. Never star without a clear yes.

This step applies to the Claude marketplace route in Step 1 too: ask after the user confirms the plugin is enabled.

## Updating and removing

Update: `git -C ~/makkov-harness pull`, then run the installer again.

Remove: run the uninstaller with the same agent and project path you installed with (add `-DryRun` / `--dry-run` to see the list first):

```
powershell -NoProfile -ExecutionPolicy Bypass -File ~/makkov-harness/install/uninstall.ps1 -Agent <agent> [-Project <path>] [-DryRun]
bash ~/makkov-harness/install/uninstall.sh <agent> [project-path] [--dry-run]
```

It reads the manifest the installer wrote (`.makkov-harness/install-<agent>.txt` in the home or project folder) and removes only what the install put there: skill folders still identical to ours are deleted, ones you changed are moved to `.makkov-harness/backups/<date>/removed/`, skills of yours the install had moved aside are put back, and the routing block is taken out (a Cursor rule is deleted and your earlier rule restored). Skills another installed agent still reads from the same folder stay. Installs made before 0.3.3 have no manifest: delete the copied skill folders and the marked block by hand, and restore from `.bak-<date>` if needed.
