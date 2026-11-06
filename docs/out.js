// "You ask in plain words": four live windows (report, install-guard, video, DESIGN.md).
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const whenSeen = (el, on, off) => new IntersectionObserver(([e]) => (e.isIntersecting ? on() : off?.())).observe(el);
  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  /* ---------- rich report: a weekly chart with a metric switch and hover values ---------- */
  const report = document.querySelector('[data-report]');
  if (report) {
    const chart = report.querySelector('[data-chart]'), title = report.querySelector('[data-chart-title]');
    const DATA = {
      share: { title: 'Paid share by week', fmt: (v) => `${v}%`, max: 34, v: [18, 19, 21, 20, 22, 24, 23, 25, 26, 25, 27, 29] },
      roi: { title: 'Paid ROI by week', fmt: (v) => `${v.toFixed(1)}×`, max: 3, v: [1.6, 1.7, 1.9, 1.8, 2.0, 2.1, 2.0, 2.2, 2.3, 2.2, 2.4, 2.6] }
    };
    let m = 'share';
    const draw = () => {
      const d = DATA[m]; title.textContent = d.title;
      chart.innerHTML = d.v.map((v, i) => `<button type="button" class="rp-bar${i === d.v.length - 1 ? ' is-key' : ''}" style="--h:${(v / d.max) * 100}%;--i:${i}" aria-label="Week ${i + 1}: ${d.fmt(v)}"><span>${d.fmt(v)}</span></button>`).join('');
      chart.classList.remove('is-drawn'); void chart.offsetWidth; chart.classList.add('is-drawn');
    };
    report.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => {
      m = b.dataset.m; report.querySelectorAll('[data-m]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw();
    }));
    draw();
  }

  /* ---------- install-guard: commands type out, each check spins, then lands ---------- */
  const term = document.querySelector('[data-term]');
  if (term) {
    const RUN = [
      ['cmd', 'install crossenv'],
      ['chk', 'fetch, no run', true, 'crossenv@7.0.0'],
      ['chk', 'install scripts', false, 'postinstall runs setup.js'],
      ['chk', 'network calls', false, 'posts process.env out'],
      ['chk', 'name check', false, 'one letter off cross-env'],
      ['chk', 'antivirus', true, 'clean'],
      ['red', 'RED', 'do not install, 3 findings'],
      ['gap'],
      ['cmd', 'install cowsay@1.6.0'],
      ['chk', 'fetch, no run', true, 'cowsay@1.6.0'],
      ['chk', 'install scripts', true, 'none'],
      ['chk', 'network calls', true, 'none'],
      ['chk', 'provenance', true, 'signed, 14 years old'],
      ['green', 'GREEN', 'installed']
    ];
    const SPIN = '⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏';
    let timers = [], running = false;
    const later = (ms, fn) => { const t = setTimeout(fn, ms); timers.push(t); return t; };
    const stop = () => { timers.forEach(clearTimeout); timers = []; running = false; };
    const line = (cls) => { const p = document.createElement('p'); p.className = cls; term.append(p); while (term.children.length > 16) term.firstChild.remove(); return p; };
    const renderFinal = () => { term.innerHTML = ''; RUN.forEach((r) => { const p = line(`t-${r[0]}`); fill(p, r, true); }); };
    function fill(p, r, done) {
      if (r[0] === 'cmd') p.innerHTML = `<span class="t-ps">$</span> ${esc(r[1])}`;
      else if (r[0] === 'chk') p.innerHTML = `<span class="t-mark ${done ? (r[2] ? 'ok' : 'bad') : 'spin'}">${done ? (r[2] ? '✓' : '✗') : SPIN[0]}</span><span class="t-k">${esc(r[1])}</span><span class="t-v">${done ? esc(r[3]) : ''}</span>`;
      else if (r[0] === 'red' || r[0] === 'green') p.innerHTML = `<b>${r[1]}</b><span>${esc(r[2])}</span>`;
    }
    function play(i = 0) {
      if (!running) return;
      if (i >= RUN.length) { later(3200, () => { term.innerHTML = ''; play(0); }); return; }
      const r = RUN[i];
      if (r[0] === 'gap') { line('t-gap'); later(500, () => play(i + 1)); return; }
      const p = line(`t-${r[0]}`);
      if (r[0] === 'cmd') {
        p.innerHTML = '<span class="t-ps">$</span> <span class="t-typed"></span><span class="t-caret"></span>';
        const typed = p.querySelector('.t-typed'); let k = 0;
        const type = () => { typed.textContent = r[1].slice(0, ++k); if (k < r[1].length) later(38 + Math.random() * 40, type); else later(300, () => { p.querySelector('.t-caret').remove(); play(i + 1); }); };
        later(250, type);
      } else if (r[0] === 'chk') {
        fill(p, r, false);
        const mark = p.querySelector('.t-mark'); let s = 0;
        const spin = () => { mark.textContent = SPIN[s++ % SPIN.length]; };
        const iv = setInterval(spin, 70); timers.push(iv);
        later(380 + Math.random() * 420, () => { clearInterval(iv); fill(p, r, true); later(140, () => play(i + 1)); });
      } else { fill(p, r, true); later(500, () => play(i + 1)); }
    }
    if (reduce) renderFinal();
    else whenSeen(term, () => { if (!running) { running = true; term.innerHTML = ''; play(0); } }, stop);
  }

  /* ---------- hyperframes: three scenes, a timeline that follows them, a render bar ---------- */
  const video = document.querySelector('[data-video]');
  if (video) {
    const scenes = [...video.querySelectorAll('[data-scene]')], clips = [...video.querySelectorAll('[data-clip]')];
    const head = video.querySelector('.vid-head'), tc = video.querySelector('[data-timecode]');
    const rLabel = video.querySelector('[data-render]'), rBar = video.querySelector('.vid-bar i'), rPct = video.querySelector('[data-render-pct]');
    const LEN = 9000; let raf = 0, t0 = 0;
    const at = (t) => {
      const p = (t % LEN) / LEN, s = Math.min(2, Math.floor(p * 3));
      scenes.forEach((el, i) => el.classList.toggle('is-on', i === s));
      clips.forEach((el, i) => el.classList.toggle('is-on', i === s));
      if (head) head.style.translate = `${(p * 100).toFixed(2)}% 0`;
      tc.textContent = `00:0${Math.floor(p * 9)}`;
      const r = Math.min(1, (t % (LEN * 2)) / (LEN * 1.4));
      rBar.style.transform = `scaleX(${r.toFixed(3)})`;
      rPct.textContent = r < 1 ? `${Math.round(r * 100)}%` : '✓';
      rLabel.textContent = r < 1 ? 'Rendering MP4, 1080p' : 'release-v2.mp4, 1080p, 9 s';
      video.classList.toggle('is-rendered', r >= 1);
    };
    const loop = (t) => { at(t - t0); raf = requestAnimationFrame(loop); };
    if (reduce) at(LEN * 1.5);
    else whenSeen(video, () => { if (!raf) { t0 = performance.now(); raf = requestAnimationFrame(loop); } }, () => { cancelAnimationFrame(raf); raf = 0; });
  }

  /* ---------- DESIGN.md: pick a product, its system restyles the preview ---------- */
  const styles = document.querySelector('[data-styles]');
  if (styles) {
    const SYS = [
      ['linear', 'Linear', 'Inter Display, tight', 'lavender blue', '8 px', 'compact'],
      ['stripe', 'Stripe', 'Söhne, open', 'blurple', '6 px', 'airy'],
      ['notion', 'Notion', 'serif headings', 'none, ink only', '4 px', 'document'],
      ['vercel', 'Vercel', 'Geist, mono labels', 'black and white', '6 px', 'precise'],
      ['apple', 'Apple', 'SF Pro, large type', 'system blue', '12 px', 'generous'],
      ['airbnb', 'Airbnb', 'Cereal, rounded', 'rausch coral', '12 px', 'warm'],
      ['figma', 'Figma', 'Inter, small UI', 'violet', '6 px', 'tool dense'],
      ['spotify', 'Spotify', 'Circular, bold', 'green', 'pill', 'immersive']
    ];
    const tabs = styles.querySelector('.st-tabs');
    tabs.innerHTML = SYS.map(([id, name], i) => `<button type="button" data-sys-id="${id}" aria-pressed="${i === 0}" aria-label="${name}" title="${name}"><svg aria-hidden="true"><use href="#b-${id}"/></svg><span>${name}</span></button>`).join('') + '<span class="st-more">+76 more</span>';
    let k = 0, timer = 0, hold = 0;
    const set = (n) => {
      k = n; const [id, , font, accent, radius, density] = SYS[n];
      styles.dataset.sys = id;
      tabs.querySelectorAll('[data-sys-id]').forEach((b, i) => b.setAttribute('aria-pressed', i === n));
      styles.querySelector('[data-st-font]').textContent = font;
      styles.querySelector('[data-st-accent]').textContent = accent;
      styles.querySelector('[data-st-radius]').textContent = radius;
      styles.querySelector('[data-st-density]').textContent = density;
    };
    tabs.addEventListener('click', (e) => { const b = e.target.closest('[data-sys-id]'); if (!b) return; set(SYS.findIndex((s) => s[0] === b.dataset.sysId)); hold = performance.now() + 9000; });
    set(0);
    if (!reduce) whenSeen(styles, () => { if (!timer) timer = setInterval(() => { if (performance.now() > hold) set((k + 1) % SYS.length); }, 2600); }, () => { clearInterval(timer); timer = 0; });
  }
})();
