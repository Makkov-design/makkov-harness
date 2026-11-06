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
    const LIMIT = matchMedia('(max-width: 40rem)').matches ? 2 : 4; // phones get two cards, the rest is one tap away
    nav.innerHTML = D.groups.map((g, i) => `<button type="button" role="tab" id="sg-${g.id}" aria-selected="${i === 0}" aria-controls="sit-panel" tabindex="${i === 0 ? 0 : -1}"><span>${esc(g.title)}</span><em>${g.rows.length}</em></button>`).join('');
    const tabs = [...nav.children];
    // phones: the same groups as one full-width picker, so nothing runs off the screen
    const pick = document.createElement('label'); pick.className = 'find-pick';
    pick.innerHTML = `<span class="find-pick-label">Situation group</span><select>${D.groups.map((g, i) => `<option value="${i}">${esc(g.title)} · ${g.rows.length}</option>`).join('')}</select><svg aria-hidden="true" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6"/></svg>`;
    nav.before(pick);
    const sel = pick.querySelector('select');
    sel.addEventListener('change', () => show(Number(sel.value)));
    const show = (i, focus) => {
      const g = D.groups[i];
      sel.value = String(i);
      tabs.forEach((t, k) => { t.setAttribute('aria-selected', k === i); t.tabIndex = k === i ? 0 : -1; });
      if (focus) tabs[i].focus();
      panel.setAttribute('aria-labelledby', `sg-${g.id}`);
      const more = g.rows.length > LIMIT ? `<a class="sit-all" href="situations.html#${g.id}">All ${g.rows.length} in ${esc(g.title.toLowerCase())}<svg aria-hidden="true"><use href="#i-arrow"/></svg></a>` : '';
      panel.innerHTML = `<p class="sit-note">${esc(g.note)}</p><div class="sit-grid">${g.rows.slice(0, LIMIT).map((r) => card(r, false)).join('')}</div>${more}`;
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
    const io = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return;
      links.forEach((l) => l.toggleAttribute('aria-current', l.dataset.g === e.target.id));
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
