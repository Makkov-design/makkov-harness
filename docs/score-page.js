// Design Score page: "Try it on this page", the draggable bookmarklet pills, copy buttons, the sample panel's
// count-up, the issue picker on the sample page, the export tabs and the badge builder.
// The only requests it makes go to this site: score/mh-score.js (Try it), score/console.txt (Copy console snippet)
// and score/offline-bookmarklet.txt (the offline pill's link, about 400 KB, fetched only when someone reaches for it).
(() => {
  const doc = document, root = doc.documentElement;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, r = doc) => r.querySelector(s);
  const $$ = (s, r = doc) => Array.from(r.querySelectorAll(s));
  const loaderLink = $('[data-bookmarklet="loader"]');
  const offlineLink = $('[data-bookmarklet="offline"]');
  const VERSION = (loaderLink && loaderLink.getAttribute('data-version')) || '1.0.0';
  const firefox = /\bFirefox\//.test(navigator.userAgent || '');

  /* ---------- toast: one polite line at the bottom ---------- */
  const toastEl = $('[data-ds-toast]');
  let toastT = 0;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.classList.add('is-on');
    clearTimeout(toastT);
    toastT = setTimeout(() => toastEl.classList.remove('is-on'), 3600);
  }

  /* ---------- the keyboard shortcut that shows the bookmarks bar ---------- */
  const mac = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent || '');
  if (mac) $$('[data-ds-mod]').forEach((k) => { k.textContent = 'Cmd'; });

  /* ---------- Try it on this page: load the bundle once, then open (or re-run) the panel ---------- */
  let loading = null;
  function openPanel() {
    const ui = window.MHScoreUI;
    if (ui && typeof ui.open === 'function') { ui.open(); return Promise.resolve(); }
    if (loading) return loading;
    window.MHScoreNoAuto = true; // this page opens the panel itself, after the script has loaded
    loading = new Promise((resolve, reject) => {
      const s = doc.createElement('script');
      s.src = 'score/mh-score.js?v=' + encodeURIComponent(VERSION);
      s.async = true;
      s.onload = () => {
        s.remove();
        try { delete window.MHScoreNoAuto; } catch (e) { window.MHScoreNoAuto = undefined; }
        if (window.MHScoreUI && typeof window.MHScoreUI.open === 'function') { window.MHScoreUI.open(); resolve(); }
        else reject(new Error('The bundle loaded but did not define MHScoreUI.'));
      };
      s.onerror = () => { s.remove(); reject(new Error('score/mh-score.js could not be loaded.')); };
      (doc.head || root).appendChild(s);
    });
    loading.then(() => { loading = null; }, () => { loading = null; });
    return loading;
  }
  function failed() { toast('Design Score could not load here. Check the connection and try again.'); }

  const tryBtn = $('[data-ds-try]');
  if (tryBtn) {
    const label = $('[data-ds-try-label]', tryBtn);
    const idle = label ? label.textContent : '';
    tryBtn.addEventListener('click', () => {
      if (tryBtn.getAttribute('aria-busy') === 'true') return;
      const pending = !window.MHScoreUI;
      if (pending) { tryBtn.setAttribute('aria-busy', 'true'); if (label) label.textContent = 'Loading…'; }
      openPanel().catch(failed).then(() => { tryBtn.removeAttribute('aria-busy'); if (label) label.textContent = idle; });
    });
  }

  /* ---------- the pills: drag to the bookmarks bar; a click here runs it on this page ---------- */
  const drop = $('[data-ds-drop]');
  const hint = $('[data-ds-hint]');
  const hintText = $('[data-ds-hint-text]');
  const setHint = (strong, rest) => {
    if (!hintText) return;
    const b = doc.createElement('b');
    b.textContent = strong;
    hintText.replaceChildren(b, doc.createTextNode(rest));
  };
  $$('[data-ds-pill]').forEach((pill) => {
    pill.addEventListener('click', (e) => {
      e.preventDefault();
      const coarse = matchMedia('(hover: none) and (pointer: coarse)').matches;
      openPanel().then(() => toast(coarse ? 'That ran it on this page. To use it on other sites, add it as a bookmark by hand: the steps are further down.' : 'That ran it on this page. Drag the pill to your bookmarks bar to use it on any site.'), failed);
    });
    pill.addEventListener('dragstart', (e) => {
      if (pill === offlineLink && !offlineReady()) {
        // the link is still on its way: a drag now would save the placeholder, so cancel it and say why
        e.preventDefault();
        fillOffline();
        toast('One moment: the offline bookmarklet is still loading. Drag it again in a second.');
        return;
      }
      if (pill === offlineLink && firefox) toast('Firefox can’t save a bookmark this long. If it doesn’t appear in the bar, use the console snippet.');
      if (drop) drop.classList.add('is-on');
      if (hint && pill === loaderLink) { hint.classList.add('is-dragging'); setHint('Drop it on your bookmarks bar', ', at the top of the window.'); }
    });
    pill.addEventListener('dragend', () => {
      if (drop) drop.classList.remove('is-on');
      if (hint && pill === loaderLink) { hint.classList.remove('is-dragging'); setHint('If it landed in the bar', ', open any site and click Design Score.'); }
    });
  });

  /* ---------- copy ---------- */
  async function writeClipboard(textOrPromise) {
    // A promise (a file still loading) goes through ClipboardItem, which keeps the click's permission in Safari.
    if (typeof textOrPromise !== 'string') {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        try {
          await navigator.clipboard.write([new ClipboardItem({ 'text/plain': textOrPromise.then((t) => new Blob([t], { type: 'text/plain' })) })]);
          return true;
        } catch (e) { /* fall through to the text path */ }
      }
      try { textOrPromise = await textOrPromise; } catch (e) { return false; }
    }
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(textOrPromise); return true; }
    } catch (e) { /* use the textarea fallback */ }
    const ta = doc.createElement('textarea');
    ta.value = textOrPromise;
    ta.setAttribute('readonly', '');
    ta.setAttribute('aria-hidden', 'true');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0';
    doc.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = doc.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    return ok;
  }

  const remote = new Map(); // url -> { promise, text } for this site's own files
  function getText(url) {
    if (!remote.has(url)) {
      const entry = { text: null, promise: null };
      entry.promise = fetch(url).then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
      entry.promise.then((t) => { entry.text = t; }, () => remote.delete(url));
      remote.set(url, entry);
    }
    const entry = remote.get(url);
    return entry.text != null ? entry.text : entry.promise; // a string once it has arrived
  }

  function done(btn, msg) {
    btn.classList.add('is-done');
    const label = btn.querySelector('span:last-child');
    if (label && !btn.hasAttribute('data-copy-text')) {
      if (!btn._idle) btn._idle = label.textContent;
      label.textContent = 'Copied';
    }
    toast(msg || 'Copied');
    clearTimeout(btn._t);
    btn._t = setTimeout(() => { btn.classList.remove('is-done'); if (label && btn._idle) label.textContent = btn._idle; }, 2000);
  }

  doc.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-copy-text], [data-copy-from], [data-copy-href], [data-copy-src]');
    if (!btn) return;
    let payload = null;
    if (btn.hasAttribute('data-copy-text')) payload = btn.getAttribute('data-copy-text');
    else if (btn.hasAttribute('data-copy-from')) { const src = $(btn.getAttribute('data-copy-from')); payload = src ? src.textContent : null; }
    else if (btn.hasAttribute('data-copy-href')) {
      const a = $(`[data-bookmarklet="${btn.getAttribute('data-copy-href')}"]`);
      const href = a ? a.getAttribute('href') : null;
      const src = a && a.getAttribute('data-bookmarklet-src');
      if (href && href.startsWith('javascript:')) payload = href;
      else if (src) { const t = getText(src); payload = typeof t === 'string' ? t.trim() : t.then((s) => s.trim()); } // not fetched yet
    }
    else if (btn.hasAttribute('data-copy-src')) payload = getText(btn.getAttribute('data-copy-src'));
    if (payload == null || payload === '' || payload === '#') { toast('Nothing to copy yet.'); return; }
    const ok = await writeClipboard(payload);
    if (ok) done(btn, btn.getAttribute('data-copy-msg'));
    else if (btn.hasAttribute('data-copy-src')) toast('Copy did not work here. Open View console.txt, select all and copy it.');
    else toast('Copy did not work here. Select the text and press Ctrl+C.');
  });
  // fetch the console snippet as soon as someone reaches for it, so the copy is instant
  $$('[data-copy-src]').forEach((btn) => ['pointerenter', 'focus', 'touchstart'].forEach((ev) => btn.addEventListener(ev, () => { const t = getText(btn.getAttribute('data-copy-src')); if (typeof t !== 'string') t.catch(() => {}); }, { once: true, passive: true })));

  /* ---------- the offline pill: its ~400 KB link is fetched when someone reaches for it, not with the page ---------- */
  const offlineSrc = offlineLink && offlineLink.getAttribute('data-bookmarklet-src');
  let offlineState = offlineLink && (offlineLink.getAttribute('href') || '').startsWith('javascript:') ? 'ready' : 'idle';
  function offlineReady() { return offlineState === 'ready'; }
  function fillOffline() {
    if (!offlineLink || !offlineSrc || offlineState === 'ready' || offlineState === 'loading') return;
    offlineState = 'loading';
    offlineLink.setAttribute('data-state', 'loading');
    const apply = (text) => {
      const href = String(text).trim();
      if (!href.startsWith('javascript:')) throw new Error('not a bookmarklet');
      offlineLink.setAttribute('href', href);
      offlineState = 'ready';
      offlineLink.removeAttribute('data-state');
    };
    const t = getText(offlineSrc);
    Promise.resolve(t).then(apply).catch(() => {
      offlineState = 'idle'; // the next hover or focus tries again
      offlineLink.removeAttribute('data-state');
    });
  }
  if (offlineLink && offlineSrc) {
    ['pointerenter', 'focus', 'touchstart'].forEach((ev) => offlineLink.addEventListener(ev, fillOffline, { passive: true }));
    // with a mouse, start a little early: when the pill scrolls near, so the link is there before the drag begins.
    // Touch screens can't drag it anyway, and Save-Data asks for less, so both wait for a real reach.
    const saveData = !!(navigator.connection && navigator.connection.saveData);
    if (!saveData && matchMedia('(hover: hover) and (pointer: fine)').matches && 'IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => { if (es.some((en) => en.isIntersecting)) { io.disconnect(); fillOffline(); } }, { rootMargin: '400px 0px' });
      io.observe(offlineLink);
    }
  }

  /* ---------- the sample panel: count up once the page is visible ---------- */
  const ring = $('[data-ds-ring]');
  if (ring && !reduce) {
    const target = Number(ring.getAttribute('data-ds-ring')) || 0;
    const num = $('[data-ds-count]', ring);
    const arc = $('.ds-ring-val', ring);
    const bars = $$('[data-ds-bars] li');
    const finals = bars.map((li) => li.style.getPropertyValue('--s'));
    const setRing = (v) => {
      if (num) num.textContent = String(Math.round(v));
      if (arc) { arc.setAttribute('stroke-dasharray', v.toFixed(2) + ' 100'); arc.style.opacity = v < 0.5 ? '0' : '1'; }
    };
    setRing(0);
    bars.forEach((li) => li.style.setProperty('--s', '0'));
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      const t0 = performance.now(), dur = 1150;
      const step = (t) => {
        const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3);
        setRing(target * e);
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
      bars.forEach((li, i) => setTimeout(() => li.style.setProperty('--s', finals[i]), 140 + i * 70));
    };
    // wait for the preloader to lift, then for the panel to be on screen
    const whenSeen = () => {
      if (!('IntersectionObserver' in window)) { setTimeout(start, 300); return; }
      const io = new IntersectionObserver((es) => { if (es.some((en) => en.isIntersecting)) { io.disconnect(); setTimeout(start, 250); } }, { threshold: 0.35 });
      io.observe(ring);
    };
    if (root.classList.contains('intro') && !root.classList.contains('intro-go')) {
      const mo = new MutationObserver(() => { if (root.classList.contains('intro-go')) { mo.disconnect(); setTimeout(whenSeen, 450); } });
      mo.observe(root, { attributes: true, attributeFilter: ['class'] });
    } else whenSeen();
    setTimeout(start, 7000); // never leave the ring at zero
  }

  /* ---------- the issue picker: pick an issue, its elements light up on the sample page ---------- */
  const site = $('[data-ds-site]');
  const picks = $$('[data-ds-issue]');
  const lists = $$('[data-ds-ex]');
  function showIssue(key) {
    picks.forEach((b) => b.setAttribute('aria-pressed', String(b.getAttribute('data-ds-issue') === key)));
    lists.forEach((l) => { l.hidden = l.getAttribute('data-ds-ex') !== key; });
    if (!site) return;
    $$('[data-hl]', site).forEach((el) => el.removeAttribute('data-hl'));
    $$('[data-ex]', site).forEach((el) => {
      const tok = el.getAttribute('data-ex').split(/\s+/).find((t) => t.startsWith(key + '-'));
      if (tok) el.setAttribute('data-hl', tok.slice(key.length + 1));
    });
    site.classList.remove('is-moving');
    if (key === 'motion' && !reduce) { void site.offsetWidth; site.classList.add('is-moving'); }
  }
  picks.forEach((b) => b.addEventListener('click', () => showIssue(b.getAttribute('data-ds-issue'))));

  /* ---------- export formats: tabs with arrow keys ---------- */
  const code = $('[data-ds-code]');
  if (code) {
    const tabs = $$('[role="tab"]', code);
    const name = $('[data-ds-code-name]', code);
    const select = (tab, focus) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        const panel = doc.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (name) name.textContent = tab.getAttribute('data-name') || tab.textContent;
      if (focus) tab.focus();
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t, false));
      t.addEventListener('keydown', (e) => {
        let j = null;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % tabs.length;
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + tabs.length) % tabs.length;
        else if (e.key === 'Home') j = 0;
        else if (e.key === 'End') j = tabs.length - 1;
        if (j != null) { e.preventDefault(); select(tabs[j], true); }
      });
    });
  }

  /* ---------- the whole fix prompt, on request ---------- */
  $$('[data-ds-expand]').forEach((btn) => {
    const pre = doc.getElementById(btn.getAttribute('aria-controls'));
    const label = btn.firstChild;
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      if (pre) pre.classList.toggle('is-clamped', !open);
      if (label && label.nodeType === 3) label.textContent = open ? 'Show less' : 'Show the whole prompt';
    });
  });

  /* ---------- badge builder ---------- */
  const range = $('[data-ds-range]');
  if (range) {
    const SH = { 'A+': ['brightgreen', 'oklch(74.2% 0.234 139.9)'], A: ['green', 'oklch(77.4% 0.197 125.8)'], B: ['yellowgreen', 'oklch(70.1% 0.146 110.5)'], C: ['yellow', 'oklch(78.4% 0.156 90.3)'], D: ['orange', 'oklch(72.8% 0.177 45.9)'], F: ['red', 'oklch(64.1% 0.169 32.7)'] };
    const gradeOf = (s) => (s >= 95 ? 'A+' : s >= 85 ? 'A' : s >= 75 ? 'B' : s >= 65 ? 'C' : s >= 50 ? 'D' : 'F');
    const shield = $('[data-ds-shield]'), val = $('[data-ds-shield-v]'), out = $('[data-ds-range-out]'), md = $('#ds-badge-md');
    const update = () => {
      const s = Math.max(0, Math.min(100, Math.round(Number(range.value) || 0)));
      const g = gradeOf(s), [name, color] = SH[g];
      if (val) val.textContent = String(s);
      if (shield) { shield.style.setProperty('--sh', color); shield.setAttribute('aria-label', 'Badge preview: Design Score ' + s); }
      if (out) out.textContent = s + ', grade ' + g;
      range.setAttribute('aria-valuetext', s + ', grade ' + g);
      if (md) md.textContent = `[![Design Score](https://img.shields.io/badge/Design%20Score-${s}-${name})](https://makkov-design.github.io/makkov-harness/score.html)`;
    };
    range.addEventListener('input', update);
    update();
  }
})();
