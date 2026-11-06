// Hero: the brand mark as a dot matrix gathered from the page's own dot grid. Wires grow out of the
// mark to each skill, slowly, one after another; once wired they stay, and light pulses travel along them.
(() => {
  const hero = document.querySelector('.hero');
  const anchor = hero?.querySelector('.hero-mark');
  if (!hero || !anchor) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

  const cv = document.createElement('canvas');
  cv.className = 'stage2d'; cv.setAttribute('aria-hidden', 'true');
  const ctx = cv.getContext('2d');
  if (!ctx) return;
  hero.prepend(cv);
  const labelsBox = document.createElement('div'); labelsBox.className = 'labels3d'; labelsBox.setAttribute('aria-hidden', 'true');
  hero.append(labelsBox);

  /* tokens to RGB through a 1px probe, so colours can be mixed per dot */
  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgb = (name) => {
    probe.clearRect(0, 0, 1, 1);
    probe.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    probe.fillRect(0, 0, 1, 1); return [...probe.getImageData(0, 0, 1, 1).data.slice(0, 3)];
  };
  const C = { ink: rgb('--color-ink'), line: rgb('--color-line'), line2: rgb('--color-line-2'), dot: rgb('--fx-dot'), o1: rgb('--opal-1'), o2: rgb('--opal-2'), o3: rgb('--opal-3') };
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const css = (c, a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

  const SKILLS = [
    ['rich-report', 'Compare these three tools'], ['install-guard', 'Install this npm package'], ['design-md-library', 'Make it feel like Linear'],
    ['animate', 'Animate this card'], ['hyperframes', 'Make a release video'], ['interfaces', 'Review this screen'],
    ['Hallmark', 'Build a landing page'], ['superpowers', 'Plan this feature with me']
  ];
  const START = 3.6, EACH = 1.8, GAP = 0.9; // the last wire lands about ten seconds after load

  let W = 0, H = 0, dpr = 1, cx = 0, cy = 0, size = 300, copyRight = 0, copyBottom = 0;
  let dots = [], wires = [], pulses = [];
  const ease = (x) => { x = Math.min(1, Math.max(0, x)); return 1 - Math.pow(1 - x, 3); };
  const expo = (x) => { x = Math.min(1, Math.max(0, x)); return x >= 1 ? 1 : 1 - Math.pow(2, -9 * x); };
  const easeIO = (x) => { x = Math.min(1, Math.max(0, x)); return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };

  /* sample the symbol into dots */
  const img = new Image();
  img.src = 'img/brand/symbol.svg';
  function sample() {
    const S = Math.round(size), step = Math.max(5, Math.round(S / 52));
    if (S < 16) { dots = []; return; }
    const off = document.createElement('canvas'); off.width = off.height = S;
    const o = off.getContext('2d', { willReadFrequently: true });
    o.drawImage(img, 0, 0, S, S * (288 / 284));
    let data;
    try { data = o.getImageData(0, 0, S, S).data; } catch { dots = []; hero.classList.remove('has-3d'); return; } // a file:// page cannot read its own image back; the plain mark stays
    const out = [];
    for (let y = step / 2; y < S; y += step) for (let x = step / 2; x < S; x += step) {
      if (data[((y | 0) * S + (x | 0)) * 4 + 3] > 140) out.push([x - S / 2, y - S / 2]);
    }
    const late = reduce || now() > 4;
    const corners = [[-80, -80], [W + 80, -80], [-80, H + 80], [W + 80, H + 80]];
    dots = out.map(([dx, dy]) => {
      const tx = cx + dx, ty = cy + dy;
      // most dots come in from the four corners, the rest from anywhere along the edges
      let sx, sy;
      const far = Math.random() < 0.22;
      if (!far) { // most gather from the background grid close to the mark
        const a = Math.random() * Math.PI * 2, r = 90 + Math.random() * 260;
        sx = Math.round((tx + Math.cos(a) * r - 13) / 26) * 26 + 13; sy = Math.round((ty + Math.sin(a) * r - 13) / 26) * 26 + 13;
      } else if (Math.random() < 0.7) { const [qx, qy] = corners[(Math.random() * 4) | 0]; sx = qx + (Math.random() - 0.5) * W * 0.5; sy = qy + (Math.random() - 0.5) * H * 0.5; }
      else { const e = (Math.random() * 4) | 0, u = Math.random(); [sx, sy] = [[u * W, -60], [W + 60, u * H], [u * W, H + 60], [-60, u * H]][e]; }
      // a bent path: the control point swings to one side, so each stream arrives in an arc
      const mx = (sx + tx) / 2, my = (sy + ty) / 2, len = Math.hypot(tx - sx, ty - sy) || 1, bend = (Math.random() - 0.5) * (far ? 0.7 : 0.35) * len;
      const qx = mx + (-(ty - sy) / len) * bend, qy = my + ((tx - sx) / len) * bend;
      const k = (dx + dy + S) / (2 * S); // diagonal position for the opal blend
      const base = k < 0.5 ? mix(C.o1, C.o3, k * 2) : mix(C.o3, C.o2, (k - 0.5) * 2);
      return { tx, ty, sx, sy, qx, qy, x: late ? tx : sx, y: late ? ty : sy, vx: 0, vy: 0, d: Math.random() * 1.1, dur: far ? 1.8 + Math.random() * 0.7 : 1.3 + Math.random() * 0.6, far, col: base, r: step * 0.3 };
    });
  }

  /* wires: evenly spaced around the mark, each with a fixed bend */
  function buildWires() {
    const keep = wires.map((w) => w.born);
    wires.forEach((w) => w.el.remove());
    const rx = Math.max(size * 0.7, Math.min(size * 1.12, W - cx - 190, cx - 40)), ry = size * 0.8;
    wires = SKILLS.map(([name, ask], i) => {
      const a = -Math.PI / 2 + (i / SKILLS.length) * Math.PI * 2 + 0.22;
      const ex = cx + Math.cos(a) * rx, ey = cy + Math.sin(a) * ry;
      const bend = (i % 2 ? 1 : -1) * size * 0.18;
      const mx = (cx + ex) / 2 - Math.sin(a) * bend, my = (cy + ey) / 2 + Math.cos(a) * bend;
      const el = document.createElement('span'); el.className = 'label3d'; el.textContent = name; el.style.opacity = '0'; labelsBox.append(el);
      const w = { name, ask, ex, ey, mx, my, el, born: keep[i] ?? START + i * GAP, flash: 0, hover: false, shown: false };
      el.addEventListener('pointerenter', () => { w.hover = true; if (grown(w, now())) fire(w); });
      el.addEventListener('pointerleave', () => { w.hover = false; });
      return w;
    });
  }
  const pt = (w, t) => { const u = 1 - t; return [u * u * cx + 2 * u * t * w.mx + t * t * w.ex, u * u * cy + 2 * u * t * w.my + t * t * w.ey]; };
  const grown = (w, t) => t - w.born >= EACH;

  function fire(w) {
    pulses.push({ w, t: 0, dur: 1.5 + Math.random() * 0.5 });
  }

  /* layout */
  function layout() {
    const hr = hero.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2); W = hr.width; H = hr.height + 360; // runs past the hero so incoming dots are not cut off
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = ar.left + ar.width / 2 - hr.left; cy = ar.top + ar.height / 2 - hr.top; size = ar.width * 0.92;
    const cr = hero.querySelector('.hero-copy')?.getBoundingClientRect();
    copyRight = cr ? cr.right - hr.left : 0; copyBottom = cr ? cr.bottom - hr.top : 0;
    if (img.complete && img.naturalWidth) { sample(); buildWires(); }
  }

  /* pointer */
  let px = -9999, py = -9999;
  if (fine && !reduce) {
    hero.addEventListener('pointermove', (e) => { const r = hero.getBoundingClientRect(); px = e.clientX - r.left; py = e.clientY - r.top; kick(); });
    hero.addEventListener('pointerleave', () => { px = py = -9999; });
  }

  let t0 = performance.now(), prev = t0, raf = 0, running = true, nextPulse = START + SKILLS.length * GAP + EACH + 0.8;
  const now = () => (reduce ? 999 : (performance.now() - t0) / 1000);
  function frame(ms) {
    raf = 0;
    const dt = Math.min(0.05, (ms - prev) / 1000); prev = ms;
    const t = now();
    ctx.clearRect(0, 0, W, H);

    /* wires under the dots */
    ctx.lineWidth = 1; ctx.lineCap = 'round';
    for (const w of wires) {
      const g = easeIO((t - w.born) / EACH);
      if (g <= 0) continue;
      w.flash = Math.max(0, w.flash - dt * 1.2);
      const hot = w.hover || w.flash > 0;
      ctx.strokeStyle = css(hot ? mix(C.line, C.o1, Math.max(w.flash, w.hover ? 1 : 0) * 0.7) : C.line2, hot ? 0.75 : 0.42);
      ctx.setLineDash([2, 5]); ctx.lineDashOffset = -t * 6;
      ctx.beginPath(); ctx.moveTo(cx, cy);
      const n = Math.max(2, Math.round(48 * g));
      for (let k = 1; k <= n; k++) { const [x, y] = pt(w, (k / n) * g); ctx.lineTo(x, y); }
      ctx.stroke(); ctx.setLineDash([]);
      const [hx, hy] = pt(w, g);
      if (g < 1) { // the growing tip
        const grd = ctx.createRadialGradient(hx, hy, 0, hx, hy, 8); grd.addColorStop(0, css(C.o2, 0.6)); grd.addColorStop(1, css(C.o2, 0));
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(hx, hy, 8, 0, 6.283); ctx.fill();
      } else {
        const r = 2.4 + w.flash * 1.6;
        if (w.flash > 0 || w.hover) { const grd = ctx.createRadialGradient(hx, hy, 0, hx, hy, 16); grd.addColorStop(0, css(C.o2, 0.5 * Math.max(w.flash, w.hover ? 0.6 : 0))); grd.addColorStop(1, css(C.o2, 0)); ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(hx, hy, 16, 0, 6.283); ctx.fill(); }
        ctx.fillStyle = css(hot ? C.o2 : C.line2, hot ? 1 : 0.7); ctx.beginPath(); ctx.arc(hx, hy, r, 0, 6.283); ctx.fill();
        if (!w.shown) { w.shown = true; w.flash = 1; }
      }
      // label
      const lw = (w.el.offsetWidth || 120) + 16, onLeft = w.ex < cx;
      // outward first; if that runs off the edge, sit under the node instead of over the mark
      let lx = onLeft ? w.ex - 14 - lw + 16 : w.ex + 14, ly = w.ey, under = false;
      if (onLeft ? lx < 16 : lx + lw > W - 16) { under = true; lx = Math.min(W - 16 - lw, Math.max(16, w.ex - lw / 2)); ly = w.ey + (w.ey > cy ? 18 : -18); }
      const clear = W >= 700 && (lx > copyRight + 8 || ly > copyBottom + 8);
      w.el.style.transform = `translate(${lx}px, ${ly}px) translateY(-50%)`;
      w.el.style.opacity = String(clear ? ease((t - w.born - EACH * 0.8) / 0.6) : 0);
      w.el.classList.toggle('is-hot', hot);
    }

    /* pulses: a short bright streak from the centre out to the skill */
    for (let i = pulses.length - 1; i >= 0; i--) {
      const p = pulses[i]; p.t += dt / p.dur;
      if (p.t >= 1) { p.w.flash = 1; pulses.splice(i, 1); continue; }
      const head = easeIO(p.t), tail = Math.max(0, head - 0.16);
      const [ax, ay] = pt(p.w, tail), [bx, by] = pt(p.w, head);
      const grd = ctx.createLinearGradient(ax, ay, bx, by); grd.addColorStop(0, css(C.o1, 0)); grd.addColorStop(1, css(C.o3, 0.7));
      ctx.strokeStyle = grd; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(ax, ay);
      for (let k = 1; k <= 10; k++) { const [x, y] = pt(p.w, tail + (head - tail) * (k / 10)); ctx.lineTo(x, y); }
      ctx.stroke();
      ctx.fillStyle = css(C.o3, 0.85); ctx.beginPath(); ctx.arc(bx, by, 1.8, 0, 6.283); ctx.fill();
    }
    if (!reduce && t > nextPulse) { nextPulse = t + 1.8 + Math.random() * 1.8; const live = wires.filter((w) => grown(w, t)); if (live.length) fire(live[(Math.random() * live.length) | 0]); }

    /* dots: fly in from the corners on arcs with a short trail, flash as the mark locks, then hold on a spring */
    const R = 80;
    const bez = (d, u) => { const v = 1 - u; return [v * v * d.sx + 2 * v * u * d.qx + u * u * d.tx, v * v * d.sy + 2 * v * u * d.qy + u * u * d.ty]; };
    const lock = t - 3.1; // the moment the last dots arrive
    for (const d of dots) {
      const raw = (t - 0.15 - d.d) / d.dur, g = expo(raw);
      if (raw < 1) {
        if (raw <= 0) continue;
        const [x, y] = bez(d, g), [ox, oy] = bez(d, expo(raw - 0.035));
        d.x = x; d.y = y;
        if (d.far) { ctx.strokeStyle = css(d.col, 0.18 * (1 - g)); ctx.lineWidth = d.r; ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(x, y); ctx.stroke(); }
        ctx.fillStyle = css(mix(C.dot, d.col, g), 0.4 + 0.6 * g);
        ctx.beginPath(); ctx.arc(x, y, d.r * (0.7 + 0.3 * g), 0, 6.283); ctx.fill();
        continue;
      }
      let fx = d.tx, fy = d.ty;
      const dx = d.x - px, dy = d.y - py, dist = Math.hypot(dx, dy);
      if (dist < R) { const k = (1 - dist / R) ** 2 * 30; fx += (dx / (dist || 1)) * k; fy += (dy / (dist || 1)) * k; }
      d.vx = (d.vx + (fx - d.x) * 0.12) * 0.78; d.vy = (d.vy + (fy - d.y) * 0.12) * 0.78;
      d.x += d.vx; d.y += d.vy;
      const shimmer = 0.5 + 0.5 * Math.sin(t * 1.4 - (d.tx + d.ty) * 0.02);
      // a bright wave sweeps the mark once, right as it locks
      const wave = lock > 0 && lock < 1.4 ? Math.max(0, 1 - Math.abs((d.tx - (cx - size / 2)) / size - lock / 1.1) * 6) : 0;
      ctx.fillStyle = css(mix(mix(d.col, C.ink, shimmer * 0.3), C.ink, wave), 1);
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r * (1 + wave * 0.5), 0, 6.283); ctx.fill();
    }

    if (running && !reduce) raf = requestAnimationFrame(frame);
  }
  function kick() { if (running && !raf) raf = requestAnimationFrame(frame); }

  let seen = true;
  const sync = () => { const go = seen && !document.hidden; if (go && !running) { running = true; prev = performance.now(); kick(); } if (!go) running = false; };
  new IntersectionObserver(([e]) => { seen = e.isIntersecting; sync(); }).observe(hero);
  document.addEventListener('visibilitychange', sync);

  const go = () => {
    hero.classList.add('has-3d'); layout();
    new ResizeObserver(() => { cancelAnimationFrame(raf); raf = 0; layout(); if (reduce) frame(performance.now()); else kick(); }).observe(hero);
    t0 = performance.now(); prev = t0;
    if (reduce) frame(performance.now()); else kick();
  };
  // wait for the intro to hand over (preloader gone, dot field in), or start anyway after 4 s
  const ready = new Promise((res) => { if (img.complete && img.naturalWidth) res(); else img.addEventListener('load', res, { once: true }); });
  const cue = new Promise((res) => { if (!document.documentElement.classList.contains('intro')) return res(); addEventListener('intro:logo', res, { once: true }); setTimeout(res, 4000); });
  hero.classList.add('has-3d'); // hide the plain mark now; the dot mark takes its place once the intro hands over
  Promise.all([ready, cue]).then(go);
})();
