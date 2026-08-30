'use strict';
/* ============================================================
   components.js — مكوّنات HTML مشتركة قابلة لإعادة الاستخدام
   ============================================================ */

const badge = (map, key) => {
  const m = map[key] || { t: key, c: 'gray' };
  return `<span class="badge bg-${m.c}"><span class="bd"></span>${m.ic ? icon(m.ic, 11) : ''}${m.t}</span>`;
};

const accBadge = (s) => badge(ACC_STATUS, s);
const campBadge = (s) => badge(CAMP_STATUS, s);
const jobBadge = (s) => badge(JOB_STATUS, s);
const postBadge = (s) => badge(POST_STATUS, s);

function platformChip(code) {
  const p = PLATFORMS[code] || { name: code, color: '#666', short: '?' };
  return `<span class="platform-ic" style="background:${p.color}" title="${p.name}">${p.short}</span><span class="small muted">${p.name}</span>`;
}

function accAvatar(a, size = 38) {
  const color = AV_COLORS[a.id % AV_COLORS.length];
  return `<div class="acc-avatar" style="background:${color};width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px" aria-hidden="true">${esc((a.name || '؟')[0])}</div>`;
}

function accCell(a) {
  return `<div class="acc-cell">${accAvatar(a)}<div class="grow"><div class="cell-main truncate">${esc(a.name)}</div><div class="cell-sub num">${esc(a.handle || '')}</div></div></div>`;
}

function statCard(o) {
  const delta = o.delta != null
    ? `<span class="delta ${o.delta >= 0 ? 'up' : 'down'}">${icon(o.delta >= 0 ? 'arrow-up' : 'arrow-down', 11)}${Math.abs(o.delta)}٪</span>` : '';
  return `<div class="card stat-card hoverable">
    <div class="sc-top"><div class="sc-ico ${o.tone}">${icon(o.icon, 19)}</div>${delta}</div>
    <div class="sc-value num">${o.value}</div>
    <div class="sc-label">${o.label}</div>
    ${o.sub ? `<div class="tiny muted mt-1">${o.sub}</div>` : ''}
  </div>`;
}

function progressRow(pct, label) {
  return `${label ? `<div class="progress-label"><span>${label}</span><span class="num">${Math.round(pct)}٪</span></div>` : ''}
  <div class="progress"><div class="fill" style="width:${Math.min(100, pct)}%"></div></div>`;
}

function emptyState(iconName, title, sub, actionHtml = '') {
  return `<div class="empty">
    <div class="e-ico">${icon(iconName, 26)}</div>
    <div class="e-title">${title}</div>
    <div class="e-sub">${sub}</div>${actionHtml}
  </div>`;
}

/* Pagination بسيطة */
function paginate(rows, page, perPage = 10) {
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  page = Math.min(Math.max(1, page), pages);
  return { rows: rows.slice((page - 1) * perPage, page * perPage), page, pages, total: rows.length };
}
function pagerHtml(pg, fnName) {
  if (pg.pages <= 1) return '';
  let h = '<div class="flex mt-2" style="justify-content:center;gap:6px">';
  for (let i = 1; i <= pg.pages; i++) {
    h += `<button class="btn btn-xs ${i === pg.page ? 'btn-primary' : 'btn-ghost'}" onclick="${fnName}(${i})">${i}</button>`;
  }
  return h + '</div>';
}

function deltaFrom(series, key) {
  if (series.length < 14) return null;
  const a = series.slice(-7).reduce((s, x) => s + (x[key] || 0), 0);
  const b = series.slice(-14, -7).reduce((s, x) => s + (x[key] || 0), 0);
  if (!b) return null;
  return Math.round(((a - b) / b) * 100);
}
