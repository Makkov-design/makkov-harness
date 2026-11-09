# Credits

makkov-harness is a curated distribution. Most of its value comes from other people's work; this file says whose.

## Included in this repository (copied under their licenses)

| Skills | Author | License | Source and version |
|---|---|---|---|
| `animate`, `animate-expo`, `animation-performance`, `improve-animations`, `find-animation-opportunities` | Emil Kowalski | MIT | [emilkowalski/skills](https://github.com/emilkowalski/skills) at `f1090be` |
| `hyperframes`, `hyperframes-cli`, `hyperframes-registry`, `media-use`, `slideshow`, `style-sampling` | HeyGen | Apache-2.0 | [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) at `d21877e` |

Each of these folders carries the original `LICENSE`. The motion skills are unmodified. The HyperFrames skills are the upstream copy plus a few changes of ours (the reviewed CLI pinned, sound effects through the harness audio engine, optional Openverse keys, usage telemetry off by default); [`NOTICE`](NOTICE) lists every changed file, and each one says so at the top. They are copied because their upstream repositories are too large to sync as a plugin marketplace (Hyperframes is about 530 MB) or ship many unrelated skills.

## Linked, not copied (install from the authors)

| Plugin | Author | License | Repository |
|---|---|---|---|
| Superpowers | Jesse Vincent | MIT | [obra/superpowers](https://github.com/obra/superpowers) |
| interfaces (better-* skills) | Jakub Krehel | MIT | [jakubkrehel/skills](https://github.com/jakubkrehel/skills) |
| Impeccable | Paul Bakaus | Apache-2.0 | [pbakaus/impeccable](https://github.com/pbakaus/impeccable) |
| Hallmark | Hallmark contributors | MIT | [Nutlope/hallmark](https://github.com/Nutlope/hallmark) |
| security-audit | Cloudflare | MIT | [cloudflare/security-audit-skill](https://github.com/cloudflare/security-audit-skill) |
| Frame Lens | Makkov | MIT | [Makkov-design/framelens](https://github.com/Makkov-design/framelens) |

## Data and inspiration

- `design-md-library` fetches design-system write-ups from [VoltAgent/awesome-design-md](https://github.com/VoltAgent/awesome-design-md) (MIT) at runtime; nothing from it is stored here.
- The session-start routing hook follows the approach of Superpowers' own session-start hook (MIT).
- The report house style is inspired by Linear's visual language; it is not affiliated with Linear.
- Design Score converts colours with the matrices published in [CSS Color Module Level 4](https://www.w3.org/TR/css-color-4/) and measures colour distance in Björn Ottosson's [OKLab](https://bottosson.github.io/posts/oklab/). Its contrast, target-size and zoom checks follow [WCAG 2.2](https://www.w3.org/TR/WCAG22/). "Lighthouse for design" is a comparison; Design Score is not part of or affiliated with Google Lighthouse.

## Own work

`design-score` (the probe, the panel, the rubric and the runner), `rich-report`, `html-report`, `third-party-install-guard`, `design-md-library`, `harness-onboarding`, `ROUTING.md`, the hooks, the adapters and the website are by Makkov, MIT.

## Agent logos on the site

The agent and product logos on the website show where the harness runs. The SVGs come from [Simple Icons](https://simpleicons.org) (CC0), [Lobe Icons](https://github.com/lobehub/lobe-icons) (MIT; Cursor, Cline, OpenCode, DeepSeek) and Aider's own repository (Apache-2.0). The names and marks belong to their owners.

Not affiliated with or endorsed by Anthropic, OpenAI, Google, Cursor, GitHub or any other vendor named here.
