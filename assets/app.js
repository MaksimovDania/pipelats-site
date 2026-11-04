/* pipelats draft site: vanilla, no build. */
(function () {
  const root = document.documentElement; root.classList.add('js');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (s, c = document) => c.querySelector(s), $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const ease = (k) => 1 - Math.pow(1 - k, 3);
  const logs = [];
  // QA only, never on a public host
  if (new URLSearchParams(location.search).has('review') && /^(|localhost|127\.0\.0\.1)$/.test(location.hostname)) root.classList.add('review');

  /* draft-only palette switch (A sky / B midnight); the log canvases re-read their colours */
  const setTheme = (t) => {
    root.dataset.theme = t; try { localStorage.setItem('pl-theme', t); } catch (e) {}
    $$('.theme button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === t)));
    logs.forEach((l) => l.set({}));
  };
  $$('.theme button').forEach((b) => b.addEventListener('click', () => setTheme(b.dataset.t)));
  $$('.theme button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.t === root.dataset.theme)));

  /* reveal on scroll */
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.06 });
  $$('.rv').forEach((el) => io.observe(el));

  /* count-up (final value is already in the markup) */
  const cio = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return; cio.unobserve(e.target); if (reduce) return;
    const el = e.target, to = +el.dataset.count, t0 = performance.now();
    (function tick(t) { const k = Math.min(1, (t - t0) / 1400); el.textContent = Math.round(to * ease(k)); if (k < 1) requestAnimationFrame(tick); })(t0);
  }), { threshold: 0.6 });
  $$('[data-count]').forEach((el) => cio.observe(el));

  /* nav state */
  const links = $$('.nav__links a');
  const sio = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) links.forEach((a) => a.setAttribute('aria-current', String(a.getAttribute('href') === '#' + e.target.id))); }), { rootMargin: '-45% 0px -50% 0px' });
  $$('main section[id]').forEach((s) => sio.observe(s));

  /* what we do: a packet walks the flow and each step lights up; click any step to jump to it */
  const fx = $('#fx');
  if (fx) {
    const els = $$('.nd, .sl', fx), nodes = $$('.nd', fx), n = els.length;
    const isNode = (e) => e.classList.contains('nd'), shown = (e) => e.offsetParent !== null;
    let i = 0, trail = [], timer = 0, seen = false;
    const paint = () => {
      els.forEach((e, k) => { e.classList.toggle('cur', k === i); e.classList.toggle('on', !isNode(e) && k !== i && trail.includes(k)); });
      if (!isNode(els[i])) return;
      $('.fx__log .t').textContent = els[i].dataset.t; $('.fx__log .d').textContent = els[i].dataset.d;
    };
    const go = (to) => { trail = to > i ? [...trail, i].slice(-3) : []; i = to; paint(); };
    const next = () => {
      let to = i; do { to = (to + 1) % n; } while (!shown(els[to]));
      go(to); timer = setTimeout(next, isNode(els[i]) ? 1800 : 170);
    };
    const play = (ms) => { clearTimeout(timer); if (!reduce && seen) timer = setTimeout(next, ms); };
    nodes.forEach((nd) => nd.addEventListener('click', () => { trail = []; i = els.indexOf(nd); paint(); play(4500); }));
    paint();
    new IntersectionObserver((es) => { seen = es[0].isIntersecting; if (seen) play(700); else clearTimeout(timer); }, { threshold: 0.25 }).observe(fx.parentElement);
  }

  if (!window.PipelatsLog) return;
  const tween = (api, key, to, ms) => { if (reduce) return api.set({ [key]: to }); const t0 = performance.now(); (function tick(t) { const k = Math.min(1, (t - t0) / ms); api.set({ [key]: to * ease(k) }); if (k < 1) requestAnimationFrame(tick); })(t0); };

  /* case study: four-step walkthrough on the same illustration */
  const cc = $('#caseLog');
  if (cc) {
    const STEPS = [{ mode: 'raw' }, { mode: 'baseline' }, { mode: 'model' }, { mode: 'confirmed' }];
    const log = PipelatsLog.mount(cc, { from: 28, windowM: 42, mode: 'raw', thr: 0.3, reveal: reduce ? 1 : 0 });
    logs.push(log);
    const steps = $$('.csteps li'), pin = $('.casepin'), stick = $('.casepin__stick');
    let cur = -1;
    const pinned = () => getComputedStyle(stick).position === 'sticky';
    const span = () => pin.offsetHeight - innerHeight;
    const stepNow = () => Math.min(3, Math.max(0, Math.floor((-pin.getBoundingClientRect().top / span()) * 4)));
    const select = (i) => {
      cur = i;
      steps.forEach((li, k) => li.classList.toggle('on', k === i));
      log.set({ mode: STEPS[i].mode });
      if (i === 0) { log.set({ reveal: 0, mreveal: 1 }); tween(log, 'reveal', 1, 2200); }
      if (i === 2) { log.set({ reveal: 1, mreveal: 0 }); tween(log, 'mreveal', 1, 1800); }
      if (i === 1 || i === 3) log.set({ reveal: 1, mreveal: 1 });
    };
    /* while the screen is pinned a click scrolls to that step, so the scroll and the picture never disagree */
    steps.forEach((li, k) => $('button', li).addEventListener('click', () => {
      if (!pinned()) return select(k);
      scrollTo({ top: pin.getBoundingClientRect().top + scrollY + ((k + 0.5) / 4) * span(), behavior: 'instant' });
    }));
    addEventListener('scroll', () => requestAnimationFrame(() => { if (!pinned()) return; const i = stepNow(); if (cur >= 0 && i !== cur) select(i); }), { passive: true });
    const co = new IntersectionObserver((es) => { if (es[0].isIntersecting) { co.disconnect(); select(pinned() ? stepNow() : 0); } }, { threshold: 0.35 }); co.observe(cc);
  }
})();
