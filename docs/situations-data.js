// Find your situation: every row is [situation, what it does, skill, how to call it, example prompt]
// Sources: harness = ships in makkov-harness, companion = reviewed plugin in its marketplace,
// claude = built into Claude / Claude Code, plugin = an official plugin (Figma, product-management).
window.SITUATIONS = {
  habits: [
    ['New feature? Talk it through first', '/superpowers:brainstorming', 'before the first line of code'],
    ['Screen is ready? Audit it', '/interfaces:better-interface', 'every dimension in one pass'],
    ['Figma link? Just paste it', 'figma-design-to-code', 'the Figma skills start on their own'],
    ['Before a PR? Review', '/code-review', 'plus /interfaces:interface-review'],
    ['Installing something? Check it', 'install-guard', 'runs on its own, keep it on'],
    ['Want a number? Score it', 'design-score', '0–100, every point explained']
  ],
  groups: [
    { id: 'start', title: 'Starting a task', note: 'No code yet: figure out what you are building and plan it.', rows: [
      ['A feature idea, but nothing is clear yet', 'Asks one question at a time, offers 2–3 approaches, then writes a spec', 'superpowers:brainstorming', '/superpowers:brainstorming', 'I want a saved-filters feature for our dashboard. Help me shape it before we write code.'],
      ['Big task, I want a step-by-step plan', 'Breaks the work into small, checkable steps', 'superpowers:writing-plans', '/superpowers:writing-plans', 'Write a plan to move our settings page to the new design system, with a check after every step.'],
      ['The plan is ready, time to execute', 'Follows the plan with a check after every step', 'superpowers:executing-plans', '/superpowers:executing-plans', 'Execute plan.md step by step and stop if a check fails.'],
      ['A product idea that needs a sparring partner', 'Works through the problem, hypotheses and risks like a PM', 'product-management:brainstorm', '/product-management:brainstorm', 'Pressure-test this idea: a Figma plugin that writes UI copy. Who pays, and what kills it?'],
      ['I need a spec or PRD', 'A feature spec with requirements and acceptance criteria', 'product-management:write-spec', '/product-management:write-spec', 'Write a PRD for dark mode in our mobile app, with acceptance criteria.'],
      ['A new landing page, promo page or site', '51 themes and 21 page structures without the AI look; a linter checks every edit', 'hallmark', '/hallmark', 'Build a landing page for my type foundry. Calm, editorial, one strong signup action.'],
      ['Redo an existing page', 'A full redesign that keeps the content; only when you ask for it', 'hallmark redesign', '/hallmark redesign', '/hallmark redesign site/index.html'],
      ['Design the UX before code', 'Thinks through flows and screens before anything is built', 'impeccable shape', '/impeccable shape', 'Shape the checkout flow for a one-product store before we design screens.']
    ]},
    { id: 'review', title: 'Audit and polish', note: 'The screen exists: find the problems and finish it properly.', rows: [
      ['Full audit of a screen or flow', 'Accessibility, layout, copy, type, colour and details in one prioritised report', 'interfaces:better-interface', '/interfaces:better-interface', 'Audit the onboarding screens in src/onboarding and fix the top issues.'],
      ['Score a page or screen 0–100', 'Measures the live page in seven categories, explains every point it takes off and writes a fix prompt', 'design-score', 'Say “score …”', 'Score localhost:3000 at desktop and phone width and list the top five fixes.'],
      ['Score it, fix it, score again', 'Fixes one category at a time with interfaces and animate, then scores again: before → after', 'design-score', 'Say “score and fix …”', 'Score localhost:3000 and fix the top issues, then show me the before → after.'],
      ['Check my changes before a PR', 'Finds the interface problems this branch introduced', 'interfaces:interface-review', '/interfaces:interface-review', '/interfaces:interface-review on this branch'],
      ['Accessibility: keyboard, focus, ARIA', 'Checks and fixes against WCAG 2.2', 'interfaces:better-accessibility', '/interfaces:better-accessibility', 'Make the modal and the dropdown fully keyboard accessible.'],
      ['Spacing, alignment, responsive', 'Grouping, reading order, mobile, RTL', 'interfaces:better-layout', '/interfaces:better-layout', 'The pricing cards break at 768px. Fix the layout and the spacing rhythm.'],
      ['Fonts and typography', 'Type scale, spacing, wrapping, truncation', 'interfaces:better-typography', '/interfaces:better-typography', 'Set a proper type scale for the blog and fix the orphans in headings.'],
      ['Colour, palette, contrast', 'Palettes, tokens, format conversion, contrast checks', 'interfaces:better-colors', '/interfaces:better-colors', 'Turn our five hex colours into an OKLCH token scale that passes AA.'],
      ['Steal a site’s design tokens', 'Its palette, fonts, type scale, spacing, radii and shadows as DESIGN.md, CSS variables, a Tailwind theme or tokens JSON', 'design-score', 'Say “steal the style of …”', 'Steal the design tokens of the page I have open and save them as DESIGN.md and CSS variables.'],
      ['Small details: shadows, radii, icons', 'Exact values for polishing surfaces', 'interfaces:better-ui', '/interfaces:better-ui', 'The cards look flat and cheap. Give me exact shadow, radius and border values.'],
      ['Heuristic UX review', 'A design review scored against heuristics', 'impeccable critique', '/impeccable critique', 'Critique the signup flow against usability heuristics and score it.'],
      ['Final polish before release', 'One last quality pass', 'impeccable polish', '/impeccable polish', 'Polish the release page: alignment, states, the last 5%.'],
      ['Too dull, or too loud', 'Makes it bolder or quieter', 'impeccable bolder · quieter', '/impeccable bolder', 'The hero feels timid. Make it bolder without new colours.'],
      ['Add motion with a purpose', 'Motion only where it helps', 'impeccable animate', '/impeccable animate', 'Add purposeful motion to the dashboard: what changed, where to look.'],
      ['Onboarding and empty states', 'First run, empty screens, activation', 'impeccable onboard', '/impeccable onboard', 'Design the empty state for a project list with zero projects.']
    ]},
    { id: 'states', title: 'Variants, states, stress tests', note: 'These run only when you call them; they never start on their own.', rows: [
      ['Several versions of a component', 'Builds variants side by side and helps you pick', 'interfaces:variant', '/interfaces:variant', '/interfaces:variant the pricing card, three directions'],
      ['See every state of a component', 'A temporary page with a switcher: loading, error, empty, lots of data', 'interfaces:state-machine', '/interfaces:state-machine', '/interfaces:state-machine for the file uploader'],
      ['Will it break on bad data?', 'Long names, empty fields and errors on one page', 'interfaces:break', '/interfaces:break', '/interfaces:break the user profile card'],
      ['How is someone else’s effect built?', 'Breaks it down from a link or screenshot and explains the recipe', 'interfaces:explain-interface', '/interfaces:explain-interface', '/interfaces:explain-interface how does the hover on linear.app/features work?'],
      ['Pick a variant right in the browser', 'Click an element, get alternatives', 'impeccable live', '/impeccable live', '/impeccable live, then click the header']
    ]},
    { id: 'motion', title: 'Motion', note: 'Emil Kowalski’s skills: from the idea of a motion to a smooth 60 fps.', rows: [
      ['A web animation from scratch', 'Whether it is needed, its purpose, properties, curve and duration', 'animate', 'Say “animate …”', 'Animate the toast: enter from the bottom, stack, swipe to dismiss.'],
      ['Motion in React Native or Expo', 'The same for mobile: thread, spring or timing', 'animate-expo', 'Say “animate in Expo …”', 'Animate the bottom sheet in Expo with a spring that feels native.'],
      ['Audit every animation in the project', 'Prioritised problems and a fix plan', 'improve-animations', 'Say “review the animations”', 'Review every animation in this repo and give me a fix plan.'],
      ['The animation stutters', 'Finds why frames drop and how to smooth it', 'animation-performance', 'Say “why does it stutter”', 'The sidebar drops frames when it opens. Why, and how do I fix it?'],
      ['Where is motion missing?', 'Finds spots for motion with exact values; does not implement', 'find-animation-opportunities', 'Say “where should I add motion”', 'Where should this settings page have motion? Give exact values.']
    ]},
    { id: 'write', title: 'Interface copy', note: 'Labels, errors, empty screens.', rows: [
      ['Rewrite a screen’s copy', 'One voice, clear next steps', 'interfaces:better-writing', '/interfaces:better-writing', 'Rewrite the billing page copy: shorter, one voice, clear next steps.'],
      ['Improve errors and labels', 'A quick copy pass', 'impeccable clarify', '/impeccable clarify', 'Make the form errors say what went wrong and how to fix it.']
    ]},
    { id: 'figma', title: 'Figma', note: 'Usually it is enough to paste the link and describe the task.', rows: [
      ['Build a screen from a mockup', 'Turns the mockup into code with the project’s tokens and components', 'figma:figma-design-to-code', 'Paste the frame link', '<figma frame link> Build this screen with our existing components.'],
      ['Pixel-close from an image or mockup', 'Builds and checks it side by side with the design', 'interfaces:build-design', '/interfaces:build-design', '/interfaces:build-design from mock.png, check it side by side'],
      ['Move a screen from code into Figma', 'Assembles the screen in Figma from design-system components', 'figma:figma-generate-design', '/figma:figma-generate-design', 'Push the settings page into my Figma file using our library.'],
      ['A component library in Figma', 'Variables, tokens and variants from code', 'figma:figma-generate-library', '/figma:figma-generate-library', 'Build a Figma library from tokens.css: variables, light and dark modes.'],
      ['A diagram or flow in FigJam', 'A diagram from a description', 'figma:figma-generate-diagram', '/figma:figma-generate-diagram', 'Draw our signup flow in FigJam, with the error branches.'],
      ['A component spec for developers', 'Component documentation from Figma', 'figma:figma-spec', '/figma:figma-spec', '<figma component link> Write the dev spec for this button.']
    ]},
    { id: 'research', title: 'Research and reports', note: 'Any result with 3+ sections comes back as a designed page on its own.', rows: [
      ['Research a topic in depth', 'Several researchers in parallel, a sourced report', 'deep-research', 'Say “deep research on …”', 'Do deep research on how design tools price AI features in 2026.'],
      ['A polished report page', 'Analysis, comparison or plan as an interactive page', 'rich-report', 'Runs on its own', 'Compare Framer, Webflow and Hallmark for a portfolio site.'],
      ['A concept in a known product’s style', 'Takes that system’s DESIGN.md (Linear, Stripe, Notion and 81 more)', 'design-md-library', 'Say “in the style of …”', 'Mock up our pricing page in the style of Stripe.'],
      ['Compare visual languages', 'A table: accent, neutrals, type, radii, density', 'design-md-library', 'Say “compare styles”', 'Compare the visual languages of Linear and Notion.'],
      ['Competitor breakdown', 'Positioning, features, weak spots', 'product-management:competitive-brief', '/product-management:competitive-brief', 'Competitive brief: our app against Things and Todoist.'],
      ['Synthesise interviews and feedback', 'Themes, insights and quotes from research', 'product-management:synthesize-research', '/product-management:synthesize-research', 'Synthesise these 8 interview notes into themes with quotes.'],
      ['Break down a YouTube video', 'Gets a text transcript on your computer (subtitles, else local Whisper), writes notes', 'yt-dlp + Whisper', 'Paste the link', '<youtube link> Break down the design techniques in this talk.'],
      ['A chart or dashboard', 'The right chart type and colours', 'dataviz', 'Runs on its own', 'Chart our weekly signups by channel for the last quarter.'],
      ['An update for the team or leadership', 'A status update in the right format', 'product-management:stakeholder-update', '/product-management:stakeholder-update', 'Write this week’s design status update for leadership.']
    ]},
    { id: 'docs', title: 'Docs and decks', note: 'Files to send and work on together.', rows: [
      ['A doc to read and comment on', 'A living doc that exports to Word, PDF, Markdown', 'docs', 'Say “make a doc”', 'Make a doc: design principles for our team, one page.'],
      ['A presentation', '16:9 slides that download as PPTX or PDF', 'pptx · slides', 'Say “make a deck”', 'Make a 10-slide deck about our redesign results.'],
      ['A promo or release video', 'HTML animation rendered to MP4; one heavy render at a time', 'hyperframes', '/hyperframes', 'Make a 20-second release video for version 2.0, vertical and horizontal.'],
      ['A Word, Excel or PDF file', 'Creates and edits files in these formats', 'docx · xlsx · pdf', 'Name the format', 'Turn this audit into a PDF I can attach to an email.']
    ]},
    { id: 'code', title: 'Code and checks', note: 'For vibe coding: built-in Claude Code commands that work everywhere.', rows: [
      ['Find bugs in my changes', 'Reviews the diff for bugs, levels low to max', 'code-review', '/code-review high', '/code-review high'],
      ['Simplify the code', 'Removes clutter and duplication; does not hunt bugs', 'simplify', '/simplify', '/simplify'],
      ['Security-check my changes', 'Looks for vulnerabilities in the current diff', 'security-review', '/security-review', '/security-review'],
      ['Something broke and I don’t know why', 'Traces the cause step by step instead of guessing', 'superpowers:systematic-debugging', '/superpowers:systematic-debugging', 'The build passes locally but the page is blank on Vercel. Find the cause.'],
      ['Make sure it really works', 'Runs the app and looks at it', 'run', '/run', '/run and show me the new modal open'],
      ['Before saying “done”', 'Evidence before claiming it is finished', 'superpowers:verification-before-completion', '/superpowers:verification-before-completion', 'Verify the form actually submits before calling it done.'],
      ['A project brief for Claude', 'Creates CLAUDE.md with the project’s rules', 'init', '/init', '/init'],
      ['The project’s design description', 'Creates DESIGN.md from the code', 'impeccable document', '/impeccable document', '/impeccable document']
    ]},
    { id: 'safety', title: 'Security and installs', note: 'Anything third-party gets checked first.', rows: [
      ['Install a package, plugin or skill', 'Checked without running it: scanner, antivirus, manual read, verdict', 'third-party-install-guard', 'Runs on its own', 'Install framer-motion in this project.'],
      ['Security-check the whole project before launch', 'Leaked keys, access to others’ data, auth. Expensive: on request only', 'security-audit', 'Say “security-audit”', 'Security-audit the project before we launch on Monday.']
    ]},
    { id: 'session', title: 'Session and setup', note: 'So long sessions keep their quality.', rows: [
      ['The conversation got long', 'Compresses the history, keeps what matters', 'compact', '/compact', '/compact keep the design decisions'],
      ['A new task in the same session', 'Start with a clean slate', 'clear', '/clear', '/clear'],
      ['How much context is used', 'Shows what fills the context, skills included', 'context', '/context', '/context'],
      ['Repeat a task on a schedule', 'A cloud agent on cron, or once at a set time', 'schedule', '/schedule', '/schedule every Monday 9:00: check our site for broken links'],
      ['Repeat something every N minutes', 'A loop in the current session', 'loop', '/loop 10m check whether the deploy finished', '/loop 10m check whether the deploy finished'],
      ['Tired of permission prompts', 'Adds frequent safe commands to the allow list', 'fewer-permission-prompts', '/fewer-permission-prompts', '/fewer-permission-prompts'],
      ['Where did the tokens go?', 'A simple chart of session usage', 'explain-usage', 'Say “explain my usage”', 'Explain my usage in this session.'],
      ['Make your own skill', 'Helps write and test a skill', 'skill-creator', 'Say “make a skill”', 'Make a skill that writes release notes in our voice.']
    ]}
  ]
};
window.SITUATIONS.source = (skill) => {
  const s = skill.toLowerCase();
  if (/^(superpowers|interfaces|impeccable|hallmark|security-audit|ytlens)/.test(s)) return 'companion';
  if (/^(animate|animation-performance|improve-animations|find-animation|rich-report|design-md-library|design-score|third-party-install-guard|hyperframes)/.test(s)) return 'harness';
  if (/^(figma|product-management)/.test(s)) return 'plugin';
  return 'claude';
};
