'use strict';
/* dashboard.js — لوحة التحكم: كل الأرقام من Supabase، بدون بيانات وهمية */
(async function () {
  const root = document.getElementById('dash-root');
  if (!root) return;
  root.innerHTML = '<div class="stats-grid">' + '<div class="skeleton skeleton-card"></div>'.repeat(8) + '</div>';
  await new Promise(r => document.addEventListener('scc:ready', r, { once: true }));

  const [accs, camps, jobs, posts, notifs, series] = await Promise.all([
    DB.accounts.list(), DB.campaigns.list(), DB.jobs.list(), DB.posts.list(),
    DB.notifications.list(), DB.analytics.daily(30)
  ]);

  const byStatus = (arr, k) => arr.filter(x => x.status === k).length;
  const totReach = series.reduce((s, r) => s + r.reach, 0);
  const totEng = series.reduce((s, r) => s + r.engagement, 0);
  const jobsOk = byStatus(jobs, 'success'), jobsFail = byStatus(jobs, 'failed');
  const needFix = accs.filter(a => a.status !== 'connected').length;

  root.innerHTML = `
    <div class="stats-grid">
      ${statCard({ icon: 'link', tone: 'sc-brand', value: fmtNum(accs.length), label: 'الحسابات المرتبطة', sub: `${byStatus(accs, 'connected')} متصلة` })}
      ${statCard({ icon: 'alert', tone: 'sc-amber', value: fmtNum(needFix), label: 'تحتاج انتباهًا', sub: needFix ? 'إعادة اتصال أو خطأ' : 'كل الحسابات سليمة' })}
      ${statCard({ icon: 'target', tone: 'sc-green', value: fmtNum(byStatus(camps, 'active')), label: 'حملات نشطة', sub: `${byStatus(camps, 'scheduled')} مجدولة` })}
      ${statCard({ icon: 'calendar', tone: 'sc-purple', value: fmtNum(byStatus(posts, 'scheduled')), label: 'منشورات مجدولة' })}
      ${statCard({ icon: 'check-circle', tone: 'sc-cyan', value: fmtNum(jobsOk), label: 'عمليات ناجحة' })}
      ${statCard({ icon: 'x', tone: 'sc-red', value: fmtNum(jobsFail), label: 'عمليات فاشلة' })}
      ${statCard({ icon: 'globe', tone: 'sc-brand', value: series.length ? fmtNum(totReach) : '—', label: 'إجمالي الوصول', sub: series.length ? 'آخر 30 يومًا' : 'لا بيانات بعد' })}
      ${statCard({ icon: 'message', tone: 'sc-green', value: series.length ? fmtNum(totEng) : '—', label: 'إجمالي التفاعل', sub: series.length ? 'آخر 30 يومًا' : 'لا بيانات بعد' })}
    </div>
    <div class="dash-grid">
      <div>
        <div class="card chart-card">
          <div class="chart-head"><div><h3>أداء الوصول والتفاعل</h3><div class="small muted">آخر 30 يومًا</div></div>
            <div class="chart-legend"><span><i style="background:var(--brand)"></i>الوصول</span><span><i style="background:var(--green)"></i>التفاعل</span></div></div>
          <div class="chart-holder" id="ch-main"></div>
        </div>
        <div class="card chart-card mt-2">
          <div class="chart-head"><div><h3>العمليات المنفَّذة</h3><div class="small muted">ناجحة مقابل فاشلة يوميًا</div></div>
            <div class="chart-legend"><span><i style="background:var(--cyan)"></i>ناجحة</span><span><i style="background:var(--red)"></i>فاشلة</span></div></div>
          <div class="chart-holder" id="ch-jobs"></div>
        </div>
      </div>
      <div>
        <div class="card"><div class="card-title mb-2">${icon('users', 17)} توزيع حالة الحسابات</div>
          ${accs.length ? `<div class="donut-wrap"><div id="ch-donut"></div><div class="donut-legend grow" id="donut-legend"></div></div>`
            : `<div class="empty" style="padding:26px">${icon('users', 24)}<div class="e-sub mt-1">لم تتم إضافة حسابات بعد</div></div>`}
        </div>
        <div class="card mt-2"><div class="between mb-2"><div class="card-title">${icon('rocket', 17)} حملات نشطة</div><a href="campaigns.html?status=active" class="small">عرض الكل</a></div>
          <div class="mini-list">
            ${camps.filter(c => c.status === 'active').slice(0, 3).map(c => `
              <div class="mini-row clickable" onclick="location.href='campaign-details.html?id=${c.id}'">
                <div class="grow"><div class="lr-title truncate">${esc(c.name)}</div>
                <div class="mt-1">${progressRow(c.jobsTotal ? Math.round(c.jobsOk / c.jobsTotal * 100) : 0)}</div></div>
              </div>`).join('') || `<div class="muted small" style="padding:8px 0">لا حملات نشطة — <a href="campaigns.html">أنشئ حملة</a></div>`}
          </div></div>
        <div class="card mt-2"><div class="between mb-2"><div class="card-title">${icon('bell', 17)} آخر التنبيهات</div><a href="notifications.html" class="small">الكل</a></div>
          <div class="mini-list">
            ${notifs.slice(0, 4).map(n => `
              <div class="mini-row">${!n.read_at ? '<span class="unread-dot" style="margin-top:6px"></span>' : '<span style="width:8px"></span>'}
                <div class="grow"><div class="lr-title">${esc(n.title)}</div><div class="lr-time">${timeAgo(n.created_at)}</div></div></div>`).join('')
              || '<div class="muted small" style="padding:8px 0">لا تنبيهات بعد</div>'}
          </div></div>
      </div>
    </div>`;

  if (series.length) {
    renderLineChart(document.getElementById('ch-main'), series, [
      { key: 'reach', label: 'الوصول', color: '#7d83e0' }, { key: 'engagement', label: 'التفاعل', color: '#4f9d7e' }]);
    renderBarChart(document.getElementById('ch-jobs'), series, [
      { key: 'jobs_success', label: 'ناجحة', color: '#5f9aa8' }, { key: 'jobs_failed', label: 'فاشلة', color: '#c96a72' }]);
  } else {
    document.getElementById('ch-main').innerHTML = '<div class="empty" style="direction:rtl;padding:36px"><div class="e-sub">لا توجد بيانات كافية لعرض هذا التقرير — ستظهر المقاييس بعد تنفيذ أولى العمليات</div></div>';
    document.getElementById('ch-jobs').innerHTML = '<div class="empty" style="direction:rtl;padding:36px"><div class="e-sub">لا عمليات منفذة بعد</div></div>';
  }
  if (accs.length) {
    const parts = Object.keys(ACC_STATUS).map(k => ({
      label: ACC_STATUS[k].t, value: byStatus(accs, k),
      color: { connected: '#4f9d7e', reconnect: '#c9964a', error: '#c96a72', paused: '#8a8f9c' }[k]
    })).filter(p => p.value);
    renderDonut(document.getElementById('ch-donut'), parts);
    document.getElementById('donut-legend').innerHTML = parts.map(p =>
      `<div class="dl-row"><i style="background:${p.color}"></i>${p.label}<span class="dl-v num">${p.value}</span></div>`).join('');
  }
})();
