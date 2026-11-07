/*! Design Score overlay 1.0.0 | makkov-harness | MIT | https://github.com/Makkov-design/makkov-harness
 *  The in-page panel for window.MHScore: the score, element highlights, "Steal the style", the fix prompt,
 *  the score card and the full report. Runs locally and makes no network requests. Every node is built with
 *  DOM APIs (never innerHTML) and every dynamic style goes through CSSOM, so page-derived text is never parsed
 *  as markup and strict CSP or Trusted Types pages keep working. Defines one global: window.MHScoreUI. */
(function (root) {
  'use strict';
  if (!root || !root.document) return;
  var W = root;
  var D = root.document;
  var VERSION = '1.0.0';
  var HOST_ID = 'mh-score-root';
  var SCORE_PAGE = 'https://makkov-design.github.io/makkov-harness/score.html';
  var REPO_URL = 'https://github.com/Makkov-design/makkov-harness';
  var REPO_SHORT = 'github.com/Makkov-design/makkov-harness';
  var SVGNS = 'http://www.w3.org/2000/svg';

  // A second copy of the bundle (the bookmarklet clicked again) reuses the live instance, so the autorun
  // toggles the open panel instead of stacking a new one. A different version replaces the old one.
  var prev = W.MHScoreUI;
  if (prev && prev.__mh) {
    if (prev.version === VERSION) return;
    try { if (typeof prev.destroy === 'function') prev.destroy(); } catch (e) { /* replace it anyway */ }
  }

  /* ------------------------------------------------------------------ helpers */

  function now() { try { return W.performance.now(); } catch (e) { return Date.now(); } }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }
  function str(v) { return v == null ? '' : String(v); }
  function arr(v) { return Array.isArray(v) ? v : []; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function fmt(n) { return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
  function plural(n, one, many) { return fmt(n) + ' ' + (n === 1 ? one : (many || one + 's')); }
  function pts(v) { v = Math.abs(Number(v) || 0); return v >= 10 ? String(Math.round(v)) : v.toFixed(1); }
  function cap(s) { s = str(s); return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function oneLine(s, max) {
    s = str(s).replace(/\s+/g, ' ').trim();
    return max && s.length > max ? s.slice(0, max - 1) + '…' : s;
  }
  function reduced() {
    try { return !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; }
  }
  // Bottom-sheet layout: a narrow viewport, or a phone showing a desktop-width page (see deviceZoom).
  function narrow() { return S && S.zoom ? S.zoom.sheet : (W.innerWidth || 1024) <= 640; }
  // A phone showing a page without a viewport meta tag (or in "desktop site" mode) lays the page out about 980 CSS
  // px wide and shrinks it to fit the screen, so a 400px panel would show at about 40%. Media queries and
  // innerWidth both see the wide layout viewport, so compare it with the device width instead. The panel and the
  // dock are then scaled back up with the `scale` property; the highlight layer stays in page coordinates.
  function deviceZoom() {
    var out = { z: 1, sheet: false, xs: false };
    try {
      if (!W.matchMedia || !W.matchMedia('(pointer: coarse)').matches) return out;
      if (!(W.CSS && typeof W.CSS.supports === 'function' && W.CSS.supports('scale', '2'))) return out;
      var de = D.documentElement, quirks = D.compatMode === 'BackCompat' && D.body;
      var lw = (quirks ? D.body.clientWidth : de && de.clientWidth) || W.innerWidth || 0;
      var lh = (quirks ? D.body.clientHeight : de && de.clientHeight) || W.innerHeight || 0;
      var sc = W.screen, sw = sc ? Number(sc.width) : 0, sh = sc ? Number(sc.height) : 0;
      if (!(lw > 0) || !(sw > 0) || !(sh > 0)) return out;
      // iOS keeps screen.width at the portrait width, Android swaps it on rotation: take the side that matches.
      var dw = lw > lh ? Math.max(sw, sh) : Math.min(sw, sh);
      var ow = Number(W.outerWidth) || 0;
      if (ow > 160 && ow < dw) dw = ow; // a split-screen window narrower than the screen
      var z = lw / dw;
      if (!(z > 1.3)) return out;
      out.z = Math.round(Math.min(z, 4) * 1000) / 1000;
      out.sheet = dw <= 640;
      out.xs = dw <= 400;
    } catch (e) { /* keep the plain layout */ }
    return out;
  }
  function engine() { var m = W.MHScore; return m && typeof m.run === 'function' ? m : null; }
  function fmtApi() { var m = W.MHScore; return m && m.format ? m.format : null; }
  function slugHost(h) { return str(h).toLowerCase().replace(/[^a-z0-9.-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 60) || 'page'; }
  function isMac() { try { return /Mac|iPhone|iPad|iPod/.test(W.navigator.platform || W.navigator.userAgent || ''); } catch (e) { return false; } }
  function gradeOf(s) { return s >= 95 ? 'A+' : s >= 85 ? 'A' : s >= 75 ? 'B' : s >= 65 ? 'C' : s >= 50 ? 'D' : 'F'; }
  function warn(e) { try { if (W.console && W.console.warn) W.console.warn('Design Score:', e); } catch (e2) { /* ignore */ } }
  function guard(fn) {
    return function () {
      try { return fn.apply(this, arguments); } catch (e) { warn(e); return undefined; }
    };
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  // Local date, like stamp(), so the card and the report show the same day.
  function dateOnly(ts) {
    var d = new Date(str(ts));
    if (!isFinite(d.getTime())) return str(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function stamp(ts) {
    var d = new Date(str(ts));
    if (!isFinite(d.getTime())) return str(ts);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }
  function hexRgb(hex) {
    var m = /^#?([0-9a-f]{6})/i.exec(str(hex));
    if (!m) return [255, 255, 255];
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function alpha(hex, a) { var c = hexRgb(hex); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function safeHex(v) { v = str(v).trim(); return /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(v) ? v : null; }
  // CSS values copied from the page into our own styles: no url(), no escapes, no declarations or blocks.
  function safeCss(v) {
    v = str(v);
    if (!v || v.length > 300 || /url\s*\(|image-set|image\(|expression|@|\\|[;{}<>]/i.test(v)) return null;
    return v;
  }
  function safeFont(v) {
    v = str(v);
    if (!v || v.length > 300 || /[;{}<>\\@()]/.test(v)) return null;
    return v;
  }

  // Score bands: the ring, bars and grade chip share them. Statuses and severities have their own colours.
  var BANDS = [[85, '#84d1af'], [75, '#bcdc83'], [65, '#f1c45e'], [50, '#f2a26a'], [0, '#f66d67']];
  function bandColor(score) {
    if (!isNum(score)) return '#6f7a84';
    for (var i = 0; i < BANDS.length; i++) if (score >= BANDS[i][0]) return BANDS[i][1];
    return BANDS[BANDS.length - 1][1];
  }
  var SHIELDS = { 'A+': ['brightgreen', '#44cc11'], A: ['green', '#97ca00'], B: ['yellowgreen', '#a4a61d'], C: ['yellow', '#dfb317'], D: ['orange', '#fe7d37'], F: ['red', '#e05d44'] };
  var STATUS = {
    pass: { color: '#84d1af', label: 'Pass', icon: 'check' },
    warn: { color: '#f1c45e', label: 'Warning', icon: 'warn' },
    fail: { color: '#f66d67', label: 'Fail', icon: 'fail' },
    skip: { color: '#8f9ba6', label: 'Not measured', icon: 'skip' }
  };
  var SEV = { high: { color: '#f66d67', label: 'High' }, medium: { color: '#f1c45e', label: 'Medium' }, low: { color: '#c3b6dd', label: 'Low' } };
  var CAT_FALLBACK = [
    { id: 'accessibility', label: 'Accessibility', weight: 25 }, { id: 'typography', label: 'Typography', weight: 20 },
    { id: 'color', label: 'Color', weight: 15 }, { id: 'layout', label: 'Layout and spacing', weight: 20 },
    { id: 'responsive', label: 'Responsive', weight: 10 }, { id: 'motion', label: 'Motion', weight: 5 },
    { id: 'consistency', label: 'Consistency', weight: 5 }
  ];

  // The makkov-harness symbol (docs/img/brand/symbol.svg), used in the header, the card and the report.
  var MARK_VIEWBOX = '-4 -4 284 288';
  var MARK_TRANSFORM = 'translate(20 20) scale(1.142857143) translate(-13 -11)';
  var MARK_PATHS = [
    'M 76.627 12.468 C 68.089 15.512, 62.156 22.402, 59.027 32.909 C 55.529 44.654, 49.022 52.173, 39.237 55.776 C 37.732 56.330, 34.293 57.571, 31.596 58.533 C 6.553 67.468, 8.037 104.141, 33.744 111.614 C 50.545 116.498, 65.215 109.037, 73.669 91.306 C 76.554 85.256, 79.273 81.096, 81.595 79.182 C 85.342 76.094, 85.746 75.872, 96.178 71.178 C 103.911 67.698, 108.777 62.002, 111.556 53.177 C 113.911 45.698, 113.211 31.119, 110.220 25.357 C 104.298 13.952, 88.967 8.070, 76.627 12.468',
    'M 134.081 14.117 C 111.459 25.422, 114.615 63.182, 138.959 72.484 C 150.400 76.856, 153.149 79.454, 159.017 91.440 C 164.624 102.892, 167.367 105.880, 175.861 109.784 C 190.990 116.738, 209.220 111.245, 216.200 97.628 C 223.373 83.635, 215.808 63.607, 201.442 58.560 C 198.999 57.702, 194.988 56.293, 192.528 55.428 C 183.467 52.243, 175.935 42.961, 173.034 31.405 C 168.835 14.678, 149.835 6.245, 134.081 14.117',
    'M 36.920 119.011 C 22.580 121.437, 11.582 135.417, 13.449 148.847 C 15.251 161.813, 22.473 169.995, 36.129 174.543 C 48.906 178.798, 55.564 185.916, 59.473 199.500 C 63.983 215.175, 78.580 223.880, 93.217 219.625 C 106.220 215.845, 113.111 205.891, 113.086 190.927 C 113.056 173.231, 106.663 163.063, 92 157.390 C 82.455 153.697, 78.026 149.258, 73.052 138.395 C 66.375 123.812, 52.509 116.374, 36.920 119.011',
    'M 177.275 120.654 C 170.201 123.159, 163.351 130.223, 158.889 139.613 C 154.278 149.320, 149.589 153.859, 140.692 157.228 C 132.857 160.196, 125.004 167.303, 121.907 174.230 C 118.281 182.339, 118.446 198.414, 122.229 205.638 C 134.248 228.588, 165.311 224.541, 173.064 199.015 C 176.863 186.507, 183.332 179.166, 193.826 175.454 C 207.483 170.624, 211.644 167.610, 215.698 159.610 C 222.922 145.353, 217.645 128.487, 203.801 121.588 C 197.653 118.524, 184.589 118.064, 177.275 120.654'
  ];

  var ICONS = {
    close: ['M18 6 6 18', 'M6 6l12 12'],
    rerun: ['M20.5 12a8.5 8.5 0 1 1-2.5-6', 'M20.5 4v4.5H16'],
    minimize: ['M6 12h12'],
    expand: ['m6 15 6-6 6 6'],
    chevron: ['m6 9 6 6 6-6'],
    copy: ['M9 9h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V10a1 1 0 0 1 1-1z', 'M16 9V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3'],
    download: ['M12 4v11', 'm7 11 5 5 5-5', 'M5 20h14'],
    external: ['M14 4h6v6', 'M10 14 20 4', 'M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5'],
    check: ['M20 6 9 17l-5-5'],
    warn: ['M12 8.5v4.5', 'M12 16.5h.01', 'M10.4 3.9 2.2 18a1.9 1.9 0 0 0 1.6 2.9h16.4a1.9 1.9 0 0 0 1.6-2.9L13.6 3.9a1.9 1.9 0 0 0-3.2 0z'],
    fail: ['M17 7 7 17', 'M7 7l10 10'],
    skip: ['M7 12h10'],
    target: ['M12 3v3', 'M12 18v3', 'M3 12h3', 'M18 12h3', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'],
    card: ['M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z', 'M7 15l3-3 2 2 3-4 2 3'],
    report: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z', 'M14 3v5h5', 'M9 13h6', 'M9 17h4'],
    clear: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'm15 9-6 6', 'm9 9 6 6'],
    next: ['m9 6 6 6-6 6'],
    code: ['m9 8-4 4 4 4', 'm15 8 4 4-4 4']
  };

  /* --------------------------------------------------------------------- DOM */

  function setAttrs(el, props) {
    if (!props) return;
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === 'text') el.textContent = str(v);
      else if (k === 'css') Object.keys(v).forEach(function (p) { if (v[p] != null) { try { el.style.setProperty(p, String(v[p])); } catch (e) { /* ignore */ } } });
      else if (k === 'on') Object.keys(v).forEach(function (t) { el.addEventListener(t, guard(v[t])); });
      else el.setAttribute(k, v === true ? '' : String(v));
    });
  }
  function add(el, kid) {
    if (kid == null || kid === false) return;
    if (Array.isArray(kid)) { for (var i = 0; i < kid.length; i++) add(el, kid[i]); return; }
    el.appendChild(typeof kid === 'object' && kid.nodeType ? kid : D.createTextNode(str(kid)));
  }
  // h('div', {class: 'x', css: {...}, on: {...}}, children...) builds HTML; svg() builds SVG. Text is always a text node.
  function h(tag, props) {
    var el = D.createElement(tag);
    setAttrs(el, props);
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function svg(tag, props) {
    var el = D.createElementNS(SVGNS, tag);
    setAttrs(el, props);
    for (var i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function clear(el) { if (el) while (el.firstChild) el.removeChild(el.firstChild); }
  function icon(name, cls) {
    var s = svg('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false', class: 'ic' + (cls ? ' ' + cls : '') });
    (ICONS[name] || []).forEach(function (d) { s.appendChild(svg('path', { d: d })); });
    return s;
  }
  function markSvg(cls) {
    var s = svg('svg', { viewBox: MARK_VIEWBOX, 'aria-hidden': 'true', focusable: 'false', class: cls || 'mark' });
    var g = svg('g', { transform: MARK_TRANSFORM, fill: 'currentColor' });
    MARK_PATHS.forEach(function (d) { g.appendChild(svg('path', { d: d })); });
    s.appendChild(g);
    return s;
  }
  function button(cls, kids, onClick, attrs) {
    var b = h('button', attrs || null, kids);
    b.setAttribute('type', 'button');
    b.setAttribute('class', cls);
    b.addEventListener('click', guard(function (e) {
      if (b.getAttribute('aria-disabled') === 'true') { e.preventDefault(); return; }
      onClick.call(b, e);
    }));
    return b;
  }
  function iconButton(name, label, onClick) {
    return button('ib', [icon(name), h('span', { class: 'sr' }, label)], onClick, { title: label });
  }
  // A labelled action button that can say "Copied" for a moment.
  function actionButton(cls, iconName, label, onClick, short) {
    var lbl = h('span', { class: 'lbl' }, label);
    var kids = [icon(iconName, 'ic-main'), icon('check', 'ic-done'), lbl];
    var b = button(cls, kids, onClick, short ? { 'aria-label': label, title: label } : null);
    if (short) { lbl.textContent = short; lbl.setAttribute('aria-hidden', 'true'); }
    b._mhLbl = lbl;
    b._mhText = lbl.textContent;
    b._mhShort = !!short;
    return b;
  }

  /* --------------------------------------------------------------------- CSS */

  // Layout rules shared by a media query and a host class, as [selectors, declarations].
  var SHEET_RULES = [
    ['.panel', 'top:auto;left:0;right:0;bottom:0;width:auto;max-width:none;max-height:86vh;border-radius:22px 22px 0 0;border-bottom:0;padding-bottom:env(safe-area-inset-bottom,0px)'],
    ['.panel.is-in', 'animation-name:mh-up'],
    ['.panel.is-out', 'animation-name:mh-down'],
    ['.grab', 'display:block;flex:none;width:40px;height:4px;margin:8px auto 0;border-radius:4px;background:rgba(255,255,255,.2)'],
    ['.head', 'padding-top:8px'],
    ['.dock,.dock.is-min', 'left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px))'],
    ['.dock-text', 'flex:1 1 auto']
  ];
  var XS_RULES = [
    ['.actions .btn:not(.btn-primary) .lbl', 'display:none'],
    ['.actions .btn:not(.btn-primary)', 'width:44px;padding:0'],
    ['.hero', 'grid-template-columns:108px minmax(0,1fr);gap:14px'],
    ['.ring', 'width:108px;height:108px'],
    ['.ring-v', 'font-size:38px'],
    ['.pal', 'grid-template-columns:repeat(3,minmax(0,1fr))'],
    ['.roles', 'grid-template-columns:repeat(2,minmax(0,1fr))'],
    ['.cat', 'grid-template-columns:minmax(0,1fr) 28px 64px 28px;gap:8px'],
    ['.exports', 'grid-template-columns:1fr']
  ];
  function rules(list, prefix) {
    return list.map(function (r) {
      var sel = prefix ? r[0].split(',').map(function (s) { return prefix + ' ' + s; }).join(',') : r[0];
      return sel + '{' + r[1] + '}';
    }).join('');
  }

  var CSS = [
    ':host{all:initial!important;position:absolute!important;top:0!important;left:0!important;width:0!important;height:0!important;margin:0!important;padding:0!important;border:0!important;display:block!important;overflow:visible!important;z-index:2147483647!important;pointer-events:none!important;transform:none!important;filter:none!important;',
    '--mh-bg:#0e1013;--mh-bg-2:#14171b;--mh-bg-3:#1a1e23;--mh-bg-4:#23282e;--mh-edge:rgba(255,255,255,.11);--mh-rule:rgba(255,255,255,.07);--mh-rule-2:rgba(255,255,255,.13);',
    '--mh-tint-1:rgba(255,255,255,.04);--mh-tint-2:rgba(255,255,255,.075);--mh-tint-3:rgba(255,255,255,.12);',
    '--mh-ink:#f1f2f3;--mh-ink-2:#c4cad0;--mh-muted:#8f9ba6;--mh-opal-1:#c3b6dd;--mh-opal-2:#b7dbca;--mh-opal-3:#f3ead9;--mh-violet:#9d84ef;--mh-focus:#99bdd3;',
    '--mh-ok:#84d1af;--mh-warn:#f1c45e;--mh-bad:#f66d67;',
    '--mh-sans:-apple-system,BlinkMacSystemFont,"Segoe UI Variable Text","Segoe UI",system-ui,Roboto,"Helvetica Neue",Arial,sans-serif;',
    '--mh-mono:ui-monospace,"SF Mono","Cascadia Mono","Segoe UI Mono",Menlo,Consolas,"Liberation Mono",monospace;',
    '--mh-ease:cubic-bezier(.16,1,.3,1)}',
    '*,*::before,*::after{box-sizing:border-box}',
    '[hidden]{display:none!important}',
    '.panel,.dock{color-scheme:dark}',
    '.panel,.dock,.layer,.sweep{font-family:var(--mh-sans);font-size:14px;line-height:1.45;font-weight:400;font-style:normal;letter-spacing:0;text-transform:none;text-align:left;text-indent:0;word-spacing:normal;white-space:normal;direction:ltr;color:var(--mh-ink);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;-webkit-text-size-adjust:100%;text-size-adjust:100%}',
    'h2,h3,h4,p,ul,ol,li,dl,dt,dd,figure{margin:0;padding:0;font:inherit;color:inherit}',
    'ul,ol{list-style:none}',
    'code{font-family:var(--mh-mono);font-size:inherit}',
    'a{color:inherit}',
    'button{-webkit-appearance:none;appearance:none;margin:0;padding:0;border:0;background:none;color:inherit;font:inherit;letter-spacing:inherit;text-align:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;touch-action:manipulation}',
    'button[aria-disabled="true"]{cursor:default;opacity:.45}',
    'button:focus-visible,a:focus-visible,textarea:focus-visible,[tabindex]:focus-visible{outline:2px solid var(--mh-focus);outline-offset:2px}',
    '.sr{position:absolute!important;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap}',
    '.ic{display:block;flex:none;width:16px;height:16px}',
    '.mark{display:block;flex:none;width:20px;height:20px;color:var(--mh-ink)}',
    // panel
    '.panel{position:fixed;top:12px;right:12px;bottom:12px;width:400px;max-width:calc(100vw - 24px);display:flex;flex-direction:column;overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;pointer-events:auto;isolation:isolate;outline:none;background:var(--mh-bg);border:1px solid var(--mh-edge);border-radius:20px;box-shadow:0 32px 80px -24px rgba(0,0,0,.7),0 10px 28px rgba(0,0,0,.38),inset 0 1px 0 rgba(255,255,255,.05)}',
    '.panel::before{content:"";position:absolute;z-index:-1;inset:0 0 auto 0;height:260px;pointer-events:none;background:radial-gradient(110% 80% at 0% 0%,rgba(195,182,221,.15),rgba(195,182,221,0) 62%),radial-gradient(80% 70% at 100% 0%,rgba(183,219,202,.10),rgba(183,219,202,0) 60%)}',
    '.panel:focus{outline:none}',
    '.panel.is-in{animation:mh-in 460ms var(--mh-ease) both}',
    '.panel.is-out{animation:mh-out 200ms cubic-bezier(.7,0,.84,0) both}',
    '@keyframes mh-in{from{opacity:0;transform:translateX(32px) scale(.985)}}',
    '@keyframes mh-out{to{opacity:0;transform:translateX(24px)}}',
    '@keyframes mh-up{from{opacity:0;transform:translateY(40px)}}',
    '@keyframes mh-down{to{opacity:0;transform:translateY(32px)}}',
    '.grab{display:none}',
    '.head{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:14px 10px 10px 18px}',
    '.brand{display:flex;align-items:center;gap:10px;min-width:0}',
    '.title{font-size:15px;font-weight:650;letter-spacing:-.01em;white-space:nowrap}',
    '.ver{padding:3px 7px;border:1px solid var(--mh-rule-2);border-radius:999px;font:500 10.5px/1.2 var(--mh-mono);color:var(--mh-muted)}',
    '.head-actions{display:flex;gap:2px}',
    '.ib{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;color:var(--mh-ink-2);transition:background-color 160ms,color 160ms}',
    '.ib:hover{background:var(--mh-tint-2);color:var(--mh-ink)}',
    '.ib .ic{width:18px;height:18px}',
    '.ib.is-spin .ic{animation:mh-spin 760ms var(--mh-ease)}',
    '@keyframes mh-spin{to{transform:rotate(360deg)}}',
    '.tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:2px 16px 8px;padding:4px;background:var(--mh-bg-2);border:1px solid var(--mh-rule);border-radius:13px}',
    '.tab{height:34px;border-radius:9px;text-align:center;font-size:13px;font-weight:600;color:var(--mh-muted);transition:background-color 180ms,color 180ms,box-shadow 180ms}',
    '.tab:hover{color:var(--mh-ink)}',
    '.tab[aria-selected="true"]{background:var(--mh-bg-4);color:var(--mh-ink);box-shadow:inset 0 1px 0 rgba(255,255,255,.07),0 1px 3px rgba(0,0,0,.45)}',
    // On a short viewport (landscape phone, 400% zoom) the score area keeps a floor and the panel itself scrolls.
    '.scroll{position:relative;flex:1 1 auto;min-height:min(160px,40vh);overflow-x:hidden;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:4px 16px 24px;scrollbar-width:thin;scrollbar-color:#2b3137 transparent}',
    '.scroll::-webkit-scrollbar{width:10px}.scroll::-webkit-scrollbar-thumb{background:#2b3137;border-radius:10px;border:3px solid var(--mh-bg)}.scroll::-webkit-scrollbar-track{background:transparent}',
    '.pane{outline:none}',
    // hero
    '.hero{display:grid;grid-template-columns:124px minmax(0,1fr);gap:18px;align-items:center;padding:12px 2px 16px}',
    '.hero-side{min-width:0}',
    '.ring{position:relative;width:124px;height:124px;flex:none}',
    '.ring svg{display:block;width:100%;height:100%;overflow:visible}',
    '.ring-num{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}',
    '.ring-v{font-size:44px;line-height:1;font-weight:700;letter-spacing:-.045em;font-variant-numeric:tabular-nums}',
    '.ring-of{margin-top:5px;font-size:11px;color:var(--mh-muted)}',
    '.ring-glow{position:absolute;inset:14px;border-radius:50%;background:var(--band-a,rgba(132,209,175,.16));filter:blur(18px);z-index:-1}',
    '.ring-spin{position:absolute;inset:0;animation:mh-spin 1100ms linear infinite}',
    '.ring-scan{font-size:10.5px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--mh-muted)}',
    '.grade{display:inline-flex;align-items:center;gap:8px;height:30px;padding:0 12px 0 11px;border-radius:999px;background:var(--band-a);box-shadow:inset 0 0 0 1px var(--band-b);color:var(--band)}',
    '.grade-l{font-size:10.5px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--mh-ink-2)}',
    '.grade-v{font-size:17px;font-weight:750;line-height:1}',
    '.host{margin-top:10px;font-size:17px;font-weight:650;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.ptitle{margin-top:2px;font-size:12.5px;color:var(--mh-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.meta{margin-top:8px;font:500 11.5px/1.45 var(--mh-mono);color:var(--mh-muted)}',
    '.note{display:flex;gap:8px;align-items:flex-start;margin:0 0 14px;padding:10px 12px;border-radius:12px;background:rgba(241,196,94,.08);box-shadow:inset 0 0 0 1px rgba(241,196,94,.22);font-size:12.5px;color:var(--mh-ink-2)}',
    '.note .ic{margin-top:1px;color:var(--mh-warn)}',
    '.callout{margin:0 0 4px;padding:12px 14px;border-radius:14px;background:linear-gradient(135deg,rgba(195,182,221,.11),rgba(183,219,202,.06));box-shadow:inset 0 0 0 1px rgba(195,182,221,.2);font-size:13px;line-height:1.5;color:var(--mh-ink-2)}',
    '.callout strong{color:var(--mh-ink);font-weight:650}',
    '.callout p+p{margin-top:4px}',
    // sections
    '.sec{margin-top:22px}',
    '.sec-head{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 2px 8px}',
    '.sec-title{font-size:11.5px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--mh-ink-2)}',
    '.sec-aside{font-size:12px;color:var(--mh-muted);font-variant-numeric:tabular-nums}',
    '.empty{padding:14px;border-radius:14px;background:var(--mh-bg-2);border:1px solid var(--mh-rule);font-size:13px;color:var(--mh-ink-2)}',
    // categories
    '.cats{display:grid;gap:1px}',
    '.cat{display:grid;grid-template-columns:minmax(0,1fr) 30px minmax(64px,104px) 30px;align-items:center;gap:10px;width:100%;min-height:36px;padding:6px 8px;border-radius:10px;transition:background-color 160ms}',
    '.cat:hover{background:var(--mh-tint-1)}',
    '.cat-label{font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.cat-w{font:500 11px/1 var(--mh-mono);color:var(--mh-muted);text-align:right}',
    '.bar{position:relative;display:block;height:6px;border-radius:6px;background:var(--mh-tint-2);overflow:hidden}',
    '.bar-fill{position:absolute;inset:0;border-radius:inherit;transform-origin:0 50%;transition:transform 1000ms var(--mh-ease)}',
    '.cat-score{font:600 13px/1 var(--mh-mono);text-align:right;font-variant-numeric:tabular-nums}',
    '.cat.is-off .cat-label,.cat.is-off .cat-score{color:var(--mh-muted)}',
    // issues
    '.issues{display:grid;gap:6px}',
    '.issue{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:12px;width:100%;padding:12px;border-radius:14px;background:var(--mh-bg-2);border:1px solid var(--mh-rule);transition:background-color 160ms,border-color 160ms}',
    '.issue:hover{background:var(--mh-bg-3);border-color:var(--mh-rule-2)}',
    '.issue[aria-expanded="true"]{background:var(--mh-bg-3);border-color:rgba(157,132,239,.5);border-bottom-color:var(--mh-rule);border-radius:14px 14px 0 0}',
    '.sev{display:block;width:8px;height:8px;margin-top:6px;border-radius:50%;box-shadow:0 0 0 3px var(--sev-a)}',
    '.issue-main{display:block;min-width:0}',
    '.issue-title{display:block;font-size:13.5px;font-weight:600;line-height:1.35;overflow-wrap:anywhere}',
    '.issue-fix{display:block;margin-top:3px;font-size:12.5px;line-height:1.45;color:var(--mh-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.issue[aria-expanded="true"] .issue-fix{color:var(--mh-ink-2);white-space:normal;overflow-wrap:anywhere}',
    '.issue-meta{display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin-top:7px;font-size:11.5px;color:var(--mh-muted)}',
    '.issue-meta .ic{width:13px;height:13px}',
    '.tag{display:inline-flex;align-items:center;gap:4px}',
    '.issue-pts{padding-top:1px;font:600 12px/1.2 var(--mh-mono);color:var(--mh-ink-2);white-space:nowrap;font-variant-numeric:tabular-nums}',
    '.issue-detail{padding:4px 12px 12px;margin-top:-1px;border:1px solid rgba(157,132,239,.5);border-top:0;border-radius:0 0 14px 14px;background:var(--mh-bg-3)}',
    '.issue-text{padding-top:8px;font-size:12.5px;line-height:1.5;color:var(--mh-ink-2);overflow-wrap:anywhere}',
    '.more{display:flex;justify-content:center;margin-top:8px}',
    '.link-btn{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 12px;border-radius:999px;font-size:12.5px;font-weight:600;color:var(--mh-ink-2);transition:background-color 160ms,color 160ms}',
    '.link-btn:hover{background:var(--mh-tint-2);color:var(--mh-ink)}',
    '.link-btn .ic{width:14px;height:14px}',
    '.row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:10px}',
    '.hint{font-size:11.5px;color:var(--mh-muted)}',
    // examples
    '.exs{display:grid;gap:2px;margin-top:10px}',
    '.ex{display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;align-items:start;width:100%;padding:7px 8px;border-radius:9px;transition:background-color 140ms}',
    '.ex:hover{background:var(--mh-tint-1)}',
    '.ex-n{display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:7px;background:var(--mh-opal-1);color:#140f22;font:700 11px/1 var(--mh-mono)}',
    '.ex.is-on{background:var(--mh-tint-2)}',
    '.ex.is-static{cursor:default}.ex.is-static:hover{background:none}.ex.is-static .ex-n{background:var(--mh-bg-4);color:var(--mh-muted)}',
    '.ex.is-on .ex-n{background:#e9e2ff;box-shadow:0 0 0 2px var(--mh-violet)}',
    '.ex-body{display:block;min-width:0}',
    '.ex-sel{display:block;font-size:11.5px;line-height:1.45;color:var(--mh-ink);overflow-wrap:anywhere}',
    '.ex-note{display:block;margin-top:1px;font-size:12px;color:var(--mh-ink-2);overflow-wrap:anywhere}',
    '.ex-text{display:block;margin-top:1px;font-size:12px;color:var(--mh-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    // checks
    '.disclose{display:flex;align-items:center;gap:10px;width:100%;min-height:48px;padding:8px 14px;border-radius:14px;background:var(--mh-bg-2);border:1px solid var(--mh-rule);transition:background-color 160ms,border-color 160ms}',
    '.disclose:hover{background:var(--mh-bg-3);border-color:var(--mh-rule-2)}',
    '.disclose-t{font-size:13.5px;font-weight:600}',
    '.counts{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:4px 10px;margin-left:auto;font:500 11.5px/1.3 var(--mh-mono);color:var(--mh-muted)}',
    '.cnt{display:inline-flex;align-items:center;gap:5px}',
    '.cnt::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--c)}',
    '.chev{transition:transform 220ms var(--mh-ease)}',
    '[aria-expanded="true"]>.chev{transform:rotate(180deg)}',
    '.checks{display:grid;gap:4px;margin-top:6px}',
    '.group-h{display:grid;grid-template-columns:minmax(0,1fr) auto 16px;align-items:center;gap:10px;width:100%;min-height:40px;padding:6px 10px;border-radius:10px;transition:background-color 160ms}',
    '.group-h:hover{background:var(--mh-tint-1)}',
    '.group-l{font-size:13px;font-weight:600}',
    '.group-s{font:600 12px/1 var(--mh-mono);color:var(--mh-ink-2);font-variant-numeric:tabular-nums}',
    '.group-b{display:grid;gap:2px;padding:0 0 8px}',
    '.check{display:grid;grid-template-columns:22px minmax(0,1fr) 28px;align-items:start;gap:10px;width:100%;padding:8px 10px;border-radius:10px;transition:background-color 140ms}',
    '.check:hover{background:var(--mh-tint-1)}',
    '.check[aria-expanded="true"]{background:var(--mh-tint-1)}',
    '.st{display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:7px;color:var(--c);background:var(--ca)}',
    '.st .ic{width:13px;height:13px;stroke-width:2.4}',
    '.check-main{display:block;min-width:0}',
    '.check-label{display:block;font-size:13px;font-weight:550}',
    '.check-display{display:block;margin-top:1px;font-size:12px;color:var(--mh-muted);overflow-wrap:anywhere}',
    '.check-score{padding-top:3px;font:600 12px/1 var(--mh-mono);color:var(--mh-ink-2);text-align:right;font-variant-numeric:tabular-nums}',
    '.check-detail{margin:0 0 6px 32px;padding:4px 10px 10px;border-left:1px solid var(--mh-rule-2)}',
    '.kv{display:grid;gap:8px;padding-top:6px}',
    '.kv dt{font-size:10.5px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--mh-muted)}',
    '.kv dd{margin-top:2px;font-size:12.5px;line-height:1.5;color:var(--mh-ink-2);overflow-wrap:anywhere}',
    // style tab
    '.intro{padding:6px 2px 0;font-size:12.5px;line-height:1.5;color:var(--mh-muted)}',
    '.roles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}',
    '.role{display:grid;grid-template-columns:26px minmax(0,1fr);column-gap:8px;align-items:center;width:100%;padding:8px;border-radius:12px;background:var(--mh-bg-2);border:1px solid var(--mh-rule);transition:border-color 160ms,background-color 160ms}',
    '.role:hover,.sw:hover{border-color:var(--mh-rule-2);background:var(--mh-bg-3)}',
    '.chip{display:block;width:26px;height:26px;border-radius:8px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.16)}',
    '.role-t{display:block;min-width:0}',
    '.role-k{display:block;font-size:11px;color:var(--mh-muted);text-transform:capitalize}',
    '.role-v{display:block;font:600 11.5px/1.3 var(--mh-mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.pal{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}',
    '.sw{display:block;width:100%;overflow:hidden;border-radius:12px;background:var(--mh-bg-2);border:1px solid var(--mh-rule);transition:border-color 160ms,background-color 160ms}',
    '.sw-chip{display:block;height:54px;box-shadow:inset 0 -1px 0 rgba(255,255,255,.08)}',
    '.sw-hex{display:block;padding:7px 8px 0;font:600 11px/1.2 var(--mh-mono)}',
    '.sw-name{display:block;padding:2px 8px 8px;font-size:11px;color:var(--mh-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.fonts{display:grid;gap:8px}',
    '.font{display:grid;grid-template-columns:56px minmax(0,1fr);gap:12px;align-items:center;padding:12px;border-radius:14px;background:var(--mh-bg-2);border:1px solid var(--mh-rule)}',
    '.font-aa{font-size:34px;line-height:1;text-align:center;color:var(--mh-ink);overflow:hidden}',
    '.font-name{font-size:13.5px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.font-meta{margin-top:1px;font-size:11.5px;color:var(--mh-muted)}',
    '.font-sample{margin-top:6px;font-size:15px;line-height:1.3;color:var(--mh-ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.ladder{display:grid;gap:0;border-radius:14px;background:var(--mh-bg-2);border:1px solid var(--mh-rule);overflow:hidden}',
    '.step{display:grid;grid-template-columns:52px minmax(0,1fr);gap:12px;align-items:center;padding:8px 12px;border-top:1px solid var(--mh-rule)}',
    '.step:first-child{border-top:0}',
    '.step-px{font:600 11.5px/1.2 var(--mh-mono);color:var(--mh-ink-2)}',
    '.step-px small{display:block;margin-top:2px;font-size:10.5px;font-weight:500;color:var(--mh-muted)}',
    '.step-body{min-width:0}',
    '.step-sample{display:block;line-height:1.15;color:var(--mh-ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.step-meta{display:block;margin-top:2px;font-size:11px;color:var(--mh-muted)}',
    '.chips{display:flex;flex-wrap:wrap;gap:6px}',
    '.chipx{display:inline-flex;align-items:center;gap:8px;min-height:32px;padding:4px 10px 4px 8px;border-radius:10px;background:var(--mh-bg-2);border:1px solid var(--mh-rule);font:600 11.5px/1.2 var(--mh-mono)}',
    '.chipx small{font-weight:500;color:var(--mh-muted)}',
    '.sp-bar{display:block;height:10px;min-width:2px;border-radius:3px;background:linear-gradient(90deg,var(--mh-opal-1),var(--mh-opal-2))}',
    '.rad-box{display:block;width:22px;height:22px;border:1.5px solid var(--mh-opal-1);border-right-color:transparent;border-bottom-color:transparent;background:rgba(195,182,221,.1)}',
    '.shadows{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}',
    '.sh{border-radius:14px;overflow:hidden;background:var(--mh-bg-2);border:1px solid var(--mh-rule)}',
    '.sh-tile{display:flex;align-items:center;justify-content:center;height:78px;background:#e9ebee}',
    '.sh-card{display:block;width:58%;height:40px;border-radius:9px;background:#ffffff}',
    '.sh-v{display:block;padding:7px 9px 9px;font:500 10.5px/1.4 var(--mh-mono);color:var(--mh-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.vars{display:grid;gap:2px;margin-top:6px;max-height:240px;overflow:auto;overscroll-behavior:contain;padding:8px;border-radius:12px;background:var(--mh-bg-2);border:1px solid var(--mh-rule)}',
    '.var{display:grid;grid-template-columns:14px minmax(0,1fr);gap:8px;align-items:center;font:500 11px/1.5 var(--mh-mono);color:var(--mh-ink-2)}',
    '.var i{display:block;width:12px;height:12px;border-radius:4px;box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)}',
    '.var span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.var b{font-weight:600;color:var(--mh-ink)}',
    '.exports{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}',
    '.exports .btn{width:100%;padding:0 12px}',
    // buttons
    '.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;padding:0 16px;border-radius:999px;border:1px solid var(--mh-rule-2);background:var(--mh-bg-2);color:var(--mh-ink);font-size:13.5px;font-weight:600;white-space:nowrap;transition:background-color 180ms,border-color 180ms,box-shadow 240ms,transform 120ms}',
    '.btn:hover{background:var(--mh-bg-4);border-color:rgba(255,255,255,.22)}',
    '.btn:active{transform:translateY(1px)}',
    '.btn .lbl{min-width:0;overflow:hidden;text-overflow:ellipsis}',
    '.btn-primary{background:var(--mh-ink);border-color:var(--mh-ink);color:#0b0d10}',
    '.btn-primary:hover{background:#ffffff;border-color:#ffffff;box-shadow:0 0 0 4px rgba(195,182,221,.28),0 10px 30px rgba(195,182,221,.28)}',
    '.btn-sm{height:36px;padding:0 12px;font-size:12.5px}',
    '.ic-done{display:none}',
    '.is-done .ic-done{display:block;color:var(--mh-ok)}',
    '.btn-primary.is-done .ic-done{color:#127a52}',
    '.is-done .ic-main{display:none}',
    // footer
    '.foot{position:relative;flex:none;padding:12px 16px 12px;border-top:1px solid var(--mh-rule);background:var(--mh-bg)}',
    '.actions{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px}',
    '.fine{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 12px;margin-top:10px;font-size:11.5px;color:var(--mh-muted)}',
    '.fine a{color:var(--mh-ink-2);text-decoration:underline;text-decoration-color:rgba(255,255,255,.28);text-underline-offset:2px;border-radius:4px}',
    '.fine a:hover{color:var(--mh-ink);text-decoration-color:currentColor}',
    '.toast{position:absolute;left:50%;bottom:100%;z-index:3;max-width:calc(100% - 32px);margin-bottom:10px;padding:8px 14px;border-radius:14px;background:var(--mh-ink);color:#0b0d10;font-size:12.5px;font-weight:600;line-height:1.35;text-align:center;box-shadow:0 12px 32px rgba(0,0,0,.45);opacity:0;transform:translate(-50%,8px);transition:opacity 180ms,transform 280ms var(--mh-ease);pointer-events:none}',
    '.toast.is-on{opacity:1;transform:translate(-50%,0)}',
    // manual copy sheet
    '.msheet{position:absolute;inset:0;z-index:6;display:flex;flex-direction:column;gap:10px;padding:20px 16px 16px;background:var(--mh-bg);border-radius:inherit}',
    '.msheet h3{font-size:15px;font-weight:650}',
    '.msheet p{font-size:12.5px;color:var(--mh-ink-2)}',
    '.msheet textarea{flex:1 1 auto;min-height:120px;width:100%;resize:none;padding:12px;border-radius:12px;border:1px solid var(--mh-rule-2);background:var(--mh-bg-2);color:var(--mh-ink);font:500 12px/1.5 var(--mh-mono)}',
    '.clip{position:fixed!important;left:-9999px;top:0;width:2px;height:2px;opacity:0}',
    // error
    '.err{margin-top:12px;padding:16px;border-radius:14px;background:rgba(246,109,103,.08);box-shadow:inset 0 0 0 1px rgba(246,109,103,.3)}',
    '.err h3{font-size:14.5px;font-weight:650}',
    '.err p{margin-top:6px;font-size:12.5px;line-height:1.5;color:var(--mh-ink-2);overflow-wrap:anywhere}',
    '.err a{display:inline-block;margin-top:10px;font-size:12.5px;font-weight:600;color:var(--mh-ink)}',
    // skeleton
    '.sk{display:block;height:10px;border-radius:6px;background:linear-gradient(90deg,rgba(255,255,255,.045) 0%,rgba(255,255,255,.1) 50%,rgba(255,255,255,.045) 100%);background-size:200% 100%;animation:mh-shimmer 1400ms linear infinite}',
    '@keyframes mh-shimmer{from{background-position:100% 0}to{background-position:-100% 0}}',
    '.sk-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}',
    '.sk-tile{height:86px;border-radius:12px}',
    // dock (minimised panel and highlight controls)
    '.dock{position:fixed;left:16px;bottom:16px;display:flex;align-items:center;gap:4px;max-width:calc(100vw - 32px);padding:5px;border-radius:999px;background:rgba(14,16,19,.96);border:1px solid var(--mh-edge);box-shadow:0 18px 44px rgba(0,0,0,.45),0 2px 8px rgba(0,0,0,.3);pointer-events:auto;animation:mh-pop 360ms var(--mh-ease) both}',
    '.dock.is-min{left:auto;right:16px}',
    '.dock.beside{max-width:calc(100vw - 460px)}',
    '@keyframes mh-pop{from{opacity:0;transform:translateY(12px) scale(.97)}}',
    '.dock-score{display:inline-flex;flex:none;align-items:center;gap:9px;height:38px;padding:0 14px 0 4px;border-radius:999px;font-size:13px;font-weight:600;transition:background-color 160ms}',
    '.dock-score.is-compact{padding:0 4px}',
    '.dock-score:hover{background:var(--mh-tint-2)}',
    '.mini{position:relative;display:block;width:30px;height:30px;flex:none}',
    '.mini svg{display:block;width:100%;height:100%}',
    '.mini b{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:700 11px/1 var(--mh-sans);font-variant-numeric:tabular-nums}',
    '.dock-text{min-width:0;padding:0 8px 0 10px;font-size:12.5px;color:var(--mh-ink-2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.dock .btn-sm{flex:none}',
    '.dock .ib{flex:none;width:38px;height:38px;border-radius:999px}',
    '.dock-sep{width:1px;height:22px;margin:0 2px;background:var(--mh-rule-2);flex:none}',
    // highlights: boxes live in document coordinates
    '.layer{position:absolute;top:0;left:0;width:0;height:0;overflow:visible;pointer-events:none}',
    '.box{position:absolute;top:0;left:0;border-radius:5px;outline:2px solid var(--mh-violet);outline-offset:0;background:rgba(157,132,239,.12);box-shadow:0 0 0 5px rgba(157,132,239,.22),inset 0 0 0 1px rgba(255,255,255,.55);pointer-events:none;animation:mh-box 420ms var(--mh-ease) both}',
    '.box.is-on{outline-width:3px;background:rgba(157,132,239,.18);box-shadow:0 0 0 7px rgba(157,132,239,.3),0 0 36px rgba(157,132,239,.55),inset 0 0 0 1px rgba(255,255,255,.7);animation:mh-box 420ms var(--mh-ease) both,mh-pulse 1500ms ease-in-out 420ms 2}',
    '.box-n{position:absolute;top:-12px;left:-12px;display:flex;align-items:center;justify-content:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#d9cffd;color:#140f22;border:1px solid rgba(20,15,34,.35);font:700 11px/1 var(--mh-mono);box-shadow:0 4px 12px rgba(0,0,0,.35)}',
    '.box.is-on .box-n{background:#ffffff}',
    '.box.at-edge .box-n{top:3px;left:3px}',
    '@keyframes mh-box{from{opacity:0;scale:1.06}}',
    '@keyframes mh-pulse{50%{box-shadow:0 0 0 12px rgba(157,132,239,.12),0 0 48px rgba(157,132,239,.6),inset 0 0 0 1px rgba(255,255,255,.7)}}',
    // measuring sweep over the page
    '.sweep{position:fixed;inset:0;overflow:hidden;pointer-events:none;opacity:0;transition:opacity 360ms}',
    '.sweep.is-on{opacity:1}',
    '.sweep-band{position:absolute;left:0;right:0;top:0;height:34vh;background:linear-gradient(to bottom,rgba(157,132,239,0) 0%,rgba(157,132,239,.07) 62%,rgba(183,219,202,.16) 97%,rgba(255,255,255,.6) 100%);transform:translateY(-36vh);animation:mh-sweep 1600ms cubic-bezier(.45,0,.2,1) infinite;will-change:transform}',
    '@keyframes mh-sweep{to{transform:translateY(104vh)}}',
    // narrow screens: bottom sheet. The same rules apply on a phone showing a desktop-width page (host classes).
    '@media (max-width:640px){' + rules(SHEET_RULES) + '}',
    '@supports (height:1dvh){@media (max-width:640px){.panel{max-height:86dvh}}}',
    '@media (max-width:400px){' + rules(XS_RULES) + '}',
    rules(SHEET_RULES, ':host(.mh-sheet)'),
    rules(XS_RULES, ':host(.mh-xs)'),
    // ...scaled back up by --mh-z: laid out at the device width, then scaled from the anchored corner.
    ':host(.mh-sheet) .panel{right:auto;width:calc(100vw / var(--mh-z,1));max-height:calc(86vh / var(--mh-z,1));scale:var(--mh-z,1);transform-origin:0 100%}',
    '@supports (height:1dvh){:host(.mh-sheet) .panel{max-height:calc(86dvh / var(--mh-z,1))}}',
    ':host(.mh-sheet) .dock,:host(.mh-sheet) .dock.is-min{left:calc(12px * var(--mh-z,1));right:auto;bottom:calc(12px * var(--mh-z,1));width:calc(100vw / var(--mh-z,1) - 24px);max-width:none;scale:var(--mh-z,1);transform-origin:0 100%}',
    ':host(.mh-side) .panel{top:calc(12px * var(--mh-z,1));right:calc(12px * var(--mh-z,1));bottom:auto;height:calc(100vh / var(--mh-z,1) - 24px);max-width:calc(100vw / var(--mh-z,1) - 24px);scale:var(--mh-z,1);transform-origin:100% 0}',
    ':host(.mh-side) .dock{left:calc(16px * var(--mh-z,1));bottom:calc(16px * var(--mh-z,1));max-width:calc(100vw / var(--mh-z,1) - 32px);scale:var(--mh-z,1);transform-origin:0 100%}',
    ':host(.mh-side) .dock.is-min{left:auto;right:calc(16px * var(--mh-z,1));transform-origin:100% 100%}',
    ':host(.mh-side) .dock.beside{max-width:calc(100vw / var(--mh-z,1) - 460px)}',
    ':host(.mh-zoom) .box{outline-width:calc(2px * var(--mh-z,1))}',
    ':host(.mh-zoom) .box.is-on{outline-width:calc(3px * var(--mh-z,1))}',
    ':host(.mh-zoom) .box-n{scale:var(--mh-z,1)}',
    ':host(.mh-zoom) .box.at-edge .box-n{transform-origin:0 0}',
    '@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:1ms!important;animation-delay:0ms!important;animation-iteration-count:1!important;transition-duration:1ms!important;transition-delay:0ms!important}.sweep{display:none!important}.ring-spin{animation:none!important}}',
    '@media (forced-colors:active){.panel,.dock{border:1px solid CanvasText}.box{outline-color:Highlight}.bar-fill{background:Highlight!important}}',
    '@media print{:host{display:none!important}}'
  ].join('\n');

  function adoptCss(rootNode) {
    try {
      if ('adoptedStyleSheets' in rootNode && typeof W.CSSStyleSheet === 'function') {
        var sheet = new W.CSSStyleSheet();
        sheet.replaceSync(CSS);
        rootNode.adoptedStyleSheets = [sheet];
        return;
      }
    } catch (e) { /* fall back to a style element */ }
    var st = D.createElement('style');
    st.textContent = CSS;
    rootNode.appendChild(st);
  }

  /* ------------------------------------------------------------------- state */

  var S = null;

  function newState() {
    return {
      host: null, root: null, panel: null, scroller: null, dock: null, layer: null, sweep: null, live: null, toast: null,
      tabs: {}, panes: {}, primary: null, cardBtn: null, reportBtn: null, rerunBtn: null,
      open: true, minimized: false, closing: false, measuring: false, sheet: null,
      result: null, style: null, tab: 'score', scrollMem: {}, lastFocus: null,
      hl: null, bounds: { w: 0, h: 0 }, activeIssue: null, groups: {}, scopes: {}, checksBtn: null, checksBody: null,
      showAll: false, toastTimer: 0, placeRaf: 0, timers: [], rafs: [], off: [], zoom: null
    };
  }
  // Timers and frames belong to the panel that scheduled them; a closed or replaced panel ignores them.
  function later(fn, ms) {
    var st = S;
    if (!st) return 0;
    var id = W.setTimeout(guard(function () { if (S === st && !st.closing) fn(); }), ms || 0);
    st.timers.push(id);
    if (st.timers.length > 400) st.timers = st.timers.slice(-100);
    return id;
  }
  function frame(fn) {
    var st = S;
    if (!st) return 0;
    var raf = W.requestAnimationFrame ? function (f) { return W.requestAnimationFrame(f); } : function (f) { return W.setTimeout(f, 16); };
    var id = raf(guard(function () { if (S === st && !st.closing) fn(); }));
    st.rafs.push(id);
    if (st.rafs.length > 400) st.rafs = st.rafs.slice(-100);
    return id;
  }
  function listen(target, type, fn, opts) {
    if (!target || !target.addEventListener) return;
    var g = guard(fn);
    target.addEventListener(type, g, opts || false);
    S.off.push(function () { try { target.removeEventListener(type, g, opts || false); } catch (e) { /* ignore */ } });
  }

  /* ------------------------------------------------------------------- frame */

  function build() {
    var old = D.getElementById(HOST_ID);
    if (old && old.parentNode) old.parentNode.removeChild(old);
    var host = D.createElement('div');
    host.id = HOST_ID;
    host.setAttribute('data-version', VERSION);
    [['all', 'initial'], ['position', 'absolute'], ['top', '0'], ['left', '0'], ['width', '0'], ['height', '0'], ['margin', '0'], ['padding', '0'],
      ['border', '0'], ['display', 'block'], ['overflow', 'visible'], ['z-index', '2147483647'], ['pointer-events', 'none'], ['transform', 'none'], ['filter', 'none']]
      .forEach(function (p) { try { host.style.setProperty(p[0], p[1], 'important'); } catch (e) { /* ignore */ } });
    var shadow = null;
    try { shadow = host.attachShadow({ mode: 'open' }); } catch (e) { shadow = null; }
    if (!shadow) return false;
    adoptCss(shadow);
    S.host = host;
    S.root = shadow;
    applyZoom();

    S.sweep = h('div', { class: 'sweep', 'aria-hidden': 'true' }, h('div', { class: 'sweep-band' }));
    S.layer = h('div', { class: 'layer', 'aria-hidden': 'true' });
    S.dock = h('div', { class: 'dock', role: 'group', 'aria-label': 'Design Score', hidden: true });
    S.live = h('div', { class: 'sr', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    // A second live region outside the dialog keeps announcements working while the panel is minimised.
    S.liveOut = h('div', { class: 'sr', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    S.wasNarrow = narrow();

    // header
    S.rerunBtn = iconButton('rerun', 'Re-run the score', function () { rerun(); });
    var head = h('header', { class: 'head' },
      h('div', { class: 'brand' }, markSvg(), h('h2', { id: 'mh-title', class: 'title' }, 'Design Score'), h('span', { class: 'ver' }, 'v' + VERSION)),
      h('div', { class: 'head-actions' }, S.rerunBtn, iconButton('minimize', 'Minimise the panel', function () { minimize(); }), iconButton('close', 'Close Design Score', function () { close(); })));

    // tabs
    var tablist = h('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Design Score views' });
    [['score', 'Score'], ['style', 'Steal the style']].forEach(function (t, i) {
      var tab = button('tab', t[1], function () { selectTab(t[0], false); }, {
        role: 'tab', id: 'mh-tab-' + t[0], 'aria-controls': 'mh-pane-' + t[0], 'aria-selected': i === 0 ? 'true' : 'false', tabindex: i === 0 ? '0' : '-1'
      });
      tab.addEventListener('keydown', guard(onTabKey));
      S.tabs[t[0]] = tab;
      tablist.appendChild(tab);
    });

    S.panes.score = h('div', { class: 'pane', role: 'tabpanel', id: 'mh-pane-score', 'aria-labelledby': 'mh-tab-score' });
    S.panes.style = h('div', { class: 'pane', role: 'tabpanel', id: 'mh-pane-style', 'aria-labelledby': 'mh-tab-style', hidden: true });
    S.scroller = h('div', { class: 'scroll' }, S.panes.score, S.panes.style);

    // footer
    S.toast = h('div', { class: 'toast', 'aria-hidden': 'true' });
    S.primary = actionButton('btn btn-primary', 'copy', 'Copy fix prompt', function () { primaryAction(this); });
    S.cardBtn = actionButton('btn', 'card', 'Download score card', function () { downloadCard(this); }, 'Card');
    S.reportBtn = actionButton('btn', 'report', 'Open full report', function () { openReport(this); }, 'Report');
    var foot = h('footer', { class: 'foot' }, S.toast,
      h('div', { class: 'actions' }, S.primary, S.cardBtn, S.reportBtn),
      h('p', { class: 'fine' }, h('span', null, 'Runs locally. Nothing leaves this page.'),
        h('a', { href: SCORE_PAGE, target: '_blank', rel: 'noopener noreferrer' }, 'About Design Score')));

    S.panel = h('section', { class: 'panel', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mh-title', tabindex: '-1' },
      h('div', { class: 'grab', 'aria-hidden': 'true' }), head, tablist, S.scroller, foot, S.live);

    shadow.appendChild(S.sweep);
    shadow.appendChild(S.layer);
    shadow.appendChild(S.panel);
    shadow.appendChild(S.dock);
    shadow.appendChild(S.liveOut);
    (D.documentElement || D.body).appendChild(host);

    // Keep keys, clicks and wheel inside the overlay from reaching the page's own shortcut handlers.
    listen(shadow, 'keydown', onKeyDown);
    ['keydown', 'keyup', 'keypress', 'click', 'dblclick', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'touchstart', 'touchend', 'wheel', 'touchmove', 'contextmenu'].forEach(function (t) {
      listen(shadow, t, function (e) { e.stopPropagation(); }, { passive: true });
    });
    listen(W, 'keydown', onPageKey);
    listen(W, 'resize', onResize, { passive: true });
    listen(D, 'scroll', onScroll, { capture: true, passive: true });
    return true;
  }

  // Host classes select the scaled layouts in the shadow CSS: mh-sheet (phone), mh-side (wider), mh-xs (small phone).
  function applyZoom() {
    if (!S || !S.host) return;
    var z = deviceZoom(), on = z.z > 1, cl = S.host.classList;
    S.zoom = on ? z : null;
    cl.toggle('mh-zoom', on);
    cl.toggle('mh-sheet', on && z.sheet);
    cl.toggle('mh-side', on && !z.sheet);
    cl.toggle('mh-xs', on && z.xs);
    try {
      if (on) S.host.style.setProperty('--mh-z', String(z.z), 'important');
      else S.host.style.removeProperty('--mh-z');
    } catch (e) { /* ignore */ }
  }

  function onTabKey(e) {
    var ids = ['score', 'style'], i = ids.indexOf(S.tab), next = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = ids[(i + 1) % 2];
    else if (e.key === 'Home') next = 'score';
    else if (e.key === 'End') next = 'style';
    if (next) { e.preventDefault(); selectTab(next, true); }
  }

  function selectTab(id, focus) {
    if (!S || !S.panes[id]) return;
    if (S.tab !== id) {
      S.scrollMem[S.tab] = S.scroller.scrollTop;
      S.tab = id;
      Object.keys(S.tabs).forEach(function (k) {
        var on = k === id;
        S.tabs[k].setAttribute('aria-selected', on ? 'true' : 'false');
        S.tabs[k].setAttribute('tabindex', on ? '0' : '-1');
        S.panes[k].hidden = !on;
      });
      S.scroller.scrollTop = S.scrollMem[id] || 0;
      updatePrimary();
    }
    if (focus) S.tabs[id].focus();
  }

  function updatePrimary() {
    if (!S || !S.primary) return;
    var t = S.tab === 'style' ? 'Copy DESIGN.md' : 'Copy fix prompt';
    S.primary._mhText = t;
    if (!S.primary.classList.contains('is-done')) S.primary._mhLbl.textContent = t;
    syncActions();
  }

  function setBusy(busy) {
    [S.primary, S.cardBtn, S.reportBtn].forEach(function (b) { dis(b, busy); });
  }
  function dis(b, off) {
    if (!b) return;
    if (off) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
  }
  // The card and the report need a score; the primary button follows the open tab, so "Copy DESIGN.md" works
  // whenever a style was read, even if scoring failed.
  function syncActions() {
    if (!S) return;
    var bad = S.measuring || !S.result || !!S.result.error;
    var st = S.style;
    var noStyle = !st || (!arr(st.colors).length && !arr(st.fonts).length && !arr(st.typeScale).length);
    dis(S.cardBtn, bad);
    dis(S.reportBtn, bad);
    dis(S.primary, S.measuring || (S.tab === 'style' ? noStyle : bad));
  }

  /* ---------------------------------------------------------------- keyboard */

  function focusables(container) {
    var list = container.querySelectorAll('button, a[href], textarea, input, select, [tabindex]:not([tabindex="-1"])');
    var out = [];
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el.disabled || el.getAttribute('tabindex') === '-1') continue;
      if (el.closest && el.closest('[hidden]')) continue;
      if (!el.getClientRects || !el.getClientRects().length) continue;
      out.push(el);
    }
    return out;
  }

  function onKeyDown(e) {
    if (!S) return;
    var key = e.key;
    if (key === 'Escape' || key === 'Esc') {
      e.preventDefault();
      if (S.sheet) closeSheet();
      else close();
      return;
    }
    if (key !== 'Tab' || S.minimized) return;
    var box = S.sheet || S.panel;
    var list = focusables(box);
    if (!list.length) { e.preventDefault(); box.focus(); return; }
    var active = S.root.activeElement;
    var i = list.indexOf(active);
    if (e.shiftKey) {
      if (i <= 0) { e.preventDefault(); list[list.length - 1].focus(); }
    } else if (i === -1 || i === list.length - 1) {
      e.preventDefault();
      list[0].focus();
    }
  }

  // Esc while focus sits on the page body (after a click outside the panel) still closes the overlay.
  function onPageKey(e) {
    if (!S || S.closing || (e.key !== 'Escape' && e.key !== 'Esc')) return;
    var a = D.activeElement;
    if (!a || a === D.body || a === D.documentElement || a === S.host) close();
  }

  /* --------------------------------------------------------------- lifecycle */

  // A page script may have removed our host (some apps clear unknown nodes); start fresh in that case.
  function stale() { return !!S && (S.closing || !S.host || S.host.isConnected === false); }

  function open() {
    if (stale()) teardown(S);
    if (S) {
      if (S.minimized) restore();
      measure();
      return;
    }
    S = newState();
    var a = D.activeElement;
    S.lastFocus = a && a !== D.body && a !== D.documentElement ? a : null;
    if (!build()) { S = null; return; }
    S.panel.classList.add('is-in');
    try { S.panel.focus({ preventScroll: true }); } catch (e) { S.panel.focus(); }
    measure();
  }

  function close() {
    if (!S || S.closing) return;
    var st = S;
    clearHighlights(true);
    st.closing = true;
    if (!reduced() && !st.minimized && st.panel) {
      st.panel.classList.remove('is-in');
      st.panel.classList.add('is-out');
      W.setTimeout(function () { teardown(st); }, 190);
    } else teardown(st);
  }

  function teardown(st) {
    if (!st || st.done) return;
    st.done = true;
    st.closing = true;
    st.timers.forEach(function (id) { W.clearTimeout(id); });
    st.rafs.forEach(function (id) { try { (W.cancelAnimationFrame || W.clearTimeout)(id); } catch (e) { /* ignore */ } });
    st.off.forEach(function (fn) { fn(); });
    if (st.host && st.host.parentNode) st.host.parentNode.removeChild(st.host);
    var lf = st.lastFocus;
    if (S === st) S = null;
    if (lf && lf.focus && lf.isConnected !== false) { try { lf.focus({ preventScroll: true }); } catch (e) { /* ignore */ } }
  }

  function minimize(silent) {
    if (!S || S.minimized) return;
    if (S.sheet) closeSheet();
    S.minimized = true;
    S.panel.hidden = true;
    renderDock();
    var first = S.dock.querySelector('button');
    if (first) first.focus();
    if (!silent) announce('Design Score minimised. Use the button at the bottom of the page to bring it back.');
  }

  function restore() {
    if (!S || !S.minimized) return;
    S.minimized = false;
    S.panel.hidden = false;
    S.panel.classList.remove('is-in');
    void S.panel.offsetWidth;
    S.panel.classList.add('is-in');
    renderDock();
    try { S.panel.focus({ preventScroll: true }); } catch (e) { S.panel.focus(); }
  }

  function rerun() {
    if (!S || S.measuring) return;
    if (S.rerunBtn && !reduced()) {
      S.rerunBtn.classList.remove('is-spin');
      void S.rerunBtn.offsetWidth;
      S.rerunBtn.classList.add('is-spin');
    }
    measure();
  }

  // Show the measuring state, let it paint, then run the probe (synchronous, up to its time budget).
  function measure() {
    if (!S || S.measuring) return;
    clearHighlights(true);
    if (S.sheet) closeSheet();
    var M = engine();
    if (!M) {
      S.result = null; S.style = null;
      renderMissing();
      return;
    }
    S.measuring = true;
    setBusy(true);
    renderMeasuring();
    if (!reduced()) S.sweep.classList.add('is-on');
    announce('Measuring this page.');
    var t0 = now();
    frame(function () {
      later(function () {
        var res = null, style = null;
        try { res = M.run(); } catch (e) { res = { error: 'The probe stopped: ' + oneLine(e && e.message, 80) }; }
        try { style = typeof M.extractStyle === 'function' ? M.extractStyle() : null; } catch (e2) { style = null; }
        var wait = reduced() ? 0 : Math.max(0, 480 - (now() - t0));
        later(function () {
          S.measuring = false;
          S.result = res;
          S.style = style;
          S.sweep.classList.remove('is-on');
          syncActions();
          S.scrollMem = {};
          S.scroller.scrollTop = 0;
          renderScore(true);
          renderStyle();
          if (res && !res.error) {
            var n = arr(res.issues).length;
            announce('Design Score ' + res.score + ' out of 100, grade ' + res.grade + '. ' + (n ? plural(n, 'issue') + ' found.' : 'No measured issues.'));
          } else announce('This page could not be measured.');
        }, wait);
      }, 40);
    });
  }

  /* ------------------------------------------------------------------- score */

  function catList(r) {
    var c = arr(r && r.categories);
    return c.length ? c : CAT_FALLBACK;
  }
  function catLabel(r, id) {
    var c = catList(r).filter(function (x) { return x.id === id; })[0];
    return c ? c.label : cap(id);
  }

  function ring(score, size, stroke, animate) {
    var color = bandColor(score);
    var gid = 'mh-g-' + Math.random().toString(36).slice(2, 9);
    var c = size / 2, r = c - stroke / 2 - 1;
    var val = svg('circle', {
      cx: c, cy: c, r: r, fill: 'none', pathLength: '100', stroke: 'url(#' + gid + ') ' + color, 'stroke-width': stroke,
      'stroke-linecap': 'round', 'stroke-dasharray': '0 100', transform: 'rotate(-90 ' + c + ' ' + c + ')'
    });
    var s = svg('svg', { viewBox: '0 0 ' + size + ' ' + size, 'aria-hidden': 'true', focusable: 'false' },
      svg('defs', null, svg('linearGradient', { id: gid, x1: '0', y1: '0', x2: '1', y2: '1' },
        svg('stop', { offset: '0', 'stop-color': '#c3b6dd' }), svg('stop', { offset: '1', 'stop-color': color }))),
      svg('circle', { cx: c, cy: c, r: r, fill: 'none', stroke: 'rgba(255,255,255,0.08)', 'stroke-width': stroke }),
      val);
    var target = isNum(score) ? clamp(score, 0, 100) : 0;
    function setTo(v) {
      if (v < 0.5) { val.setAttribute('stroke-dasharray', '0 100'); val.setAttribute('stroke-opacity', '0'); return; }
      val.setAttribute('stroke-opacity', '1');
      val.setAttribute('stroke-dasharray', v.toFixed(2) + ' 100');
    }
    if (!animate) setTo(target);
    return { svg: s, set: setTo, target: target };
  }

  function countUp(numEl, rg) {
    var target = rg.target;
    if (reduced()) { numEl.textContent = String(Math.round(target)); rg.set(target); return; }
    var t0 = now(), dur = 1150;
    numEl.textContent = '0';
    rg.set(0);
    (function step() {
      var t = clamp((now() - t0) / dur, 0, 1), e = 1 - Math.pow(1 - t, 3);
      numEl.textContent = String(Math.round(target * e));
      rg.set(target * e);
      if (t < 1) frame(step);
    })();
  }

  function heroBlock(r, animate) {
    var score = isNum(r.score) ? Math.round(r.score) : 0;
    var grade = str(r.grade || gradeOf(score));
    var color = bandColor(score);
    var rg = ring(score, 124, 9, true);
    var num = h('span', { class: 'ring-v' }, animate ? '0' : String(score));
    var ringEl = h('div', { class: 'ring', role: 'img', 'aria-label': 'Design Score ' + score + ' out of 100, grade ' + grade },
      h('div', { class: 'ring-glow', 'aria-hidden': 'true' }), rg.svg,
      h('div', { class: 'ring-num', 'aria-hidden': 'true' }, num, h('span', { class: 'ring-of' }, 'of 100')));
    var sc = r.scanned || {}, vp = r.viewport || {};
    var side = h('div', { class: 'hero-side' },
      h('div', { class: 'grade' }, h('span', { class: 'grade-l' }, 'Grade'), h('span', { class: 'grade-v' }, grade)),
      h('div', { class: 'host', title: str(r.url) }, r.host || 'This page'),
      r.title ? h('div', { class: 'ptitle', title: str(r.title) }, r.title) : null,
      h('p', { class: 'meta' }, 'Measured on ' + plural(sc.elements || 0, 'element'),
        h('br'), 'in ' + fmt(sc.ms || 0) + ' ms at ' + (vp.width || '?') + '×' + (vp.height || '?'),
        sc.decorative ? h('br') : null, sc.decorative ? plural(sc.decorative, 'illustration') + ' measured as pictures' : null));
    var hero = h('div', { class: 'hero', css: { '--band': color, '--band-a': alpha(color, 0.15), '--band-b': alpha(color, 0.42) } }, ringEl, side);
    if (animate) frame(function () { countUp(num, rg); }); else rg.set(rg.target);
    return hero;
  }

  function insight(r) {
    var cats = arr(r.categories).filter(function (c) { return isNum(c.score); });
    var issues = arr(r.issues);
    var lines = [];
    if (cats.length >= 2) {
      var sorted = cats.slice().sort(function (a, b) { return b.score - a.score; });
      var best = sorted[0], worst = sorted[sorted.length - 1];
      if (best.score !== worst.score) {
        lines.push(h('p', null, 'Strongest in ', h('strong', null, best.label + ' ' + best.score), ', weakest in ', h('strong', null, worst.label + ' ' + worst.score), '.'));
      }
    }
    if (issues.length) {
      var top = issues.slice(0, 3);
      var gain = Math.min(100 - (isNum(r.score) ? r.score : 0), Math.round(top.reduce(function (a, is) { return a + (Number(is.impact) || 0); }, 0)));
      if (gain >= 1) lines.push(h('p', null, top.length === 1 ? 'Fixing the top issue is worth up to ' : 'Fixing the top ' + top.length + ' issues is worth up to ', h('strong', null, '+' + gain + ' ' + (gain === 1 ? 'point' : 'points')), '.'));
    } else {
      lines.push(h('p', null, 'Nothing measured needs fixing. Judge the rest by eye: hierarchy, the primary action, density and polish.'));
    }
    return lines.length ? h('div', { class: 'callout' }, lines) : null;
  }

  function categoriesBlock(r, animate) {
    var list = h('ul', { class: 'cats' });
    var motion = animate && !reduced();
    catList(r).forEach(function (c, i) {
      var measured = isNum(c.score);
      var color = bandColor(c.score);
      var scale = measured ? clamp(c.score, 0, 100) / 100 : 0;
      var fill = h('span', { class: 'bar-fill', css: { 'background-color': color, transform: 'scaleX(' + (motion ? 0 : scale) + ')' } });
      var b = button('cat' + (measured ? '' : ' is-off'), [
        h('span', { class: 'cat-label' }, c.label),
        h('span', { class: 'cat-w', 'aria-hidden': 'true' }, c.weight + '%'),
        h('span', { class: 'bar', 'aria-hidden': 'true' }, fill),
        h('span', { class: 'cat-score', 'aria-hidden': 'true' }, measured ? String(c.score) : '—')
      ], function () { openGroup(c.id); }, {
        'aria-label': c.label + ': ' + (measured ? c.score + ' out of 100' : 'not measured') + ', weight ' + c.weight + ' percent. Show its checks.',
        title: oneLine(c.summary, 200) || null
      });
      list.appendChild(h('li', null, b));
      if (motion && measured) later(function () { fill.style.setProperty('transform', 'scaleX(' + scale + ')'); }, 140 + i * 70);
    });
    return h('section', { class: 'sec', 'aria-labelledby': 'mh-cats-h' },
      h('div', { class: 'sec-head' }, h('h3', { class: 'sec-title', id: 'mh-cats-h' }, 'Categories'), h('span', { class: 'sec-aside' }, 'weight · score')),
      list);
  }

  // An example can be pointed at when it has a live element or a measured box. Some findings come from
  // stylesheet rules that match nothing rendered; those are listed but not clickable.
  function canShow(ex) {
    return !!ex && ((ex.el && ex.el.nodeType === 1) || (ex.rect && isNum(ex.rect.x) && (ex.rect.width > 0 || ex.rect.height > 0)));
  }

  function firstShowable(exs) {
    for (var i = 0; i < exs.length; i++) if (canShow(exs[i])) return i;
    return 0;
  }

  function exampleList(exs, key, label) {
    var ol = h('ol', { class: 'exs' });
    exs.forEach(function (ex, j) {
      var ruleOnly = ex && !ex.el && (!ex.selector || ex.selector === 'element') && ex.text;
      var body = h('span', { class: 'ex-body' },
        h('code', { class: 'ex-sel' }, ruleOnly ? ex.text : ((ex && ex.selector) || 'element')),
        ex && ex.note ? h('span', { class: 'ex-note' }, ex.note) : null,
        ex && ex.text && !ruleOnly ? h('span', { class: 'ex-text' }, '“' + ex.text + '”') : null);
      var n = h('span', { class: 'ex-n', 'aria-hidden': 'true' }, String(j + 1));
      if (!canShow(ex)) {
        ol.appendChild(h('li', null, h('div', { class: 'ex is-static' }, n, body)));
        return;
      }
      var b = button('ex', [n, body], function () { showExample(exs, key, label, j); },
        { 'data-ex': String(j), 'aria-label': 'Show example ' + (j + 1) + ' on the page: ' + oneLine((ex && ex.selector) || 'element', 120) + (ex && ex.note ? ', ' + oneLine(ex.note, 120) : '') });
      ol.appendChild(h('li', null, b));
    });
    return ol;
  }

  function issueItem(r, is, i) {
    var sev = SEV[is.severity] || SEV.low;
    var exs = arr(is.examples);
    var shown = exs.filter(canShow).length;
    var key = 'issue:' + (is.id || i);
    var did = 'mh-issue-' + i;
    var detail = h('div', { class: 'issue-detail', id: did, hidden: true },
      is.detail ? h('p', { class: 'issue-text' }, is.detail) : null,
      exs.length ? exampleList(exs, key, is.title) : h('p', { class: 'issue-text' }, 'This one is page-wide, so there is no single element to highlight.'),
      shown ? h('div', { class: 'row' }, button('link-btn', [icon('clear'), 'Clear highlights'], function () { clearHighlights(false); }), h('span', { class: 'hint' }, 'Pick a number to scroll to it.')) : null);
    var meta = [h('span', { class: 'sr' }, sev.label + ' severity. Costs ' + pts(is.impact) + ' points. '), h('span', { class: 'tag' }, catLabel(r, is.category))];
    if (shown) meta.push(h('span', { class: 'tag' }, icon('target'), plural(shown, 'example') + ' on the page'));
    else if (exs.length) meta.push(h('span', { class: 'tag' }, plural(exs.length, 'rule') + ' in the stylesheets'));
    var b = button('issue', [
      h('span', { class: 'sev', 'aria-hidden': 'true', css: { 'background-color': sev.color, '--sev-a': alpha(sev.color, 0.18) } }),
      h('span', { class: 'issue-main' }, h('span', { class: 'issue-title' }, is.title), h('span', { class: 'issue-fix' }, is.fix), h('span', { class: 'issue-meta' }, meta)),
      h('span', { class: 'issue-pts', 'aria-hidden': 'true', title: 'Points this costs' }, '−' + pts(is.impact))
    ], function () { toggleIssue(b, detail, shown ? exs : [], key, is.title); }, { 'aria-expanded': 'false', 'aria-controls': did });
    S.scopes[key] = detail;
    return h('li', null, b, detail);
  }

  function toggleIssue(b, detail, exs, key, label) {
    var wasOpen = S.activeIssue && S.activeIssue.btn === b;
    collapseIssue();
    if (wasOpen) { clearHighlights(true); return; }
    b.setAttribute('aria-expanded', 'true');
    detail.hidden = false;
    S.activeIssue = { btn: b, detail: detail, key: key };
    if (exs.length) highlight(exs, key, label, firstShowable(exs));
    else clearHighlights(true);
  }
  function collapseIssue() {
    var a = S && S.activeIssue;
    if (!a) return;
    a.btn.setAttribute('aria-expanded', 'false');
    a.detail.hidden = true;
    S.activeIssue = null;
  }

  function issuesBlock(r) {
    var issues = arr(r.issues);
    var sec = h('section', { class: 'sec', 'aria-labelledby': 'mh-issues-h' },
      h('div', { class: 'sec-head' }, h('h3', { class: 'sec-title', id: 'mh-issues-h' }, 'Top issues'),
        h('span', { class: 'sec-aside' }, issues.length ? plural(issues.length, 'issue') + ', by points lost' : '')));
    if (!issues.length) {
      sec.appendChild(h('p', { class: 'empty' }, 'No measured issues on this page at this viewport.'));
      return sec;
    }
    var LIMIT = 6;
    var list = h('ol', { class: 'issues' });
    var rest = [];
    issues.forEach(function (is, i) {
      var li = issueItem(r, is, i);
      if (i >= LIMIT) { li.hidden = !S.showAll; rest.push(li); }
      list.appendChild(li);
    });
    sec.appendChild(list);
    if (rest.length) {
      var lbl = h('span', null, S.showAll ? 'Show fewer' : 'Show all ' + issues.length + ' issues');
      var chev = icon('chevron', 'chev');
      var more = button('link-btn', [lbl, chev], function () {
        S.showAll = !S.showAll;
        rest.forEach(function (li) { li.hidden = !S.showAll; });
        lbl.textContent = S.showAll ? 'Show fewer' : 'Show all ' + issues.length + ' issues';
        more.setAttribute('aria-expanded', S.showAll ? 'true' : 'false');
      }, { 'aria-expanded': S.showAll ? 'true' : 'false' });
      sec.appendChild(h('div', { class: 'more' }, more));
    }
    return sec;
  }

  function statusCounts(r) {
    var n = { pass: 0, warn: 0, fail: 0, skip: 0 };
    catList(r).forEach(function (c) { arr(c.checks).forEach(function (k) { n[STATUS[k.status] ? k.status : 'skip']++; }); });
    return n;
  }

  function checkItem(k, gid, idx) {
    var st = STATUS[k.status] || STATUS.skip;
    var did = 'mh-chk-' + gid + '-' + idx;
    var exs = arr(k.examples);
    var shown = exs.filter(canShow).length;
    var key = 'check:' + k.id;
    var kv = h('dl', { class: 'kv' },
      k.target ? [h('dt', null, 'Target'), h('dd', null, k.target)] : null,
      k.why ? [h('dt', null, 'Why it matters'), h('dd', null, k.why)] : null);
    var detail = h('div', { class: 'check-detail', id: did, hidden: true }, kv,
      exs.length ? exampleList(exs, key, k.label) : null,
      shown ? h('div', { class: 'row' },
        button('link-btn', [icon('target'), 'Show ' + plural(shown, 'example') + ' on the page'], function () { highlight(exs, key, k.label, firstShowable(exs)); }),
        button('link-btn', [icon('clear'), 'Clear'], function () { clearHighlights(false); })) : null);
    var b = button('check', [
      h('span', { class: 'st', title: st.label, css: { '--c': st.color, '--ca': alpha(st.color, 0.13) } }, icon(st.icon), h('span', { class: 'sr' }, st.label + '. ')),
      h('span', { class: 'check-main' }, h('span', { class: 'check-label' }, k.label), h('span', { class: 'check-display' }, k.display)),
      h('span', { class: 'check-score', 'aria-hidden': 'true' }, k.status === 'skip' ? '—' : String(k.score))
    ], function () {
      var open = b.getAttribute('aria-expanded') === 'true';
      b.setAttribute('aria-expanded', open ? 'false' : 'true');
      detail.hidden = open;
      if (open && S.hl && S.hl.key === key) clearHighlights(true);
    }, { 'aria-expanded': 'false', 'aria-controls': did });
    S.scopes[key] = detail;
    return h('li', null, b, detail);
  }

  function checksBlock(r) {
    var n = statusCounts(r);
    var total = n.pass + n.warn + n.fail + n.skip;
    var counts = h('span', { class: 'counts' },
      [['pass', 'pass'], ['warn', 'warn'], ['fail', 'fail'], ['skip', 'skipped']].filter(function (x) { return n[x[0]] > 0; }).map(function (x) {
        return h('span', { class: 'cnt', css: { '--c': STATUS[x[0]].color } }, n[x[0]] + ' ' + x[1]);
      }));
    var body = h('div', { class: 'checks', id: 'mh-checks', hidden: !S.checksOpen });
    S.groups = {};
    catList(r).forEach(function (c) {
      var checks = arr(c.checks);
      if (!checks.length) return;
      var gid = 'mh-grp-' + c.id;
      var gb = h('ul', { class: 'group-b', id: gid + '-b', hidden: true });
      checks.forEach(function (k, i) { gb.appendChild(checkItem(k, c.id, i)); });
      var gh = button('group-h', [
        h('span', { class: 'group-l' }, c.label),
        h('span', { class: 'group-s' }, isNum(c.score) ? c.score + '/100' : 'not measured'),
        icon('chevron', 'chev')
      ], function () { var open = gh.getAttribute('aria-expanded') === 'true'; gh.setAttribute('aria-expanded', open ? 'false' : 'true'); gb.hidden = open; },
      { 'aria-expanded': 'false', 'aria-controls': gid + '-b', id: gid });
      S.groups[c.id] = { btn: gh, body: gb };
      body.appendChild(h('div', { class: 'group' }, gh, gb));
    });
    var t = button('disclose', [h('span', { class: 'disclose-t' }, 'All checks (' + total + ')'), counts, icon('chevron', 'chev')], function () {
      setChecksOpen(t.getAttribute('aria-expanded') !== 'true');
    }, { 'aria-expanded': S.checksOpen ? 'true' : 'false', 'aria-controls': 'mh-checks' });
    S.checksBtn = t;
    S.checksBody = body;
    return h('section', { class: 'sec' }, t, body);
  }

  function setChecksOpen(open) {
    if (!S || !S.checksBtn) return;
    S.checksOpen = open;
    S.checksBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    S.checksBody.hidden = !open;
  }

  function openGroup(id) {
    if (!S) return;
    selectTab('score', false);
    setChecksOpen(true);
    var g = S.groups[id];
    if (!g) return;
    g.btn.setAttribute('aria-expanded', 'true');
    g.body.hidden = false;
    scrollPanelTo(g.btn);
    try { g.btn.focus({ preventScroll: true }); } catch (e) { g.btn.focus(); }
  }

  function scrollPanelTo(el) {
    var sc = S.scroller, y = 0, cur = el;
    while (cur && cur !== sc) { y += cur.offsetTop || 0; cur = cur.offsetParent; }
    var top = Math.max(0, y - 10);
    try { sc.scrollTo({ top: top, behavior: reduced() ? 'auto' : 'smooth' }); } catch (e) { sc.scrollTop = top; }
  }

  function moreBlock() {
    return h('section', { class: 'sec', 'aria-labelledby': 'mh-more-h' },
      h('div', { class: 'sec-head' }, h('h3', { class: 'sec-title', id: 'mh-more-h' }, 'More exports')),
      h('div', { class: 'exports' },
        actionButton('btn btn-sm', 'code', 'Copy JSON', function () { var f = fmtApi(); copyText(f && f.json ? f.json(S.result) : JSON.stringify(S.result, null, 2), 'Result JSON copied', this); }),
        actionButton('btn btn-sm', 'copy', 'Copy README badge', function () { copyText(badgeMd(S.result), 'Badge Markdown copied. Paste it into your README.', this); }),
        actionButton('btn btn-sm', 'download', 'Save report as HTML', function () { saveReport(this); }),
        actionButton('btn btn-sm', 'card', 'Download score card', function () { downloadCard(this); })));
  }

  function renderScore(animate) {
    var p = S.panes.score;
    clear(p);
    S.activeIssue = null;
    S.scopes = {};
    var r = S.result;
    if (!r || r.error) {
      p.appendChild(errorCard((r && r.error) || 'The probe returned no result.'));
      return;
    }
    p.appendChild(heroBlock(r, animate));
    var part = partialNote(r, true);
    if (part) p.appendChild(h('p', { class: 'note' }, icon('warn'), h('span', null, part)));
    var ins = insight(r);
    if (ins) p.appendChild(ins);
    p.appendChild(categoriesBlock(r, animate));
    p.appendChild(issuesBlock(r));
    p.appendChild(checksBlock(r));
    p.appendChild(moreBlock());
  }

  // Why a scored result is partial: the element cap, checks the time budget skipped, or a check that stopped
  // part-way. A probe that records each cause (scanned.elementsCut, scanned.checksSkipped) is read as is; for
  // an older result the skipped checks are counted from the checks, and the element cut is inferred: the
  // element cap, or a time stop that no skipped or stopped-early check explains.
  function partialNote(r, inPanel) {
    var sc = (r && r.scanned) || {};
    if (!sc.truncated) return '';
    var checks = [];
    catList(r).forEach(function (c) { checks = checks.concat(arr(c.checks)); });
    var skipped = isNum(sc.checksSkipped) ? sc.checksSkipped : checks.filter(function (k) {
      return k && k.status === 'skip' && /time budget ran out before this check/.test(str(k.display));
    }).length;
    var early = checks.some(function (k) { return !!(k && k.value && k.value.stoppedEarly); });
    var cut = sc.elementsCut != null ? !!sc.elementsCut : sc.stoppedBy === 'elements' || (!skipped && !early);
    var out = [];
    if (cut) out.push('Large page: Design Score measured the first ' + plural(sc.elements || 0, 'element') + ' and scored those.');
    if (skipped > 0) out.push('The time budget ran out: ' + fmt(skipped) + ' of ' + plural(Math.max(checks.length, skipped), 'check') + (skipped === 1 ? ' was' : ' were') + ' not measured.' + (inPanel ? ' Press Re-run.' : ''));
    if (!out.length) out.push('The time budget ran out before every check finished.');
    return out.join(' ');
  }

  function errorCard(msg) {
    return h('div', { class: 'err', role: 'alert' },
      h('h3', null, 'This page could not be measured'),
      h('p', null, msg),
      h('p', null, 'Wait for the page to finish loading and press Re-run. If it still fails, the page may block scripts like this one: use the console snippet or the skill instead.'),
      h('a', { href: SCORE_PAGE + '#other-ways', target: '_blank', rel: 'noopener noreferrer' }, 'Other ways to run Design Score'));
  }

  function renderMissing() {
    clear(S.panes.score);
    clear(S.panes.style);
    setBusy(true);
    S.panes.score.appendChild(h('div', { class: 'err', role: 'alert' },
      h('h3', null, 'The Design Score engine is not loaded'),
      h('p', null, 'The panel needs window.MHScore. Load the full mh-score.js bundle, which contains both, and open the panel again.'),
      h('a', { href: SCORE_PAGE, target: '_blank', rel: 'noopener noreferrer' }, 'Get Design Score')));
    S.panes.style.appendChild(h('p', { class: 'empty' }, 'Nothing to show until the engine loads.'));
  }

  function renderMeasuring() {
    var p = S.panes.score;
    clear(p);
    var spin = svg('svg', { viewBox: '0 0 124 124', 'aria-hidden': 'true', focusable: 'false' },
      svg('circle', { cx: 62, cy: 62, r: 56.5, fill: 'none', stroke: 'rgba(255,255,255,0.08)', 'stroke-width': 9 }),
      svg('circle', { cx: 62, cy: 62, r: 56.5, fill: 'none', stroke: '#c3b6dd', 'stroke-width': 9, 'stroke-linecap': 'round', pathLength: '100', 'stroke-dasharray': '22 100', transform: 'rotate(-90 62 62)' }));
    var host = '';
    try { host = W.location.hostname || 'this page'; } catch (e) { host = 'this page'; }
    p.appendChild(h('div', { class: 'hero', 'aria-busy': 'true' },
      h('div', { class: 'ring' }, h('div', { class: 'ring-spin' }, spin), h('div', { class: 'ring-num' }, h('span', { class: 'ring-scan' }, 'Scanning'))),
      h('div', { class: 'hero-side' },
        h('div', { class: 'host' }, 'Measuring ' + host),
        h('p', { class: 'meta' }, 'Reading contrast, type, colour,', h('br'), 'spacing and motion from the live page.'))));
    var list = h('ul', { class: 'cats', 'aria-hidden': 'true' });
    catList(null).forEach(function (c, i) {
      list.appendChild(h('li', null, h('div', { class: 'cat is-off' },
        h('span', { class: 'cat-label' }, c.label), h('span', { class: 'cat-w' }, c.weight + '%'),
        h('span', { class: 'sk', css: { 'animation-delay': (i * 90) + 'ms' } }), h('span', { class: 'cat-score' }, '··'))));
    });
    p.appendChild(h('section', { class: 'sec' }, h('div', { class: 'sec-head' }, h('h3', { class: 'sec-title' }, 'Categories')), list));
    var sp = S.panes.style;
    clear(sp);
    var grid = h('div', { class: 'sk-grid', 'aria-hidden': 'true' });
    for (var i = 0; i < 8; i++) grid.appendChild(h('span', { class: 'sk sk-tile', css: { 'animation-delay': (i * 70) + 'ms' } }));
    sp.appendChild(h('p', { class: 'intro' }, 'Reading the palette, fonts and spacing…'));
    sp.appendChild(h('section', { class: 'sec' }, grid));
  }

  /* ------------------------------------------------------------------- style */

  function styleSection(title, aside, body, id) {
    return h('section', { class: 'sec', 'aria-labelledby': id },
      h('div', { class: 'sec-head' }, h('h3', { class: 'sec-title', id: id }, title), aside ? h('span', { class: 'sec-aside' }, aside) : null),
      body);
  }

  // The page's @font-face rules reach into our shadow root, so a sample drawn in a page family at a weight, style
  // or character range the page never rendered would make the browser download that face: a network request of
  // ours. Samples therefore use only weights the probe saw that family render, and only when FontFaceSet.check()
  // (which never starts a load) reports every matching face already loaded. Otherwise the system font draws it.
  var SAMPLE = 'Sphinx of black quartz, judge my vow';
  var STEP_SAMPLE = 'Sphinx of black quartz';
  function wkey(w) { return Math.round((Number(w) || 400) / 50) * 50; }
  function faceReady(stack, weight, text) {
    var set = D.fonts;
    if (!set || typeof set.check !== 'function') return true; // no font loading API: the weight rule alone applies
    try { return set.check('normal normal ' + weight + ' 16px ' + stack, text) === true; } catch (e) { return false; }
  }
  // The weight to draw a family's sample at: one the page used (400 or the nearest), and already loaded.
  function sampleWeight(f, text) {
    var stack = safeFont(f && f.stack);
    if (!stack) return null;
    var ws = arr(f.weights).map(wkey).filter(function (w) { return w >= 100 && w <= 900; });
    ws.sort(function (a, b) { return Math.abs(a - 400) - Math.abs(b - 400) || a - b; });
    for (var i = 0; i < ws.length; i++) if (faceReady(stack, ws[i], text)) return ws[i];
    return null;
  }
  // The family for a type-scale step: one that rendered this weight on the page, by the likely role for the size.
  function fontFor(st, px, weight) {
    var w = wkey(weight);
    var fonts = arr(st && st.fonts).filter(function (x) { return safeFont(x.stack) && arr(x.weights).map(wkey).indexOf(w) >= 0; });
    function rank(x) {
      var r = arr(x.roles);
      return r.indexOf(px >= 24 ? 'display' : 'body') >= 0 ? 0 : r.indexOf(px >= 24 ? 'body' : 'display') >= 0 ? 1 : r.indexOf('mono') < 0 ? 2 : 9;
    }
    fonts = fonts.filter(function (x) { return rank(x) < 9; }).sort(function (a, b) { return rank(a) - rank(b); });
    for (var i = 0; i < fonts.length; i++) {
      var stack = safeFont(fonts[i].stack);
      if (faceReady(stack, weight, STEP_SAMPLE)) return stack;
    }
    return null;
  }

  function renderStyle() {
    var p = S.panes.style;
    clear(p);
    var st = S.style;
    if (!st || (!arr(st.colors).length && !arr(st.fonts).length && !arr(st.typeScale).length)) {
      p.appendChild(h('p', { class: 'intro' }, 'Read from computed styles.'));
      p.appendChild(h('p', { class: 'empty', css: { 'margin-top': '12px' } }, st && st.error ? 'The style could not be read on this page (' + oneLine(st.error, 100) + ').' : 'No colours, fonts or sizes were found to extract on this page.'));
      return;
    }
    p.appendChild(h('p', { class: 'intro' }, 'Read from this page’s computed styles at this viewport. A close approximation, not the source design system. Click any colour to copy it.'));

    var roles = st.roles || {};
    var roleGrid = h('div', { class: 'roles' });
    ['background', 'surface', 'text', 'muted', 'accent', 'border'].forEach(function (k) {
      var hex = safeHex(roles[k]);
      if (!hex) return;
      roleGrid.appendChild(button('role', [
        h('span', { class: 'chip', css: { 'background-color': hex } }),
        h('span', { class: 'role-t' }, h('span', { class: 'role-k' }, k), h('span', { class: 'role-v' }, hex))
      ], function () { copyText(hex, 'Copied ' + k + ' ' + hex, null); }, { 'aria-label': 'Copy ' + k + ' colour ' + hex }));
    });
    if (roleGrid.childNodes.length) p.appendChild(styleSection('Colour roles', 'best guess', roleGrid, 'mh-roles-h'));

    var colors = arr(st.colors).filter(function (c) { return safeHex(c.hex); });
    if (colors.length) {
      var pal = h('div', { class: 'pal' });
      colors.forEach(function (c) {
        var hex = safeHex(c.hex);
        var used = arr(c.roles).join(', ');
        pal.appendChild(button('sw', [
          h('span', { class: 'sw-chip', css: { 'background-color': hex } }),
          h('span', { class: 'sw-hex' }, hex),
          h('span', { class: 'sw-name' }, used || c.name || '')
        ], function () { copyText(hex, 'Copied ' + hex, null); }, {
          'aria-label': 'Copy ' + hex + (c.name ? ', ' + c.name : '') + (used ? ', used as ' + used : ''),
          title: (c.name ? c.name + ' · ' : '') + (used ? used + ' · ' : '') + 'used ' + fmt(c.count || 0) + '×'
        }));
      });
      p.appendChild(styleSection('Palette', plural(colors.length, 'colour'), pal, 'mh-pal-h'));
    }

    var fonts = arr(st.fonts);
    if (fonts.length) {
      var fl = h('div', { class: 'fonts' });
      fonts.forEach(function (f) {
        var stack = safeFont(f.stack), w = sampleWeight(f, 'Aa ' + SAMPLE);
        var css = stack && w ? { 'font-family': stack, 'font-weight': String(w) } : null;
        var meta = arr(f.roles).map(cap).join(' · ') + (arr(f.weights).length ? ' · weights ' + arr(f.weights).join(', ') : '');
        fl.appendChild(h('div', { class: 'font', title: css ? null : 'Drawn in the system font: drawing it in this family could make the browser download a font face the page has not loaded.' },
          h('div', { class: 'font-aa', css: css, 'aria-hidden': 'true' }, 'Aa'),
          h('div', { class: 'font-info' },
            h('div', { class: 'font-name', title: str(f.stack) }, f.family || 'Unknown family'),
            h('div', { class: 'font-meta' }, meta + (css ? '' : ' · sample in system font')),
            h('div', { class: 'font-sample', css: css }, SAMPLE))));
      });
      p.appendChild(styleSection('Fonts', plural(fonts.length, 'family', 'families'), fl, 'mh-fonts-h'));
    }

    var scale = arr(st.typeScale);
    if (scale.length) {
      var lad = h('ol', { class: 'ladder' });
      scale.forEach(function (t) {
        var px = Number(t.px) || 0, wt = clamp(Number(t.weight) || 400, 100, 900);
        var stack = fontFor(st, px, wt);
        var css = { 'font-size': clamp(px, 10, 40) + 'px', 'font-weight': String(wt) };
        if (stack) css['font-family'] = stack;
        lad.appendChild(h('li', { class: 'step' },
          h('span', { class: 'step-px' }, px + 'px', h('small', null, (t.rem != null ? t.rem + 'rem' : ''))),
          h('span', { class: 'step-body' },
            h('span', { class: 'step-sample', css: css }, STEP_SAMPLE),
            h('span', { class: 'step-meta' }, [t.sample ? '<' + t.sample + '>' : '', t.lineHeight ? 'line height ' + t.lineHeight : '', t.weight ? 'weight ' + t.weight : '', t.count ? fmt(t.count) + '×' : ''].filter(Boolean).join(' · ')))));
      });
      p.appendChild(styleSection('Type scale', plural(scale.length, 'step'), lad, 'mh-scale-h'));
    }

    var spacing = arr(st.spacing);
    if (spacing.length) {
      var sc = h('ul', { class: 'chips' });
      spacing.slice().sort(function (a, b) { return a.px - b.px; }).forEach(function (s) {
        sc.appendChild(h('li', { class: 'chipx' }, h('span', { class: 'sp-bar', 'aria-hidden': 'true', css: { width: clamp(Number(s.px) || 0, 2, 72) + 'px' } }), s.px + 'px', h('small', null, '×' + fmt(s.count || 0))));
      });
      p.appendChild(styleSection('Spacing', 'most used', sc, 'mh-sp-h'));
    }

    var radii = arr(st.radii);
    if (radii.length) {
      var rc = h('ul', { class: 'chips' });
      radii.slice().sort(function (a, b) { return a.px - b.px; }).forEach(function (r) {
        var pill = Number(r.px) >= 9999;
        rc.appendChild(h('li', { class: 'chipx' },
          h('span', { class: 'rad-box', 'aria-hidden': 'true', css: { 'border-top-left-radius': (pill ? 22 : clamp(Number(r.px) || 0, 0, 22)) + 'px' } }),
          pill ? 'pill' : r.px + 'px', h('small', null, '×' + fmt(r.count || 0))));
      });
      p.appendChild(styleSection('Corner radii', null, rc, 'mh-rad-h'));
    }

    var shadows = arr(st.shadows).filter(function (s) { return safeCss(s.value); });
    if (shadows.length) {
      var sg = h('div', { class: 'shadows' });
      shadows.forEach(function (s) {
        sg.appendChild(h('div', { class: 'sh' },
          h('div', { class: 'sh-tile', 'aria-hidden': 'true' }, h('span', { class: 'sh-card', css: { 'box-shadow': safeCss(s.value) } })),
          h('code', { class: 'sh-v', title: str(s.value) }, '×' + fmt(s.count || 0) + '  ' + s.value)));
      });
      p.appendChild(styleSection('Shadows', null, sg, 'mh-sh-h'));
    }

    var props = arr(st.customProperties);
    if (props.length) {
      var vl = h('ul', { class: 'vars', hidden: true, id: 'mh-vars' });
      props.forEach(function (cp) {
        var v = str(cp.value);
        var colorish = /^(#|rgb|hsl|hwb|lab|lch|oklab|oklch|color\(|color-mix)/i.test(v.trim()) && safeCss(v);
        vl.appendChild(h('li', { class: 'var' },
          colorish ? h('i', { css: { 'background-color': v } }) : h('span', null, ''),
          h('span', { title: cp.name + ': ' + v }, h('b', null, cp.name), ': ' + v)));
      });
      var vb = button('disclose', [h('span', { class: 'disclose-t' }, plural(props.length, 'custom property', 'custom properties') + ' on :root'), icon('chevron', 'chev')], function () {
        var open = vb.getAttribute('aria-expanded') === 'true';
        vb.setAttribute('aria-expanded', open ? 'false' : 'true');
        vl.hidden = open;
      }, { 'aria-expanded': 'false', 'aria-controls': 'mh-vars' });
      p.appendChild(h('section', { class: 'sec' }, vb, vl));
    }

    var f = fmtApi();
    var ex = h('div', { class: 'exports' },
      actionButton('btn btn-sm', 'copy', 'Copy DESIGN.md', function () { copyText(f.designMd(S.style), 'DESIGN.md copied. Save it in your project for your agent.', this); }),
      actionButton('btn btn-sm', 'code', 'Copy CSS variables', function () { copyText(f.cssVars(S.style), 'CSS variables copied', this); }),
      actionButton('btn btn-sm', 'code', 'Copy Tailwind theme', function () { copyText(f.tailwind(S.style), 'Tailwind theme copied', this); }),
      actionButton('btn btn-sm', 'code', 'Copy tokens JSON', function () { copyText(JSON.stringify(f.tokens(S.style), null, 2), 'Design tokens JSON copied', this); }));
    var dl = button('link-btn', [icon('download'), 'Download DESIGN.md'], function () {
      saveText(f.designMd(S.style), 'DESIGN.md', 'text/markdown;charset=utf-8');
      toast('DESIGN.md downloaded');
    });
    if (f) p.appendChild(styleSection('Export', 'for your agent', [ex, h('div', { class: 'more' }, dl)], 'mh-exp-h'));
  }

  /* -------------------------------------------------------------- highlights */

  function measureBounds() {
    var de = D.documentElement;
    if (!de) { S.bounds = { w: W.innerWidth || 0, h: W.innerHeight || 0 }; return; }
    S.bounds = { w: Math.max(de.scrollWidth || 0, de.clientWidth || 0), h: Math.max(de.scrollHeight || 0, de.clientHeight || 0) };
  }

  function liveRect(it, hr) {
    if (it.el) {
      var r = null;
      try { r = it.el.isConnected === false ? null : it.el.getBoundingClientRect(); } catch (e) { r = null; }
      if (r && (r.width > 0 || r.height > 0)) return { x: r.left - hr.left, y: r.top - hr.top, w: r.width, h: r.height };
      if (it.el.isConnected !== false) return null; // in the page but not rendered right now
    }
    var d = it.ex && it.ex.rect;
    if (d && isNum(d.x) && isNum(d.y) && (d.width > 0 || d.height > 0)) {
      var sx = W.pageXOffset || 0, sy = W.pageYOffset || 0;
      return { x: d.x - sx - hr.left, y: d.y - sy - hr.top, w: d.width || 0, h: d.height || 0 };
    }
    return null;
  }

  function placeBoxes() {
    if (!S || !S.hl) return;
    var hr = S.host.getBoundingClientRect(), b = S.bounds;
    S.hl.items.forEach(function (it, i) {
      var r = liveRect(it, hr);
      if (!r) { it.box.hidden = true; return; }
      // a little breathing room around the element, clipped to the page so the boxes never add scroll
      var x0 = Math.max(0, r.x - 3), y0 = Math.max(0, r.y - 3);
      var x1 = Math.min(b.w, r.x + Math.max(r.w, 4) + 3), y1 = Math.min(b.h, r.y + Math.max(r.h, 4) + 3);
      if (x1 - x0 < 2 || y1 - y0 < 2) { it.box.hidden = true; return; }
      it.box.hidden = false;
      var s = it.box.style;
      s.setProperty('left', Math.round(x0) + 'px');
      s.setProperty('top', Math.round(y0) + 'px');
      s.setProperty('width', Math.round(x1 - x0) + 'px');
      s.setProperty('height', Math.round(y1 - y0) + 'px');
      var edge = 14 * (S.zoom ? S.zoom.z : 1);
      it.box.classList.toggle('at-edge', x0 < edge || y0 < edge);
      it.box.classList.toggle('is-on', i === S.hl.focus);
    });
  }

  function schedulePlace() {
    if (!S || !S.hl || S.placeRaf) return;
    S.placeRaf = frame(function () { S.placeRaf = 0; placeBoxes(); });
  }
  function onScroll() { schedulePlace(); }
  function onResize() {
    if (!S) return;
    applyZoom();
    var n = narrow();
    if (n !== S.wasNarrow) { S.wasNarrow = n; renderDock(); }
    if (!S.hl) return;
    S.layer.hidden = true;
    measureBounds();
    S.layer.hidden = false;
    schedulePlace();
  }

  // On a wide screen the panel covers the right 412px. When the element being shown sits mostly under it,
  // minimise the panel so the highlight is visible; the dock brings it back.
  function underPanel(it) {
    if (!it || !it.el || !S.panel || S.minimized || narrow()) return false;
    var r = null, p = null;
    try { r = it.el.getBoundingClientRect(); p = S.panel.getBoundingClientRect(); } catch (e) { return false; }
    if (!r || !p || r.width <= 0 || p.width <= 0) return false;
    var overlap = Math.max(0, Math.min(r.right, p.right) - Math.max(r.left, p.left));
    return overlap / r.width >= 0.6;
  }

  function highlight(exs, key, label, focusIdx) {
    if (!S) return;
    if (S.activeIssue && S.activeIssue.key !== key) collapseIssue();
    removeBoxes();
    var items = [];
    arr(exs).forEach(function (ex, i) {
      var el = ex && ex.el && ex.el.nodeType === 1 ? ex.el : null;
      items.push({ ex: ex, el: el, n: i + 1, box: null });
    });
    if (!items.length) return;
    measureBounds();
    S.hl = { key: key, label: oneLine(label, 80), items: items, focus: clamp(focusIdx || 0, 0, items.length - 1) };
    var motion = !reduced();
    items.forEach(function (it, i) {
      it.box = h('div', { class: 'box', hidden: true }, h('span', { class: 'box-n' }, String(it.n)));
      if (motion) it.box.style.setProperty('animation-delay', Math.min(i, 12) * 40 + 'ms');
      S.layer.appendChild(it.box);
    });
    placeBoxes();
    markExamples();
    renderDock();
    var shown = items.filter(function (it) { return !it.box.hidden; }).length;
    var tuck = (narrow() || underPanel(items[S.hl.focus])) && !S.minimized;
    if (tuck) minimize(true);
    announce('Highlighting ' + plural(items.length, 'element') + ' on the page' + (shown < items.length ? ', ' + fmt(items.length - shown) + ' not visible right now' : '') + '.' +
      (tuck ? ' The panel is minimised so the page shows; the bar at the bottom brings it back.' : ''));
    reveal(S.hl.focus);
  }

  function showExample(exs, key, label, j) {
    if (!S) return;
    if (!S.hl || S.hl.key !== key) { highlight(exs, key, label, j); return; }
    if ((narrow() || underPanel(S.hl.items[j])) && !S.minimized) minimize(true);
    reveal(j);
  }

  function reveal(i) {
    if (!S || !S.hl) return;
    var it = S.hl.items[i];
    if (!it) return;
    S.hl.focus = i;
    var behavior = reduced() ? 'auto' : 'smooth';
    if (!canShow(it.ex)) { /* a stylesheet rule: nothing on the page to scroll to */ }
    else if (it.el && it.el.isConnected !== false && it.el.scrollIntoView) {
      try { it.el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: behavior }); } catch (e) { try { it.el.scrollIntoView(); } catch (e2) { /* ignore */ } }
    } else if (it.ex && it.ex.rect && isNum(it.ex.rect.y)) {
      try { W.scrollTo({ top: Math.max(0, it.ex.rect.y - (W.innerHeight || 600) / 3), behavior: behavior }); } catch (e3) { /* ignore */ }
    }
    placeBoxes();
    markExamples();
    renderDock();
  }

  function markExamples() {
    if (!S) return;
    var key = S.hl ? S.hl.key : null, focus = S.hl ? S.hl.focus : -1;
    var all = S.panes.score.querySelectorAll('.ex.is-on');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('is-on');
    var scope = key ? S.scopes[key] : null;
    if (!scope) return;
    var mine = scope.querySelectorAll('.ex');
    if (mine[focus]) mine[focus].classList.add('is-on');
  }

  function removeBoxes() {
    if (!S) return;
    if (S.placeRaf) { try { (W.cancelAnimationFrame || W.clearTimeout)(S.placeRaf); } catch (e) { /* ignore */ } S.placeRaf = 0; }
    clear(S.layer);
    S.hl = null;
  }

  // Clearing removes the boxes only: an expanded issue or check stays open, so a Clear button inside it keeps
  // focus. The dock hides once nothing is highlighted while the panel is open, so focus then returns to the
  // issue or check that was shown (or the panel) instead of dropping to the page behind the dialog.
  function clearHighlights(silent) {
    if (!S) return;
    var had = !!S.hl;
    var scope = S.hl ? S.scopes[S.hl.key] : null;
    var f = S.root ? S.root.activeElement : null;
    var fromDock = !!(f && S.dock && S.dock.contains(f));
    removeBoxes();
    markExamples();
    renderDock();
    if (fromDock && !S.minimized && S.dock.hidden) focusIn(ownerButton(scope));
    if (had && !silent) announce('Highlights cleared.');
  }

  function ownerButton(scope) {
    if (!S || !S.panel || !scope || !scope.id) return null;
    var list = S.panel.querySelectorAll('[aria-controls]');
    for (var i = 0; i < list.length; i++) if (list[i].getAttribute('aria-controls') === scope.id) return list[i];
    return null;
  }

  // Focus el inside the panel; when it cannot take focus (hidden, gone), focus the dialog itself.
  function focusIn(el) {
    if (!S || !S.panel) return;
    if (el && el.isConnected !== false) { try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) { /* ignore */ } } }
    if (!el || S.root.activeElement !== el) { try { S.panel.focus({ preventScroll: true }); } catch (e3) { S.panel.focus(); } }
  }

  /* -------------------------------------------------------------------- dock */

  function miniRing(score) {
    var rg = ring(score, 30, 3.5, false);
    return h('span', { class: 'mini', 'aria-hidden': 'true' }, rg.svg, h('b', null, isNum(score) ? String(Math.round(score)) : '–'));
  }

  // The dock is the small bar at the bottom of the page: the minimised panel, and the highlight controls.
  function renderDock() {
    if (!S || !S.dock) return;
    var d = S.dock;
    var hl = S.hl && S.hl.items.length;
    var active = S.root ? S.root.activeElement : null;
    var keep = active && d.contains(active) ? active.getAttribute('data-k') : null;
    clear(d);
    // On a phone the open sheet covers the bottom of the screen, so the dock only shows with the sheet minimised.
    if ((!S.minimized && !hl) || (!S.minimized && narrow())) { d.hidden = true; return; }
    d.hidden = false;
    d.classList.toggle('is-min', !!S.minimized);
    d.classList.toggle('beside', !S.minimized);
    var r = S.result;
    if (S.minimized) {
      // On a phone with a highlight the ring alone opens the panel, so the highlight label keeps its room.
      var compact = !!hl && narrow();
      d.appendChild(button('dock-score' + (compact ? ' is-compact' : ''), [miniRing(r && !r.error ? r.score : null)].concat(compact ? [] : [h('span', null, 'Design Score')]), function () { restore(); },
        { 'data-k': 'open', 'aria-label': 'Open Design Score' + (r && !r.error ? ': ' + r.score + ' out of 100, grade ' + r.grade : ''), title: 'Open the panel' }));
    }
    if (hl) {
      if (S.minimized) d.appendChild(h('span', { class: 'dock-sep', 'aria-hidden': 'true' }));
      var label = S.hl.items.length > 1 ? (S.hl.focus + 1) + ' of ' + S.hl.items.length : '1 element';
      d.appendChild(h('span', { class: 'dock-text', title: S.hl.label || null }, 'Showing ' + label + (S.hl.label ? ': ' + S.hl.label : '')));
      if (S.hl.items.length > 1) {
        d.appendChild(button('ib', [icon('next'), h('span', { class: 'sr' }, 'Next example')], function () {
          var n = S.hl.items.length, j = S.hl.focus;
          for (var step = 1; step <= n; step++) { j = (S.hl.focus + step) % n; if (canShow(S.hl.items[j].ex)) break; }
          reveal(j);
          var ex = S.hl && S.hl.items[j] ? S.hl.items[j].ex : null;
          announce('Showing ' + (j + 1) + ' of ' + n + ': ' + oneLine((ex && ex.selector) || 'element', 80) + '.');
        }, { 'data-k': 'next', title: 'Next example' }));
      }
      d.appendChild(button('btn btn-sm', [icon('clear'), 'Clear'], function () { clearHighlights(false); }, { 'data-k': 'clear', 'aria-label': 'Clear highlights' }));
    }
    if (S.minimized) {
      var x = iconButton('close', 'Close Design Score', function () { close(); });
      x.setAttribute('data-k', 'close');
      d.appendChild(x);
    }
    if (keep) {
      var again = d.querySelector('[data-k="' + keep + '"]') || d.querySelector('button');
      if (again) again.focus();
    }
  }

  /* -------------------------------------------------------- copy and save */

  function announce(msg) {
    if (!S || !S.live) return;
    var region = S.minimized && S.liveOut ? S.liveOut : S.live;
    S.live.textContent = '';
    if (S.liveOut) S.liveOut.textContent = '';
    later(function () { region.textContent = msg; }, 60);
  }

  function toast(msg) {
    if (!S || !S.toast) return;
    if (S.minimized) { announce(msg); return; }
    S.toast.textContent = msg;
    S.toast.classList.add('is-on');
    announce(msg);
    if (S.toastTimer) W.clearTimeout(S.toastTimer);
    S.toastTimer = later(function () { S.toast.classList.remove('is-on'); }, 2400);
  }

  function flash(b) {
    if (!b || !b._mhLbl) return;
    b.classList.add('is-done');
    if (!b._mhShort) b._mhLbl.textContent = 'Copied';
    later(function () { b.classList.remove('is-done'); b._mhLbl.textContent = b._mhText; }, 1600);
  }

  function execCopy(text) {
    var ta = D.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.setAttribute('aria-hidden', 'true');
    ta.setAttribute('tabindex', '-1');
    ta.className = 'clip';
    var mount = (S && S.root) || D.body;
    var active = S && S.root ? S.root.activeElement : null;
    var ok = false;
    try {
      mount.appendChild(ta);
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, text.length);
      ok = !!(D.execCommand && D.execCommand('copy'));
    } catch (e) { ok = false; }
    if (ta.parentNode) ta.parentNode.removeChild(ta);
    if (active && active.focus) { try { active.focus({ preventScroll: true }); } catch (e2) { /* ignore */ } }
    return ok;
  }

  function copyText(text, msg, btn) {
    text = str(text);
    var st = S;
    var done = function (ok) {
      if (S !== st || !S) return;
      if (ok) { if (btn) flash(btn); toast(msg || 'Copied'); } else manualCopy(text);
    };
    var fallback = function () { done(execCopy(text)); };
    try {
      var cb = W.navigator && W.navigator.clipboard;
      if (cb && typeof cb.writeText === 'function' && W.isSecureContext !== false) {
        cb.writeText(text).then(function () { done(true); }, fallback);
        return;
      }
    } catch (e) { /* fall through */ }
    fallback();
  }

  // When the page blocks the clipboard, show the text selected so the person can copy it by hand.
  function manualCopy(text) {
    if (!S) return;
    if (S.minimized) restore();
    closeSheet();
    var ta = h('textarea', { readonly: true, 'aria-label': 'Text to copy', spellcheck: 'false' });
    ta.value = text;
    var touch = false;
    try { touch = !!(W.matchMedia && W.matchMedia('(pointer: coarse)').matches); } catch (e) { /* keep the shortcut text */ }
    var sheet = h('div', { class: 'msheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'mh-ms-t' },
      h('h3', { id: 'mh-ms-t' }, 'Copy it by hand'),
      h('p', null, 'This page blocks the clipboard. ' + (touch ? 'Touch and hold the text below, choose Copy, then Done.' : 'The text below is selected: press ' + (isMac() ? '⌘C' : 'Ctrl+C') + ', then Done.')),
      ta,
      h('div', { class: 'row' },
        button('btn btn-sm', 'Select all', function () { ta.focus(); ta.select(); }),
        button('btn btn-sm btn-primary', 'Done', function () { closeSheet(); })));
    S.sheet = sheet;
    S.sheetReturn = S.root.activeElement;
    S.panel.scrollTop = 0; // the panel scrolls on a short viewport; the sheet covers it from the top
    S.panel.appendChild(sheet);
    ta.focus();
    ta.select();
  }
  function closeSheet() {
    if (!S || !S.sheet) return;
    if (S.sheet.parentNode) S.sheet.parentNode.removeChild(S.sheet);
    S.sheet = null;
    var r = S.sheetReturn;
    S.sheetReturn = null;
    if (r && r.focus && S.panel.contains(r)) { try { r.focus({ preventScroll: true }); } catch (e) { /* ignore */ } } else { try { S.panel.focus({ preventScroll: true }); } catch (e2) { /* ignore */ } }
  }

  function saveUrl(url, name) {
    var a = D.createElement('a');
    a.href = url;
    a.download = name;
    a.rel = 'noopener';
    a.className = 'clip';
    a.setAttribute('tabindex', '-1');
    a.setAttribute('aria-hidden', 'true');
    var mount = (S && S.root) || D.body || D.documentElement;
    mount.appendChild(a);
    try { a.click(); } finally { if (a.parentNode) a.parentNode.removeChild(a); }
  }
  function saveBlob(blob, name) {
    var U = W.URL || W.webkitURL;
    var url = U.createObjectURL(blob);
    saveUrl(url, name);
    W.setTimeout(function () { try { U.revokeObjectURL(url); } catch (e) { /* ignore */ } }, 30000);
  }
  function saveText(text, name, type) {
    try { saveBlob(new W.Blob([str(text)], { type: type || 'text/plain;charset=utf-8' }), name); return true; } catch (e) { warn(e); return false; }
  }

  function primaryAction(b) {
    var f = fmtApi();
    if (!S || !f) return;
    if (S.tab === 'style') copyText(f.designMd(S.style), 'DESIGN.md copied. Save it in your project for your agent.', b);
    else copyText(f.promptMd(S.result), 'Fix prompt copied. Paste it into your agent.', b);
  }

  function badgeMd(r) {
    var score = r && isNum(r.score) ? Math.round(r.score) : 0;
    var grade = r && r.grade ? r.grade : gradeOf(score);
    var color = (SHIELDS[grade] || ['lightgrey'])[0];
    return '[![Design Score](https://img.shields.io/badge/Design%20Score-' + score + '-' + color + ')](' + SCORE_PAGE + ')';
  }

  function downloadCard(b) {
    if (!S || !S.result || S.result.error) return;
    var r = S.result;
    var name = 'design-score-' + slugHost(r.host) + '.png';
    // Encode synchronously so the download stays inside the click (some browsers drop downloads started later).
    try {
      var data = cardCanvas(r).toDataURL('image/png');
      var blob = null;
      try {
        var bin = W.atob(data.slice(data.indexOf(',') + 1));
        var bytes = new W.Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        blob = new W.Blob([bytes], { type: 'image/png' });
      } catch (e2) { blob = null; }
      if (blob) saveBlob(blob, name); else saveUrl(data, name);
      if (b) flashSaved(b);
      toast('Score card saved as ' + name);
    } catch (e) { warn(e); toast('This page blocked the download.'); }
  }
  function flashSaved(b) {
    b.classList.add('is-done');
    later(function () { b.classList.remove('is-done'); }, 1600);
  }

  // A blob: tab takes the scored page's Content-Security-Policy, so the report's inline style and script run
  // there only if they run here. Both are tried on the spot (synchronously, inside the click).
  function inlineAllowed() {
    if (!S || !S.root) return false;
    var okStyle = false, okScript = false;
    var st = D.createElement('style'), i = D.createElement('i');
    st.textContent = '.mh-csp-probe{--mh-csp:1}';
    i.className = 'mh-csp-probe';
    try {
      S.root.appendChild(st);
      S.root.appendChild(i);
      okStyle = W.getComputedStyle(i).getPropertyValue('--mh-csp').trim() === '1';
    } catch (e) { okStyle = false; }
    if (st.parentNode) st.parentNode.removeChild(st);
    if (i.parentNode) i.parentNode.removeChild(i);
    if (!okStyle) return false;
    var sc = D.createElement('script');
    try {
      sc.textContent = 'window.__mhInline=1'; // throws where Trusted Types are enforced
      S.root.appendChild(sc);
      okScript = W.__mhInline === 1;
    } catch (e2) { okScript = false; }
    if (sc.parentNode) sc.parentNode.removeChild(sc);
    try { delete W.__mhInline; } catch (e3) { W.__mhInline = undefined; }
    return okScript;
  }

  function openReport(b) {
    if (!S || !S.result || S.result.error) return;
    var name = 'design-score-' + slugHost(S.result.host) + '.html';
    var html = reportHtml(S.result, S.style);
    var U = W.URL || W.webkitURL, url = null, win = null;
    var allowed = inlineAllowed();
    // The URL is not revoked: the page releases it when it unloads, and until then a reload of the tab still works.
    if (allowed) { try { url = U.createObjectURL(new W.Blob([html], { type: 'text/html;charset=utf-8' })); } catch (e) { url = null; } }
    if (url) { try { win = W.open(url, '_blank'); } catch (e2) { win = null; } }
    if (win) {
      try { win.opener = null; } catch (e3) { /* ignore */ }
      if (b) flashSaved(b);
      toast('The full report opened in a new tab.');
      return;
    }
    if (url) { try { U.revokeObjectURL(url); } catch (e5) { /* ignore */ } }
    if (saveText(html, name, 'text/html;charset=utf-8')) {
      toast(allowed ? 'Pop-ups are blocked here, so the report was downloaded as ' + name + '.' : 'This page’s security policy would break the report tab, so it was downloaded as ' + name + '.');
    } else toast(allowed ? 'This page blocked both the new tab and the download.' : 'This page blocked the download.');
  }
  function saveReport(b) {
    if (!S || !S.result || S.result.error) return;
    var name = 'design-score-' + slugHost(S.result.host) + '.html';
    if (saveText(reportHtml(S.result, S.style), name, 'text/html;charset=utf-8')) { if (b) flashSaved(b); toast('Report saved as ' + name); }
    else toast('This page blocked the download.');
  }

  /* -------------------------------------------------------------- score card */

  var CARD_SANS = '"Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, Roboto, "Helvetica Neue", Arial, sans-serif';
  var CARD_MONO = 'ui-monospace, "SF Mono", "Cascadia Mono", Consolas, Menlo, "Liberation Mono", monospace';

  function rr(c, x, y, w, hgt, r) {
    r = Math.min(r, w / 2, hgt / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.arcTo(x + w, y, x + w, y + r, r);
    c.lineTo(x + w, y + hgt - r);
    c.arcTo(x + w, y + hgt, x + w - r, y + hgt, r);
    c.lineTo(x + r, y + hgt);
    c.arcTo(x, y + hgt, x, y + hgt - r, r);
    c.lineTo(x, y + r);
    c.arcTo(x, y, x + r, y, r);
    c.closePath();
  }
  function glow(c, x, y, r, rgb, a) {
    var g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 1200, 630);
  }
  function fitText(c, text, max) {
    text = str(text);
    if (c.measureText(text).width <= max) return text;
    var lo = 0, hi = text.length;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if (c.measureText(text.slice(0, mid) + '…').width <= max) lo = mid; else hi = mid - 1;
    }
    return text.slice(0, lo).replace(/\s+$/, '') + '…';
  }
  function drawMark(c, x, y, size, color) {
    if (typeof W.Path2D !== 'function') return;
    c.save();
    c.translate(x, y);
    var k = size / 288;
    c.scale(k, k);
    c.translate(4, 4);
    c.translate(20, 20);
    c.scale(1.142857143, 1.142857143);
    c.translate(-13, -11);
    c.fillStyle = color;
    MARK_PATHS.forEach(function (d) { try { c.fill(new W.Path2D(d)); } catch (e) { /* ignore */ } });
    c.restore();
  }

  function drawCard(c, r) {
    var score = isNum(r.score) && !r.error ? clamp(Math.round(r.score), 0, 100) : null;
    var grade = score == null ? '–' : str(r.grade || gradeOf(score));
    var band = bandColor(score);
    c.textBaseline = 'alphabetic';
    c.fillStyle = '#0b0d10';
    c.fillRect(0, 0, 1200, 630);
    glow(c, 170, 80, 640, '195,182,221', 0.24);
    glow(c, 1160, 660, 580, '183,219,202', 0.17);
    glow(c, 720, -140, 480, '243,234,217', 0.07);
    c.fillStyle = 'rgba(255,255,255,0.045)';
    for (var gy = 22; gy < 630; gy += 28) for (var gx = 22; gx < 1200; gx += 28) c.fillRect(gx, gy, 1.5, 1.5);

    // header
    drawMark(c, 72, 54, 32, '#f1f2f3');
    c.font = '600 26px ' + CARD_SANS;
    c.fillStyle = '#f1f2f3';
    c.textAlign = 'left';
    c.fillText('Design Score', 116, 80);
    var vp = r.viewport || {};
    c.font = '500 18px ' + CARD_MONO;
    c.fillStyle = '#8f9ba6';
    c.textAlign = 'right';
    c.fillText(dateOnly(r.timestamp) + (vp.width ? '  ·  ' + vp.width + '×' + vp.height : ''), 1128, 80);

    // ring
    var cx = 262, cy = 334, R = 146;
    c.lineWidth = 24;
    c.strokeStyle = 'rgba(255,255,255,0.08)';
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();
    if (score) {
      var g = c.createLinearGradient(cx - R, cy - R, cx + R, cy + R);
      g.addColorStop(0, '#c3b6dd');
      g.addColorStop(1, band);
      c.save();
      c.shadowColor = alpha(band, 0.45);
      c.shadowBlur = 34;
      c.strokeStyle = g;
      c.lineCap = 'round';
      c.beginPath(); c.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * score / 100); c.stroke();
      c.restore();
    }
    c.textAlign = 'center';
    c.fillStyle = '#f1f2f3';
    c.font = '700 124px ' + CARD_SANS;
    c.fillText(score == null ? '–' : String(score), cx, cy + 26);
    c.font = '500 22px ' + CARD_SANS;
    c.fillStyle = '#8f9ba6';
    c.fillText('out of 100', cx, cy + 70);
    var sc = r.scanned || {};
    if (sc.elements) {
      c.font = '500 17px ' + CARD_MONO;
      c.fillText(fmt(sc.elements) + ' elements measured', cx, 534);
    }

    // right column
    var x0 = 500, x1 = 1128;
    c.textAlign = 'left';
    var gtxt = 'Grade ' + grade;
    c.font = '700 24px ' + CARD_SANS;
    var gw = c.measureText(gtxt).width + 40;
    c.fillStyle = alpha(band, 0.15);
    rr(c, x0, 112, gw, 46, 23); c.fill();
    c.strokeStyle = alpha(band, 0.55); c.lineWidth = 1.5; c.stroke();
    c.fillStyle = band;
    c.fillText(gtxt, x0 + 20, 143);
    c.font = '700 50px ' + CARD_SANS;
    c.fillStyle = '#f1f2f3';
    c.fillText(fitText(c, r.host || 'This page', x1 - x0), x0, 222);
    if (r.title) {
      c.font = '400 22px ' + CARD_SANS;
      c.fillStyle = '#8f9ba6';
      c.fillText(fitText(c, r.title, x1 - x0), x0, 258);
    }
    var y = 316;
    catList(r).slice(0, 7).forEach(function (cat) {
      var measured = isNum(cat.score);
      c.textAlign = 'left';
      c.font = '500 19px ' + CARD_SANS;
      c.fillStyle = '#c4cad0';
      c.fillText(fitText(c, cat.label, 232), x0, y);
      var bx = 748, bw = 314, bh = 8, by = y - 12;
      c.fillStyle = 'rgba(255,255,255,0.08)';
      rr(c, bx, by, bw, bh, 4); c.fill();
      if (measured && cat.score > 0) {
        c.fillStyle = bandColor(cat.score);
        rr(c, bx, by, Math.max(bh, bw * clamp(cat.score, 0, 100) / 100), bh, 4); c.fill();
      }
      c.textAlign = 'right';
      c.font = '600 20px ' + CARD_MONO;
      c.fillStyle = measured ? '#f1f2f3' : '#8f9ba6';
      c.fillText(measured ? String(cat.score) : '–', x1, y);
      y += 36;
    });

    // footer
    c.fillStyle = 'rgba(255,255,255,0.09)';
    c.fillRect(72, 566, 1056, 1);
    drawMark(c, 72, 585, 22, '#c4cad0');
    c.textAlign = 'left';
    c.font = '500 19px ' + CARD_SANS;
    c.fillStyle = '#c4cad0';
    c.fillText('Scored with makkov-harness', 104, 603);
    c.textAlign = 'right';
    c.font = '500 18px ' + CARD_MONO;
    c.fillStyle = '#8f9ba6';
    c.fillText(REPO_SHORT, 1128, 603);
  }

  function cardCanvas(result) {
    var r = result || (W.MHScore && W.MHScore.lastRun) || {};
    var cv = D.createElement('canvas');
    cv.width = 1200;
    cv.height = 630;
    var c = null;
    try { c = cv.getContext('2d'); } catch (e) { c = null; }
    if (c) { try { drawCard(c, r); } catch (e2) { warn(e2); } }
    return cv;
  }

  /* ------------------------------------------------------------------ report */

  function esc(v) {
    return str(v).replace(/[&<>"']/g, function (ch) { return ch === '&' ? '&amp;' : ch === '<' ? '&lt;' : ch === '>' ? '&gt;' : ch === '"' ? '&quot;' : '&#39;'; });
  }
  function safeHref(u) { u = str(u); return /^https?:\/\//i.test(u) ? esc(u) : null; }
  function jsonOf(v) {
    var f = fmtApi();
    if (f && f.json) return f.json(v);
    try { return JSON.stringify(v, function (k, x) { return x && typeof x === 'object' && typeof x.nodeType === 'number' ? undefined : x; }, 2); } catch (e) { return '{}'; }
  }

  var MARK_SVG_STR = '<svg class="mark" viewBox="' + MARK_VIEWBOX + '" aria-hidden="true"><g transform="' + MARK_TRANSFORM + '" fill="currentColor">' +
    MARK_PATHS.map(function (d) { return '<path d="' + d + '"/>'; }).join('') + '</g></svg>';

  var REPORT_CSS = [
    ':root{color-scheme:dark;--bg:#0b0d10;--bg2:#121519;--bg3:#181c21;--rule:rgba(255,255,255,.08);--rule2:rgba(255,255,255,.14);--ink:#f1f2f3;--ink2:#c4cad0;--muted:#8f9ba6;--opal1:#c3b6dd;--opal2:#b7dbca;--focus:#99bdd3;',
    '--sans:-apple-system,BlinkMacSystemFont,"Segoe UI Variable Text","Segoe UI",system-ui,Roboto,"Helvetica Neue",Arial,sans-serif;--mono:ui-monospace,"SF Mono","Cascadia Mono","Segoe UI Mono",Menlo,Consolas,"Liberation Mono",monospace}',
    '*,*::before,*::after{box-sizing:border-box}',
    'html{-webkit-text-size-adjust:100%;text-size-adjust:100%}',
    'body{margin:0;background:var(--bg);color:var(--ink);font:400 15px/1.55 var(--sans);-webkit-font-smoothing:antialiased}',
    'body::before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:radial-gradient(70% 55% at 0% 0%,rgba(195,182,221,.13),rgba(195,182,221,0) 70%),radial-gradient(55% 45% at 100% 0%,rgba(183,219,202,.09),rgba(183,219,202,0) 70%)}',
    'a{color:var(--ink);text-decoration-color:rgba(255,255,255,.35);text-underline-offset:3px}a:hover{text-decoration-color:currentColor}',
    'a:focus-visible,button:focus-visible,summary:focus-visible{outline:2px solid var(--focus);outline-offset:3px;border-radius:6px}',
    'code,pre{font-family:var(--mono)}',
    'h1,h2,h3{margin:0;line-height:1.2;letter-spacing:-.015em}',
    'p{margin:0}',
    '.wrap{max-width:1000px;margin:0 auto;padding:28px 24px 72px}',
    '.top{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px}',
    '.brand{display:inline-flex;align-items:center;gap:10px;font-weight:650;text-decoration:none}',
    '.mark{width:22px;height:22px;color:var(--ink)}',
    '.stamp{font:500 12.5px/1.4 var(--mono);color:var(--muted)}',
    '.toc{display:flex;flex-wrap:wrap;gap:6px;margin-top:20px}',
    '.toc a{display:inline-flex;align-items:center;min-height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--rule2);font-size:13px;text-decoration:none;color:var(--ink2)}',
    '.toc a:hover{color:var(--ink);background:rgba(255,255,255,.05)}',
    '.hero{display:grid;grid-template-columns:200px minmax(0,1fr);gap:36px;align-items:center;margin-top:28px;padding:32px;border-radius:28px;background:var(--bg2);border:1px solid var(--rule)}',
    '.ring{position:relative;width:200px;height:200px}',
    '.ring svg{display:block;width:100%;height:100%}',
    '.ring-v{stroke-dasharray:var(--v) 100;animation:ring 1.3s cubic-bezier(.16,1,.3,1) both}',
    '@keyframes ring{from{stroke-dasharray:0 100}}',
    '.ring-num{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}',
    '.ring-num b{font-size:68px;line-height:1;font-weight:700;letter-spacing:-.05em;font-variant-numeric:tabular-nums}',
    '.ring-num span{margin-top:6px;font-size:13px;color:var(--muted)}',
    '.grade{display:inline-flex;align-items:center;gap:10px;height:34px;padding:0 14px;border-radius:999px;font-weight:750;font-size:18px;color:var(--band);background:var(--band-a);box-shadow:inset 0 0 0 1px var(--band-b)}',
    '.grade small{font-size:11px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2)}',
    '.hero h1{margin-top:14px;font-size:clamp(28px,4vw,42px);font-weight:700;overflow-wrap:anywhere}',
    '.ptitle{margin-top:4px;color:var(--ink2);overflow-wrap:anywhere}',
    '.url{margin-top:6px;font:500 13px/1.5 var(--mono);color:var(--muted);overflow-wrap:anywhere}',
    '.meta{margin-top:14px;font:500 13px/1.6 var(--mono);color:var(--muted)}',
    '.callout{margin-top:16px;padding:14px 16px;border-radius:16px;background:linear-gradient(135deg,rgba(195,182,221,.11),rgba(183,219,202,.06));box-shadow:inset 0 0 0 1px rgba(195,182,221,.2);color:var(--ink2)}',
    '.callout strong{color:var(--ink)}',
    '.callout p+p{margin-top:4px}',
    'section{margin-top:56px}',
    'section>h2{font-size:24px;font-weight:700}',
    '.lede{margin-top:6px;color:var(--muted);max-width:68ch}',
    '.cats{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px;margin-top:20px}',
    '.cat{padding:18px;border-radius:20px;background:var(--bg2);border:1px solid var(--rule)}',
    '.cat-h{display:flex;align-items:baseline;justify-content:space-between;gap:12px}',
    '.cat-h h3{font-size:16px;font-weight:650}',
    '.cat-h b{font:650 22px/1 var(--mono);font-variant-numeric:tabular-nums}',
    '.cat-w{font:500 12px var(--mono);color:var(--muted)}',
    '.bar{height:8px;margin-top:12px;border-radius:8px;background:rgba(255,255,255,.08);overflow:hidden}',
    '.bar i{display:block;height:100%;border-radius:inherit;width:var(--w);background:var(--c)}',
    '.cat p{margin-top:12px;font-size:13.5px;color:var(--ink2)}',
    '.issues{display:grid;gap:10px;margin:20px 0 0;padding:0;list-style:none}',
    '.issue{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;padding:16px 18px;border-radius:18px;background:var(--bg2);border:1px solid var(--rule)}',
    '.sev{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;font-size:11.5px;font-weight:650;letter-spacing:.04em;text-transform:uppercase;color:var(--c);background:var(--ca)}',
    '.issue h3{font-size:15.5px;font-weight:650;overflow-wrap:anywhere}',
    '.issue p{margin-top:4px;font-size:14px;color:var(--ink2);overflow-wrap:anywhere}',
    '.issue .fix{color:var(--ink)}',
    '.issue .fix b{font-weight:650}',
    '.where{margin-top:8px;font-size:13px;color:var(--muted);overflow-wrap:anywhere}',
    '.where code{font-size:12.5px;color:var(--ink2)}',
    '.pts{font:650 14px/1.6 var(--mono);color:var(--ink2);white-space:nowrap}',
    '.group{margin-top:28px}',
    '.group-h{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px;padding-bottom:10px;border-bottom:1px solid var(--rule2)}',
    '.group-h h3{font-size:18px;font-weight:650}',
    '.group-h span{font:600 14px var(--mono);color:var(--ink2)}',
    '.chk{padding:16px 0;border-bottom:1px solid var(--rule)}',
    '.chk-h{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center}',
    '.chk-h h4{margin:0;font-size:15px;font-weight:600}',
    '.chk-h b{font:650 14px var(--mono);font-variant-numeric:tabular-nums}',
    '.pill{display:inline-flex;align-items:center;height:22px;padding:0 9px;border-radius:999px;font-size:11px;font-weight:650;letter-spacing:.04em;text-transform:uppercase;color:var(--c);background:var(--ca)}',
    '.val{margin-top:6px;font-size:14px;color:var(--ink);overflow-wrap:anywhere}',
    'dl.kv{display:grid;grid-template-columns:130px minmax(0,1fr);gap:4px 16px;margin:10px 0 0;font-size:13.5px}',
    '.kv dt{color:var(--muted)}.kv dd{margin:0;color:var(--ink2);overflow-wrap:anywhere}',
    'details{margin-top:10px}',
    'summary{cursor:pointer;width:max-content;max-width:100%;font-size:13.5px;font-weight:600;color:var(--ink2)}',
    'summary:hover{color:var(--ink)}',
    '.exs{margin:10px 0 0;padding:0 0 0 22px;font-size:13px;color:var(--ink2)}',
    '.exs li{margin-top:6px;overflow-wrap:anywhere}',
    '.exs code{font-size:12.5px;color:var(--ink)}',
    '.exs q{color:var(--muted)}',
    '.sub{margin-top:28px;font-size:13px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--ink2)}',
    '.roles,.pal{display:grid;gap:10px;margin-top:12px}',
    '.roles{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}',
    '.pal{grid-template-columns:repeat(auto-fill,minmax(112px,1fr))}',
    '.sw{border-radius:14px;overflow:hidden;background:var(--bg2);border:1px solid var(--rule)}',
    '.sw i{display:block;height:64px;box-shadow:inset 0 -1px 0 rgba(255,255,255,.08)}',
    '.sw div{padding:8px 10px 10px;font-size:12px;color:var(--muted);overflow-wrap:anywhere}',
    '.sw code{display:block;font-size:12.5px;font-weight:650;color:var(--ink)}',
    'table{width:100%;margin-top:12px;border-collapse:collapse;font-size:13.5px}',
    'th,td{padding:9px 10px;text-align:left;vertical-align:top;border-bottom:1px solid var(--rule);overflow-wrap:anywhere}',
    'th{font-size:11.5px;font-weight:650;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)}',
    'td code{font-size:12.5px;color:var(--ink2)}',
    '.tw{overflow-x:auto}',
    '.chips{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px;padding:0;list-style:none}',
    '.chips li{padding:6px 10px;border-radius:10px;background:var(--bg2);border:1px solid var(--rule);font:600 12.5px var(--mono)}',
    '.chips small{margin-left:6px;font-weight:500;color:var(--muted)}',
    '.shadows{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-top:12px}',
    '.sh{border-radius:16px;overflow:hidden;background:var(--bg2);border:1px solid var(--rule)}',
    '.sh div{display:flex;align-items:center;justify-content:center;height:96px;background:#e9ebee}',
    '.sh i{display:block;width:60%;height:48px;border-radius:10px;background:#fff}',
    '.sh code{display:block;padding:8px 10px 10px;font-size:11.5px;color:var(--muted);overflow-wrap:anywhere}',
    '.block{position:relative;margin-top:12px}',
    'pre{margin:0;padding:18px;max-height:480px;overflow:auto;border-radius:16px;background:var(--bg2);border:1px solid var(--rule);font-size:12.5px;line-height:1.6;color:var(--ink2);white-space:pre-wrap;overflow-wrap:anywhere}',
    '.copy{position:absolute;top:10px;right:10px;height:32px;padding:0 14px;border-radius:999px;border:1px solid var(--rule2);background:var(--bg3);color:var(--ink);font:600 12.5px var(--sans);cursor:pointer}',
    '.copy:hover{background:#23282e}',
    '.badge{display:inline-flex;margin-top:12px;border-radius:4px;overflow:hidden;font:600 12px/20px Verdana,Geneva,DejaVu Sans,sans-serif;color:#fff;text-shadow:0 1px 0 rgba(0,0,0,.3)}',
    '.badge span{padding:0 7px}.badge span:first-child{background:#555}',
    'footer{margin-top:72px;padding-top:24px;border-top:1px solid var(--rule);font-size:13.5px;color:var(--muted)}',
    'footer p+p{margin-top:6px}',
    '@media (max-width:720px){.wrap{padding:20px 16px 56px}.hero{grid-template-columns:1fr;justify-items:start;gap:20px;padding:22px}.ring{width:160px;height:160px}.ring-num b{font-size:54px}dl.kv{grid-template-columns:1fr}.kv dd{margin-bottom:6px}.issue{grid-template-columns:minmax(0,1fr) auto}.issue .sev{grid-column:1/-1;justify-self:start}}',
    '@media (prefers-reduced-motion:reduce){.ring-v{animation:none}}',
    '@media print{:root{color-scheme:light;--bg:#fff;--bg2:#fff;--bg3:#f3f4f6;--rule:#e2e5e9;--rule2:#cfd4da;--ink:#111418;--ink2:#2c3238;--muted:#59636e}body::before,.copy,.toc{display:none}.hero,.cat,.issue,.sw,.sh{break-inside:avoid}pre{max-height:none}}'
  ].join('\n');

  var REPORT_JS = '(function(){function fb(s){var a=document.createElement("textarea");a.value=s;a.setAttribute("readonly","");a.style.position="fixed";a.style.opacity="0";document.body.appendChild(a);a.select();var ok=false;try{ok=document.execCommand("copy");}catch(e){}document.body.removeChild(a);return ok;}' +
    'var bs=document.querySelectorAll("[data-copy]");for(var i=0;i<bs.length;i++){(function(b){b.hidden=false;b.addEventListener("click",function(){var t=document.getElementById(b.getAttribute("data-copy"));var s=t?t.textContent:"";' +
    'var done=function(ok){var o=b.getAttribute("data-label");b.textContent=ok?"Copied":"Select and copy";setTimeout(function(){b.textContent=o;},1600);};' +
    'if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(s).then(function(){done(true);},function(){done(fb(s));});}else{done(fb(s));}});})(bs[i]);}})();';

  function rPill(status) {
    var st = STATUS[status] || STATUS.skip;
    return '<span class="pill" style="--c:' + st.color + ';--ca:' + alpha(st.color, 0.14) + '">' + esc(st.label) + '</span>';
  }
  function rExamples(exs) {
    exs = arr(exs);
    if (!exs.length) return '';
    return '<details><summary>' + esc(plural(exs.length, 'example')) + '</summary><ol class="exs">' + exs.map(function (e) {
      return '<li><code>' + esc((e && e.selector) || 'element') + '</code>' + (e && e.note ? ' · ' + esc(e.note) : '') + (e && e.text ? ' <q>' + esc(e.text) + '</q>' : '') + '</li>';
    }).join('') + '</ol></details>';
  }
  function rBlock(id, text, label) {
    return '<div class="block"><pre id="' + id + '">' + esc(text) + '</pre><button class="copy" type="button" data-copy="' + id + '" data-label="' + esc(label || 'Copy') + '" hidden>' + esc(label || 'Copy') + '</button></div>';
  }

  function rStyle(st) {
    if (!st) return '<p class="lede">The style was not extracted for this report.</p>';
    var out = [];
    var roles = st.roles || {};
    var roleHtml = ['background', 'surface', 'text', 'muted', 'accent', 'border'].map(function (k) {
      var hex = safeHex(roles[k]);
      return hex ? '<div class="sw"><i style="background:' + hex + '"></i><div><code>' + esc(hex) + '</code>' + esc(cap(k)) + '</div></div>' : '';
    }).join('');
    if (roleHtml) out.push('<h3 class="sub">Colour roles</h3><div class="roles">' + roleHtml + '</div>');
    var colors = arr(st.colors).filter(function (c) { return safeHex(c.hex); });
    if (colors.length) {
      out.push('<h3 class="sub">Palette · ' + esc(plural(colors.length, 'colour')) + '</h3><div class="pal">' + colors.map(function (c) {
        var hex = safeHex(c.hex);
        return '<div class="sw"><i style="background:' + hex + '"></i><div><code>' + esc(hex) + '</code>' + esc(c.name || '') + (arr(c.roles).length ? ' · ' + esc(arr(c.roles).join(', ')) : '') + ' · ' + esc(fmt(c.count || 0)) + '×</div></div>';
      }).join('') + '</div>');
    }
    var fonts = arr(st.fonts);
    if (fonts.length) {
      out.push('<h3 class="sub">Fonts</h3><div class="tw"><table><thead><tr><th>Family</th><th>Role</th><th>Weights</th><th>Sample</th></tr></thead><tbody>' + fonts.map(function (f) {
        var stack = safeFont(f.stack);
        return '<tr><td><b>' + esc(f.family) + '</b><br><code>' + esc(f.stack) + '</code></td><td>' + esc(arr(f.roles).join(', ')) + '</td><td>' + esc(arr(f.weights).join(', ')) + '</td><td' + (stack ? ' style="font-family:' + esc(stack) + ';font-size:18px"' : '') + '>Sphinx of black quartz</td></tr>';
      }).join('') + '</tbody></table></div>');
    }
    var scale = arr(st.typeScale);
    if (scale.length) {
      out.push('<h3 class="sub">Type scale</h3><div class="tw"><table><thead><tr><th>Size</th><th>rem</th><th>Line height</th><th>Weight</th><th>Seen on</th><th>Uses</th></tr></thead><tbody>' + scale.map(function (t) {
        return '<tr><td><code>' + esc(t.px) + 'px</code></td><td><code>' + esc(t.rem) + '</code></td><td>' + esc(t.lineHeight) + '</td><td>' + esc(t.weight) + '</td><td><code>' + esc(t.sample) + '</code></td><td>' + esc(fmt(t.count || 0)) + '</td></tr>';
      }).join('') + '</tbody></table></div>');
    }
    function chips(list, label) {
      return '<ul class="chips">' + list.map(function (x) { return '<li>' + esc(label(x)) + '<small>×' + esc(fmt(x.count || 0)) + '</small></li>'; }).join('') + '</ul>';
    }
    if (arr(st.spacing).length) out.push('<h3 class="sub">Spacing</h3>' + chips(arr(st.spacing).slice().sort(function (a, b) { return a.px - b.px; }), function (s) { return s.px + 'px'; }));
    if (arr(st.radii).length) out.push('<h3 class="sub">Corner radii</h3>' + chips(arr(st.radii).slice().sort(function (a, b) { return a.px - b.px; }), function (r) { return r.px >= 9999 ? 'pill' : r.px + 'px'; }));
    var shadows = arr(st.shadows);
    if (shadows.length) {
      out.push('<h3 class="sub">Shadows</h3><div class="shadows">' + shadows.map(function (s) {
        var v = safeCss(s.value);
        return '<div class="sh"><div><i' + (v ? ' style="box-shadow:' + esc(v) + '"' : '') + '></i></div><code>' + esc(fmt(s.count || 0)) + '× · ' + esc(s.value) + '</code></div>';
      }).join('') + '</div>');
    }
    var props = arr(st.customProperties);
    if (props.length) {
      out.push('<details><summary>' + esc(plural(props.length, 'custom property', 'custom properties')) + ' on :root</summary>' +
        '<div class="block"><pre>' + esc(props.map(function (p) { return p.name + ': ' + p.value + ';'; }).join('\n')) + '</pre></div></details>');
    }
    return out.join('\n');
  }

  function reportHtml(result, style) {
    var r = result || (W.MHScore && W.MHScore.lastRun) || null;
    var f = fmtApi();
    if (!r) {
      return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Design Score report</title><style>' + REPORT_CSS + '</style></head><body><main class="wrap"><h1>Design Score report</h1><p class="lede">No result was passed in. Run MHScore.run() first and pass its result to MHScoreUI.reportHtml().</p></main></body></html>';
    }
    var failed = !!r.error;
    var score = isNum(r.score) ? Math.round(r.score) : 0;
    var grade = str(r.grade || gradeOf(score));
    var band = bandColor(failed ? null : score);
    var host = str(r.host || 'page');
    var vp = r.viewport || {}, sc = r.scanned || {};
    var cats = catList(r);
    var issues = arr(r.issues);
    var shield = SHIELDS[grade] || ['lightgrey', '#9f9f9f'];
    var o = [];

    o.push('<!doctype html>');
    o.push('<html lang="en"><head><meta charset="utf-8">');
    o.push('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; script-src \'unsafe-inline\'; img-src data:; base-uri \'none\'; form-action \'none\'">');
    o.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
    o.push('<meta name="color-scheme" content="dark light">');
    o.push('<meta name="generator" content="Design Score ' + esc(VERSION) + ' · makkov-harness">');
    o.push('<title>' + esc('Design Score ' + (failed ? '–' : score + ' (' + grade + ')') + ' · ' + host) + '</title>');
    o.push('<style>' + REPORT_CSS + '</style></head><body><div class="wrap">');

    o.push('<header class="top"><a class="brand" href="' + SCORE_PAGE + '" target="_blank" rel="noopener noreferrer">' + MARK_SVG_STR + '<span>Design Score report</span></a>' +
      '<span class="stamp">' + esc(stamp(r.timestamp)) + (vp.width ? ' · ' + esc(vp.width + ' × ' + vp.height) : '') + ' · v' + esc(r.version || VERSION) + '</span></header>');
    o.push('<nav class="toc" aria-label="Report sections"><a href="#categories">Categories</a><a href="#issues">Top issues</a><a href="#checks">Every check</a><a href="#style">Style</a><a href="#prompt">Fix prompt</a><a href="#badge">Badge</a></nav>');

    // hero
    var url = safeHref(r.url);
    var insightHtml = '';
    if (!failed) {
      var mc = cats.filter(function (c) { return isNum(c.score); }).slice().sort(function (a, b) { return b.score - a.score; });
      var lines = [];
      if (mc.length >= 2 && mc[0].score !== mc[mc.length - 1].score) lines.push('<p>Strongest in <strong>' + esc(mc[0].label + ' ' + mc[0].score) + '</strong>, weakest in <strong>' + esc(mc[mc.length - 1].label + ' ' + mc[mc.length - 1].score) + '</strong>.</p>');
      var top = issues.slice(0, 3);
      var gain = Math.min(100 - score, Math.round(top.reduce(function (a, is) { return a + (Number(is.impact) || 0); }, 0)));
      if (top.length && gain >= 1) lines.push('<p>' + (top.length === 1 ? 'Fixing the top issue' : 'Fixing the top ' + top.length + ' issues') + ' is worth up to <strong>+' + gain + ' ' + (gain === 1 ? 'point' : 'points') + '</strong>.</p>');
      if (!issues.length) lines.push('<p>Nothing measured needs fixing. Judge the rest by eye: hierarchy, the primary action, density and polish.</p>');
      if (lines.length) insightHtml = '<div class="callout">' + lines.join('') + '</div>';
    }
    o.push('<section class="hero" style="--band:' + band + ';--band-a:' + alpha(band, 0.15) + ';--band-b:' + alpha(band, 0.42) + '" aria-label="Summary">' +
      '<div class="ring" role="img" aria-label="' + esc(failed ? 'Not measured' : 'Design Score ' + score + ' out of 100, grade ' + grade) + '">' +
      '<svg viewBox="0 0 200 200" aria-hidden="true"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c3b6dd"/><stop offset="1" stop-color="' + band + '"/></linearGradient></defs>' +
      '<circle cx="100" cy="100" r="88" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="14"/>' +
      (failed || score < 1 ? '' : '<circle class="ring-v" style="--v:' + score + '" cx="100" cy="100" r="88" fill="none" stroke="url(#rg) ' + band + '" stroke-width="14" stroke-linecap="round" pathLength="100" transform="rotate(-90 100 100)"/>') +
      '</svg><div class="ring-num"><b>' + (failed ? '–' : score) + '</b><span>of 100</span></div></div>' +
      '<div><span class="grade"><small>Grade</small>' + esc(failed ? '–' : grade) + '</span>' +
      '<h1>' + esc(host) + '</h1>' + (r.title ? '<p class="ptitle">' + esc(r.title) + '</p>' : '') +
      (url ? '<p class="url"><a href="' + url + '" target="_blank" rel="noopener noreferrer">' + esc(r.url) + '</a></p>' : (r.url ? '<p class="url">' + esc(r.url) + '</p>' : '')) +
      '<p class="meta">' + (failed ? esc(r.error) : 'Measured on ' + esc(plural(sc.elements || 0, 'element')) + ' (' + esc(plural(sc.textBlocks || 0, 'text block')) + ') in ' + esc(fmt(sc.ms || 0)) + ' ms at ' + esc((vp.width || '?') + ' × ' + (vp.height || '?')) + (vp.dpr && vp.dpr !== 1 ? ' @' + esc(vp.dpr) + 'x' : '') +
        (sc.truncated ? '.<br>' + esc(partialNote(r, false)) : '.') +
        (sc.decorative ? '<br>' + esc(plural(sc.decorative, 'HTML illustration')) + ' (aria-hidden, role="img" or data-design-score="ignore") measured as pictures, not as the page’s own interface.' : '')) + '</p>' +
      insightHtml + '</div></section>');

    // categories
    o.push('<section id="categories"><h2>Categories</h2><p class="lede">Seven weighted categories. A category scores the weighted mean of its measured checks; the overall score is the weighted mean of the measured categories.</p><div class="cats">' + cats.map(function (c) {
      var m = isNum(c.score), col = bandColor(c.score);
      return '<div class="cat"><div class="cat-h"><h3>' + esc(c.label) + ' <span class="cat-w">' + esc(c.weight) + '%</span></h3><b>' + (m ? esc(c.score) : '–') + '</b></div>' +
        '<div class="bar" aria-hidden="true"><i style="--w:' + (m ? clamp(c.score, 0, 100) : 0) + '%;--c:' + col + '"></i></div><p>' + esc(c.summary || (m ? '' : 'Not measured on this page.')) + '</p></div>';
    }).join('') + '</div></section>');

    // issues
    o.push('<section id="issues"><h2>Top issues</h2><p class="lede">Sorted by the points each one costs the overall score. Fix from the top.</p>');
    if (!issues.length) o.push('<p class="lede">No measured issues on this page at this viewport.</p>');
    else {
      o.push('<ol class="issues">' + issues.map(function (is) {
        var sev = SEV[is.severity] || SEV.low;
        var seen = {};
        var where = arr(is.examples).filter(function (e) { if (!e || seen[e.selector]) return false; seen[e.selector] = 1; return true; }).slice(0, 4)
          .map(function (e) { return '<code>' + esc(e.selector) + '</code>' + (e.note ? ' (' + esc(e.note) + ')' : ''); });
        return '<li class="issue"><span class="sev" style="--c:' + sev.color + ';--ca:' + alpha(sev.color, 0.14) + '">' + esc(sev.label) + '</span>' +
          '<div><h3>' + esc(is.title) + '</h3>' + (is.detail ? '<p>' + esc(is.detail) + '</p>' : '') + '<p class="fix"><b>Fix:</b> ' + esc(is.fix) + '</p>' +
          '<p class="where">' + esc(catLabel(r, is.category)) + (where.length ? ' · Where: ' + where.join(', ') : '') + '</p></div>' +
          '<span class="pts" title="Points this costs">−' + esc(pts(is.impact)) + '</span></li>';
      }).join('') + '</ol>');
    }
    o.push('</section>');

    // every check
    o.push('<section id="checks"><h2>Every check</h2><p class="lede">What was measured, the value found, what good looks like and why it matters. Skipped checks say why they could not be measured.</p>');
    cats.forEach(function (c) {
      var checks = arr(c.checks);
      if (!checks.length) return;
      o.push('<div class="group"><div class="group-h"><h3>' + esc(c.label) + '</h3><span>' + (isNum(c.score) ? esc(c.score) + '/100' : 'not measured') + ' · weight ' + esc(c.weight) + '%</span></div>');
      checks.forEach(function (k) {
        o.push('<article class="chk"><div class="chk-h">' + rPill(k.status) + '<h4>' + esc(k.label) + '</h4><b>' + (k.status === 'skip' ? '–' : esc(k.score)) + '</b></div>' +
          (k.display ? '<p class="val">' + esc(k.display) + '</p>' : '') +
          '<dl class="kv">' + (k.target ? '<dt>Target</dt><dd>' + esc(k.target) + '</dd>' : '') + (k.why ? '<dt>Why it matters</dt><dd>' + esc(k.why) + '</dd>' : '') + '</dl>' +
          rExamples(k.examples) + '</article>');
      });
      o.push('</div>');
    });
    o.push('</section>');

    // style
    o.push('<section id="style"><h2>Extracted style</h2><p class="lede">Read from the computed styles of one viewport: an approximation of what renders, not the source design system. Check names and values before you build on them.</p>' + rStyle(style) + '</section>');

    // exports
    o.push('<section id="prompt"><h2>Fix prompt</h2><p class="lede">Paste this into any AI agent. It lists the top issues with selectors and targets, and routes the fixes to the makkov-harness skills.</p>' +
      rBlock('fix-prompt', f && f.promptMd ? f.promptMd(r) : 'The fix prompt needs MHScore.format.promptMd.', 'Copy prompt'));
    if (style && f) {
      o.push('<details><summary>DESIGN.md</summary>' + rBlock('design-md', f.designMd(style), 'Copy DESIGN.md') + '</details>');
      o.push('<details><summary>CSS variables</summary>' + rBlock('css-vars', f.cssVars(style), 'Copy CSS') + '</details>');
      o.push('<details><summary>Tailwind theme</summary>' + rBlock('tw-theme', f.tailwind(style), 'Copy theme') + '</details>');
      o.push('<details><summary>Design tokens (DTCG JSON)</summary>' + rBlock('dtcg', JSON.stringify(f.tokens(style), null, 2), 'Copy JSON') + '</details>');
    }
    o.push('<details><summary>Raw result (JSON)</summary>' + rBlock('raw-json', jsonOf(r), 'Copy JSON') + '</details></section>');

    // badge
    o.push('<section id="badge"><h2>Badge for your README</h2><p class="lede">Shows the score and links to Design Score. The image is served by shields.io when someone views your README; this report does not load it.</p>' +
      '<div class="badge" aria-hidden="true"><span>Design Score</span><span style="background:' + shield[1] + '">' + (failed ? '–' : score) + '</span></div>' +
      rBlock('badge-md', badgeMd(r), 'Copy Markdown') + '</section>');

    o.push('<footer><p>Scored with <a href="' + SCORE_PAGE + '" target="_blank" rel="noopener noreferrer">Design Score</a> · <a href="' + REPO_URL + '" target="_blank" rel="noopener noreferrer">makkov-harness</a> (' + REPO_SHORT + ').</p>' +
      '<p>Generated in the browser: nothing was sent anywhere. A score is a guide, not a verdict. It measures what code can measure on one viewport at one moment, and it cannot judge whether a design is right for its audience.</p></footer>');
    o.push('</div><script>' + REPORT_JS + '</script></body></html>');
    return o.join('\n');
  }

  /* --------------------------------------------------------------------- API */

  var api = {
    version: VERSION,
    __mh: true,
    open: guard(function () { open(); }),
    close: guard(function () { close(); }),
    toggle: guard(function () {
      if (stale()) teardown(S);
      if (S) { if (S.minimized) restore(); else close(); } else open();
    }),
    isOpen: function () { return !!S && !stale(); },
    reportHtml: function (result, style) {
      try { return reportHtml(result, style); } catch (e) {
        warn(e);
        return '<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Design Score report</title></head><body><p>The report could not be built (' + esc(e && e.message) + ').</p></body></html>';
      }
    },
    cardCanvas: function (result) { try { return cardCanvas(result); } catch (e) { warn(e); var cv = D.createElement('canvas'); cv.width = 1200; cv.height = 630; return cv; } },
    destroy: function () { try { if (S) teardown(S); } catch (e) { warn(e); } }
  };

  try {
    Object.defineProperty(W, 'MHScoreUI', { value: api, writable: true, configurable: true, enumerable: false });
  } catch (e) { W.MHScoreUI = api; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
