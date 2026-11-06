// Page behaviour: scroll-driven routing board, the before/after screen, install stops, live output windows.
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wide = matchMedia('(min-width: 60.01rem)');
  const clamp = (v) => Math.max(0, Math.min(1, v));
  const progressOf = (el) => { const r = el.getBoundingClientRect(), span = r.height - innerHeight; return span > 0 ? clamp(-r.top / span) : (r.top < 0 ? 1 : 0); };
  const onFrame = (fn) => { let q = false; const run = () => { q = false; fn(); }; addEventListener('scroll', () => { if (!q) { q = true; requestAnimationFrame(run); } }, { passive: true }); addEventListener('resize', fn); fn(); };

  /* ---------- routing board: tabs, and the scroll picks the tab (phones too) ---------- */
  const list = document.querySelector('.requests');
  if (list) {
    const tabs = [...list.children], track = document.querySelector('.board-track');
    let cur = -1;
    const show = (i, fresh) => {
      if (i === cur) return; cur = i;
      tabs.forEach((x, k) => {
        const on = k === i, p = document.getElementById(x.getAttribute('aria-controls'));
        x.classList.toggle('is-past', k < i);
        if (on && fresh && !matchMedia('(prefers-reduced-motion: reduce)').matches) { x.classList.remove('is-unlock'); void x.offsetWidth; x.classList.add('is-unlock'); clearTimeout(x._u); x._u = setTimeout(() => x.classList.remove('is-unlock'), 1400); }
        x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; p.hidden = false; p.classList.toggle('is-active', on); p.setAttribute('aria-hidden', String(!on)); p.inert = !on;
        if (on && fresh) { p.removeAttribute('data-fresh'); void p.offsetWidth; p.setAttribute('data-fresh', ''); }
      });
    };
    // after a click the page glides to the tab: the sheen steps through every tab on the way and lands on the
    // clicked one, but never replays on the tab the click started from
    let lock = -1, from = -1, lockT = 0;
    const unlock = () => { lock = -1; from = -1; clearTimeout(lockT); };
    ['wheel', 'touchstart', 'keydown'].forEach((ev) => addEventListener(ev, (e) => { if (ev !== 'keydown' || !e.target.closest?.('.requests')) unlock(); }, { passive: true }));
    const scrollToTab = (i) => {
      if (!track || track.offsetHeight <= innerHeight) return false;
      from = cur; lock = i; clearTimeout(lockT); lockT = setTimeout(() => { const t = lock; unlock(); if (t >= 0) show(t, true); }, 1800);
      const top = track.getBoundingClientRect().top + scrollY, span = track.offsetHeight - innerHeight;
      scrollTo({ top: top + span * ((i + 0.5) / tabs.length), behavior: reduce ? 'auto' : 'smooth' });
      return true;
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => { if (!scrollToTab(i)) show(i, true); });
      t.addEventListener('keydown', (e) => {
        const k = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]; if (!k) return;
        e.preventDefault(); const n = (i + k + tabs.length) % tabs.length; scrollToTab(n); show(n, true); tabs[n].focus();
      });
    });
    show(0, false);
    if (track) onFrame(() => {
      if (track.offsetHeight <= innerHeight) return;
      const p = progressOf(track), f = p * tabs.length, i = Math.min(tabs.length - 1, Math.floor(f));
      if (lock >= 0) { if (i === from) return; if (i === lock) unlock(); }
      tabs.forEach((t, k) => t.style.setProperty('--tp', k < i ? 0 : k === i ? (f - i).toFixed(3) : 0));
      show(i, true);
    });
  }

  document.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', () => {
    const el = document.getElementById(b.dataset.copy), text = el.textContent.trim();
    const done = () => { b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1600); };
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(done, () => getSelection().selectAllChildren(el)); else getSelection().selectAllChildren(el);
  }));

  /* ---------- install stops: each step lights as you reach it (in a row: one after another) ---------- */
  const lists = [...document.querySelectorAll('[data-stops]')];
  const lightStops = () => lists.forEach((stops) => {
    if (!stops.offsetParent) return; // a hidden path
    const items = [...stops.children], stacked = items.length > 1 && items[1].offsetTop > items[0].offsetTop + 10;
    if (stacked) { items.forEach((li) => li.classList.toggle('is-lit', li.getBoundingClientRect().top < innerHeight * 0.7)); return; }
    const r = stops.getBoundingClientRect(), p = clamp((innerHeight * 0.8 - r.top) / (innerHeight * 0.55));
    items.forEach((li, i) => li.classList.toggle('is-lit', p >= i / (items.length - 1) - 0.02));
  });
  if (lists.length) onFrame(lightStops);

  /* ---------- the cursor in each step's small screen lands on the thing to press, at any width ---------- */
  const aim = () => document.querySelectorAll('.sv-cur').forEach((c) => {
    const sv = c.parentElement, hits = sv.querySelectorAll('.sv-hit'), t = hits[hits.length - 1];
    if (!t || !sv.offsetWidth) return;
    const s = sv.getBoundingClientRect(), r = t.getBoundingClientRect(), w = c.offsetWidth;
    // the arrow's tip sits at (6, 3.5) of its 28-unit box; put it a little right of the target's centre
    c.style.left = `${r.left - s.left + r.width * 0.58 - (w * 6) / 28}px`;
    c.style.top = `${r.top - s.top + r.height * 0.6 - (w * 3.5) / 28}px`;
  });
  addEventListener('resize', aim); addEventListener('load', aim); document.fonts?.ready.then(aim); aim();

  /* ---------- the other install route folds open below the onboarding line ---------- */
  document.querySelectorAll('.then-toggle').forEach((b) => b.addEventListener('click', () => {
    const open = b.getAttribute('aria-expanded') !== 'true';
    b.setAttribute('aria-expanded', String(open));
    document.getElementById(b.getAttribute('aria-controls')).classList.toggle('is-open', open);
  }));

  /* ---------- where you work: three install paths ---------- */
  const ways = [...document.querySelectorAll('.ways [role="tab"]')];
  const pickWay = (i, focus) => {
    ways.forEach((w, k) => { const on = k === i; w.setAttribute('aria-selected', String(on)); w.tabIndex = on ? 0 : -1; document.getElementById(w.getAttribute('aria-controls')).hidden = !on; });
    if (focus) ways[i].focus();
    // the new path's steps light at once if the list is already on screen, and replay their cursor
    document.querySelectorAll('.path .step').forEach((li) => li.classList.remove('is-lit'));
    requestAnimationFrame(() => { aim(); lightStops(); });
  };
  ways.forEach((w, i) => {
    w.addEventListener('click', () => pickWay(i));
    w.addEventListener('keydown', (e) => { const d = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!d) return; e.preventDefault(); pickWay((i + d + ways.length) % ways.length, true); });
  });

  /* ---------- output windows come alive only while on screen ---------- */
  const whenSeen = (el, on, off) => new IntersectionObserver(([e]) => (e.isIntersecting ? on() : off?.())).observe(el);
  const gate = document.querySelector('.gate');
  if (gate) new IntersectionObserver(([e], o) => { if (e.isIntersecting) { gate.classList.add('is-seen'); o.disconnect(); } }, { rootMargin: '0px 0px -15% 0px' }).observe(gate);

  /* ---------- the closing illustration's packets pause off screen ---------- */
  const art = document.querySelector('.close-svg');
  if (art) { if (reduce) art.pauseAnimations(); else whenSeen(art, () => art.unpauseAnimations(), () => art.pauseAnimations()); }
})();
