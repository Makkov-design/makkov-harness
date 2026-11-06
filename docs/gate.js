// Gate table: a laser line sweeps the reviewed list, leaves a crumbling pixel trail,
// and each row glitches for a moment as the beam crosses it.
(() => {
  const table = document.querySelector('.gate .checks');
  if (!table || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = document.createElement('canvas'); cv.className = 'ck-trail'; cv.setAttribute('aria-hidden', 'true');
  const beam = document.createElement('i'); beam.className = 'ck-beam'; beam.setAttribute('aria-hidden', 'true');
  table.append(cv, beam);
  const ctx = cv.getContext('2d');
  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  const rgb = (n) => { probe.clearRect(0, 0, 1, 1); probe.fillStyle = getComputedStyle(document.documentElement).getPropertyValue(n).trim(); probe.fillRect(0, 0, 1, 1); return [...probe.getImageData(0, 0, 1, 1).data.slice(0, 3)]; };
  const COLS = [rgb('--opal-2'), rgb('--opal-1'), rgb('--color-ink-2')];
  const rows = [...table.querySelectorAll('.ck-row:not(.ck-head)')];
  let W = 0, H = 0, dpr = 1, top = 0, raf = 0, t0 = 0, seen = false;
  const PX = 3, SWEEP = 2200, REST = 4200;

  function size() {
    const r = table.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2);
    top = table.querySelector('.ck-head').offsetHeight; W = r.width; H = r.height - top;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.top = top + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  const hit = new Set();
  function frame(t) {
    raf = requestAnimationFrame(frame);
    const e = (t - t0) % (SWEEP + REST), on = e < SWEEP;
    // the old trail crumbles away a little every frame
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,0.09)'; ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    if (!on) { beam.style.opacity = '0'; hit.clear(); return; }
    const p = e / SWEEP, y = p * H;
    beam.style.opacity = String(Math.min(1, p * 8, (1 - p) * 8));
    beam.style.transform = `translateY(${top + y}px)`;
    // fresh pixels just behind the beam, sparser the further back
    for (let k = 0; k < 70; k++) {
      const back = Math.pow(Math.random(), 1.8) * 46, x = Math.floor((Math.random() * W) / PX) * PX, yy = Math.floor((y - back) / PX) * PX;
      if (yy < 0) continue;
      const c = COLS[(Math.random() * COLS.length) | 0], a = (1 - back / 46) * (0.25 + Math.random() * 0.5);
      ctx.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a.toFixed(3)})`; ctx.fillRect(x, yy, PX - 1, PX - 1);
    }
    // a row glitches as the beam crosses its middle
    rows.forEach((row) => {
      const mid = row.offsetTop - top + row.offsetHeight / 2;
      if (!hit.has(row) && y >= mid) { hit.add(row); row.classList.remove('is-scan'); void row.offsetWidth; row.classList.add('is-scan'); setTimeout(() => row.classList.remove('is-scan'), 360); }
    });
  }
  new ResizeObserver(size).observe(table); size();
  new IntersectionObserver(([en]) => {
    seen = en.isIntersecting;
    if (seen && !raf) { t0 = performance.now() - REST + 600; raf = requestAnimationFrame(frame); }
    if (!seen && raf) { cancelAnimationFrame(raf); raf = 0; }
  }).observe(table);
})();
