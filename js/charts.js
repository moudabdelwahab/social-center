'use strict';
/* ============================================================
   charts.js — رسوم SVG خالصة (بدون أي مكتبة Charts)
   Line (منطقة) · Bars مجمّعة · Donut — مع Tooltips وحركة خفيفة
   ============================================================ */

const ChartTip = (() => {
  let el = null;
  function ensure() {
    if (!el) { el = document.createElement('div'); el.className = 'chart-tip'; document.body.appendChild(el); }
    return el;
  }
  return {
    show(html, x, y) { const t = ensure(); t.innerHTML = html; t.style.opacity = '1'; t.style.left = x + 'px'; t.style.top = (y - 12) + 'px'; t.style.transform = 'translate(-50%,-100%)'; },
    hide() { if (el) el.style.opacity = '0'; }
  };
})();

function svgEl(tag, attrs = {}) {
  const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

/** مخطط خطي/منطقة بسلسلتين مع Tooltip تفاعلي */
function renderLineChart(container, series, defs) {
  // defs: [{key,label,color}] — container dir=ltr
  container.innerHTML = '';
  const W = 720, H = 250, P = { t: 14, r: 12, b: 26, l: 46 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const max = Math.max(10, ...series.flatMap((s) => defs.map((d) => s[d.key] || 0)));
  const niceMax = Math.ceil(max / 5000) * 5000;
  const x = (i) => P.l + (i / Math.max(1, series.length - 1)) * iw;
  const y = (v) => P.t + ih - (v / niceMax) * ih;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': 'مخطط بياني' });
  const gid = 'g' + Math.random().toString(36).slice(2, 8);
  const gDefs = svgEl('defs');
  defs.forEach((d, i) => {
    const lg = svgEl('linearGradient', { id: `${gid}${i}`, x1: 0, y1: 0, x2: 0, y2: 1 });
    lg.append(svgEl('stop', { offset: '0%', 'stop-color': d.color, 'stop-opacity': .28 }),
              svgEl('stop', { offset: '100%', 'stop-color': d.color, 'stop-opacity': 0 }));
    gDefs.appendChild(lg);
  });
  svg.appendChild(gDefs);

  // شبكة + محاور
  for (let i = 0; i <= 4; i++) {
    const gy = P.t + (ih / 4) * i;
    svg.appendChild(svgEl('line', { x1: P.l, y1: gy, x2: W - P.r, y2: gy, stroke: 'var(--chart-grid)', 'stroke-width': 1 }));
    const lbl = svgEl('text', { x: P.l - 8, y: gy + 4, 'text-anchor': 'end', 'font-size': 10, fill: 'var(--muted-2)' });
    lbl.textContent = fmtNum(niceMax - (niceMax / 4) * i);
    svg.appendChild(lbl);
  }
  const step = Math.ceil(series.length / 6);
  series.forEach((s, i) => {
    if (i % step) return;
    const t = svgEl('text', { x: x(i), y: H - 8, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--muted-2)' });
    t.textContent = s.date.slice(8, 10) + '/' + s.date.slice(5, 7);
    svg.appendChild(t);
  });

  // المسارات
  const paths = [];
  defs.forEach((d, i) => {
    const pts = series.map((s, j) => [x(j), y(s[d.key] || 0)]);
    const line = pts.map((p, j) => (j ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const area = line + ` L${x(series.length - 1)} ${P.t + ih} L${P.l} ${P.t + ih} Z`;
    const a = svgEl('path', { d: area, fill: `url(#${gid}${i})` });
    const p = svgEl('path', { d: line, fill: 'none', stroke: d.color, 'stroke-width': 2.2, 'stroke-linecap': 'round' });
    const len = 1600;
    p.style.strokeDasharray = len; p.style.strokeDashoffset = len;
    p.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.22,.8,.3,1)';
    svg.append(a, p);
    requestAnimationFrame(() => requestAnimationFrame(() => { p.style.strokeDashoffset = 0; }));
    paths.push(p);
  });

  // Tooltip tracker
  const tracker = svgEl('line', { y1: P.t, y2: P.t + ih, stroke: 'var(--brand)', 'stroke-width': 1, 'stroke-dasharray': '3 3', opacity: 0 });
  svg.appendChild(tracker);
  svg.addEventListener('mousemove', (ev) => {
    const rect = svg.getBoundingClientRect();
    const mx = (ev.clientX - rect.left) * (W / rect.width);
    const i = Math.round(((mx - P.l) / iw) * (series.length - 1));
    if (i < 0 || i >= series.length) return;
    tracker.setAttribute('x1', x(i)); tracker.setAttribute('x2', x(i)); tracker.setAttribute('opacity', 1);
    const s = series[i];
    ChartTip.show(
      `<b>${s.date}</b><br>` + defs.map((d) => `<span style="color:${d.color}">●</span> ${d.label}: <b class="num">${fmtFull(s[d.key])}</b>`).join('<br>'),
      ev.clientX, ev.clientY
    );
  });
  svg.addEventListener('mouseleave', () => { tracker.setAttribute('opacity', 0); ChartTip.hide(); });

  container.appendChild(svg);
}

/** أعمدة مجمّعة (سلسلتان) */
function renderBarChart(container, series, defs) {
  container.innerHTML = '';
  const W = 720, H = 230, P = { t: 14, r: 10, b: 26, l: 42 };
  const iw = W - P.l - P.r, ih = H - P.t - P.b;
  const max = Math.max(10, ...series.flatMap((s) => defs.map((d) => s[d.key] || 0)));
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}` });
  for (let i = 0; i <= 4; i++) {
    const gy = P.t + (ih / 4) * i;
    svg.appendChild(svgEl('line', { x1: P.l, y1: gy, x2: W - P.r, y2: gy, stroke: 'var(--chart-grid)' }));
    const lbl = svgEl('text', { x: P.l - 8, y: gy + 4, 'text-anchor': 'end', 'font-size': 10, fill: 'var(--muted-2)' });
    lbl.textContent = fmtNum(max - (max / 4) * i);
    svg.appendChild(lbl);
  }
  const bw = iw / series.length;
  series.forEach((s, i) => {
    defs.forEach((d, k) => {
      const v = s[d.key] || 0, bh = (v / max) * ih;
      const r = svgEl('rect', {
        x: P.l + i * bw + 3 + k * (bw - 6) / defs.length,
        y: P.t + ih - bh, width: Math.max(3, (bw - 6) / defs.length - 2),
        height: Math.max(2, bh), rx: 3, fill: d.color, opacity: .92
      });
      r.style.transformOrigin = `0 ${P.t + ih}px`; r.style.transform = 'scaleY(0)';
      r.style.transition = `transform .5s ${i * 22}ms cubic-bezier(.22,.8,.3,1)`;
      requestAnimationFrame(() => requestAnimationFrame(() => r.style.transform = 'scaleY(1)'));
      r.addEventListener('mousemove', (ev) => ChartTip.show(`<b>${s.date}</b><br>${d.label}: <b class="num">${fmtFull(v)}</b>`, ev.clientX, ev.clientY));
      r.addEventListener('mouseleave', () => ChartTip.hide());
      svg.appendChild(r);
    });
    if (i % Math.ceil(series.length / 6) === 0) {
      const t = svgEl('text', { x: P.l + i * bw + bw / 2, y: H - 8, 'text-anchor': 'middle', 'font-size': 10, fill: 'var(--muted-2)' });
      t.textContent = s.date.slice(8, 10) + '/' + s.date.slice(5, 7);
      svg.appendChild(t);
    }
  });
  container.appendChild(svg);
}

/** Donut لتوزيع الحالات */
function renderDonut(container, parts, size = 170) {
  // parts: [{label, value, color}]
  container.innerHTML = '';
  const R = 62, C = 2 * Math.PI * R, total = Math.max(1, parts.reduce((s, p) => s + p.value, 0));
  const svg = svgEl('svg', { viewBox: '0 0 170 170', style: `width:${size}px;height:${size}px` });
  let acc = 0;
  parts.forEach((p) => {
    const frac = p.value / total;
    const seg = svgEl('circle', {
      cx: 85, cy: 85, r: R, fill: 'none', stroke: p.color, 'stroke-width': 17,
      'stroke-dasharray': `0 ${C}`, 'stroke-dashoffset': C * (0.25 - acc), 'stroke-linecap': 'butt'
    });
    seg.style.transition = 'stroke-dasharray 1s cubic-bezier(.22,.8,.3,1)';
    svg.appendChild(seg);
    requestAnimationFrame(() => requestAnimationFrame(() => seg.setAttribute('stroke-dasharray', `${Math.max(0, frac * C - 2)} ${C}`)));
    acc += frac;
  });
  const t1 = svgEl('text', { x: 85, y: 80, 'text-anchor': 'middle', 'font-size': 22, 'font-weight': 800, fill: 'var(--text)' });
  t1.textContent = fmtFull(total);
  const t2 = svgEl('text', { x: 85, y: 100, 'text-anchor': 'middle', 'font-size': 10.5, fill: 'var(--muted)' });
  t2.textContent = 'حسابًا';
  svg.append(t1, t2);
  container.appendChild(svg);
}

/** حلقة تقدم دائرية */
function ringSVG(pct, size = 64) {
  const R = 26, C = 2 * Math.PI * R;
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 64 64">
    <defs><linearGradient id="ringGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="var(--brand)"/><stop offset="100%" stop-color="var(--brand-2)"/>
    </linearGradient></defs>
    <circle class="track" cx="32" cy="32" r="${R}" fill="none" stroke-width="6"/>
    <circle class="val" cx="32" cy="32" r="${R}" fill="none" stroke-width="6"
      stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}"/>
    <text x="32" y="37" text-anchor="middle" font-size="13" font-weight="800" fill="var(--text)" transform="rotate(90 32 32)" class="num">${Math.round(pct)}٪</text>
  </svg>`;
}
