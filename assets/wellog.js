/* pipelats well-log illustration (synthetic). A pulsed-EM style log with short/medium/long sondes, collars and
   anomaly zones; "model confidence" is derived from the anomalies. Illustration only, never client data.
   Signal model: v_k = sum_i A_i * exp(-t_k / (c * wall_i^2)). */
(function () {
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const smooth = (x) => x * x * (3 - 2 * x);
  const mulberry = (s) => () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

  const STEP = 0.1, N = 1000; // 100 m at 0.1 m
  const ZONES = [{ a: 14.6, b: 16.3, s: 0.21 }, { a: 31.2, b: 36.8, s: 0.34 }, { a: 47.4, b: 48.5, s: 0.12 }, { a: 61.0, b: 66.2, s: 0.27 }, { a: 83.5, b: 84.4, s: 0.17 }];
  const COLLARS = []; for (let d = 5.3; d < 100; d += 9.55) COLLARS.push(d);
  const GATES = { S: [2, 5, 8, 11, 14], M: [3, 7, 11, 15, 19, 23], L: [4, 10, 16, 22, 28, 34, 40] };
  const GAIN = [7, 3.4, 2.1]; // soft-clip gain per sonde keeps traces inside their lanes

  function synth() {
    const R = mulberry(31), depth = new Float32Array(N), sev = new Float32Array(N), collar = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const d = (depth[i] = i * STEP);
      for (const z of ZONES) sev[i] = Math.max(sev[i], z.s * smooth(clamp((d - z.a) / 0.45 + 0.5, 0, 1)) * smooth(clamp((z.b - d) / 0.45 + 0.5, 0, 1)) * (0.82 + 0.18 * Math.sin(d * 7.3)));
      for (const c of COLLARS) collar[i] = Math.max(collar[i], Math.exp(-Math.pow((d - c) / 0.22, 2)));
    }
    const gates = []; [['S', 17], ['M', 28], ['L', 40]].forEach(([g, n]) => { for (let k = 1; k <= n; k++) gates.push({ g, k, t: 0.0004 * Math.pow(1.095, gates.length) }); });
    const drift = new Float32Array(N); let dv = 0; for (let i = 0; i < N; i++) { dv = dv * 0.995 + (R() - 0.5) * 0.012; drift[i] = dv; }
    const series = gates.map((G, gi) => {
      const o = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const w1 = 0.62 + 0.55 * collar[i], w2 = 1 - sev[i] + 0.9 * collar[i];
        const v = Math.exp(-G.t / (0.0016 * w1 * w1)) + 2.2 * Math.exp(-G.t / (0.016 * w2 * w2)) + 0.0008;
        o[i] = Math.log10(v) + drift[i] * (0.4 + gi / 120) + (R() - 0.5) * (0.004 + gi * 0.0002);
      }
      return o;
    });
    const base = gates.map((G) => Math.log10(Math.exp(-G.t / (0.0016 * 0.62 * 0.62)) + 2.2 * Math.exp(-G.t / 0.016) + 0.0008));
    const gr = new Float32Array(N); let g = 0.5; for (let i = 0; i < N; i++) { g = clamp(g + (R() - 0.5) * 0.35, 0.05, 0.95); gr[i] = g * (collar[i] > 0.3 ? 1.5 : 1); }
    const conf = new Float32Array(N);
    for (let i = 0; i < N; i++) { conf[i] = clamp(sev[i] / 0.34, 0, 1) * 0.92 + (R() - 0.5) * 0.02; for (const c of [22.4, 54.9, 74.0]) conf[i] += 0.09 * Math.exp(-Math.pow((depth[i] - c) / 0.5, 2)); conf[i] = clamp(conf[i], 0, 1); }
    return { depth, gates, series, base, gr, conf };
  }
  const W = synth();

  // contiguous runs of confidence >= thr, small gaps merged, tiny runs dropped
  function intervals(thr) {
    const out = []; let s = -1;
    for (let i = 0; i <= N; i++) {
      const on = i < N && W.conf[i] >= thr;
      if (on && s < 0) s = i;
      if (!on && s >= 0) { let pk = 0; for (let j = s; j < i; j++) pk = Math.max(pk, W.conf[j]); const iv = { a: s * STEP, b: i * STEP, peak: pk }; const prev = out[out.length - 1]; if (prev && iv.a - prev.b < 0.8) { prev.b = iv.b; prev.peak = Math.max(prev.peak, pk); } else out.push(iv); s = -1; }
    }
    return out.filter((v) => v.b - v.a >= 0.3);
  }

  function mount(canvas, opt) {
    const o = Object.assign({ from: 10, windowM: 42, mode: 'model', thr: 0.3, reveal: 1, mreveal: 1 }, opt || {});
    const ctx = canvas.getContext('2d'); let w = 0, h = 0, dpr = 1, c = {}, hover = null, raf = 0;
    const cs = getComputedStyle(canvas);
    const probe = document.createElement('i'); probe.style.cssText = 'position:absolute;visibility:hidden'; canvas.parentNode.appendChild(probe);
    const col = (n, f) => { probe.style.color = `var(${n}, ${f})`; return getComputedStyle(probe).color; };
    const rgba = (s, a) => { const n = s.match(/[\d.]+/g); return `rgba(${n[0]},${n[1]},${n[2]},${a})`; };
    function size() { dpr = Math.min(devicePixelRatio || 1, 2); const r = canvas.getBoundingClientRect(); w = Math.round(r.width); h = Math.round(r.height); canvas.width = w * dpr; canvas.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }

    function draw() {
      c = { bg: col('--log-bg', '#080c10'), ink: col('--log-ink', '#e6edf3'), mute: col('--log-mute', '#6b7681'), grid: col('--log-grid', '#1b232b'), flag: col('--log-flag', '#c6f432'), base: col('--log-base', '#5bd6ff'), s: col('--log-s', '#8fa6bd'), m: col('--log-m', '#dfe7ee'), l: col('--log-l', '#b9c6d2'), font: cs.getPropertyValue('--font-mono').trim() || 'ui-monospace, Menlo, monospace' };
      ctx.fillStyle = c.bg; ctx.fillRect(0, 0, w, h);
      const narrow = w < 520, lanes = narrow ? { S: 2, M: 3, L: 3 } : { S: 4, M: 5, L: 6 };
      const fs = narrow ? 10 : clamp(Math.round(w / 52), 10, 12);
      const rulerW = 38, casingW = narrow ? 22 : 28, grW = narrow ? 34 : 42, modelW = narrow ? 70 : clamp(w * 0.13, 84, 120), headH = 26;
      const nL = lanes.S + lanes.M + lanes.L, laneW = (w - rulerW - casingW - grW - modelW) / nL, y0 = headH, plotH = h - headH;
      const d0 = o.from, d1 = o.from + o.windowM, Y = (d) => y0 + ((d - d0) / (d1 - d0)) * plotH;
      const i0 = Math.max(0, Math.floor(d0 / STEP) - 1), i1 = Math.min(N - 1, Math.ceil(d1 / STEP) + 1);
      const rD = d0 + (d1 - d0) * o.reveal, iR = Math.min(i1, Math.floor(rD / STEP)), mD = d0 + (d1 - d0) * Math.min(o.mreveal, o.reveal);
      ctx.font = `${fs}px ${c.font}`; ctx.textBaseline = 'middle';

      ctx.strokeStyle = c.grid; ctx.lineWidth = 1; ctx.fillStyle = c.mute; ctx.textAlign = 'right';
      for (let d = Math.ceil(d0 / 5) * 5; d <= d1; d += 5) { const y = Math.round(Y(d)) + 0.5; ctx.beginPath(); ctx.moveTo(rulerW - 6, y); ctx.lineTo(w, y); ctx.stroke(); ctx.fillText(String(d), rulerW - 10, y); }
      // casing schematic
      const cx = rulerW + casingW / 2; ctx.strokeStyle = c.mute; ctx.lineWidth = 1.2;
      for (const dx of [-casingW / 2 + 3, -4, 4, casingW / 2 - 3]) { ctx.beginPath(); ctx.moveTo(cx + dx, y0); ctx.lineTo(cx + dx, y0 + plotH); ctx.stroke(); }
      ctx.fillStyle = c.ink; for (const cl of COLLARS) if (cl > d0 - 1 && cl < d1 + 1) ctx.fillRect(rulerW + 1, Y(cl) - 1.5, casingW - 2, 3);
      // gamma / CCL track
      const gx = rulerW + casingW; ctx.save(); ctx.beginPath(); ctx.rect(gx, y0, grW, plotH); ctx.clip(); ctx.strokeStyle = c.mute; ctx.lineWidth = 0.9; ctx.beginPath();
      for (let i = i0; i <= iR; i++) { const x = gx + 4 + W.gr[i] * (grW - 8), y = Y(W.depth[i]); i === i0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke(); ctx.restore();

      // sonde lanes
      let lx = gx + grW;
      [['S', 'Short', c.s], ['M', 'Medium', c.m], ['L', 'Long', c.l]].forEach(([grp, label, stroke], gi) => {
        const idx = GATES[grp].slice(0, lanes[grp]).map((_, i, a) => GATES[grp][Math.floor((i * GATES[grp].length) / lanes[grp])]); const gw = laneW * idx.length;
        ctx.fillStyle = c.mute; ctx.textAlign = 'center'; ctx.font = `600 ${fs - 1}px ${c.font}`; ctx.fillText(label, lx + gw / 2, 12); ctx.font = `${fs}px ${c.font}`;
        ctx.strokeStyle = c.grid; ctx.beginPath(); ctx.moveTo(lx + 0.5, 4); ctx.lineTo(lx + 0.5, h); ctx.stroke();
        idx.forEach((k, li) => {
          const gi2 = W.gates.findIndex((g) => g.g === grp && g.k === k), x0 = lx + li * laneW, cxl = x0 + laneW / 2, m = W.series[gi2], b = W.base[gi2];
          ctx.save(); ctx.beginPath(); ctx.rect(x0, y0, laneW, plotH); ctx.clip();
          if (o.mode !== 'raw') { ctx.strokeStyle = rgba(c.base, 0.75); ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(cxl, y0); ctx.lineTo(cxl, y0 + plotH); ctx.stroke(); ctx.setLineDash([]); }
          ctx.strokeStyle = stroke; ctx.lineWidth = 1.05; ctx.beginPath();
          for (let i = i0; i <= iR; i++) { const x = cxl + Math.tanh((m[i] - b) * GAIN[gi]) * laneW * 0.47, y = Y(W.depth[i]); i === i0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
          ctx.stroke(); ctx.restore();
        });
        lx += gw;
      });

      // model track: confidence curve + flagged intervals
      const mx = w - modelW; ctx.strokeStyle = c.grid; ctx.beginPath(); ctx.moveTo(mx + 0.5, 4); ctx.lineTo(mx + 0.5, h); ctx.stroke();
      ctx.fillStyle = c.mute; ctx.textAlign = 'center'; ctx.font = `600 ${fs - 1}px ${c.font}`; ctx.fillText(o.mode === 'confirmed' ? 'Verdict' : 'Model', mx + modelW / 2, 12); ctx.font = `${fs}px ${c.font}`;
      if (o.mode === 'model' || o.mode === 'confirmed') {
        const iM = Math.min(i1, Math.floor(mD / STEP)); ctx.save(); ctx.beginPath(); ctx.rect(mx, y0, modelW, plotH); ctx.clip();
        const cxm = (i) => mx + 6 + W.conf[i] * (modelW - 14);
        ctx.beginPath(); ctx.moveTo(mx + 6, Y(W.depth[i0])); for (let i = i0; i <= iM; i++) ctx.lineTo(cxm(i), Y(W.depth[i])); ctx.lineTo(mx + 6, Y(W.depth[iM])); ctx.closePath(); ctx.fillStyle = rgba(c.flag, 0.1); ctx.fill();
        ctx.strokeStyle = c.flag; ctx.lineWidth = 1.3; ctx.beginPath(); for (let i = i0; i <= iM; i++) { const x = cxm(i), y = Y(W.depth[i]); i === i0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); } ctx.stroke();
        ctx.strokeStyle = rgba(c.flag, 0.5); ctx.setLineDash([2, 3]); const tx = mx + 6 + o.thr * (modelW - 14); ctx.beginPath(); ctx.moveTo(tx, y0); ctx.lineTo(tx, y0 + plotH); ctx.stroke(); ctx.setLineDash([]);
        for (const v of intervals(o.thr)) {
          if (v.b < d0 || v.a > d1 || v.a > mD) continue;
          const ya = Y(v.a - 0.2), yb = Y(Math.min(v.b + 0.2, mD)), ok = o.mode === 'confirmed' && v.peak > 0.5;
          ctx.fillStyle = rgba(ok ? c.ink : c.flag, ok ? 0.1 : 0.16); ctx.fillRect(mx + 3, ya, modelW - 6, yb - ya);
          ctx.strokeStyle = ok ? c.ink : c.flag; ctx.lineWidth = 1.2; ctx.strokeRect(mx + 3.5, ya, modelW - 7, yb - ya);
          ctx.fillStyle = ok ? c.ink : c.flag; ctx.textAlign = 'right'; ctx.font = `600 ${fs}px ${c.font}`; ctx.fillText(ok ? '✓ ' + v.peak.toFixed(2) : v.peak.toFixed(2), mx + modelW - 7, ya + fs);
        }
        ctx.restore();
      }
      // scan head while revealing
      if (o.reveal < 1 || o.mreveal < 1) {
        const y = Y(o.reveal < 1 ? rD : mD), g = ctx.createLinearGradient(0, y - 46, 0, y); g.addColorStop(0, rgba(c.flag, 0)); g.addColorStop(1, rgba(c.flag, 0.22));
        ctx.fillStyle = g; ctx.fillRect(rulerW, y - 46, w - rulerW, 46); ctx.strokeStyle = c.flag; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(rulerW - 6, y); ctx.lineTo(w, y); ctx.stroke();
      }
      if (hover != null) {
        const d = d0 + ((hover - y0) / plotH) * (d1 - d0);
        if (d >= d0 && d <= rD) { ctx.strokeStyle = rgba(c.ink, 0.5); ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(rulerW - 6, hover + 0.5); ctx.lineTo(w, hover + 0.5); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = c.ink; ctx.fillRect(2, hover - 8, rulerW - 8, 16); ctx.fillStyle = c.bg; ctx.textAlign = 'center'; ctx.fillText(d.toFixed(1), rulerW / 2 - 2, hover); }
      }
    }
    const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
    const api = { set(p) { Object.assign(o, p); redraw(); }, resize() { size(); redraw(); }, state: o, intervals, yAt: (d) => 26 + ((d - o.from) / o.windowM) * (h - 26) };
    canvas.addEventListener('pointermove', (e) => { hover = e.clientY - canvas.getBoundingClientRect().top; redraw(); });
    canvas.addEventListener('pointerleave', () => { hover = null; redraw(); });
    new ResizeObserver(() => api.resize()).observe(canvas); size(); draw();
    return api;
  }
  window.PipelatsLog = { mount, intervals };
})();
