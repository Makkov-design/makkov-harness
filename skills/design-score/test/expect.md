# What the fixtures should score

Two self-contained pages keep the probe honest. `fixtures/good.html` is a small page built with care; `fixtures/bad.html` breaks every rule in `../rubric.md` on purpose. Neither page loads anything from the network.

Expected values are ranges, not exact numbers: installed fonts, scrollbar width and the browser version move a score by a few points. A change to `src/probe.js` that pushes either page out of its range is a calibration change and needs a matching edit to `rubric.md`.

## How to run

Open the fixture in Chrome, Edge or Firefox at 1440 × 900 with no reduced-motion preference, load the probe and print the result in the console:

```js
// In the DevTools console of the fixture page, after pasting the contents of mh-score.js
// (set window.MHScoreNoAuto = true first to skip the overlay) or of src/probe.js:
const r = MHScore.run();
console.log(r.score, r.grade, r.scanned);
console.table(r.categories.map(c => ({ category: c.id, score: c.score, summary: c.summary })));
console.table(r.categories.flatMap(c => c.checks).map(k => ({ check: k.id, status: k.status, score: k.score, value: k.display })));
```

Then repeat at 390 × 844 (device toolbar) for the phone-only check.

## good.html

**Overall: 85 or more** (expected 95–100, grade A or A+). Every measured check should pass at 1440 × 900.

| Category | Expected | What each check should report |
|---|---|---|
| Accessibility | 95–100 | Contrast: every text block passes AA; the tightest pair is the accent tag text on its tint, about 5:1. Alt: the one screenshot image has descriptive alt text. Labels: the email field and the checkbox are labelled. Names: every link, button and summary has text. Language: `lang="en"`. Headings: one h1, h2 sections, h3 cards, no skipped level. Targets: everything is 24px or larger; the native checkbox is exempt as a user-agent control. Focus: a `:focus-visible` outline, nothing removed. Zoom: allowed. |
| Typography | 95–100 | Families: 2 (system-ui, ui-monospace). Sizes: 6 (14, 16, 18, 22, 28, 40px). Body: 18px. Line height: 1.5–1.6. Line length: about 40–75 characters (cards near 40, paragraphs near 65–70). Scale: no crowded steps, steady ratio. All caps: only a short eyebrow, nothing long. Weights: 3 (400, 600, 700). |
| Color | 90–100 | Palette: about 11 colours (authored in oklch, lab, hwb, hsl, hex and display-p3). Near duplicates: none. Text colours: the top three cover 90% or more of the text. Accent: 2 hue families (blue accent, green status). |
| Layout and spacing | 95–100 | Grid: 100% of spacing values on 4px. Scale: 10 values (4, 8, 12, 16, 20, 24, 32, 48, 64, 96px). Alignment: every text block shares an edge. Overflow: nothing spills. Column width: 21–36em. |
| Responsive | 100 | Viewport meta present, no horizontal scroll, the image fits, nothing wider than the viewport. Small text: skipped at 1440px; at 390px it passes (smallest text is 14px). |
| Motion | 100 | Reduced motion: handled (a `prefers-reduced-motion: reduce` block). Endless animations: none. Transitions: 160ms. |
| Consistency | 100 | Radii: 3 (8px, 16px, pill). Shadows: 1. Buttons: 3 styles (primary, secondary, light). |

## bad.html

**Overall: under 45** (expected 15–30, grade F). It has no `lang`, no viewport meta, and `overflow` on purpose, so it scrolls sideways at 1440px.

| Category | Expected | What each check should report |
|---|---|---|
| Accessibility | under 25 | Contrast: nearly every text block fails (pale greys on white, yellow headline, white on bright buttons). Alt: 3 of 3 images fail (two without alt, one with `alt="IMG_2041.jpg"`). Labels: 4 fields, two with only a placeholder, two with nothing. Names: 6 icon links and 1 icon button have no name. Language: missing. Headings: two h1s and two skipped levels (h1 → h4 → h6), about 60. Targets: icon links, fields and small buttons are under 24px and crowded. Focus: `:focus { outline: none }` with no replacement. Zoom: passes (no viewport tag, so nothing blocks zoom). |
| Typography | under 30 | Families: 8. Sizes: 15 (9 to 47px). Body: 13px. Line height: about 1.0–1.1. Line length: about 190–220 characters per line. Scale: may only warn, because the 15 sizes step fairly evenly; the size count is what fails. All caps: long uppercase paragraph, headline, banner and marquee. Weights: 9 (100 to 900). |
| Color | under 45 | Palette: 40 or more colours. Near duplicates: many look-alikes of a more used colour (#a9a9a9 / #ababab / #adadad, #fafafa / #fbfbfb / #fcfcfc, #343434 / #353535 / #363636). Text colours: spread over many greys and tints. Accent: 8 or more hue families. |
| Layout and spacing | under 45 | Grid: most values are off-grid (3, 5, 7, 9, 11, 13px…). Scale: about 18–24 distinct values. Alignment: around half the blocks align with nothing. Overflow: the unbroken URL and the 900px image in a 300px box. Column width: paragraphs over 100em wide. |
| Responsive | under 35 | Viewport meta: missing. Horizontal scroll: about 280–310px from the 1700px banner. Media: the 900px image overflows its box. Fixed widths: the banner. Small text: skipped at 1440px; at 390px it fails (9 and 11px text). |
| Motion | under 20 | Reduced motion: not handled. Endless animations: 3 (pulsing banner, spinning badge, sliding marquee). Transitions: 8 buttons with 1.2–3s transitions. |
| Consistency | under 70 | Radii: 9 (1, 3, 5, 7, 10, 13, 18, 22px and a circle). Shadows: 7. Buttons: 8 styles. Each fails or warns; the category is the lightest (5%) and real design systems use up to six radii and five shadows, so it does not sink this page alone. |

## Extract style on good.html

`MHScore.extractStyle()` should return roles close to: background `#ffffff`, text `#1d222b` (ink), muted `#585e69`, accent `#2c57cd`, border `#dde0e5` (from `lab(89 0 -3)`) and surface `#f1f3f8`, give or take one step of rounding. Fonts: system-ui as display and body, ui-monospace as mono. Type scale: 40, 28, 22, 18, 16, 14px. Spacing led by 16, 12, 24 and 8px. Radii 8px, 16px and pill. `format.designMd()` must say it is an approximation and end with "Extracted with Design Score · makkov-harness".
