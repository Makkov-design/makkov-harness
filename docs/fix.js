// Before/after: one CRM screen moves from generated defaults to a designed system, one skill per step.
// Every guide measures the live screen, so the numbers on it are the real ones at that moment.
// The scroll ends on the finished screen, with a demo cursor touring it.
(() => {
  const fix = document.querySelector('.fix');
  if (!fix) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wide = matchMedia('(min-width: 60.01rem)');
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const smooth = (x) => { x = clamp(x); return x * x * (3 - 2 * x); };
  const $ = (s, r = fix) => r.querySelector(s), $$ = (s, r = fix) => [...r.querySelectorAll(s)];

  const track = $('.fix-track'), stage = $('.fix-stage'), ui = $('.ui'), guides = $('.fx-guides');
  const rail = $$('.fix-rail li'), note = $('[data-note]'), scoreEl = $('[data-score]'), issuesEl = $('[data-issues]'), ring = $('.fix-ring-v');
  const counts = $$('[data-count]', ui), dates = $$('.ui-date', ui);
  const NOTES = [
    'A screen as it comes out of a generator.',
    'One spacing rhythm instead of whatever fit.',
    'Everything lines up on one left edge.',
    'A real type scale, one date format.',
    'Tokens and one accent instead of raw greys.',
    'Motion that explains what changed.'
  ];
  const ISS = [14, 11, 8, 5, 2, 0], SCORE = [41, 55, 68, 79, 90, 96];
  const SPAN = 0.74; // the five steps fill this share of the scroll; the rest holds the finished screen

  /* the probe turns any computed colour into RGB for the contrast readout */
  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const toRGB = (c) => { probe.clearRect(0, 0, 1, 1); probe.fillStyle = c; probe.fillRect(0, 0, 1, 1); return [...probe.getImageData(0, 0, 1, 1).data.slice(0, 3)]; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = (el) => { for (let n = el; n; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; if (c && !/rgba?\(0, 0, 0, 0\)|transparent/.test(c)) return c; } return 'black'; };

  let k = 0, alive = false;
  // each block gets a delay from its place on the screen, so every change runs as a wave from top left
  function seedDelays() {
    const u = ui.getBoundingClientRect();
    $$('.fx-el', ui).forEach((el) => { const r = el.getBoundingClientRect(); const d = ((r.left - u.left) / u.width) * 0.75 + ((r.top - u.top) / u.height) * 0.25; el.style.setProperty('--dw', d.toFixed(3)); });
  }
  seedDelays(); addEventListener('resize', seedDelays);
  function rel(el) { const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect(); return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height, r: r.right - s.left, b: r.bottom - s.top }; }
  const g = (sel) => ui.querySelector(`[data-g="${sel}"]`);

  function drawGuides() {
    if (!wide.matches) { guides.innerHTML = ''; return; }
    let h = '';
    if (k === 1) { // spacing: the real gaps between cards and the real row heights
      const a = rel(g('s1')), b = rel(g('s2')), c = rel(g('s3'));
      [[a, b], [b, c]].forEach(([l, r]) => { const gap = Math.round(r.x - l.r); h += `<span class="gm gm-h" style="left:${l.r}px;top:${l.y + l.h / 2}px;width:${Math.max(1, gap)}px"><em>${gap}</em></span>`; });
      ['r1', 'r2', 'r3'].forEach((id) => { const r = rel(g(id)); h += `<span class="gm gm-v" style="left:${r.r + 10}px;top:${r.y}px;height:${r.h}px"><em>${Math.round(r.h)}</em></span>`; });
    } else if (k === 2) { // alignment: one edge, and how far each block sits off it
      const edge = rel(ui.querySelector('.ui-table')).x;
      h += `<span class="gl" style="left:${edge}px"></span>`;
      ['title', 's1', 'r1', 'r3'].forEach((id) => { const r = rel(g(id)), d = Math.round(r.x - edge); const y = r.y + Math.min(r.h / 2, 14); if (Math.abs(d) >= 1) h += `<span class="gd" style="left:${Math.min(edge, r.x)}px;top:${y}px;width:${Math.abs(d)}px"></span>`; h += `<span class="gt gt-side ${Math.abs(d) < 1 ? 'gt-ok' : ''}" style="left:${edge - 8}px;top:${y}px">${Math.abs(d) < 1 ? '0' : (d > 0 ? '+' : '') + d}</span>`; });
    } else if (k === 3) { // type: the live size, weight and face of two roles
      [['title', 'heading', 'r'], ['num', 'figure', 'b']].forEach(([id, role, at]) => { const el = g(id), cs = getComputedStyle(el), r = rel(el); h += `<span class="gt gt-type" style="left:${r.r + 12}px;top:${r.y + r.h / 2}px">${role} ${Math.round(parseFloat(cs.fontSize))}/${cs.fontWeight} ${cs.fontFamily.split(',')[0].replace(/"/g, '')}</span>`; });
    } else if (k === 4) { // colour: the button fill and the live contrast of muted text
      const btn = g('btn'), r = rel(btn), date = ui.querySelector('.ui-date'), rd = rel(date);
      const ratio = contrast(toRGB(getComputedStyle(date).color), toRGB(bgOf(date)));
      h += `<span class="gt gt-sw" style="left:${r.x}px;top:${r.b + 14}px"><i style="background:${getComputedStyle(btn).backgroundColor}"></i>fill</span>`;
      const tb = rel(ui.querySelector('.ui-table')); h += `<span class="gt gt-below ${ratio >= 4.5 ? 'gt-ok' : 'gt-bad'}" style="left:${rd.r}px;top:${tb.b + 12}px">muted text ${ratio.toFixed(1)}:1</span>`;
    } else if (k === 5 && !alive) { // motion: the curve the progress bars use
      const r = rel(ui.querySelector('[data-g="r1"] .ui-prog'));
      h += `<span class="gt gt-curve" style="left:${r.x}px;top:${r.y - 30}px"><svg viewBox="0 0 28 16"><path d="M1 15 C6 2, 12 1, 27 1"/></svg>ease-out, 600 ms</span>`;
    }
    guides.innerHTML = h;
  }

  function apply(p) {
    const s = clamp((p - 0.04) / SPAN) * 5;
    let kk = 0;
    for (let i = 0; i < 5; i++) {
      const raw = clamp(s - i), v = smooth(raw);
      ui.style.setProperty(`--P${i + 1}`, v.toFixed(3));
      rail[i].style.setProperty('--sp', raw.toFixed(3));
      rail[i].classList.toggle('is-done', raw >= 1); rail[i].classList.toggle('is-on', raw > 0 && raw < 1);
      if (raw > 0) kk = i + 1;
    }
    k = kk; stage.dataset.step = String(k);
    // the scan band rides the current step: it crosses the screen as that skill does its pass
    const cur = Math.min(4, Math.floor(s)), raw = s >= 5 ? 1 : s - cur;
    stage.style.setProperty('--sx', raw.toFixed(3));
    stage.style.setProperty('--so', (s > 0 && s < 5 ? Math.sin(Math.PI * raw) : 0).toFixed(3));
    ui.classList.toggle('is-gen', s < 2.5);
    ui.classList.toggle('is-left', s >= 1.5);
    dates.forEach((d) => { const t = s >= 2.5 ? d.dataset.after : d.dataset.before; if (d.textContent !== t) d.textContent = t; });
    const f = Math.floor(s), fr = s - f, lerp = (arr) => arr[f] + ((arr[Math.min(5, f + 1)] ?? arr[5]) - arr[f]) * fr;
    const score = Math.round(lerp(SCORE)), iss = Math.round(lerp(ISS));
    scoreEl.textContent = score; issuesEl.textContent = iss;
    ring.style.strokeDasharray = `${score} 100`;
    fix.classList.toggle('is-clean', !iss);
    if (note.dataset.k !== String(k)) { note.dataset.k = String(k); note.textContent = NOTES[k]; }
    const live = s >= 4.95 && !reduce;
    if (live !== alive) { alive = live; ui.classList.toggle('is-alive', live); if (live) { countUp(); startTour(); } else stopTour(); }
    drawGuides();
  }

  /* a demo cursor tours the finished screen: hover, press, and the screen answers each time */
  const cur = ui.querySelector('.ui-cursor'), ripple = ui.querySelector('.ui-ripple'), toast = ui.querySelector('.ui-toast');
  const TOUR = [
    { el: () => g('r2'), at: [0.18, 0.5], act: 'hover', hold: 1100 },
    { el: () => g('r2').querySelector('.ui-pill'), at: [0.5, 0.55], act: 'click', hold: 900 },
    { el: () => g('btn'), at: [0.55, 0.6], act: 'click', hold: 1500, then: () => { toast.classList.add('is-on'); setTimeout(() => toast.classList.remove('is-on'), 2200); } },
    { el: () => g('s2'), at: [0.7, 0.62], act: 'hover', hold: 1200 },
    { el: () => ui.querySelectorAll('.ui-nav span')[2], at: [0.4, 0.55], act: 'click', hold: 1100 }
  ];
  let tourOn = false, tourTimer = 0, cx = 0, cy = 0, tx = 0, ty = 0, curRaf = 0, lastEl = null;
  function moveLoop() {
    cx += (tx - cx) * 0.14; cy += (ty - cy) * 0.14;
    cur.style.translate = `${cx}px ${cy}px`;
    curRaf = tourOn ? requestAnimationFrame(moveLoop) : 0;
  }
  function target(el, [fx, fy]) { const u = ui.getBoundingClientRect(), r = el.getBoundingClientRect(); return [r.left - u.left + r.width * fx, r.top - u.top + r.height * fy]; }
  function step(i) {
    if (!tourOn) return;
    const s = TOUR[i % TOUR.length], el = s.el(); if (!el) return;
    lastEl?.classList.remove('is-demo-hover', 'is-demo-press');
    [tx, ty] = target(el, s.at);
    tourTimer = setTimeout(() => {
      if (!tourOn) return;
      el.classList.add('is-demo-hover'); lastEl = el;
      if (s.act === 'click') {
        tourTimer = setTimeout(() => {
          cur.classList.add('is-press'); el.classList.add('is-demo-press');
          ripple.style.translate = `${tx}px ${ty}px`; ripple.classList.remove('is-on'); void ripple.offsetWidth; ripple.classList.add('is-on');
          setTimeout(() => { cur.classList.remove('is-press'); el.classList.remove('is-demo-press'); s.then?.(); }, 180);
          tourTimer = setTimeout(() => step(i + 1), s.hold);
        }, 380);
      } else tourTimer = setTimeout(() => step(i + 1), s.hold);
    }, 650);
  }
  function startTour() {
    if (tourOn || reduce) return;
    tourOn = true; ui.classList.add('is-touring');
    const u = ui.getBoundingClientRect(); cx = tx = u.width * 0.62; cy = ty = u.height * 0.9;
    if (!curRaf) curRaf = requestAnimationFrame(moveLoop);
    tourTimer = setTimeout(() => step(0), 500);
  }
  function stopTour() {
    tourOn = false; clearTimeout(tourTimer); ui.classList.remove('is-touring'); toast.classList.remove('is-on');
    lastEl?.classList.remove('is-demo-hover', 'is-demo-press'); lastEl = null;
  }
  function countUp() {
    const t0 = performance.now();
    const fmt = (c, v) => (c.dataset.prefix || '') + v + (c.dataset.suffix || '');
    const tick = (t) => {
      const q = clamp((t - t0) / 900), e = 1 - Math.pow(1 - q, 3);
      counts.forEach((c) => { c.textContent = fmt(c, Math.round(Number(c.dataset.count) * e)); });
      if (q < 1 && alive) requestAnimationFrame(tick); else counts.forEach((c) => { c.textContent = fmt(c, c.dataset.count); });
    };
    requestAnimationFrame(tick);
  }


  /* the scroll drives everything, on phones too; the step buttons jump to their step */
  const progressOf = () => { const r = track.getBoundingClientRect(), span = r.height - innerHeight; return span > 0 ? clamp(-r.top / span) : 0; };
  $$('[data-goto]').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.goto), p = 0.04 + ((i + 1) / 5) * SPAN - 0.005;
    const top = track.getBoundingClientRect().top + scrollY, span = track.offsetHeight - innerHeight;
    scrollTo({ top: top + span * p, behavior: reduce ? 'auto' : 'smooth' });
  }));
  let q = false;
  const onScroll = () => { if (q) return; q = true; requestAnimationFrame(() => { q = false; apply(progressOf()); }); };
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', () => apply(progressOf()));
  apply(progressOf());
})();
