# Chat pack: ChatGPT, Grok, DeepSeek, Gemini in a browser

Chat apps cannot install files, run hooks or read a skills folder. You can still give them the harness as knowledge: a project (or custom GPT, Gem, Space) with the right files and a short instruction.

## Steps

1. Create a project in your chat app (ChatGPT: Projects; Gemini: Gems; Grok and DeepSeek: whatever lets you attach files to every chat, or attach them at the start of a chat).
2. Upload these files from this repository:
   - `ROUTING.md`
   - `skills/html-report/SKILL.md` and `skills/html-report/skeleton.html`
   - `skills/third-party-install-guard/SKILL.md`
   - any other `skills/<name>/SKILL.md` you want (keep it to the few you use: long uploads dilute attention)
3. Paste this into the project's instructions:

```text
You have the makkov-harness files attached. ROUTING.md says which skill fits which situation. When a request matches a skill, open that skill's SKILL.md from the attached files and follow it. You cannot run commands or write files: give results in chat, and for html-report give the complete HTML in one code block for me to save as a .html file. Never invent the output of a tool you do not have.
```

## What will not work in a chat app

- Hooks, installers and anything that runs commands.
- Skills that need a local program (Hyperframes rendering, ffmpeg, the install guard's scanner). The chat can still explain the steps.
- rich-report (needs Claude Artifacts). Use html-report.
