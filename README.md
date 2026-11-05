<p align="center">
  <a href="https://makkov-design.github.io/makkov-harness/"><img src=".github/assets/banner.png" alt="makkov-harness: pick the skill by the situation. 16 skills, 6 reviewed plugins, 9 agents." width="100%"></a>
</p>

<p align="center">
  <a href="https://github.com/Makkov-design/makkov-harness/stargazers"><img src="https://img.shields.io/github/stars/Makkov-design/makkov-harness?style=flat-square&color=2f4fd8&label=stars" alt="GitHub stars"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-0b0d12?style=flat-square" alt="MIT license"></a>
  <a href="SECURITY.md"><img src="https://img.shields.io/badge/companions-reviewed%20%26%20pinned-f2b31d?style=flat-square" alt="Companion plugins reviewed and pinned"></a>
  <a href="COMPATIBILITY.md"><img src="https://img.shields.io/badge/works%20in-9%20agents-2f4fd8?style=flat-square" alt="Works in 9 agents"></a>
</p>

<p align="center">
  <b>A designer's harness for AI agents.</b><br>
  Your agent stops guessing which tool to use: a routing map picks the right skill for every situation,<br>
  results come back as designed pages, and every third-party plugin is security-reviewed before you get it.
</p>

<p align="center">
  <a href="#install-in-two-minutes"><b>Install in two minutes</b></a> &nbsp;|&nbsp;
  <a href="https://makkov-design.github.io/makkov-harness/">Website</a> &nbsp;|&nbsp;
  <a href="ROUTING.md">The routing map</a> &nbsp;|&nbsp;
  <a href="SECURITY.md">Security verdicts</a>
</p>

---

## Why designers install it

AI agents already have hundreds of skills and plugins. The hard part is getting the right one to run at the right moment, without installing something you never checked. makkov-harness solves exactly that.

- **The agent picks the right skill on its own.** A routing map loads at the start of every session and tells the agent which skill fits which situation. You say "compare these three tools", it builds a report page. You say "install this package", it reviews the package first.
- **Nothing third-party reaches your machine unchecked.** Every companion plugin was fetched without running, scanned, and had its hooks and scripts read by hand. Each one is pinned to the exact commit that passed, and a weekly check flags new upstream versions for review.
- **Results you can send as they are.** Research, comparisons, plans and audits come back as designed, interactive pages with real tables, charts and navigation, not as a wall of chat text.
- **Install once, works everywhere.** Add it in the browser once and it follows your account: the desktop app, Claude Code, cloud sessions and every computer you sign in on. Codex, Cursor, Gemini CLI and five more agents get it with one script.

<p align="center"><img src=".github/assets/compare.png" alt="Without the harness: you name the tool every time, plugins are installed blind, answers arrive as chat walls, setup per computer. With makkov-harness: the map picks the skill, every plugin reviewed and pinned, results as designed pages, install once." width="100%"></p>

## How it works

```mermaid
flowchart LR
    A["You describe the task<br/>'make a release video'"] --> B["Routing map<br/>ROUTING.md, loaded<br/>every session"]
    B --> C["The right skill<br/>hyperframes"]
    B -.-> D["Or a companion plugin<br/>Hallmark, interfaces, ..."]
    C --> E["A finished result<br/>an MP4, a report page,<br/>a reviewed install"]
    D --> E
```

No commands to memorise and no skill names to remember. The map does the matching; you keep talking about the work.

<p align="center"><img src=".github/assets/board.png" alt="The routing board: 'Compare these three tools' goes to rich-report, 'Install this package' to install-guard, 'Make it feel like Linear' to design-md-library, 'Animate this card' to animate, 'Make a release video' to hyperframes, 'Review this screen' to interfaces, 'Build a landing page' to Hallmark, 'We launch next week' to security-audit." width="100%"></p>

## What's inside

| Skill | What it does for you |
|---|---|
| `rich-report` | Turns research, plans and audits into a designed, interactive report page (Claude Artifacts) |
| `html-report` | The same reports as one self-contained HTML file, for every other agent |
| `third-party-install-guard` | Reviews any package, plugin, skill or MCP server for malware and risky behavior **before** it is installed, with a green, yellow or red verdict |
| `design-md-library` | "Make it in the style of Linear, Stripe or Notion": pulls that product's design-system write-up as a reference |
| `animate`, `animate-expo`, `animation-performance`, `improve-animations`, `find-animation-opportunities` | Motion done right, by Emil Kowalski |
| `hyperframes` + 5 helpers | HTML to video: promo clips, release videos, animated slides, by HeyGen |
| `harness-onboarding` | A few questions, then the harness is tuned to you: language, role, tools |
| `ROUTING.md` | The "situation → skill" map, loaded automatically in Claude and added to your instructions file elsewhere |

## Install in two minutes

<p align="center"><img src=".github/assets/stops.png" alt="Four stops to install: open claude.ai, paste the address Makkov-design/makkov-harness, enable makkov-harness, run onboarding." width="100%"></p>

