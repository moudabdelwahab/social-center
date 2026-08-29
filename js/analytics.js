'use strict';
/* analytics.js — التحليلات مع فلاتر زمنية ومقارنة حملات */
(function () {
  const root = document.getElementById('analytics-root');
  if (!root) return;
  let days = 30;

  function slice() { return appState.series30.slice(-days); }
  function sum(rows, k) { return rows.reduce((s, r) => s + (r[k] || 0), 0); }

  function render() {
    const rows = slice();
    const reach = sum(rows, 'reach'), imp = sum(rows, 'impressions'), eng = sum(rows, 'engagement');
    const ok = sum(rows, 'success'), fail = sum(rows, 'failed');
    const pubs = appState.posts.filter(p => p.status === 'published').length;
    const camps = appState.campaigns.filter(c => c.jobsTotal > 0 || c.status === 'active');

    root.innerHTML = `
      <div class="analytics-filters">
        <div class="tabs">
          ${[[1, 'اليوم'], [7, 'آخر 7 أيام'], [30, 'آخر 30 يومًا']].map(([d, t]) =>
            `<button class="tab ${days === d ? 'active' : ''}" onclick="anDays(${d})">${t}</button>`).join('')}
        </div>
        <div class="grow"></div>
        <span class="small muted">${icon('info', 13)} تُحدَّث المقاييس مع كل عملية تنفيذ</span>
      </div>
      <div class="metric-grid">
        ${statCard({ icon: 'globe', tone: 'sc-brand', value: fmtNum(reach), label: 'الوصول', delta: 12 })}
        ${statCard({ icon: 'eye', tone: 'sc-purple', value: fmtNum(imp), label: 'المشاهدات', delta: 9 })}
        ${statCard({ icon: 'message', tone: 'sc-green', value: fmtNum(eng), label: 'التفاعل', delta: 17 })}
        ${statCard({ icon: 'send', tone: 'sc-cyan', value: fmtNum(pubs), label: 'منشورات منشورة' })}
        ${statCard({ icon: 'activity', tone: 'sc-amber', value: fmtNum(ok + fail), label: 'عمليات منفذة', sub: `معدل نجاح ${Math.round(ok / Math.max(1, ok + fail) * 100)}٪` })}
      </div>
      <div class="analytics-grid">
        <div class="card chart-card">
          <div class="chart-head"><h3>الوصول والمشاهدات</h3>
            <div class="chart-legend"><span><i style="background:#6d8dff"></i>الوصول</span><span><i style="background:#a78bfa"></i>المشاهدات</span></div></div>
          <div class="chart-holder" id="an-ch1"></div>
        </div>
        <div class="card chart-card">
          <div class="chart-head"><h3>التفاعل اليومي</h3></div>
          <div class="chart-holder" id="an-ch2"></div>
        </div>
      </div>
      <div class="section-head mt-3"><h2>${icon('chart', 18)} مقارنة الحملات</h2><span class="sh-sub">الوصول مقابل معدل النجاح</span></div>
      <div class="table-wrap cmp-table"><table class="tbl"><thead><tr>
        <th>الحملة</th><th>الحالة</th><th>الوصول</th><th></th><th>التفاعل</th><th>ناجحة</th><th>فاشلة</th><th>معدل النجاح</th>
      </tr></thead><tbody>
        ${camps.map(c => {
          const maxR = Math.max(...camps.map(x => x.reach), 1);
          const total = c.jobsOk + c.jobsFail;
          return `<tr>
            <td class="cell-main" style="min-width:180px">${esc(c.name)}</td>
            <td>${campBadge(c.status)}</td>
            <td class="num">${fmtNum(c.reach)}</td>
            <td style="width:22%"><div class="bar-bg"><div class="bar-fill" style="width:${Math.round(c.reach / maxR * 100)}%"></div></div></td>
            <td class="num">${fmtNum(c.engagement)}</td>
            <td class="num text-green">${c.jobsOk}</td>
            <td class="num text-red">${c.jobsFail}</td>
            <td class="num">${total ? Math.round(c.jobsOk / total * 100) + '٪' : '—'}</td>
          </tr>`;
        }).join('')}
      </tbody></table></div>
      <div class="section-head mt-3"><h2>${icon('send', 18)} أفضل المنشورات أداءً</h2></div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>المحتوى</th><th>الحملة</th><th>الوصول</th><th>التفاعل</th><th>معدل التفاعل</th></tr></thead><tbody>
        ${appState.posts.filter(p => p.reach > 0).sort((a, b) => b.reach - a.reach).slice(0, 5).map(p => {
          const c = appState.campaigns.find(x => x.id === p.campaignId);
          return `<tr><td style="max-width:320px">${esc(p.content.slice(0, 80))}…</td>
            <td class="small">${esc(c?.name || '—')}</td><td class="num">${fmtNum(p.reach)}</td>
            <td class="num">${fmtNum(p.engagement)}</td>
            <td><span class="badge bg-green num">${(p.engagement / p.reach * 100).toFixed(1)}٪</span></td></tr>`;
        }).join('')}
      </tbody></table></div>`;

    renderLineChart(document.getElementById('an-ch1'), rows, [
      { key: 'reach', label: 'الوصول', color: '#6d8dff' },
      { key: 'impressions', label: 'المشاهدات', color: '#a78bfa' }
    ]);
    renderBarChart(document.getElementById('an-ch2'), rows, [
      { key: 'engagement', label: 'التفاعل', color: '#2fbf8f' }
    ]);
  }
  window.anDays = (d) => { days = d; render(); };
  Bus.on('theme', () => setTimeout(render, 60));
  render();
})();
