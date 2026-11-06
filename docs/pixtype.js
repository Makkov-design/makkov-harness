// The routed skill name, drawn in Space Grotesk but cut into small square cells, so it reads as built
// from tiny blocks. Long names shrink to fit one line. The real text stays in place for readers and search.
(() => {
  const els = [...document.querySelectorAll('.route-to')];
  if (!els.length) return;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = getComputedStyle(document.documentElement);
  const ink = root.getPropertyValue('--color-ink').trim(), opal = root.getPropertyValue('--opal-2').trim(), opal1 = root.getPropertyValue('--opal-1').trim();

  function build(el) {
    if (!el.querySelector('.px-text')) {
      const t = el.textContent; el.textContent = '';
      const span = document.createElement('span'); span.className = 'px-text'; span.textContent = t; el.append(span);
      const cv = document.createElement('canvas'); cv.className = 'px-canvas'; cv.setAttribute('aria-hidden', 'true'); el.append(cv);
    }
    const span = el.querySelector('.px-text'), cv = el.querySelector('.px-canvas');
    // one line always: measure the drawn text itself and shrink the size until it fits the card
    el.style.fontSize = ''; el.style.minHeight = '';
    // the card's own content width: the name block itself grows with long text, so it cannot be the ruler
    const pr = el.parentElement, pcs = getComputedStyle(pr);
    const avail = Math.min(el.clientWidth, pr.clientWidth - parseFloat(pcs.paddingLeft) - parseFloat(pcs.paddingRight));
    if (!avail) return null;
    const h0 = el.offsetHeight;
    const cs = getComputedStyle(span);
    const mctx = document.createElement('canvas').getContext('2d');
    const fontAt = (px) => `${cs.fontWeight} ${px}px ${cs.fontFamily}`;
    let size = parseFloat(getComputedStyle(el).fontSize);
    const widthAt = (px) => { mctx.font = fontAt(px); mctx.letterSpacing = `${(-0.04 * px).toFixed(2)}px`; return mctx.measureText(span.textContent).width; };
    const w0 = widthAt(size);
    if (w0 + 28 > avail) { size = size * (avail - 28) / w0; el.style.fontSize = `${size}px`; el.style.minHeight = `${h0}px`; } // same line box as the other names, so the spacing below stays put
    const r = span.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 2), W = Math.ceil(widthAt(size)) + 8, H = Math.ceil(Math.max(r.height, size * 1.1)) + 8;
    const cell = Math.max(3, Math.round(size / 22));
    const off = document.createElement('canvas'); off.width = W; off.height = H;
    const o = off.getContext('2d', { willReadFrequently: true });
    o.font = fontAt(size);
    o.letterSpacing = `${(-0.04 * size).toFixed(2)}px`; // fixed, not whatever the entrance animation is showing
    o.textBaseline = 'alphabetic'; o.fillStyle = '#fff';
    const m = o.measureText(span.textContent);
    const base = (H + m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2;
    o.fillText(span.textContent, 2, base);
    const data = o.getImageData(0, 0, W, H).data, cells = [];
    for (let y = 0; y < H; y += cell) for (let x = 0; x < W; x += cell) {
      let a = 0, n = 0;
      for (let yy = y; yy < Math.min(H, y + cell); yy++) for (let xx = x; xx < Math.min(W, x + cell); xx++) { a += data[(yy * W + xx) * 4 + 3]; n++; }
      if (a / n > 105) {
        const ang = Math.random() * Math.PI * 2, dist = 10 + Math.random() * 36;
        cells.push({ x, y, d: Math.random() * 0.45 + (x / W) * 0.35, l: 0.9 + Math.random() * 0.1, ox: Math.cos(ang) * dist, oy: Math.sin(ang) * dist * 0.6 });
      }
    }
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + 'px'; cv.style.height = H + 'px';
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, cells, cell, W, H };
  }

  const ease = (x) => 1 - Math.pow(1 - x, 3);
  // p runs past 1: cells fly in from a small scatter, flash opal on arrival, then settle to ink
  function draw(s, p) {
    const { ctx, cells, cell, W, H } = s;
    ctx.clearRect(0, 0, W, H);
    for (const c of cells) {
      const k = Math.min(1, Math.max(0, (p - c.d) / 0.32));
      if (k <= 0) continue;
      const e = ease(k), since = p - c.d - 0.32, flash = since > 0 ? Math.max(0, 1 - since / 0.35) : 1;
      ctx.fillStyle = flash > 0.6 ? opal : flash > 0.15 ? opal1 : ink;
      ctx.globalAlpha = c.l * Math.min(1, e * 1.4);
      const g = (cell - 1) * (0.35 + 0.65 * e);
      ctx.fillRect(c.x + c.ox * (1 - e) + (cell - 1 - g) / 2, c.y + c.oy * (1 - e) + (cell - 1 - g) / 2, g, g);
    }
    ctx.globalAlpha = 1;
  }

  const render = (el, animate) => {
    const s = build(el); if (!s) return;
    if (!animate || reduce) { draw(s, 9); return; }
    const t0 = performance.now(), LEN = 1100;
    const tick = (t) => { const p = (t - t0) / LEN; draw(s, p * 1.5); if (p < 1) requestAnimationFrame(tick); else draw(s, 9); };
    requestAnimationFrame(tick);
  };

  const start = () => {
    document.documentElement.classList.add('px-on');
    els.forEach((el) => render(el, false));
    els.forEach((el) => {
      const panel = el.closest('.route'); if (!panel) return;
      new MutationObserver(() => { if (panel.classList.contains('is-active')) render(el, true); }).observe(panel, { attributes: true, attributeFilter: ['class'] });
    });
    // redraw whenever the card itself changes width, not only on window resize
    let rt; const ro = new ResizeObserver(() => { clearTimeout(rt); rt = setTimeout(() => els.forEach((el) => render(el, false)), 120); });
    ro.observe(document.querySelector('.routes') || els[0]);
  };
  const fontIn = document.fonts ? Promise.all([document.fonts.ready, document.fonts.load('600 64px "Space Grotesk"')]).catch(() => {}) : Promise.resolve();
  fontIn.then(start);
})();