**Claude (desktop app, Claude Code, cloud sessions).** In a **browser**, open claude.ai → Customize → Plugins → Add → Add marketplace → paste `Makkov-design/makkov-harness` → enable **makkov-harness**. Once is enough: it is added to your account, so it works on every computer you sign in on and in cloud sessions. (Adding it from the desktop app installs it on that one computer only. In a terminal, also this computer only: `/plugin marketplace add Makkov-design/makkov-harness`, then `/plugin install makkov-harness@makkov-harness`.)

**Easiest for any agent: give it this repository.** Paste the link and say "install this". The agent reads [`INSTALL.md`](INSTALL.md) and sets everything up for its own environment.

**Codex, Cursor, Gemini CLI, Copilot, Windsurf, Cline, OpenCode, Aider.** Clone the repository and run `install/install.ps1 -Agent <agent>` (Windows) or `install/install.sh <agent>` (macOS, Linux). Details per tool in [`INSTALL.md`](INSTALL.md) and [`COMPATIBILITY.md`](COMPATIBILITY.md).

**Chat apps** (ChatGPT, Grok, DeepSeek, Gemini in a browser): a lighter pack you paste in, see [`adapters/chat-pack`](adapters/chat-pack/README.md).

**Claude cloud sessions (claude.ai/code).** Nothing extra is required. When a session needs to render a Hyperframes video or run a Hallmark browser check and the tools are missing, the agent offers to install them (1–2 minutes, only after you say yes). If you render often, paste [`cloud/setup-design-tools.sh`](cloud/setup-design-tools.sh) into your cloud environment's Setup script and add `HYPERFRAMES_NO_TELEMETRY=1` to its variables. It installs pinned, reviewed versions of ffmpeg, puppeteer-core and the Hyperframes CLI.

**Updates.** Your account keeps the copy it took when you added the plugin. To get a newer version: claude.ai → Customize → Plugins → Manage marketplaces → `makkov-harness` → ⋯ → Sync, then fully quit and reopen the desktop app.

Then run `harness-onboarding` once, and you are set.

## Companion plugins, reviewed and pinned

<p align="center"><img src=".github/assets/review.png" alt="Checked before recommended: Superpowers 7.0.1 green, interfaces 1.17.0 green, Impeccable 4.8.0 yellow with telemetry on by default, Hallmark 2.0.0 green, security-audit green." width="100%"></p>

The best design plugins, in one list. Their code stays in their authors' repositories; the makkov-harness marketplace lists them, pinned to the exact version that was reviewed (verdicts in [`SECURITY.md`](SECURITY.md)), so after adding the marketplace you enable each one with one switch. A newer version appears here only after it is reviewed again. If you already have one of these from its author's own marketplace, keep that one and don't enable it here too, or its skills load twice. Figma's plugin is in Anthropic's official marketplace.

| Plugin | Use it for | By |
|---|---|---|
| Superpowers | Brainstorming before building, debugging, plans | [obra/superpowers](https://github.com/obra/superpowers) |
| interfaces | UI review: accessibility, typography, color, layout, copy | [jakubkrehel/skills](https://github.com/jakubkrehel/skills) |
| Impeccable | Creative direction: bolder or quieter, onboarding, DESIGN.md | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) |
| Hallmark | New landing pages and sites that look designed, not generated | [Nutlope/hallmark](https://github.com/Nutlope/hallmark) |
| security-audit | Whole-project security review before a launch | [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) |
| ytlens | Watch and analyze YouTube videos (frames and audio) through Gemini | [Makkov-design/ytlens](https://github.com/Makkov-design/ytlens) |

## Principles

- **Credit, don't repackage.** Other people's work is linked or, where the license allows and linking is impractical, copied unmodified with its license. See [`CREDITS.md`](CREDITS.md).
- **Checked before recommended.** Every third-party piece has a dated verdict in [`SECURITY.md`](SECURITY.md).
- **Nothing runs that you can't read.** The only hook reads `ROUTING.md` and prints it. Installers copy local files and download nothing.
- **No keys in files.** Ever.

## Like it? Star it and pass it on

If the harness saved you one wrong tool, one unchecked install or one wall of chat text, **[give it a star ⭐](https://github.com/Makkov-design/makkov-harness/stargazers)**. Stars are how other designers find it, and they tell me which direction to keep building.

- **Share it** with a designer friend or your team: the link [makkov-design.github.io/makkov-harness](https://makkov-design.github.io/makkov-harness/) explains it in one screen.
- **Ideas, bugs, a skill you want routed?** [Open an issue](https://github.com/Makkov-design/makkov-harness/issues). Pull requests are welcome: see [`CONTRIBUTING.md`](CONTRIBUTING.md).

---

<sub>MIT licensed. Third-party skills keep their own licenses. Not affiliated with Anthropic, OpenAI, Google, Cursor, GitHub or any other vendor named here.</sub>
