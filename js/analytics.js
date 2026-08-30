'use strict';
/* analytics.js — تحليلات من analytics_daily الحقيقية — لا أرقام وهمية */
(async function () {
  const root = document.getElementById('analytics-root');
  if (!root) return;
  await new Promise(r => document.addEventListener('scc:ready', r, { once: true }));
  let days = 30;

  async function render() {
    root.innerHTML = '<div class="skeleton" style="min-height:320px"></div>';
    let rows, camps, jobs;
    try { [rows, camps, jobs] = await Promise.all([DB.analytics.daily(days), DB.campaigns.list(), DB.jobs.list()]); }
    catch (e) { toast(e.message, { type: 'err' }); return; }
    const sum = (k) => rows.reduce((s, r) => s + (r[k] || 0), 0);
    const reach = sum('reach'), imp = sum('impressions'), eng = sum('engagement');
    const ok = jobs.filter(j => j.status === 'success').length, fail = jobs.filter(j => j.status === 'failed').length;
    const noData = !rows.length;

    root.innerHTML = `
      <div class="analytics-filters">
        <div class="tabs">
          ${[[7, 'آخر 7 أيام'], [30, 'آخر 30 يومًا'], [90, 'آخر 90 يومًا']].map(([d, t]) =>
            `<button class="tab ${days === d ? 'active' : ''}" onclick="anDays(${d})">${t}</button>`).join('')}
        </div>
      </div>
      ${noData ? emptyState('chart', 'لا توجد بيانات كافية لعرض هذا التقرير', 'ستتراكم المقاييس هنا بعد أن ينفّذ مزوّد النشر العمليات ويجمع النتائج — التكامل مع Meta قيد الإعداد') : `
      <div class="metric-grid">
        ${statCard({ icon: 'globe', tone: 'sc-brand', value: fmtNum(reach), label: 'الوصول' })}
        ${statCard({ icon: 'eye', tone: 'sc-purple', value: fmtNum(imp), label: 'المشاهدات' })}
        ${statCard({ icon: 'message', tone: 'sc-green', value: fmtNum(eng), label: 'التفاعل' })}
        ${statCard({ icon: 'check-circle', tone: 'sc-cyan', value: fmtNum(ok), label: 'عمليات ناجحة' })}
        ${statCard({ icon: 'activity', tone: 'sc-amber', value: ok + fail ? Math.round(ok / (ok + fail) * 100) + '٪' : '—', label: 'معدل النجاح' })}
      </div>
      <div class="analytics-grid">
        <div class="card chart-card"><div class="chart-head"><h3>الوصول والمشاهدات</h3>
          <div class="chart-legend"><span><i style="background:#7d83e0"></i>الوصول</span><span><i style="background:#9a8fc7"></i>المشاهدات</span></div></div>
          <div class="chart-holder" id="an-ch1"></div></div>
        <div class="card chart-card"><div class="chart-head"><h3>التفاعل اليومي</h3></div>
          <div class="chart-holder" id="an-ch2"></div></div>
      </div>`}
      <div class="section-head mt-3"><h2>${icon('chart', 18)} مقارنة الحملات</h2><span class="sh-sub">حسب العمليات المنفذة فعليًا</span></div>
      <div class="table-wrap cmp-table"><table class="tbl"><thead><tr>
        <th>الحملة</th><th>الحالة</th><th>الأصول</th><th>المهام</th><th>ناجحة</th><th>فاشلة</th><th>معدل النجاح</th>
      </tr></thead><tbody>
        ${camps.map(c => {
          const total = c.jobsOk + c.jobsFail;
          return `<tr><td class="cell-main" style="min-width:180px"><a href="campaign-details.html?id=${c.id}">${esc(c.name)}</a></td>
            <td>${campBadge(c.status)}</td><td class="num">${c.accountIds.length}</td><td class="num">${c.jobsTotal}</td>
            <td class="num text-green">${c.jobsOk}</td><td class="num text-red">${c.jobsFail}</td>
            <td class="num">${total ? Math.round(c.jobsOk / total * 100) + '٪' : '—'}</td></tr>`;
        }).join('') || `<tr><td colspan="7" class="empty">لا حملات بعد</td></tr>`}
      </tbody></table></div>`;
    if (!noData) {
      renderLineChart(document.getElementById('an-ch1'), rows, [
        { key: 'reach', label: 'الوصول', color: '#7d83e0' }, { key: 'impressions', label: 'المشاهدات', color: '#9a8fc7' }]);
      renderBarChart(document.getElementById('an-ch2'), rows, [{ key: 'engagement', label: 'التفاعل', color: '#4f9d7e' }]);
    }
  }
  window.anDays = (d) => { days = d; render(); };
  Bus.on('theme', () => setTimeout(render, 60));
  render();
})();
