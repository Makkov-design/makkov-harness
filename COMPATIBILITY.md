# Compatibility

Skills follow the open [Agent Skills](https://agentskills.io/specification) format (a folder with `SKILL.md`), so the same files work across agents. What differs is how they get installed and whether hooks run.

Status key: ✅ tested by hand · 📄 set up from the tool's documentation, not yet tested · ⚠️ partial · — not available

Folders and files were checked against each tool's documentation on 2026-11-04. Tools change these often; if something has moved, please open an issue.

| | Claude Code | Codex | Cursor | Gemini CLI | Copilot | Windsurf / Devin | Cline | OpenCode | Aider | Chat apps |
|---|---|---|---|---|---|---|---|---|---|---|
| Install route | plugin marketplace | installer | installer | installer | installer | installer | installer | installer | installer | chat pack |
| Status | 📄 | 📄 | 📄 | 📄 | 📄 | 📄 | 📄 | 📄 | 📄 | 📄 |
| Skills | yes | yes | yes | yes | yes | yes | yes | yes | — (conventions only) | ⚠️ as attached files |
| Routing map | auto at session start | AGENTS.md | always-on rule | GEMINI.md | AGENTS.md | AGENTS.md | AGENTS.md | AGENTS.md | CONVENTIONS.md | project instructions |
| `rich-report` | yes | — | — | — | — | — | — | — | — | — |
| `html-report` | yes | yes | yes | yes | yes | yes | yes | yes | ⚠️ | ⚠️ HTML in chat |
| Hyperframes rendering | needs Node, ffmpeg, Chrome | same | same | same | same | same | same | same | same | — |

Notes:
- Gemini CLI: Google moved unpaid and Google One users to Antigravity CLI on 2026-06-18. Its skills folder is documented as `.agents/skills`; how it reads instructions files is not yet confirmed.
- Smaller local models follow long skills less reliably than frontier models. Expect weaker results with the same files.
- The row "Status" moves to ✅ once someone runs the install end to end in that tool. Reports welcome.
