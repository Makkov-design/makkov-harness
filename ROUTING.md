# makkov-harness routing

Pick the skill by the situation. A skill named here can be invoked by name even when its description is missing from your skill list. If a skill or plugin is not installed in this agent, say so in one line and continue without it; never invent its output.

## Skills in this repository

| Situation | Skill | Notes |
|---|---|---|
| Research, analysis, comparison, plan, roadmap, audit or any result with 3+ sections or a data table | `rich-report` (Claude with Artifacts) or `html-report` (any agent) | One page per topic; a follow-up on the same topic edits the same page or file |
| Installing, adding, cloning-and-running or wiring in anything third-party: packages, CLIs, plugins, skills, MCP servers, extensions, Actions, Docker images, binaries | `third-party-install-guard` | Always before the install; the user does not have to ask |
| "Make it in the style of Linear / Stripe / Notion…", comparing visual languages of known products | `design-md-library` | Style reference only; a project's own design system always wins |
| A design score: "score / rate / grade this page", "how good is this UI", before → after a round of fixes, a README badge; "steal / extract this site's design tokens" | `design-score` | Only when a number or the tokens are wanted; a plain review is interfaces. Measured in a real page, judged only from a screenshot or Figma frame; fixes go to interfaces and animate, one category at a time |
| Building an animation, adding motion, a transition | `animate` (web) or `animate-expo` (React Native / Expo) | |
| Janky or dropped-frame animation, choosing which property to animate | `animation-performance` | |
| Auditing all motion in a codebase, roadmap of animation fixes | `improve-animations` | Plans, does not edit |
| "What could be animated here?" | `find-animation-opportunities` | Read-only |
| Promo video, release clip, animated slides from HTML | `hyperframes` first, then `hyperframes-cli`, `hyperframes-registry`, `media-use`, `slideshow`, `style-sampling` as it directs | Rendering is heavy: one render at a time |
| First run of this harness for a new person, or "set this up for me" | `harness-onboarding` | Builds the person's own private layer |

## Companion plugins (enabled separately; Claude users find them in the makkov-harness marketplace)

| Situation | Plugin | Where from |
|---|---|---|
| Any new feature or creative work before code; debugging; plans | Superpowers (`brainstorming`, `systematic-debugging`, `writing-plans`, `verification-before-completion`) | github.com/obra/superpowers |
| UI review and correctness: accessibility, typography, color, layout, UI copy, states | interfaces (`better-interface`, `better-*`, `build-design`) | github.com/jakubkrehel/skills |
| Creative direction: shaping a feature, bolder or quieter, onboarding, empty states, DESIGN.md | Impeccable (`/impeccable …`) | github.com/pbakaus/impeccable |
| New landing page, promo page, personal site | Hallmark (`/hallmark`, `/hallmark redesign <path>`, `/hallmark audit <path>`) | github.com/Nutlope/hallmark |
| Whole-project security review before a launch | security-audit | github.com/cloudflare/security-audit-skill |
| Figma: design to code, code to Figma | Figma plugin and connector | Figma's official plugin |
| Analyze, summarize or transcribe a YouTube video | ytlens | github.com/Makkov-design/ytlens (needs the user's own Gemini key) |

## Rules of thumb

- Never run two audits of the same screen: interfaces covers correctness, Impeccable covers creative direction.
- Hallmark builds new pages; it touches an existing design only when the user names `/hallmark redesign` or `/hallmark audit`.
- Keys, tokens and passwords never go into files, chats or commits.
- Sound for any edited or generated video: real recordings from Openverse first (through `media-use`, CC0 / CC BY, credits kept), generated sound only for gaps. Optional `OPENVERSE_CLIENT_ID` / `OPENVERSE_CLIENT_SECRET` in the environment raise the limits.
- Claude cloud session (`CLAUDE_CODE_REMOTE=true`) and a task needs a Hyperframes MP4 render or a Hallmark browser check, but `ffmpeg`, `hyperframes` or a global `puppeteer-core` is missing: tell the user in one line that the tools are missing and installing them takes 1–2 minutes, then ask. On yes, run `bash <plugin path>/cloud/setup-design-tools.sh` (the plugin path is given at session start) and report its `[design-tools]` lines. Install nothing else and change no versions. If the script is not available, say that pasting it into the environment's Setup script makes it permanent. Suggest that too once it ran, for people who render often.
