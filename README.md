# makkov-harness

**A designer's harness for AI agents.** Curated skills, a routing map that tells the agent which skill fits which situation, and companion plugins that were each checked for security before they were recommended. Works in Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, Windsurf, Cline, OpenCode and Aider, with a light version for chat apps.

[Русская версия ниже](#русский)

## What you get

| Skill | What it does |
|---|---|
| `rich-report` | Turns research, plans and audits into a designed, interactive report page (Claude Artifacts) |
| `html-report` | The same reports as one self-contained HTML file, for every other agent |
| `third-party-install-guard` | Reviews any package, plugin, skill or MCP server for malware and risky behavior **before** it is installed |
| `design-md-library` | "Make it in the style of Linear / Stripe / Notion": pulls a ready design-system write-up as a reference |
| `animate`, `animate-expo`, `animation-performance`, `improve-animations`, `find-animation-opportunities` | Motion done right, by Emil Kowalski |
| `hyperframes` + 5 helpers | HTML to video: promo clips, release videos, animated slides, by HeyGen |
| `harness-onboarding` | A few questions, then the harness is set up for you: language, role, tools |
| `ROUTING.md` | The map "situation → skill", loaded automatically in Claude and added to your instructions file elsewhere |

## Install

**Easiest: give this repository to your agent.** Paste the link and say "install this". The agent reads [`INSTALL.md`](INSTALL.md) and sets everything up for its own environment.

**Claude (desktop app, Claude Code, cloud sessions):** in a **browser**, open claude.ai → Customize → Plugins → Add → Add marketplace → `Makkov-design/makkov-harness` → enable **makkov-harness**. Once is enough: this adds it to your account, so it works on every computer you sign in on and in cloud sessions. Adding it from the desktop app installs it on that one computer only. In a terminal (also this computer only): `/plugin marketplace add Makkov-design/makkov-harness`, then `/plugin install makkov-harness@makkov-harness`.

**Other agents:** clone the repository and run `install/install.ps1 -Agent <agent>` (Windows) or `install/install.sh <agent>` (macOS, Linux). Details per tool in [`INSTALL.md`](INSTALL.md) and [`COMPATIBILITY.md`](COMPATIBILITY.md).

**Chat apps** (ChatGPT, Grok, DeepSeek, Gemini in a browser): see [`adapters/chat-pack`](adapters/chat-pack/README.md).

**Claude cloud sessions (claude.ai/code):** nothing extra is required. When a cloud session needs to render a Hyperframes video or run a Hallmark browser check and the tools are missing, the agent offers to install them (1–2 minutes, after you say yes). If you render often, paste [`cloud/setup-design-tools.sh`](cloud/setup-design-tools.sh) into your cloud environment's Setup script so the tools are ready in every session, and add `HYPERFRAMES_NO_TELEMETRY=1` to its variables. It installs pinned, reviewed versions of ffmpeg, puppeteer-core and the Hyperframes CLI.

**Updates:** your account keeps the copy it took when you added the plugin. To get a newer version, open claude.ai → Customize → Plugins → Manage marketplaces → `makkov-harness` → ⋯ → Sync, then fully quit and reopen the desktop app.

Then run `harness-onboarding` once.

## Companion plugins

Not copied here: the code stays in their authors' repositories. The makkov-harness marketplace lists them, so after adding it you can enable each one from the same list. Each entry is pinned to the exact version that was reviewed (verdicts in [`SECURITY.md`](SECURITY.md)). Newer versions show up here only after they are reviewed again. If you already have one of these from its author's own marketplace, keep that one and don't enable it here too, or its skills will load twice. Figma's plugin is in Anthropic's official marketplace.

| Plugin | For | Repository |
|---|---|---|
| Superpowers | Brainstorming before building, debugging, plans | [obra/superpowers](https://github.com/obra/superpowers) |
| interfaces | UI review: accessibility, typography, color, layout, copy | [jakubkrehel/skills](https://github.com/jakubkrehel/skills) |
| Impeccable | Creative direction, bolder or quieter, onboarding, DESIGN.md | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) |
| Hallmark | New landing pages and sites that look designed, not generated | [Nutlope/hallmark](https://github.com/Nutlope/hallmark) |
| security-audit | Whole-project security review before a launch | [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) |
| ytlens | Watch and analyze YouTube videos (frames and audio) through Gemini | [Makkov-design/ytlens](https://github.com/Makkov-design/ytlens) |

## Principles

- **Credit, don't repackage.** Other people's work is linked or, where the license allows and linking is impractical, copied unmodified with its license. See [`CREDITS.md`](CREDITS.md).
- **Checked before recommended.** Every third-party piece has a dated verdict in [`SECURITY.md`](SECURITY.md).
- **Nothing runs that you can't read.** The only hook reads `ROUTING.md` and prints it. Installers copy local files and download nothing.
- **No keys in files.** Ever.

MIT licensed. Third-party skills keep their own licenses. Not affiliated with Anthropic, OpenAI, Google, Cursor, GitHub or any other vendor named here.

---

## Русский

**Рабочая среда дизайнера для ИИ-агентов.** Подборка навыков, карта «ситуация → навык», по которой агент сам понимает, что взять, и проверенные на безопасность плагины-компаньоны. Работает в Claude Code, Codex, Cursor, Gemini CLI, GitHub Copilot, Windsurf, Cline, OpenCode и Aider, а в облегчённом виде и в чат-приложениях.

### Как поставить

**Проще всего:** дайте ссылку на этот репозиторий своему агенту и напишите «установи». Он прочитает [`INSTALL.md`](INSTALL.md) и всё настроит под себя.

**Claude** (приложение, Claude Code, облачные сессии): **в браузере** откройте claude.ai → Customize → Plugins → Add → Add marketplace → `Makkov-design/makkov-harness` → включите **makkov-harness**. Достаточно одного раза: плагин добавится в аккаунт и будет работать на всех ваших компьютерах и в облачных сессиях. Если добавить его из десктопного приложения, он встанет только на этот компьютер.

**Другие агенты:** скрипт из папки `install/`, подробности в [`INSTALL.md`](INSTALL.md).

**Чаты** (ChatGPT, Grok, DeepSeek, Gemini в браузере): инструкция в [`adapters/chat-pack`](adapters/chat-pack/README.md).

**Облачные сессии Claude:** дополнительно ничего делать не нужно. Если в облаке понадобится рендер видео Hyperframes или проверка страниц Hallmark в браузере, а инструментов нет, агент сам предложит их поставить. Это займёт 1–2 минуты и начнётся только после вашего «да». Если делаете видео часто, вставьте [`cloud/setup-design-tools.sh`](cloud/setup-design-tools.sh) в Setup script облачного окружения, чтобы инструменты были готовы в каждой сессии, и добавьте в его переменные `HYPERFRAMES_NO_TELEMETRY=1`.

**Обновления:** аккаунт хранит ту копию, которую взял при подключении. Чтобы получить новую версию, откройте claude.ai → Customize → Plugins → Manage marketplaces → `makkov-harness` → ⋯ → Sync, затем полностью закройте и снова откройте десктопное приложение.

После установки один раз запустите навык `harness-onboarding`: он задаст несколько вопросов и подстроит всё под вас.

### Что внутри

- **Отчёты:** `rich-report` (страницы в Claude) и `html-report` (HTML-файл для любого агента).
- **Безопасность:** `third-party-install-guard` проверяет любой пакет, плагин или навык до установки.
- **Стиль:** `design-md-library`, «сделай в стиле Linear».
- **Анимации:** навыки Эмиля Ковальски.
- **Видео из HTML:** Hyperframes от HeyGen.
- **Плагины-компаньоны** из таблицы выше есть в том же маркетплейсе: после его подключения каждый включается одной кнопкой. Код берётся из репозитория автора, ровно той версии, которая прошла проверку (вердикты в [`SECURITY.md`](SECURITY.md)). Если какой-то из них у вас уже стоит из маркетплейса автора, второй раз его не включайте.

Чужие работы указаны в [`CREDITS.md`](CREDITS.md), каждая со своей лицензией.
