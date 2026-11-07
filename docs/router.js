// Ask the router: describe the task in your own words and get the situation, the skill, how to call it
// and a prompt to paste. It matches against window.SITUATIONS right here in the page: light stemming,
// a synonym table for design words and a BM25 score weighted by field. Nothing you type leaves the page.
(() => {
  'use strict';
  const G = typeof window !== 'undefined' ? window : globalThis;
  const D = G.SITUATIONS;
  if (!D || !Array.isArray(D.groups)) return;

  /* ===================== words: fold, spell, split, stem ===================== */
  const words = (s) => s.trim().split(/\s+/);
  // never worth matching on their own
  const STOP = new Set(words(`a an the and or but nor if then than so to of in on at by for from with without into onto over under
    about above below before after during while until since up down out as is are was were be been being am do does did doing have has had having i me my mine myself
    we us our ours you your yours it its itself this that these those there here what which who whom whose when why how
    can could should would will shall may might must not no yes just only also too very really quite rather pretty please pls
    thanks thank hi hey hello want wants wanted wanna need needs needed let lets get gets got getting give
    gives put some something anything everything nothing thing things stuff way ways kind sort bit lot lots one ones any each
    much many more most less least better best ok okay sure maybe again still even ever already yet now today say said tell
    dont doesnt isnt arent wasnt cant wont im ive id youre theyre thats whats hows gonna etc via per e g eg ie someone else`));
  // real words, but too common in design talk to decide anything alone
  const WEAK = new Set(words(`small big large tiny huge little look looks looking feel feels feeling seem seems good bad nice ugly
    weird off new old whole entire all every quick fast page pages screen screens site app apps make makes making made build
    builds building create creates creating do use using work working works project projects design designs designer fix fixes
    fixing fixed improve improving add adding change changes changing update updates updating issue issues problem problems
    help done show see try like feature features user users go goes going went stop ask asking asks where ui interface
    check checks checking checked open opens opening close closes closing run runs running remove removes removing delete`));
  // interface parts: they say where, rarely what the job is ("make the buttons rounder" is about radius)
  const OBJECT = new Set(words(`button buttons card cards modal modals dialog dialogs dropdown dropdowns menu menus header headers footer
    sidebar navbar nav form forms input inputs field fields table tables list lists tab tabs toast toasts tooltip tooltips hero section
    sections component components banner banners panel panels widget widgets icon icons text switch switches toggle toggles slider
    sliders overlay overlays carousel carousels drawer drawers avatar avatars badge badges chip chips popover popovers accordion
    accordions checkbox checkboxes radio radios dashboard dashboards`));
  // real words the list does not use that sit one slip away from one it does ("shader" is not "shade")
  const NOFIX = new Set(words('shader shaders integration integrations'));
  // the verb usually names the job ("score my landing page" is about scoring, not landing pages)
  const ACTION_WORDS = words(`score rate grade install animate audit review critique roast compare research rewrite redesign debug
    simplify schedule compact steal extract polish brainstorm plan synthesize transcribe summarize chart diagram verify explain
    benchmark measure translate recreate replicate deconstruct`);
  const CENTRE = { e: 'center', es: 'centers', ed: 'centered', ing: 'centering' };
  const SPELL = [[/colou?r/g, 'color'], [/\bgrey/g, 'gray'], [/\bcentr(e|es|ed|ing)\b/g, (m, x) => CENTRE[x]], [/behaviou?r/g, 'behavior'],
    [/isation/g, 'ization'], [/\bpall?ett?e(s?)\b/g, 'palette$1'], [/\bgradiant(s?)\b/g, 'gradient$1'], [/\banalys(e|es|ed|ing)\b/g, 'analyz$1'], [/\b([a-z]{3,}?)is(e|es|ed|ing)\b/g, '$1iz$2']];
  // stems that the suffix rules would get wrong
  const IRREG = { words: 'wordz', wording: 'wordz', installation: 'install', installations: 'install', typographic: 'typography',
    typographical: 'typography', accessible: 'accessibility', a11y: 'accessibility', radii: 'radius', prs: 'pr',
    mockups: 'mockup', analyses: 'analysis', canvas: 'canvas', status: 'status', focus: 'focus', ios: 'ios',
    explanation: 'explain', explanations: 'explain', bouncy: 'bounc' };

  const fold = (s) => String(s == null ? '' : s).normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[‘’`´']/g, '');
  const spell = (t) => SPELL.reduce((s, [re, to]) => s.replace(re, to), t);
  const split = (s) => spell(fold(s)).match(/[a-z0-9]+/g) || [];
  const stem = (w) => {
    if (IRREG[w]) return IRREG[w];
    if (w.length <= 3 || /\d/.test(w)) return w;
    let s = w;
    if (s.length > 4 && s.endsWith('ies')) s = s.slice(0, -3) + 'y';
    else if (s.endsWith('sses')) s = s.slice(0, -2);
    else if (/[^su]s$/.test(s)) s = s.slice(0, -1);
    if (s.endsWith('ied') && s.length > 4) s = s.slice(0, -3) + 'y';
    else if (s.endsWith('ing') && s.length - 3 >= 3) s = s.slice(0, -3);
    else if (s.endsWith('ed') && s.length - 2 >= 3) s = s.slice(0, -2);
    if (/[ts]ion$/.test(s) && s.length > 6) s = s.slice(0, -3);
    if (s.length > 3 && s.endsWith('e')) s = s.slice(0, -1);
    if (/([bdgmnprt])\1$/.test(s)) s = s.slice(0, -1);
    return s;
  };
  const ACTION = new Set(ACTION_WORDS.map(stem));
  // "for the …" and "of my …" start the task's subject; these words end it
  const SUBJECT_DET = new Set(words('my our the a an this that your their these those every all new'));
  // "check for leaks", "optimise for mobile": here what follows "for" is the job
  const FOR_VERB = new Set(words('check checking look looking scan scanning search searching test testing optimize optimise optimized designed design ready prepare ask asking wait'));
  const SUBJECT_END = new Set(words('and then but so with before after using because while plus also'));
  const isStop = (w) => STOP.has(w) || (w.length < 2) || (/^\d+$/.test(w) && w.length < 3);

  /* ===================== synonyms: groups of words that mean the same job =====================
     Each line: a weight, then the terms. A query word that belongs to a group also looks for every other term in it,
     at that weight (a word's own spelling always counts 1). Multi-word terms match as phrases. A * after the weight
     means its phrases name the job ("where should I add motion"); a ~ means its words only add context (brand names). */
  const SYN = `
    0.9* accessibility, a11y, wcag, too small to tap, hard to tap, hard to click, tap targets, touch targets, inaccessible, ada compliance, screen reader, screenreader, voiceover, talkback, assistive tech
    0.6 accessibility, keyboard, focus, aria, tab order, tabbing, alt text, contrast, assistive, focus ring, focus trap, reachable, unreachable, not reachable, keyboard only, tab key, disabled users, blind users, tap target, touch target, hit area, target size, tap, tappable, touch, hard to read, cant read, unreadable, low vision
    0.9 typography, font, font family, font size, typeface, type scale, type ramp, lettering, small text, tiny text, text too small, text size
    0.6 typography, font, type, text, body text, heading, headline, title, text size, line height, line length, leading, tracking, kerning, letter spacing, orphan, widow, wrapping, truncation, truncate, ellipsis, readable, readability, legible, legibility, serif, sans serif, font weight
    0.45 size, sizing, small, smaller, tiny, big, bigger, large, larger, huge, scale
    0.9 layout, spacing, alignment, align, aligned, misaligned, responsive, center, centered, centering, not centered
    0.9* spacing, too close, close together, too far apart, not enough space, too much space, too much padding, no breathing room, spaced out
    0.6 layout, spacing, space, padding, margin, gap, gutter, whitespace, white space, grid, column, rhythm, cramped, crowded, tight, uneven, overlap, overlapping, mobile, tablet, breakpoint, viewport, rtl, reading order, grouping, break, stacking, squished, squeezed, off center, phone, iphone, small screen, narrow screen
    0.9 color, palette, hue, oklch, hex, rgb, hsl, color scheme, recolor
    0.6 color, palette, contrast, gray, neutral, neutrals, background, tint, shade, gradient, saturation, saturated, dark mode, dark theme, light mode, color tokens, swatch, brand colors, darker, brighter, recolor
    0.9 contrast, low contrast, poor contrast, too dark, too bright, too pale, too faint, hard to read, hard to see, light gray, gray text, gray on white, faint, washed out
    0.9 shadow, drop shadow, box shadow, elevation
    0.9 radius, rounded, round, rounder, roundness, rounded corners, corner radius, border radius, corners, pill shaped, softer corners
    0.6 shadow, radius, border, outline, icon, iconography, stroke, stroke width, line weight, surface, flat, cheap, details, small details, crisp
    0.9 animate, animation, motion, transition, hover, micro interaction, microinteraction
    0.9* animate, page transition, route transition, view transition, between pages, between screens, between routes, shared element transition, slide up, slide down, slide in, slide out, slide from, fade in, fade out, pop in, enter from, swipe to dismiss, subtle hover, hover animation, subtle animation, subtle motion
    0.9* easing, ease, easing curve, curve, duration, timing function, cubic bezier, keyframe, keyframes, too fast, snappier, snappy
    0.6 animate, motion, easing, ease, curve, spring, keyframe, fade, slide in, bounce, parallax, hover effect, scroll effect, entrance, exit, duration, gesture, swipe, drag, lottie
    0.9 stutter, jank, janky, laggy, lag, sluggish, choppy, jitter, jittery, flicker, flickering, flickers, dropped frames, drops frames, frame drops, frame rate, fps, 60fps, 60 fps, not smooth
    0.9* where should i add motion, where animations would help, where motion would help, suggest animations, suggest motion, animation ideas, motion ideas, spots for motion, where could i add motion, where can i add motion, where to add motion, where should i add animation, where would animation help, where would motion help, where to animate, what should i animate, what could i animate, where does motion make sense, where is motion missing, motion missing, what could be animated, what to animate, motion opportunities, animation opportunities
    0.55 stutter, performance, perf, slow, smooth, layout shift, content shift, jumps, jumpy, jumping around, frames, gpu, reflow, repaint, layout thrash
    0.9 react native, expo, reanimated, swiftui, bottom sheet
    0.5 react native, expo, native app, mobile app, ios, android
    0.9 landing page, landing, build a site, make a site, create a site, new site, build a website, make a website, new website, a site for, homepage, home page, promo page, marketing site, marketing page, microsite, launch page, splash page, product page, one page site, portfolio, portfolio site, portfolio website, personal site
    0.6 landing, site, website, web site, web page, homepage, page
    0.9 redesign, redo, revamp, overhaul, makeover, rework, restyle, reskin, refresh the design, rebuild the page
    0.5 brand, branding, rebrand, brand identity, visual identity, brand guidelines, identity, landing page
    0.45 logo, logos, logotype, wordmark, logomark, favicon, icon, iconography
    0.9 figma, figjam, figma file, figma frame, figma link, frame link, mockup, mock up, design file
    0.6 figma, frame, component, variables, library, handoff, dev mode, prototype, design system
    0.9 into figma, to figma, push to figma, code to figma, send to figma, export to figma, figma from code, in figma
    0.9 figma to code, design to code, from figma, implement figma, build from figma, design into code, frame into code, mockup into code
    0.9 component library, design system, ui kit, figma variables, variables, light and dark modes, token scale
    0.9 diagram, flowchart, flow chart, user flow, flow diagram, sitemap, site map, journey map, whiteboard, map out
    0.9 dev spec, developer spec, component spec, spec for developers, handoff spec, hand off, handoff, component docs, redlines
    0.9 pixel perfect, pixel close, pixel accurate, from a screenshot, from an image, from a png, from mock, match the design, side by side
    0.9 video, reel, clip, mp4, trailer, teaser, promo video, release video, launch video, motion graphics, explainer video, tiktok, instagram, youtube short, shorts, render, gif
    0.9 youtube, youtube video, youtube link, yt, talk, lecture, webinar, conference talk, podcast, transcript, transcribe, captions
    0.9 review, audit, critique, assess, assessment, evaluate, evaluation, inspect, roast, give feedback, feedback on, feedback for, teardown, tear down, look over, go over
    0.6 review, feedback, ux, usability, heuristic, ux review, design review, what is wrong
    0.9 install, add package, add a package, npm, pnpm, yarn, pip, brew, cargo, gem, npx, plugin, package, dependency, mcp, mcp server, extension, cli, binary, docker image, github action, third party, 3rd party, vs code extension, vscode extension, browser extension, chrome extension, add a library, install a library, npm library, js library, react library
    0.9 install, malware, malicious, virus, trojan, spyware, vs code, vscode
    0.6 install, as a dependency, safe, safety, trust, trusted, supply chain, sketchy, legit, vet, vetting, scan
    0.9 security, secure, vulnerability, vuln, exploit, pentest, pen test, penetration test, pentesting, leak, leaked, secret, api keys, leaked keys, auth, authentication, xss, injection, csrf, hacked
    0.6 security, launch, before launch, go live, production, whole project, entire project, entire codebase, whole codebase, whole app, entire app, whole site
    0.9 report, compare, comparison, versus, vs, pros and cons, benchmark, matrix
    0.6 report, analysis, analyze, overview, summary, writeup, write up, breakdown, table
    0.9 research, deep research, investigate, study, look into, find out, dig into, sources, literature, desk research
    0.9 score, rate, rating, grade, lighthouse, measure, metric, number, out of 100, out of 10, benchmark
    0.9* score, how good, how good is, how good does, is this good, is it good, does it look good, how does it look, how bad is
    0.55 score, audit, quality, assess, evaluate, judge, how bad
    0.9 design tokens, tokens, css variables, custom properties, variables, tailwind theme, tailwind config, theme
    0.9 steal, extract, copy the design, copy the colors, copy the fonts, copy the tokens, copy their, copy the look, from this site, from a site, from the site, from a website, from this website, from their site, from a live site, from this url, copy the style, rip, grab, lift, borrow, clone the style, pull the colors
    0.9* in the style of, style of, styled like, look like, looks like, feel like, feels like, inspired by, similar to, vibe of
    0.6 style, styling, aesthetic, visual language, visual style, look and feel, vibe, mood, design language
    0.6~ linear, stripe, notion, vercel, apple, airbnb, spotify, raycast, superhuman, airtable, shopify, supabase
    0.9* how is it built, how was it built, how is this built, how does it work, how did they, how they did, how did they build, how did they make, how was this made, how is this made, how it was built, recreate, replicate, reverse engineer, effect, recipe, deconstruct
    0.9 copy, copywriting, microcopy, ux writing, ux copy, wording, words, labels, label, error messages, error message, button text, button labels, cta, tone, voice, tone of voice, rewrite, rephrase, wordy
    0.6 copy, friendly, friendlier, warm, warmer, human, clearer, clarity, concise, shorter, jargon, plain language, plain english, confusing, unclear, translate, translation, localize, localization, i18n, formal, casual
    0.9 onboarding, onboard, onboarding flow, onboarding experience, new user experience, first time user, first run, first time, first use, welcome, welcome screen, empty state, zero state, blank state, no data, activation, getting started, tutorial, walkthrough, product tour
    0.9 variant, variation, versions, alternatives, alternative, options, directions, explorations, iterations, ab test, a b test
    0.9 state, loading, loading state, error state, skeleton, spinner, loader, progress bar, disabled state, hover state, every state, all states
    0.9 break, stress test, stress, bad data, long names, long text, overflow, edge case, empty fields, worst case, unhappy path, robust
    0.9 plan, planning, step by step, steps, roadmap, milestones, tasks, checklist, migration
    0.9 execute, execute the plan, run the plan, follow the plan, implement the plan, carry out, execution
    0.9 spec, specification, prd, requirements, acceptance criteria, user stories, product brief
    0.9 brainstorm, brainstorming, idea, ideation, new feature, feature idea, a feature, think through, talk through, vague idea, fuzzy idea, not sure what to build, not sure where to start, figure out
    0.6 brainstorm, sparring, pressure test, devil advocate, risks, hypotheses, business model, who pays
    0.6 ux, flow, user flow, journey, wireframe, sketch, screens, before code, before any screens, information architecture
    0.9 bug, buggy, broken, broke, crash, debug, not working, doesnt work, does not work, no idea why, not sure why, no clue why, cant figure out why, fails, failing, failure, blank page, white screen, regression, dont know why, nothing renders, not rendering, does not render, nothing shows, nothing happens, console error, empty console, stack trace, exception
    0.9 diff, my changes, branch, pull request, pr, merge request, commit, before merging, before a pr
    0.9 simplify, simpler, clean up, cleanup, refactor, duplication, duplicate code, messy code, clutter, dead code, tidy
    0.9 verify, verification, make sure, really works, actually works, prove, evidence, finished, before saying done
    0.9* run the app, launch the app, start the app, open the app, run it, see it working, preview, dev server, localhost, screenshot
    0.9 doc, document, google doc, memo, guidelines, principles, handbook, wiki, one pager
    0.9 presentation, deck, slides, slide deck, keynote, powerpoint, pptx, pitch deck, slideshow
    0.9 pdf, docx, excel, xlsx, spreadsheet, csv, word file, word doc, microsoft word, file format, export
    0.9 chart, graph, dashboard, build a dashboard, make a dashboard, analytics dashboard, data viz, dataviz, visualization, visualize, plot, kpi, analytics, signups
    0.9 status update, weekly update, progress update, stakeholder, leadership, exec, executives, management, boss, team update, recap
    0.9 interview, user interviews, user research, persona, personas, survey, feedback, notes, transcripts, synthesis, synthesize, affinity, insights, quotes, usability test
    0.9 competitor, competition, competitive, competitive analysis, rivals, market landscape, positioning
    0.9* bolder, bold, louder, pop, stand out, eye catching, more contrast in the design, more personality, punchier, punchy, striking, dramatic, timid, dull, boring, bland, generic, quieter, quiet, calmer, calm, toned down, tone down, tone it down, too many colors, too many fonts, too loud, too busy, too much going on, busy, noisy, cluttered, overwhelming, too much, minimal, subtle
    0.9 polish, polished, ready for release, ready to ship, before we ship, before shipping, final pass, last pass, finishing touches, final touches, refine, refinement, nitpicks, before release, last 5
    0.9 compact, compress, summarize the conversation, long conversation, long chat, conversation got long, too long, running out of context
    0.9 context, context window, context usage, how full, how much context, context left
    0.9 clear, reset, fresh start, start fresh, start over, clean slate, new task, new chat, wipe, clear context, clear the context
    0.9* schedule, cron, every day, every week, every monday, every friday, every morning, every evening, every night, nightly, each morning, every hour, hourly, daily, weekly, recurring, routine, automate, timer
    0.9* loop, every minutes, every 5 minutes, every 10 minutes, poll, polling, keep checking, repeat, repeatedly, every n minutes
    0.9 permission, permission prompts, approve, approvals, allow list, allowlist, keeps asking, stop asking, nagging
    0.9 usage, tokens, token usage, how many tokens, tokens used, cost, spend, spent, credits, limits, where did the tokens go
    0.9 skill, own skill, custom skill, make a skill, write a skill, new skill, skill creator, create a skill
    0.9 claude md, project brief, project rules, agents md, init, initialize, project instructions, house rules, conventions
    0.9 design md, design description, document the design, design documentation, style guide`;

  // A phrase matches its words in order, each allowing a plural or -ed/-ing ending. In a phrase with two or more
  // real words, a small word is an open slot ("where should I add motion" also reads "where could we add motion").
  // Filler words may sit between two phrase words ("add some motion", "is this ui good", "tone the dashboard
  // down"): one in all for a phrase with open slots, two for the others.
  const FILLER = new Set([...STOP, ...WEAK, ...OBJECT]);
  const ENDING = /^(s|es|d|ed|ing)$/;
  const wordIs = (w, p) => w === p || (w.length > p.length && w.startsWith(p) && ENDING.test(w.slice(p.length)));
  const phraseOf = (ws) => {
    const loose = ws.filter((w) => !isStop(w)).length >= 2;
    return { phrase: ws.join(' '), ws, open: ws.map((w) => loose && isStop(w)), max: loose && ws.some(isStop) ? 1 : 2 };
  };
  // every place a phrase starts in a list of words, with how many words it spans
  const hitsOf = (t, list) => {
    const out = [], n = t.ws.length;
    const end = (i, j, extra) => {
      if (j === n) return i;
      if (i >= list.length) return -1;
      if (t.open[j] || wordIs(list[i], t.ws[j])) { const e = end(i + 1, j + 1, extra); if (e >= 0) return e; }
      return j > 0 && extra < t.max && FILLER.has(list[i]) ? end(i + 1, j, extra + 1) : -1;
    };
    for (let i = 0; i < list.length; i++) { const e = end(i, 0, 0); if (e > i) out.push({ i, n: e - i }); }
    return out;
  };
  const SYNG = SYN.trim().split('\n').map((line) => {
    const m = line.trim().match(/^([\d.]+)([*~]?)\s+(.*)$/);
    const terms = m[3].split(',').map(split).filter((ws) => ws.length).map((ws) => (ws.length > 1 ? phraseOf(ws) : { stem: stem(ws[0]), w: ws[0] }));
    return { w: Number(m[1]), intent: m[2] === '*', ctx: m[2] === '~', terms };
  });
  // the group a package name stands for, and the verbs that come before one
  const INSTALL_G = Math.max(0, SYNG.findIndex((g) => g.terms[0] && g.terms[0].stem === stem('install')));
  const PKG_VERB = new Set(words('add adding install installing npm pnpm yarn pip brew'));
  const termKey = (t) => (t.phrase ? `"${t.phrase}"` : t.stem);
  const byStem = new Map(), byPhrase = [];
  SYNG.forEach((g, gi) => g.terms.forEach((t) => {
    if (t.phrase) byPhrase.push({ gi, t });
    else { if (!byStem.has(t.stem)) byStem.set(t.stem, []); byStem.get(t.stem).push(gi); }
  }));

  /* ===================== the index: one document per situation row ===================== */
  const FIELDS = { s: 3, x: 2, h: 1.5, k: 1, g: 0.6 }; // situation, example, what it does, skill and call, group
  const K1 = 1.2, B = 0.6;
  // the call column holds commands ("/hallmark") or plain directions ("Say “animate …”", "Runs on its own")
  const callText = (c) => {
    const s = String(c || '');
    if (s.startsWith('/')) return s;
    const q = s.match(/[“"]([^”"]+)[”"]/);
    return q ? q[1].replace(/…|\.\.\./g, ' ') : '';
  };
  // words are split per written token, so each normalised word keeps the spelling it had; "break down" and
  // "breaks it down" are one word (to analyse), never the stress test "break"
  const tokens = (text) => {
    const out = [];
    String(text || '').replace(/[\p{L}\p{N}'’]+/gu, (raw) => { split(raw).forEach((w) => out.push({ w, raw })); return raw; });
    for (let i = 0; i < out.length; i++) {
      if (!/^(break|breaks|breaking)$/.test(out[i].w)) continue;
      const n = out[i + 1] && out[i + 1].w === 'down' ? 1 : out[i + 2] && out[i + 2].w === 'down' && /^(it|them|this|that|things)$/.test(out[i + 1].w) ? 2 : 0;
      if (n) out.splice(i, n + 1, { w: 'breakdown', raw: out.slice(i, i + n + 1).map((x) => x.raw).join(' ') });
    }
    return out;
  };
  const fieldOf = (text) => {
    const tk = tokens(text), all = tk.map((x) => x.w), orig = tk.map((x) => x.raw);
    const seq = all.filter((w) => !isStop(w)).map(stem);
    const tf = new Map(); seq.forEach((s) => tf.set(s, (tf.get(s) || 0) + 1));
    const pairs = new Set(); for (let i = 1; i < seq.length; i++) pairs.add(`${seq[i - 1]} ${seq[i]}`);
    return { tf, pairs, len: Math.max(1, seq.length), words: all, orig };
  };
  // the words a phrase match covers, as the row writes them
  const spanOf = (f, m) => f.orig.slice(m.i, m.i + m.n).filter((x, i, a) => x !== a[i - 1]).join(' ').replace(/[’']s$/, '');
  const docs = [];
  D.groups.forEach((g) => (g.rows || []).forEach((r, i) => {
    if (!Array.isArray(r) || r.length < 5) return;
    docs.push({ id: `${g.id}:${i}`, row: r, group: g, f: {
      s: fieldOf(r[0]), x: fieldOf(r[4]), h: fieldOf(r[1]), k: fieldOf(`${r[2]} ${callText(r[3])}`), g: fieldOf(g.title)
    } });
  }));
  const N = docs.length;
  // the page's habits name the default skill for common moments ("Screen is ready? Audit it"); their rows get a small lead
  const HABIT = (Array.isArray(D.habits) ? D.habits : []).map((h) => String((h && h[1]) || '').trim().toLowerCase()).filter(Boolean);
  docs.forEach((d) => {
    const skill = String(d.row[2]).toLowerCase(), call = String(d.row[3]).toLowerCase();
    d.prior = HABIT.some((c) => call === c || skill === c || call.startsWith(`${c} `) || skill.endsWith(c.replace(/^\//, ''))) ? 1.08 : 1;
  });
  const PHRASE_WORDS = new Set(); // words that only live inside phrases ("reader" in "screen reader") are real words, not typos
  // every word the router knows, as written (word -> stem), for reading a typo as the word it was meant to be
  const VOCAB = (() => {
    const v = new Map(), add = (w) => { if (w.length >= 4 && !/[0-9]/.test(w) && !isStop(w) && !v.has(w)) v.set(w, stem(w)); };
    docs.forEach((d) => Object.keys(FIELDS).forEach((k) => d.f[k].words.forEach(add)));
    SYNG.forEach((g) => g.terms.forEach((t) => (t.phrase ? t.ws : [t.w]).forEach(add)));
    byPhrase.forEach(({ t }) => t.ws.forEach((w) => PHRASE_WORDS.add(stem(w))));
    return v;
  })();
  // edit distance where a wrong letter only counts as one slip when its key sits next to the right one:
  // "typograpy" and "aligment" are slips, "loader" is not "louder" and "contract" is not "contrast"
  const KEYS = {};
  ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'].forEach((row, y) => [...row].forEach((ch, x) => { KEYS[ch] = [y, x + y * 0.5]; }));
  const slip = (a, b) => { const p = KEYS[a], q = KEYS[b]; return p && q && Math.abs(p[0] - q[0]) <= 1 && Math.abs(p[1] - q[1]) <= 1 ? 1 : 2; };
  const near = (a, b, max) => {
    const m = a.length, n = b.length; if (Math.abs(m - n) > max) return max + 1;
    let p2 = null, p = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const c = [i]; let low = i;
      for (let j = 1; j <= n; j++) {
        let v = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : slip(a[i - 1], b[j - 1])));
        if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
        c[j] = v; if (v < low) low = v;
      }
      if (low > max) return max + 1;
      p2 = p; p = c;
    }
    return p[n];
  };
  // only for longer words; a typo keeps its first letter ("hard" must not turn into "card"), and a two-slip
  // reading also keeps the second ("integration" is not "iteration")
  const typoFix = (w) => {
    if (w.length < 5 || /[0-9]/.test(w)) return null;
    const max = w.length >= 10 ? 2 : 1;
    let best = null, bw = '', bd = max + 1;
    for (const [v, st] of VOCAB) {
      if (v[0] !== w[0] || Math.abs(v.length - w.length) > max) continue;
      const d = near(w, v, max); if (d > max || (d === 2 && v[1] !== w[1])) continue;
      if (d < bd || (d === bd && v.length === w.length && bw.length !== w.length)) { bd = d; best = st; bw = v; }
    }
    return best;
  };
  const avg = {}; Object.keys(FIELDS).forEach((k) => { avg[k] = docs.reduce((a, d) => a + d.f[k].len, 0) / Math.max(1, N); });

  // term frequency per field for a stem or a phrase, memoised per document
  const tfOf = (d, t, k) => {
    if (!t.phrase) return d.f[k].tf.get(t.stem) || 0;
    const key = `${k}${t.phrase}`; d.memo = d.memo || new Map();
    if (!d.memo.has(key)) d.memo.set(key, hitsOf(t, d.f[k].words).length);
    return d.memo.get(key);
  };
  const dfMemo = new Map();
  const idf = (t) => {
    const key = termKey(t);
    if (!dfMemo.has(key)) {
      let df = 0; for (const d of docs) if (Object.keys(FIELDS).some((k) => tfOf(d, t, k) > 0)) df++;
      dfMemo.set(key, df ? Math.log(1 + (N - df + 0.5) / (df + 0.5)) : 0);
    }
    return dfMemo.get(key);
  };
  // BM25F over one-line fields: a word counts once per field (repeats in a one-liner are noise),
  // normalised by the field's length, weighted by field, then saturated once
  const termScore = (d, t, fields, cap = Infinity) => {
    const w = Math.min(idf(t), cap); if (!w) return 0;
    let T = 0;
    for (const k in FIELDS) {
      if (!tfOf(d, t, k)) continue;
      T += FIELDS[k] / (1 - B + B * d.f[k].len / avg[k]);
      if (fields) fields.add(k);
    }
    return T ? w * T * (K1 + 1) / (T + K1) : 0;
  };

  /* ===================== the query ===================== */
  // the user's own words, kept as typed for the "why" line
  const parse = (q) => {
    const typed = tokens(q).map(({ w, raw }) => ({ w, raw: raw.replace(/['’]s$/i, '') }));
    const units = [], seen = new Set();
    const expand = (gis, own) => {
      const out = new Map();
      gis.forEach((gi) => SYNG[gi].terms.forEach((t) => {
        const key = termKey(t); if (key === own) return;
        if (!out.has(key) || out.get(key).w < SYNG[gi].w) out.set(key, { t, w: SYNG[gi].w, ctx: SYNG[gi].ctx });
      }));
      return [...out.values()];
    };
    // the subject of the task ("a landing page for my podcast", "a review of the checkout flow") says what it is
    // about, not what to do: those words count for less, unless they are all there is
    const subject = new Set();
    for (let i = 1; i < typed.length - 1; i++) {
      if (!/^(for|of)$/.test(typed[i].w) || !typed.slice(0, i).some((x) => !isStop(x.w))) continue;
      const det = SUBJECT_DET.has(typed[i + 1].w);
      if (!det && (typed[i].w === 'of' || FOR_VERB.has(typed[i - 1].w) || isStop(typed[i + 1].w))) continue;
      for (let j = i + (det ? 2 : 1); j < typed.length && !SUBJECT_END.has(typed[j].w); j++) subject.add(j);
      break;
    }
    typed.forEach(({ w, raw }, at) => {
      if (isStop(w)) return;
      const s0 = stem(w);
      // ordinary interface words and verbs are never typos, even when the list does not use them
      const plainWord = ACTION.has(s0) || OBJECT.has(w) || WEAK.has(w) || WEAK.has(s0) || NOFIX.has(w);
      const fix = !plainWord && !byStem.has(s0) && !PHRASE_WORDS.has(s0) && !idf({ stem: s0 }) ? typoFix(w) : null;
      // a word the list has never seen, right after "add" or "install", is most likely a package name ("add zod")
      const prev = typed.slice(0, at).reverse().find((x) => !/^(a|an|the|this|that|i)$/.test(x.w));
      const pkg = !fix && !plainWord && !byStem.has(s0) && !PHRASE_WORDS.has(s0) && !idf({ stem: s0 }) && !!prev && PKG_VERB.has(prev.w);
      const s = fix || s0; if (seen.has(s)) return; seen.add(s);
      const weak = WEAK.has(w) || WEAK.has(s), object = !weak && OBJECT.has(w);
      const base = weak ? 0.4 : object ? 0.6 : ACTION.has(s) ? 1.6 : 1;
      const alias = !fix && !!IRREG[w] && IRREG[w].slice(0, 4) !== w.slice(0, 4);
      units.push({ raw, stem: s, t: { stem: s }, typo: !!fix, alias, weak, object, pkg, subject: subject.has(at), at, w: fix ? base * 0.85 : base, exp: expand(pkg ? [INSTALL_G] : byStem.get(s) || [], s) });
    });
    const tw = typed.map((x) => x.w);
    const groupsHit = new Map();
    byPhrase.forEach(({ gi, t }) => {
      const hit = hitsOf(t, tw)[0]; if (!hit) return;
      if (!groupsHit.has(t.phrase)) {
        // the stretch of the query it matched, in the user's own spelling
        const from = hit.i, to = hit.i + hit.n, said = tw.slice(from, to).join(' ');
        const raws = typed.slice(from, to).map((x) => x.raw).filter((x, i, a) => x !== a[i - 1]);
        groupsHit.set(t.phrase, { t, gis: [], said, shown: raws.join(' ') || said, from, to });
      }
      groupsHit.get(t.phrase).gis.push(gi);
    });
    // two table phrases that matched the same words of the query are one unit ("where could I" and "where should I")
    const bySaid = new Map(); groupsHit.forEach((v, k) => { if (bySaid.has(v.said)) { bySaid.get(v.said).gis.push(...v.gis); groupsHit.delete(k); } else bySaid.set(v.said, v); });
    [...groupsHit.entries()].forEach(([p, v]) => { if ([...groupsHit.values()].some((o) => o !== v && ` ${o.said} `.includes(` ${v.said} `))) groupsHit.delete(p); });
    // a longer phrase is a more specific signal ("where could I add motion" is not "add motion")
    // it covers the user's own words in that stretch, filler included ("ui" in "is this ui good")
    groupsHit.forEach(({ t, gis, said, shown, from, to }) => {
      const covers = said.split(' ').filter((x) => !isStop(x)).map(stem), intent = gis.some((gi) => SYNG[gi].intent);
      let all = true; for (let j = from; j < to; j++) if (!isStop(typed[j].w) && !subject.has(j)) all = false;
      units.push({ raw: shown, t, phrase: true, intent, subject: all, from, to, w: intent ? 1.6 : covers.length >= 3 ? 1.3 : 0.8, covers, exp: expand(gis, termKey(t)) });
    });
    // a word inside a phrase the user typed speaks mostly through that phrase ("screen" in "screen reader")
    const inPhrase = new Set(); units.forEach((u) => { if (u.phrase) u.covers.forEach((st) => inPhrase.add(st)); });
    units.forEach((u) => { if (!u.phrase && inPhrase.has(u.stem)) u.w *= 0.5; });
    // two words side by side, unless a phrase the user typed already holds them together
    const spans = units.filter((u) => u.phrase), content = [];
    typed.forEach(({ w }, i) => { if (!isStop(w)) content.push({ st: stem(w), i }); });
    const pairs = [];
    for (let i = 1; i < content.length; i++) {
      const a = content[i - 1], b = content[i];
      if (a.st !== b.st && !spans.some((u) => a.i >= u.from && b.i < u.to)) pairs.push([a.st, b.st, subject.has(a.i) && subject.has(b.i) ? 0.6 : 1]);
    }
    return { units, pairs };
  };

  /* ===================== scoring ===================== */
  // Each of the user's words scores by its own spelling or by the best synonym it stands for; a term that
  // already scored for one word in a row does not score again for another. Rows that explain more of the
  // meaningful words rank higher (coverage).
  const search = (q, opts = {}) => {
    const limit = opts.limit || 3;
    const P = parse(q);
    const plain = P.units.filter((u) => !u.phrase);
    const blank = !String(q || '').trim();
    // the list is in English: a query written mostly in another script gets its own answer
    const letters = fold(q).replace(/[^\p{L}]/gu, ''), other = letters.replace(/[a-z]/g, '');
    const lang = other.length > 0 && other.length * 2 >= letters.length;
    const nothing = (state) => (lang && state !== 'empty' ? { state: 'none', reason: 'lang', results: [], units: P.units } : { state, results: [], units: P.units });
    if (!plain.length) return nothing(blank ? 'empty' : 'short');
    // a word is "known" when it, or something it stands for, appears anywhere in the list
    const knownT = (u) => idf(u.t) > 0 || u.exp.some((e) => idf(e.t) > 0);
    plain.forEach((u) => { u.known = knownT(u); });
    // a word the list only knows inside a phrase the user typed ("tap" in "tap targets") is known through it
    const phrases = P.units.filter((u) => u.phrase && knownT(u));
    plain.forEach((u) => { if (!u.known && phrases.some((p) => p.covers.includes(u.stem))) u.known = true; });
    // a synonym can carry no more weight than the word the user actually typed (when that word is in the list at all)
    P.units.forEach((u) => { const i = idf(u.t); u.cap = i > 0 ? i : Infinity; });
    const known = plain.filter((u) => u.known);
    // nothing that names a job yet: weak words only ("make it nice", "ugly") or an interface part alone ("the sidebar");
    // words the list does not know at all make it a miss instead ("bake a cake")
    if (!phrases.length && !known.some((u) => !u.weak && !u.object)) {
      return nothing(plain.some((u) => !u.known && !u.weak && !u.object) ? 'none' : 'short');
    }
    // the subject counts for less when something else names the job
    if (known.some((u) => !u.weak && !u.subject) || phrases.some((u) => !u.subject)) P.units.forEach((u) => { if (u.subject) u.w *= 0.6; });
    const meaningful = known.filter((u) => !u.weak);
    // a phrase that names the job ("too much going on", "where should I add motion") is part of what a row must explain
    const job = meaningful.filter((u) => !u.subject && !u.object);
    const denom = [...(job.length ? job : meaningful.length ? meaningful : known), ...phrases.filter((u) => u.intent)];
    const totalW = denom.reduce((a, u) => a + u.w, 0);
    const order = P.units.slice().sort((a, b) => (a.phrase - b.phrase) || (b.w - a.w));
    const own = new Set(P.units.map((u) => termKey(u.t)));

    const scored = docs.map((d) => {
      let score = 0, strong = false;
      const hits = [], used = new Set(), m = new Map();
      for (const u of order) {
        const key0 = termKey(u.t), litF = new Set();
        // a phrase the user typed mostly scores through its words; its synonyms carry it
        const lit = used.has(key0) ? 0 : (u.phrase ? (u.intent ? 1 : 0.6) : 1) * termScore(d, u.t, litF);
        // the user's own word in the row's name (the situation) is the clearest sign of all
        const named = !u.phrase && litF.has('s') ? (ACTION.has(u.stem) ? 1.3 : 1.12) : 1;
        let bestE = 0, bestT = null, bestF = null, rest = 0;
        // a phrase that is literally in the row has said everything it can; its synonyms add nothing
        if (!(u.phrase && lit > 0)) for (const e of u.exp) {
          const key = termKey(e.t); if (used.has(key) || own.has(key)) continue;
          // a phrase that exists in the list as typed is specific; its synonyms count for less
          const f2 = new Set(), sc = e.w * (u.phrase && u.cap < Infinity ? 0.6 : 1) * termScore(d, e.t, f2, u.cap);
          if (!sc) continue;
          if (sc > bestE) { rest += bestE; bestE = sc; bestT = e; bestF = f2; } else rest += sc;
        }
        const best = Math.max(lit * named, bestE);
        if (best <= 0) continue;
        score += u.w * (best + 0.15 * (rest + Math.min(lit, bestE)));
        if (lit > 0) used.add(key0);
        if (bestT && bestE >= lit) used.add(termKey(bestT.t));
        const via = lit > 0 ? null : bestT.t;
        const got = lit > 0 ? 1 : bestT.w;
        if (u.phrase) { u.covers.forEach((st) => m.set(st, Math.max(m.get(st) || 0, got))); m.set(key0, Math.max(m.get(key0) || 0, got)); }
        else { m.set(u.stem, Math.max(m.get(u.stem) || 0, got)); if (lit > 0 && !u.weak) strong = true; }
        hits.push({ u, via, ctx: !!(via && bestT.ctx), fields: lit > 0 ? litF : bestF, gain: u.w * best });
      }
      if (!score) return null;
      // two of the user's words side by side, in the same order, in one field
      for (const [a, b, pw] of P.pairs) {
        for (const k in FIELDS) if (d.f[k].pairs.has(`${a} ${b}`)) { score += pw * 0.4 * (idf({ stem: a }) + idf({ stem: b })) / 2 * (FIELDS[k] / 3); break; }
      }
      const coverage = totalW ? denom.reduce((a, u) => a + u.w * (m.get(u.phrase ? termKey(u.t) : u.stem) || 0), 0) / totalW : 0;
      return { d, score: score * (0.45 + 0.55 * coverage) * d.prior, coverage, strong, hits };
    }).filter(Boolean).sort((a, b) => b.score - a.score);

    if (!scored.length || scored[0].score < 1) return { state: 'none', results: [], units: P.units };
    const top = scored[0];
    // alternates: the next best rows, one per skill, close enough and grounded enough to be worth a look
    const results = [top], skills = new Set([top.d.row[2]]);
    for (const r of scored.slice(1)) {
      if (results.length >= limit) break;
      if (skills.has(r.d.row[2]) || r.score < top.score * 0.3 || (!r.strong && r.coverage < 0.5)) continue;
      skills.add(r.d.row[2]); results.push(r);
    }
    const sure = top.coverage >= 0.5 && top.score >= 3 && (top.strong || (top.coverage >= 0.85 && top.score >= 8));
    return { state: sure ? 'match' : 'loose', results, units: P.units, unknown: plain.filter((u) => !u.known).map((u) => u.raw) };
  };

  // which stems to highlight in a row, and the words behind them
  const hitStems = (r) => {
    const s = new Set();
    r.hits.forEach((h) => {
      if (h.ctx) return;
      const t = h.via || h.u.t;
      if (t.phrase) t.ws.forEach((w) => { if (!isStop(w)) s.add(stem(w)); }); else s.add(t.stem);
    });
    return s;
  };

  /* ===================== the "why this one" line (plain words, escaped for HTML) ===================== */
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const FIELD_NAME = { s: 'the situation', x: 'the example prompt', h: 'what it does', k: 'the skill name', g: 'its group' };
  const FIELD_ORDER = ['s', 'x', 'h', 'k', 'g'];
  const quote = (s) => `“${esc(s)}”`;
  const andList = (a) => (a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`);
  // the word in the row that a synonym landed on, so the line can say what it was read as
  // (searched in the same fields the index reads, the call's quoted words included); null when it is not there
  const wordFor = (r, t) => {
    for (const k of FIELD_ORDER) {
      const f = r.d.f[k];
      if (t.phrase) { const m = hitsOf(t, f.words)[0]; if (m) return spanOf(f, m) || f.words.slice(m.i, m.i + m.n).join(' '); continue; }
      const i = f.words.findIndex((w) => !isStop(w) && stem(w) === t.stem);
      if (i >= 0 && f.orig[i]) return f.orig[i].toLowerCase().replace(/[’']s$/, '');
    }
    return null;
  };
  const whyLine = (r) => {
    const hits = r.hits.slice().sort((x, y) => (y.u.w - x.u.w) || (y.gain - x.gain));
    // the user's own word is in the row (an alias like "a11y" for "accessibility" only reads as it)
    const isDirect = (h) => !h.via && !h.u.phrase && !h.u.typo && !h.u.alias;
    let direct = hits.filter(isDirect);
    // a weak word ("make", "page") is worth naming only when nothing better explains the match
    const better = hits.some((h) => !h.ctx && !isDirect(h));
    direct = (direct.some((h) => !h.u.weak) ? direct.filter((h) => !h.u.weak) : better ? [] : direct).slice(0, 3);
    const phrase = hits.find((h) => h.u.phrase && h.u.intent);
    let read = hits.filter((h) => !h.ctx && !isDirect(h) && h !== phrase && !(h.u.phrase && phrase));
    // a word inside a phrase the line already names adds nothing ("tap" in "tap targets")
    const inside = new Set([phrase, ...read].filter((h) => h && h.u.phrase).flatMap((h) => h.u.covers));
    read = read.filter((h) => h.u.phrase || !inside.has(h.u.stem)).slice(0, direct.length || phrase ? 1 : 2);
    const fields = new Set(); direct.forEach((h) => h.fields.forEach((k) => fields.add(k)));
    const parts = [];
    if (direct.length) parts.push(`${andList(direct.map((h) => quote(h.u.raw)))} ${direct.length > 1 ? 'appear' : 'appears'} in ${andList(FIELD_ORDER.filter((k) => fields.has(k)).slice(0, 2).map((k) => FIELD_NAME[k]))}`);
    const say = (h) => {
      const to = wordFor(r, h.via || h.u.t);
      // say nothing rather than something odd: no word found, the same word, or bare digits
      if (!to || fold(to) === fold(h.u.raw) || !/\p{L}/u.test(to)) return '';
      return `${quote(h.u.raw)} ${h.u.phrase ? (h.via ? 'points to' : 'matches') : 'reads as'} ${quote(to)}`;
    };
    if (phrase) parts.push(say(phrase));
    read.forEach((h) => parts.push(say(h)));
    for (let i = parts.length - 1; i >= 0; i--) if (!parts[i]) parts.splice(i, 1);
    if (!parts.length) return '';
    const out = parts.join('; ');
    return out.charAt(0) === '“' ? `${out}.` : `${out.charAt(0).toUpperCase()}${out.slice(1)}.`;
  };

  G.MHRouter = { search, why: whyLine, stem, split, hitStems, size: N };
  if (typeof document === 'undefined') return;

  /* ===================== the playground ===================== */
  const box = document.querySelector('[data-ask]');
  if (!box) return;
  const input = box.querySelector('[data-ask-input]'), form = box.querySelector('[data-ask-form]');
  const out = box.querySelector('[data-ask-out]'), status = box.querySelector('[data-ask-status]'), clearBtn = box.querySelector('[data-ask-clear]');
  if (!input || !out) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const coarse = matchMedia('(hover: none), (pointer: coarse)').matches;
  document.querySelectorAll('[data-ask-count]').forEach((el) => { el.textContent = String(N); });
  // a full example where there is room for one, a short one on phones
  const fitHint = () => {
    const long = input.dataset.phLong, short = input.dataset.phShort;
    if (long && short) { const want = input.clientWidth > 460 ? long : short; if (input.placeholder !== want) input.placeholder = want; }
  };
  fitHint(); addEventListener('resize', fitHint, { passive: true });

  const ICON_COPY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/></svg>';
  const ICON_GO = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
  // same markup as the catalog's copy buttons, so situations.js copies them and shows "Copied"
  const copyBtn = (text, label, name) => `<button type="button" class="copy" data-copy-text="${esc(text)}" data-label="${esc(label)}" aria-label="${esc(name || `${label}: ${text}`)}">${ICON_COPY}<span>${esc(label)}</span></button>`;
  const SRC = { harness: 'In the harness', companion: 'Companion plugin', plugin: 'Official plugin', claude: 'Built into Claude' };
  const sourceOf = (skill) => {
    if (/^design-score/i.test(skill)) return 'harness';
    try { return typeof D.source === 'function' ? D.source(skill) : ''; } catch (e) { return ''; }
  };
  const srcTag = (skill) => { const s = sourceOf(skill); return SRC[s] ? `<span class="src src--${s}">${SRC[s]}</span>` : ''; };
  // long skill names may break after ":" or "-"
  const nameHtml = (s) => esc(s).replace(/([:\-·])/g, '$1<wbr>');

  // wrap the words whose stem matched; everything else is escaped as it is
  const mark = (text, stems) => {
    const t = String(text); let html = '', at = 0;
    t.replace(/[\p{L}\p{N}]+(?:['’][\p{L}]+)?/gu, (w, i) => {
      const hit = split(w).some((x) => !isStop(x) && stems.has(stem(x)));
      html += esc(t.slice(at, i)) + (hit ? `<mark>${esc(w)}</mark>` : esc(w)); at = i + w.length; return w;
    });
    return html + esc(t.slice(at));
  };
  const cmd = (call) => !call ? '' : String(call).startsWith('/')
    ? `<div class="sit-cmd"><span class="sit-sign" aria-hidden="true">$</span><code>${esc(call)}</code>${copyBtn(call, 'Copy')}</div>`
    : `<div class="sit-cmd sit-cmd--say"><span class="sit-sign" aria-hidden="true">›</span><code>${esc(call)}</code></div>`;
  // the catalog's full-audit row, offered when a query only says that something looks wrong
  const AUDIT = (docs.find((d) => /better-interface$/.test(d.row[2]) && String(d.row[3]).startsWith('/')) || { row: [] }).row[3] || '';
  const linkFor = (q) => `${location.href.split('#')[0]}#ask=${encodeURIComponent(q.trim())}`;
  let lastKey = '', results = [];

  const render = (q, announce) => {
    const res = search(q);
    clearTimeout(render.t);
    if (res.state === 'empty') { out.hidden = true; out.innerHTML = ''; lastKey = ''; results = []; say(''); return; }
    out.hidden = false;
    if (res.state === 'short' || res.state === 'none') {
      const lang = res.reason === 'lang', key = lang ? 'lang' : res.state;
      // "it looks off", "make it nice": a general once-over is the honest answer while the task is still vague
      const vibe = AUDIT && res.state === 'short' && /\b(look|looks|looking|feel|feels|ugly|bad|nice|off|weird|meh|wrong)\b/.test(fold(q));
      out.className = 'ask-out ask-out--none';
      out.innerHTML = lang
        ? `<div class="ask-none"><p class="ask-none-h">The router reads English for now.</p><p>Describe the task in English, for example “animate the toast”, or browse all ${N} situations below. In a session, your agent routes requests in other languages too.</p><a class="ask-go" href="#catalog">Browse the list${ICON_GO}</a></div>`
        : res.state === 'short'
          ? `<div class="ask-none"><p class="ask-none-h">Tell it a little more.</p><p>Name the thing and what is wrong with it, for example “the pricing cards look cramped on mobile”.</p>${vibe ? `<p>Not sure what is wrong yet? A full audit looks at everything in one pass.</p>${cmd(AUDIT)}` : ''}</div>`
          : `<div class="ask-none"><p class="ask-none-h">Nothing on the list matches ${quote(q.trim().slice(0, 80))} yet.</p><p>Try other words for the same task, or browse all ${N} situations below. Your agent still routes it: describe the task in a session and the routing map picks the skill.</p><a class="ask-go" href="#catalog">Browse the list${ICON_GO}</a></div>`;
      if (key !== lastKey && !reduce) { out.classList.add('is-fresh'); }
      lastKey = key; results = [];
      const msg = lang ? 'The router reads English for now. Describe the task in English, or browse the list below.'
        : res.state === 'short' ? `Add a few words about the task.${vibe ? ` Or run a full audit: ${AUDIT}.` : ''}` : `Nothing matches yet. All ${N} situations are listed below.`;
      if (announce) say(msg); else render.t = setTimeout(() => say(msg), 700);
      return;
    }
    results = res.results;
    const [top, ...alts] = results, r = top.d.row, st = hitStems(top), loose = res.state === 'loose';
    const why = whyLine(top);
    const altHtml = alts.map((a, i) => {
      const ar = a.d.row, ast = hitStems(a);
      return `<article class="ask-alt" style="--i:${i}" aria-labelledby="ask-alt-${i}">
        <p class="ask-meta"><span class="ask-group">${esc(a.d.group.title)}</span>${srcTag(ar[2])}</p>
        <h3 id="ask-alt-${i}">${mark(ar[0], ast)}</h3>
        <p class="ask-alt-skill"><code>${nameHtml(ar[2])}</code></p>
        <p class="ask-alt-what">${mark(ar[1], ast)}</p>
        ${cmd(ar[3])}
        <button type="button" class="ask-go" data-ask-find="${i + 1}">Show it in the list${ICON_GO}</button>
      </article>`;
    }).join('');
    out.className = `ask-out${alts.length ? '' : ' ask-out--solo'}`;
    out.innerHTML = `
      <article class="ask-best spot" aria-labelledby="ask-best-name">
        <p class="ask-meta" style="--i:0"><span class="ask-flag${loose ? ' ask-flag--loose' : ''}">${loose ? 'Closest match' : 'Best match'}</span><span class="ask-group">${esc(top.d.group.title)}</span>${srcTag(r[2])}</p>
        <p class="ask-for" style="--i:1"><span>Situation</span>${mark(r[0], st)}</p>
        <div class="ask-wire" aria-hidden="true"><b></b></div>
        <h2 class="ask-name" id="ask-best-name"><span class="visually-hidden">${loose ? 'Closest match' : 'Best match'}: </span>${nameHtml(r[2])}</h2>
        <p class="ask-get" style="--i:2">${mark(r[1], st)}</p>
        <div class="ask-call" style="--i:3">${cmd(r[3])}</div>
        <div class="sit-prompt ask-prompt" style="--i:4"><span class="sit-label">Example prompt</span><p>${mark(r[4], st)}</p>${copyBtn(r[4], 'Copy prompt')}</div>
        ${why ? `<p class="ask-why" style="--i:5"><b>Why this one</b> ${why}</p>` : ''}
        ${loose ? `<p class="ask-loose" style="--i:5">A loose match. Add a detail or two, or look through the list below.</p>` : ''}
        <div class="ask-acts" style="--i:6"><button type="button" class="ask-go" data-ask-find="0">Show it in the list${ICON_GO}</button>${copyBtn(linkFor(q), 'Copy link', 'Copy a link to this answer')}</div>
      </article>
      ${alts.length ? `<div class="ask-alts"><p class="ask-alts-h">Also close</p>${altHtml}</div>` : ''}`;
    if (top.d.id !== lastKey && !reduce) { out.classList.add('is-fresh'); }
    lastKey = top.d.id;
    const msg = `${loose ? 'Closest match' : 'Best match'}: ${r[2]}, for “${r[0]}”.${alts.length ? ` ${alts.length === 1 ? 'One more option' : `${alts.length} more options`} below it.` : ''}`;
    if (announce) say(msg); else render.t = setTimeout(() => say(msg), 700);
  };
  const say = (msg) => { if (status && status.textContent !== msg) status.textContent = msg; };

  let typing = 0;
  const syncClear = () => { if (clearBtn) clearBtn.hidden = !input.value; box.classList.toggle('has-q', !!input.value); };
  input.addEventListener('input', () => { syncClear(); clearTimeout(typing); typing = setTimeout(() => render(input.value, false), 140); });
  form?.addEventListener('submit', (e) => {
    e.preventDefault(); clearTimeout(typing); render(input.value, true);
    if (coarse && input.value.trim()) { input.blur(); out.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); }
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; syncClear(); render('', true); }
  });
  clearBtn?.addEventListener('click', () => { input.value = ''; syncClear(); render('', true); input.focus(); });
  box.querySelectorAll('[data-ask-try]').forEach((b) => b.addEventListener('click', () => {
    input.value = b.dataset.askTry || b.textContent.trim(); syncClear(); clearTimeout(typing); render(input.value, true);
  }));

  // "/" puts the cursor in the box from anywhere on the page
  document.addEventListener('keydown', (e) => {
    if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    const t = e.target; if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    e.preventDefault(); input.focus({ preventScroll: true }); input.select();
    input.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  });

  // jump to the row's card in the catalog below and light it for a moment
  const cardFor = (row) => [...document.querySelectorAll('[data-sit-list] .sit')].find((a) => a.querySelector('h3')?.textContent === row[0]);
  out.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ask-find]');
    if (b) {
      const r = results[Number(b.dataset.askFind)]; const card = r && cardFor(r.d.row); if (!card) return;
      card.classList.remove('ask-flash'); void card.offsetWidth; card.classList.add('ask-flash');
      clearTimeout(card._askT); card._askT = setTimeout(() => card.classList.remove('ask-flash'), 2600);
      card.setAttribute('tabindex', '-1'); card.focus({ preventScroll: true });
      card.addEventListener('blur', () => card.removeAttribute('tabindex'), { once: true });
      card.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
    }
  });
  // situations.js does the copying and marks the button "is-done" once the clipboard has it, however long that
  // takes; this only tells screen readers it worked
  if (status && typeof MutationObserver === 'function') {
    new MutationObserver((list) => {
      if (!list.some((m) => m.target.matches && m.target.matches('[data-copy-text].is-done'))) return;
      // the copy is newer news than an answer still waiting to be read out
      clearTimeout(render.t); status.textContent = ''; setTimeout(() => say('Copied to the clipboard.'), 30);
    }).observe(out, { subtree: true, attributes: true, attributeFilter: ['class'] });
  }

  // a shared answer: situations.html#ask=your words (the hash never leaves the browser)
  const fromHash = () => {
    const m = location.hash.match(/^#ask=(.*)$/); if (!m) return false;
    let q = ''; try { q = decodeURIComponent(m[1].replace(/\+/g, ' ')); } catch (e) { q = m[1]; }
    input.value = q.slice(0, 200); syncClear(); render(input.value, true); return true;
  };
  addEventListener('hashchange', fromHash);
  if (!fromHash() && input.value) { syncClear(); render(input.value, false); } // the browser may restore typed text on back
})();
