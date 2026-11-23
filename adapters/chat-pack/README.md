# Chat pack: ChatGPT, Grok, DeepSeek, Gemini in a browser

Chat apps cannot install files, run hooks or read a skills folder. You can still give them the harness as knowledge: a project (or custom GPT, Gem, Space) with the right files and a short instruction.

## Steps

1. Create a project in your chat app (ChatGPT: Projects; Gemini: Gems; Grok and DeepSeek: whatever lets you attach files to every chat, or attach them at the start of a chat).
2. Upload files from [`files/`](files/) in this folder. Every file there has its own name, because chat apps keep a file's name but not its folder (several files all called `SKILL.md` would overwrite each other). Get them with [Download ZIP](https://github.com/Makkov-design/makkov-harness/archive/refs/heads/main.zip) (they are in `adapters/chat-pack/files/` inside it), or open a file on GitHub and press "Download raw file".
   - `ROUTING.md`
   - `html-report.md` and `html-report-skeleton.html`
   - `third-party-install-guard.md`
   - any other `<skill>.md` you want, for example `design-md-library.md` or `animate.md` (keep it to the few you use: long uploads dilute attention)

   Upload the files themselves, not the ZIP and not the folder. The pack is rebuilt from `skills/` by `.github/scripts/chat-pack.mjs`, and CI fails if it is out of date, so the files match the skills on the same branch.
3. Paste this into the project's instructions:

```text
You have the makkov-harness files attached. ROUTING.md says which skill fits which situation. When a request matches a skill, open the attached file named after the skill (the html-report skill is html-report.md) and follow it. You cannot run commands or write files: give results in chat, and for html-report give the complete HTML in one code block for me to save as a .html file. Never invent the output of a tool you do not have.
```

## What will not work in a chat app

- Hooks, installers and anything that runs commands.
- Skills that need a local program (Hyperframes rendering, ffmpeg, the install guard's scanner). The chat can still explain the steps.
- rich-report (needs Claude Artifacts), so it is not in the pack. Use html-report.
