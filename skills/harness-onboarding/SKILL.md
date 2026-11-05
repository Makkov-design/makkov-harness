---
name: harness-onboarding
description: First-run setup for makkov-harness. Use when a person has just installed this harness, says "set this up for me", "onboard me", or asks how to personalize it. Interviews them in a few short questions and writes their own private layer of instructions (language, role, tools, preferences) into the right place for their agent, without touching anything else.
---

# Harness onboarding

Turns the shared harness into the person's own setup. The shared part (skills, ROUTING.md) stays as installed; this skill adds a short personal layer on top.

## 1. Interview

Ask one question at a time, in the person's language, with suggested answers so they can reply in a word:

1. What do you mostly do? (designer, developer, product, marketing, student, other)
2. Which language should I answer you in? And for texts meant for other people (team, clients), which language?
3. Are you a programmer? (yes / a bit / no) — sets how detailed setup instructions should be.
4. Which tools do you use daily? (Figma, Notion, Linear, Jira, GitHub, Slack…) — only names, never logins or keys.
5. How do you want results delivered? (report pages, short chat answers, files)
6. Anything Claude or other agents keep getting wrong for you?

Stop early if they want to skip; use sensible defaults.

## 2. Draft the personal layer

Write 10-25 lines of plain instructions, for example:

```markdown
# Personal layer (makkov-harness)
- Answer in English; drafts for my team in German.
- I am a designer, not a programmer: give step-by-step instructions, one command per block.
- Deliver research and plans with rich-report (Claude) or html-report (other agents).
- Daily tools: Figma, Notion, Linear.
```

Rules: no secrets, tokens, emails of others, client names or company-internal details. Show the draft and get a clear yes before writing.

## 3. Write it to the right place

Pick the user-level instructions file of the agent you are running in, so it applies to all their projects:

| Agent | File |
|---|---|
| Claude Code | `~/.claude/CLAUDE.md` |
| Codex | `~/.codex/AGENTS.md` |
| Gemini CLI | `~/.gemini/GEMINI.md` |
| Others (Cursor, Copilot, Windsurf, Cline, OpenCode, Aider) | their user-level rules if they have one; otherwise the project's `AGENTS.md` and say so |

Append a clearly marked section (`# Personal layer (makkov-harness)`); never overwrite existing content. If the section already exists, update it in place. Back up the file first (`<file>.bak-<date>`).

Cloud sessions do not read the user-level file from the person's computer. Tell them: to have the layer in the cloud too, keep it in a private GitHub repository of their own and add it as a plugin marketplace in their claude.ai account (see the harness README).

## 4. Confirm

Say in 2-3 lines what was written and where, and how to change it later ("run harness-onboarding again").
