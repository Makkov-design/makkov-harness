// Site-wide effects: a dot-grid field that reacts to the pointer, spotlight cards,
// blur-in reveals, scroll progress with a section readout, and decoding text.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const css = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  /* ---------- dot field ---------- */
  const cv = document.createElement('canvas');
  cv.className = 'field'; cv.setAttribute('aria-hidden', 'true');
  document.body.prepend(cv);
  const ctx = cv.getContext('2d');
  const STEP = 26, R = 170, PUSH = 14;
  let W = 0, H = 0, dpr = 1, dots = [], mx = -999, my = -999, tx = -999, ty = -999, ripples = [], raf = 0, last = 0;
  let cDot = '', cHot = '', cOpal = '';
  // intro: the field powers up as a wave from the centre; until then it stays dark
  const introOn = document.documentElement.classList.contains('intro') && !reduce;
  let bootT0 = introOn ? -1 : 0; const BOOT = 1100, FLASH = 420;
  window.fxBoot = () => { bootT0 = performance.now(); kick(); };
  function size() {
    dpr = Math.min(devicePixelRatio || 1, 2); W = innerWidth; H = innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    dots = [];
    const cx = W / 2, cy = H * 0.42, far = Math.hypot(Math.max(cx, W - cx), Math.max(cy, H - cy));
    for (let y = STEP / 2; y < H + STEP; y += STEP) for (let x = STEP / 2; x < W + STEP; x += STEP) dots.push({ x, y, ox: 0, oy: 0, at: (Math.hypot(x - cx, y - cy) / far) * BOOT + Math.random() * 220 });
    cDot = css('--fx-dot'); cHot = css('--fx-dot-hot'); cOpal = css('--opal-1');
    kick();
  }
  function frame(t) {
    raf = 0;
    const dt = Math.min(48, t - (last || t)); last = t;
    mx += (tx - mx) * 0.18; my += (ty - my) * 0.18;
    ctx.clearRect(0, 0, W, H);
    if (bootT0 < 0) return; // dark until the intro starts the boot
    const age0 = t - bootT0, booting = bootT0 > 0 && age0 < BOOT + 220 + FLASH;
    let moving = booting || Math.abs(tx - mx) > 0.3 || Math.abs(ty - my) > 0.3 || ripples.length > 0;
    ripples = ripples.filter((r) => (r.r += dt * 0.9) < r.max);
    for (const d of dots) {
      let fx = 0, fy = 0, heat = 0;
      const dx = d.x - mx, dy = d.y - my, dist = Math.hypot(dx, dy);
      if (dist < R) { const k = 1 - dist / R; const e = k * k; fx += (dx / (dist || 1)) * PUSH * e; fy += (dy / (dist || 1)) * PUSH * e; heat = e; }
      for (const r of ripples) {
        const rx = d.x - r.x, ry = d.y - r.y, rd = Math.hypot(rx, ry), band = Math.abs(rd - r.r);
        if (band < 40) { const k = (1 - band / 40) * (1 - r.r / r.max); fx += (rx / (rd || 1)) * 12 * k; fy += (ry / (rd || 1)) * 12 * k; heat = Math.max(heat, k); }
      }
      d.ox += (fx - d.ox) * 0.2; d.oy += (fy - d.oy) * 0.2;
      if (Math.abs(fx - d.ox) > 0.05 || Math.abs(fy - d.oy) > 0.05) moving = true;
      const x = d.x + d.ox, y = d.y + d.oy;
      if (booting) {
        const a = age0 - d.at;
        if (a < 0) continue;
        if (a < FLASH) { const k = 1 - a / FLASH; ctx.fillStyle = k > 0.55 ? cOpal : cHot; ctx.globalAlpha = 0.3 + k * 0.7; ctx.beginPath(); ctx.arc(x, y, 0.8 + k * 1.6, 0, 6.283); ctx.fill(); continue; }
      }
      if (heat > 0.02) {
        ctx.fillStyle = heat > 0.45 ? cOpal : cHot; ctx.globalAlpha = 0.35 + heat * 0.65;
        ctx.beginPath(); ctx.arc(x, y, 1 + heat * 1.3, 0, 6.283); ctx.fill();
      } else {
        ctx.fillStyle = cDot; ctx.globalAlpha = 1; ctx.fillRect(x - 0.75, y - 0.75, 1.5, 1.5);
      }
    }
    ctx.globalAlpha = 1;
    if (moving && !reduce) kick();
  }
  function kick() { if (!raf) raf = requestAnimationFrame(frame); }
  addEventListener('resize', size, { passive: true });
  if (fine && !reduce) {
    addEventListener('pointermove', (e) => { tx = e.clientX; ty = e.clientY; if (mx < -900) { mx = tx; my = ty; } kick(); }, { passive: true });
    document.documentElement.addEventListener('pointerleave', () => { tx = ty = -999; kick(); });
    addEventListener('pointerdown', (e) => {
      if (e.target.closest('a, button, input, [role="tab"], canvas.stage3d')) return;
      ripples.push({ x: e.clientX, y: e.clientY, r: 0, max: 520 }); kick();
    });
  }
  // touch: a short tap (not a scroll) sends the same ring through the dots; pointer events reach every element on iOS
  if (!fine && !reduce) {
    let down = null;
    addEventListener('pointerdown', (e) => { down = e.isPrimary ? { x: e.clientX, y: e.clientY, t: performance.now() } : null; }, { passive: true });
    addEventListener('pointerup', (e) => {
      const d = down; down = null;
      if (!d || performance.now() - d.t > 450 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 10) return;
      if (e.target.closest?.('a, button, input, select, summary, [role="tab"], canvas.stage3d')) return;
      ripples.push({ x: e.clientX, y: e.clientY, r: 0, max: 460 }); kick();
    }, { passive: true });
    addEventListener('pointercancel', () => { down = null; }, { passive: true });
  }
  size();

  /* ---------- spotlight cards ---------- */
  if (fine) document.addEventListener('pointermove', (e) => {
    const el = e.target.closest?.('.spot'); if (!el) return;
    const b = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - b.left}px`); el.style.setProperty('--my', `${e.clientY - b.top}px`);
  }, { passive: true });

  /* ---------- accent buttons: the wave starts where the pointer enters ---------- */
  document.addEventListener('pointerover', (e) => { const b = e.target.closest?.('.btn--primary, .btn--dark'); if (!b || b.contains(e.relatedTarget)) return; const r = b.getBoundingClientRect(); b.style.setProperty('--rx', `${e.clientX - r.left}px`); b.style.setProperty('--ry', `${e.clientY - r.top}px`); const x = e.clientX - r.left, y = e.clientY - r.top, far = Math.max(Math.hypot(x, y), Math.hypot(r.width - x, y), Math.hypot(x, r.height - y), Math.hypot(r.width - x, r.height - y)); b.style.setProperty('--ws', (far / 12 + 2).toFixed(2)); }, { passive: true });

  /* ---------- glow fields follow the pointer (footer mark) ---------- */
  document.querySelectorAll('[data-glow]').forEach((el) => el.addEventListener('pointermove', (e) => { const b = el.getBoundingClientRect(); el.style.setProperty('--gx', `${e.clientX - b.left}px`); el.style.setProperty('--gy', `${e.clientY - b.top}px`); el.classList.add('is-lit'); }, { passive: true }));
  document.querySelectorAll('[data-glow]').forEach((el) => el.addEventListener('pointerleave', () => el.classList.remove('is-lit')));

  /* ---------- blur-in reveals ---------- */
  const io = 'IntersectionObserver' in window && !reduce ? new IntersectionObserver((es) => es.forEach((en) => {
    if (!en.isIntersecting) return;
    en.target.classList.add('is-in'); io.unobserve(en.target);
    if (en.target.matches('[data-scramble]')) scramble(en.target);
  }), { rootMargin: '0px 0px -8% 0px' }) : null;
  window.fxRefresh = (root = document) => root.querySelectorAll('[data-reveal]:not(.is-in), [data-scramble]:not(.is-in)').forEach((el, i) => {
    if (!io) { el.classList.add('is-in'); return; }
    if (!el.style.getPropertyValue('--d')) el.style.setProperty('--d', `${Math.min(i, 8) * 45}ms`); io.observe(el);
  });
  // every block below the hero arrives the same way: its parts blur in one after another
  const REVEAL = 'h2, .lead, .find-all, .find-nav, .find-panel, .windows > .win, .gate-shield, .gate-steps, .gate-sum, .gate-note, .checks, .steps > .step, .stops-foot, .agents > div, .close-card, .fix-head > *, .fix-body, .switch, .board-foot, .foot-top > *, .foot-legal, .foot-mark, .habits > li, .cat-hero h1, .sit-block-head';
  document.querySelectorAll('main > section:not(.hero), footer').forEach((sec) => {
    sec.querySelectorAll(REVEAL).forEach((el, i) => { if (el.closest('.hero')) return; el.setAttribute('data-reveal', ''); el.style.setProperty('--d', `${Math.min(i, 9) * 80}ms`); });
  });
  document.documentElement.classList.add('fx');
  fxRefresh();

  /* ---------- intro: preloader out, dot field in from the centre, then the logo, then the hero copy ---------- */
  const root = document.documentElement;
  if (root.classList.contains('intro')) {
    const start = () => {
      if (root.classList.contains('intro-go')) return;
      root.classList.add('intro-go');
      setTimeout(() => window.fxBoot?.(), 250);
      setTimeout(() => dispatchEvent(new Event('intro:logo')), 1150);
      setTimeout(() => root.classList.add('intro-copy'), 2000);
      setTimeout(() => { root.classList.add('intro-done'); document.querySelector('.preload')?.remove(); }, 3600);
    };
    if (document.readyState === 'complete') setTimeout(start, 250); else addEventListener('load', () => setTimeout(start, 250), { once: true });
    setTimeout(start, 3000);
  }
  // safety net: anything already on or above the screen shows even if an observer callback is late
  const sweep = () => document.querySelectorAll('[data-reveal]:not(.is-in)').forEach((el) => { if (el.getBoundingClientRect().top < innerHeight) el.classList.add('is-in'); });
  setTimeout(sweep, 1200); addEventListener('scroll', () => { clearTimeout(sweep.t); sweep.t = setTimeout(sweep, 400); }, { passive: true });

  /* ---------- decoding text ---------- */
  const GLYPHS = 'abcdefghijklmnopqrstuvwxyz0123456789-/';
  const escH = (c) => (c === '<' ? '&lt;' : c === '&' ? '&amp;' : c);
  // each letter settles in turn, left to right, while the rest flicker slowly and dimly
  function scramble(el, text = el.dataset.text || el.textContent) {
    if (reduce) { el.textContent = text; return; }
    el.dataset.text = text;
    const len = text.length, t0 = performance.now(), spread = Math.min(620, 40 * len), settle = 260;
    const seed = Array.from(text, () => GLYPHS[(Math.random() * GLYPHS.length) | 0]);
    let lastSwap = 0;
    cancelAnimationFrame(el._sc);
    const tick = (t) => {
      const e = t - t0;
      if (t - lastSwap > 70) { lastSwap = t; for (let i = 0; i < len; i++) if (Math.random() < 0.35) seed[i] = GLYPHS[(Math.random() * GLYPHS.length) | 0]; }
      let out = '', done = true;
      for (let i = 0; i < len; i++) {
        const at = (i / Math.max(1, len - 1)) * spread + settle;
        if (text[i] === ' ' || e >= at) out += escH(text[i]);
        else { done = false; out += `<span class="sc" style="opacity:${(0.25 + 0.5 * Math.min(1, e / at)).toFixed(2)}">${seed[i]}</span>`; }
      }
      el.innerHTML = out;
      if (!done) el._sc = requestAnimationFrame(tick); else el.textContent = text;
    };
    el._sc = requestAnimationFrame(tick);
  }
  window.fxScramble = scramble;
  if (fine) document.addEventListener('pointerover', (e) => {
    const el = e.target.closest?.('[data-scramble-hover]'); if (el && !el._busy) { el._busy = 1; scramble(el); setTimeout(() => { el._busy = 0; }, 700); }
  });

  /* ---------- scroll progress + section readout ---------- */
  const hud = document.createElement('div');
  hud.className = 'hud'; hud.setAttribute('aria-hidden', 'true');
  hud.innerHTML = '<i class="hud-bar"></i><span class="hud-read"><b></b><em></em></span>';
  document.body.append(hud);
  const bar = hud.querySelector('.hud-bar'), nameEl = hud.querySelector('b'), pctEl = hud.querySelector('em');
  const marks = [...document.querySelectorAll('[data-hud]')];
  let ticking = false;
  function onScroll() {
    ticking = false;
    const max = document.documentElement.scrollHeight - innerHeight, p = max > 0 ? scrollY / max : 0;
    bar.style.transform = `scaleX(${p.toFixed(4)})`;
    let cur = marks[0];
    for (const m of marks) if (m.getBoundingClientRect().top < innerHeight * 0.45) cur = m;
    if (cur) nameEl.textContent = cur.dataset.hud;
    pctEl.textContent = String(Math.round(p * 100)).padStart(3, '0') + '%';
    hud.classList.toggle('is-on', scrollY > 40);
  }
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(onScroll); } }, { passive: true });
  onScroll();

})();
