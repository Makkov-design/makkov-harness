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

The installer copies `skills/` into the folder your tool reads and adds the routing map (ROUTING.md) to your instructions file inside a marked block, so running it again updates instead of duplicating. It makes a `.bak-<date>` backup of any instructions file it edits.

Windows (PowerShell):

```
powershell -NoProfile -ExecutionPolicy Bypass -File ~/makkov-harness/install/install.ps1 -Agent <agent> [-Project <path>]
```

macOS / Linux:

```
bash ~/makkov-harness/install/install.sh <agent> [project-path]
```

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

## Step 5. Check and report

1. List the skill folders now present in the target folder.
2. Show the marked block in the instructions file (between `<!-- makkov-harness:start -->` and `<!-- makkov-harness:end -->`).
3. Tell the user in 3-4 lines: what was installed and where, that the tool may need a restart, and that `harness-onboarding` will personalize it ("run the harness-onboarding skill").
4. Mention companion plugins from README.md that exist for their tool, without installing them.

## Updating and removing

Update: `git -C ~/makkov-harness pull`, then run the installer again.
Remove: delete the copied skill folders and the marked block; restore from `.bak-<date>` if needed.
