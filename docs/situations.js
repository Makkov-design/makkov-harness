// "Find your situation": a group switcher with a few cards on the home page,
// and the full catalog with a side rail on situations.html.
(() => {
  const D = window.SITUATIONS;
  if (!D) return;
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const ICON_COPY = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/></svg>';
  const ICON_DONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
  const copyBtn = (text, label) => `<button type="button" class="copy" data-copy-text="${esc(text)}" data-label="${label}" aria-label="${label}: ${esc(text)}">${ICON_COPY}<span>${label}</span></button>`;

  const cmd = (call) => call.startsWith('/')
    ? `<div class="sit-cmd"><span class="sit-sign" aria-hidden="true">$</span><code>${esc(call)}</code>${copyBtn(call, 'Copy')}</div>`
    : `<div class="sit-cmd sit-cmd--say"><span class="sit-sign" aria-hidden="true">›</span><code>${esc(call)}</code></div>`;
  const prompt = (r) => `<div class="sit-prompt"><p>${esc(r[4])}</p>${copyBtn(r[4], 'Copy prompt')}</div>`;
  const card = (r, full) => `
    <article class="sit">
      <h3>${esc(r[0])}</h3>
      <p class="sit-what">${esc(r[1])}</p>
      ${cmd(r[3])}
      ${full ? `<details class="sit-more"><summary>Example prompt</summary>${prompt(r)}</details>` : prompt(r)}
    </article>`;

  /* home: pick a group, see a few of its situations */
  document.querySelectorAll('[data-sit-home]').forEach((root) => {
    const nav = root.querySelector('[data-sit-nav]'), panel = root.querySelector('[data-sit-panel]');
    // up to eight cards in two columns; phones show four, and a fifth fades out under the link to the rest
    const phone = matchMedia('(max-width: 40rem)').matches, LIMIT = phone ? 4 : 8;
    nav.innerHTML = D.groups.map((g, i) => `<button type="button" role="tab" id="sg-${g.id}" aria-selected="${i === 0}" aria-controls="sit-panel" tabindex="${i === 0 ? 0 : -1}"><span>${esc(g.title)}</span><em>${g.rows.length}</em></button>`).join('');
    const tabs = [...nav.children];

    // phones: the groups as one full-width dropdown of our own, so nothing runs off the screen
    const pick = document.createElement('div'); pick.className = 'find-pick';
    pick.innerHTML = `<button type="button" class="find-pick-btn" aria-haspopup="listbox" aria-expanded="false" aria-controls="find-pick-list" aria-label="Situation group"><span class="find-pick-val"></span><em></em><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg></button>
      <ul class="find-pick-list" id="find-pick-list" role="listbox" tabindex="-1" aria-label="Situation groups" hidden>${D.groups.map((g, i) => `<li role="option" id="fp-${i}" data-i="${i}" aria-selected="false"><span>${esc(g.title)}</span><em>${g.rows.length}</em></li>`).join('')}</ul>`;
    nav.before(pick);
    const btn = pick.querySelector('.find-pick-btn'), list = pick.querySelector('.find-pick-list'), opts = [...list.children];
    let cur = 0, act = 0;
    const activate = (i) => { act = (i + opts.length) % opts.length; opts.forEach((o, k) => o.classList.toggle('is-act', k === act)); list.setAttribute('aria-activedescendant', opts[act].id); opts[act].scrollIntoView({ block: 'nearest' }); };
    const open = () => { list.hidden = false; btn.setAttribute('aria-expanded', 'true'); pick.classList.add('is-open'); activate(cur); list.focus({ preventScroll: true }); };
    const close = (refocus) => { if (list.hidden) return; list.hidden = true; btn.setAttribute('aria-expanded', 'false'); pick.classList.remove('is-open'); if (refocus) btn.focus({ preventScroll: true }); };
    btn.addEventListener('click', () => (list.hidden ? open() : close(true)));
    btn.addEventListener('keydown', (e) => { if (['ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); open(); } });
    list.addEventListener('click', (e) => { const o = e.target.closest('[role="option"]'); if (!o) return; show(Number(o.dataset.i)); close(true); });
    list.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); activate(act + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); activate(act - 1); }
      else if (e.key === 'Home') { e.preventDefault(); activate(0); }
      else if (e.key === 'End') { e.preventDefault(); activate(opts.length - 1); }
      else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(act); close(true); }
      else if (e.key === 'Escape') { e.preventDefault(); close(true); }
      else if (e.key === 'Tab') close(false);
    });
    document.addEventListener('pointerdown', (e) => { if (!pick.contains(e.target)) close(false); });

    const show = (i, focus) => {
      const g = D.groups[i];
      cur = i;
      pick.querySelector('.find-pick-val').textContent = g.title; pick.querySelector('.find-pick-btn em').textContent = g.rows.length;
      opts.forEach((o, k) => o.setAttribute('aria-selected', String(k === i)));
      tabs.forEach((t, k) => { t.setAttribute('aria-selected', k === i); t.tabIndex = k === i ? 0 : -1; });
      if (focus) tabs[i].focus();
      panel.setAttribute('aria-labelledby', `sg-${g.id}`);
      const peek = phone && g.rows.length > LIMIT ? card(g.rows[LIMIT], false).replace('<article class="sit">', '<article class="sit sit--peek" aria-hidden="true" inert>') : '';
      panel.classList.toggle('has-peek', !!peek);
      panel.innerHTML = `<p class="sit-note">${esc(g.note)}</p><div class="sit-grid">${g.rows.slice(0, LIMIT).map((r) => card(r, false)).join('')}${peek}</div>`;
      panel.classList.remove('is-in'); void panel.offsetWidth; panel.classList.add('is-in');
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => show(i));
      t.addEventListener('keydown', (e) => {
        const d = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]; if (!d) return;
        e.preventDefault(); show((i + d + tabs.length) % tabs.length, true);
      });
    });
    show(0);
  });

  /* catalog: every group in order, with a quiet rail on the side */
  document.querySelectorAll('[data-sit-catalog]').forEach((root) => {
    const list = root.querySelector('[data-sit-list]'), rail = document.querySelector('[data-sit-rail]');
    list.innerHTML = D.groups.map((g) => `
      <section class="sit-block" id="${g.id}" aria-labelledby="gh-${g.id}">
        <div class="sit-block-head"><h2 id="gh-${g.id}">${esc(g.title)}</h2><p>${esc(g.note)}</p></div>
        <div class="sit-grid">${g.rows.map((r) => card(r, true)).join('')}</div>
      </section>`).join('');
    if (!rail) return;
    rail.innerHTML = D.groups.map((g) => `<a href="#${g.id}" data-g="${g.id}"><i></i><span>${esc(g.title)}</span></a>`).join('');
    const links = [...rail.children];

    // phones and tablets: the rail is an edge index in the right gutter. Tap a tick to jump,
    // drag along the ticks to scrub through the groups; a small label names the group under the finger.
    const edge = matchMedia('(max-width: 75rem)'), reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tip = document.createElement('div'); tip.className = 'sit-tip'; tip.setAttribute('aria-hidden', 'true'); document.body.append(tip);
    let tipT = 0, scrub = -1, moved = false, cur = -1;
    const yOf = (i) => { const r = links[i].getBoundingClientRect(); return r.top + r.height / 2; };
    const at = (y) => { let best = 0, d = Infinity; links.forEach((l, k) => { const dd = Math.abs(yOf(k) - y); if (dd < d) { d = dd; best = k; } }); return best; };
    const showTip = (i, hold) => {
      const g = D.groups[i]; tip.innerHTML = `<b>${esc(g.title)}</b><em>${g.rows.length}</em>`; tip.style.top = `${yOf(i)}px`; tip.classList.add('is-on');
      clearTimeout(tipT); if (!hold) tipT = setTimeout(() => tip.classList.remove('is-on'), 1100);
    };
    let quietUntil = 0; // a jump passes other groups on its way; they should not flash their names
    const go = (i, smooth) => { quietUntil = performance.now() + 1000; document.getElementById(D.groups[i].id).scrollIntoView({ behavior: smooth && !reduce ? 'smooth' : 'auto', block: 'start' }); };
    rail.addEventListener('pointerdown', (e) => {
      if (!edge.matches) return;
      e.preventDefault(); try { rail.setPointerCapture(e.pointerId); } catch {} rail.classList.add('is-scrub');
      scrub = at(e.clientY); moved = false; showTip(scrub, true);
    });
    rail.addEventListener('pointermove', (e) => {
      if (scrub < 0) return;
      const i = at(e.clientY); if (i === scrub) return;
      scrub = i; moved = true; showTip(i, true); go(i, false);
    });
    const end = () => { if (scrub < 0) return; const i = scrub; scrub = -1; rail.classList.remove('is-scrub'); go(i, !moved); showTip(i, false); };
    rail.addEventListener('pointerup', end); rail.addEventListener('pointercancel', end);
    rail.addEventListener('click', (e) => { if (edge.matches) e.preventDefault(); });
    // the index shows only while the list is on screen
    new IntersectionObserver(([e]) => rail.classList.toggle('is-on', e.isIntersecting)).observe(list);

    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      const k = links.findIndex((l) => l.dataset.g === e.target.id);
      links.forEach((l, j) => l.toggleAttribute('aria-current', j === k));
      // entering a new group while reading: name it for a moment next to its tick
      if (edge.matches && scrub < 0 && cur >= 0 && k !== cur && performance.now() > quietUntil) showTip(k, false);
      cur = k;
    }), { rootMargin: '-35% 0px -55% 0px' });
    list.querySelectorAll('.sit-block').forEach((s) => io.observe(s));
    window.fxRefresh?.(list);
  });

  /* copy: the button keeps its colours and swaps its icon and word for a moment */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-copy-text]'); if (!b) return;
    const text = b.dataset.copyText, label = b.dataset.label || 'Copy';
    const done = () => {
      b.classList.add('is-done'); b.innerHTML = `${ICON_DONE}<span>Copied</span>`;
      clearTimeout(b._t); b._t = setTimeout(() => { b.classList.remove('is-done'); b.innerHTML = `${ICON_COPY}<span>${label}</span>`; }, 1600);
    };
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(done, () => {
      const c = b.parentElement.querySelector('code, p'); if (c) getSelection().selectAllChildren(c);
    });
  });
})();
