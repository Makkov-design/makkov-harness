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
| `design-score`, measured | browser tool or Node runner | browser MCP or Node runner | same | same | same | same | same | same | — | ⚠️ judged only, or paste the bookmarklet's fix prompt |
| Hyperframes rendering | needs Node, ffmpeg, Chrome | same | same | same | same | same | same | same | same | — |

Notes:
- Gemini CLI: Google moved unpaid and Google One users to Antigravity CLI on 2026-06-18. Its skills folder is documented as `.agents/skills`; how it reads instructions files is not yet confirmed.
- Claude cloud sessions: Hyperframes rendering and Hallmark's browser checks need the tools from `cloud/setup-design-tools.sh`. The agent offers to run it on demand (after the user agrees). Pasting it into the environment's Setup script makes the tools ready in every session. Tested in WSL Ubuntu 24.04 (npm install, `hyperframes --version`, Hallmark render check); a real cloud run and an actual video render are not tested yet.
- Design Score: a measured score needs a tool that runs JavaScript in the page (Claude in Chrome, the Claude app's built-in browser, Playwright MCP, Chrome DevTools MCP), or the optional Node runner with an already-installed puppeteer-core. Without one, the skill asks you to click the bookmarklet and paste its fix prompt, or scores the judged criteria from a screenshot and says nothing was measured. People can always use the bookmarklet or the console snippet in a desktop browser, no agent needed. Not yet tested end to end in each agent.
- Smaller local models follow long skills less reliably than frontier models. Expect weaker results with the same files.
- The row "Status" moves to ✅ once someone runs the install end to end in that tool. Reports welcome.
