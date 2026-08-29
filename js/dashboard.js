'use strict';
/* dashboard.js — لوحة التحكم الرئيسية */
(function () {
  const root = document.getElementById('dash-root');
  if (!root) return;
  const s = appState;
  const accs = s.accounts, camps = s.campaigns, jobs = s.jobs, posts = s.posts;

  const tot = {
    connected: accs.filter(a => a.status === 'connected').length,
    needFix: accs.filter(a => a.status !== 'connected').length,
    active: camps.filter(c => c.status === 'active').length,
    scheduled: posts.filter(p => p.status === 'scheduled').length,
    jobsOk: jobs.filter(j => j.status === 'success').length,
    jobsFail: jobs.filter(j => j.status === 'failed').length,
    reach: camps.reduce((x, c) => x + c.reach, 0),
    eng: camps.reduce((x, c) => x + c.engagement, 0)
  };

  root.innerHTML = `
    <div class="stats-grid">
      ${statCard({ icon: 'link', tone: 'sc-brand', value: fmtNum(accs.length), label: 'الحسابات المتصلة', delta: 12, sub: `${tot.connected} نشطة الآن` })}
      ${statCard({ icon: 'alert', tone: 'sc-amber', value: fmtNum(tot.needFix), label: 'تحتاج انتباهًا', sub: 'إعادة اتصال أو خطأ' })}
      ${statCard({ icon: 'target', tone: 'sc-green', value: fmtNum(tot.active), label: 'حملات نشطة', delta: 8, sub: `${camps.filter(c => c.status === 'scheduled').length} مجدولة` })}
      ${statCard({ icon: 'calendar', tone: 'sc-purple', value: fmtNum(tot.scheduled), label: 'منشورات مجدولة', sub: 'خلال الأيام القادمة' })}
      ${statCard({ icon: 'check-circle', tone: 'sc-cyan', value: fmtNum(tot.jobsOk), label: 'عمليات ناجحة', delta: 15 })}
      ${statCard({ icon: 'x', tone: 'sc-red', value: fmtNum(tot.jobsFail), label: 'عمليات فاشلة', sub: `${s.errors.filter(e => e.status === 'open').length} خطأ مفتوح` })}
      ${statCard({ icon: 'globe', tone: 'sc-brand', value: fmtNum(tot.reach), label: 'إجمالي الوصول', delta: deltaFrom(s.series30, 'reach') })}
      ${statCard({ icon: 'message', tone: 'sc-green', value: fmtNum(tot.eng), label: 'إجمالي التفاعل', delta: deltaFrom(s.series30, 'engagement') })}
    </div>

    <div class="dash-grid">
      <div>
        <div class="card chart-card">
          <div class="chart-head">
            <div><h3>أداء الوصول والتفاعل</h3><div class="small muted">آخر 30 يومًا — كل الحملات</div></div>
            <div class="chart-legend"><span><i style="background:var(--brand)"></i>الوصول</span><span><i style="background:var(--green)"></i>التفاعل</span></div>
          </div>
          <div class="chart-holder" id="ch-main"></div>
        </div>
        <div class="card chart-card mt-2">
          <div class="chart-head">
            <div><h3>العمليات المنفَّذة</h3><div class="small muted">ناجحة مقابل فاشلة يوميًا</div></div>
            <div class="chart-legend"><span><i style="background:var(--cyan)"></i>ناجحة</span><span><i style="background:var(--red)"></i>فاشلة</span></div>
          </div>
          <div class="chart-holder" id="ch-jobs"></div>
        </div>
      </div>
      <div>
        <div class="card">
          <div class="card-title mb-2">${icon('users', 17)} توزيع حالة الحسابات</div>
          <div class="donut-wrap">
            <div id="ch-donut"></div>
            <div class="donut-legend grow" id="donut-legend"></div>
          </div>
        </div>
        <div class="card mt-2">
          <div class="between mb-2"><div class="card-title">${icon('rocket', 17)} حملات نشطة</div><a href="campaigns.html?status=active" class="small">عرض الكل</a></div>
          <div class="mini-list">
            ${camps.filter(c => c.status === 'active').slice(0, 3).map(c => `
              <div class="mini-row clickable" onclick="location.href='campaign-details.html?id=${c.id}'">
                <div class="grow"><div class="lr-title truncate">${esc(c.name)}</div>
                <div class="mt-1">${progressRow(c.progress)}</div></div>
                <span class="num small muted">${c.progress}٪</span>
              </div>`).join('') || emptyState('target', 'لا حملات نشطة', 'أطلق حملة لتراها هنا')}
          </div>
        </div>
        <div class="card mt-2">
          <div class="between mb-2"><div class="card-title">${icon('bell', 17)} آخر التنبيهات</div><a href="notifications.html" class="small">الكل</a></div>
          <div class="mini-list">
            ${s.notifications.slice(0, 4).map(n => `
              <div class="mini-row">
                ${!n.read ? '<span class="unread-dot" style="margin-top:6px"></span>' : '<span style="width:8px"></span>'}
                <div class="grow"><div class="lr-title">${esc(n.title)}</div><div class="lr-time">${timeAgo(n.time)}</div></div>
              </div>`).join('')}
          </div>
        </div>
      </div>
    </div>`;

  const series = s.series30;
  renderLineChart(document.getElementById('ch-main'), series, [
    { key: 'reach', label: 'الوصول', color: '#6d8dff' },
    { key: 'engagement', label: 'التفاعل', color: '#2fbf8f' }
  ]);
  renderBarChart(document.getElementById('ch-jobs'), series.slice(-14), [
    { key: 'success', label: 'ناجحة', color: '#3fc1d8' },
    { key: 'failed', label: 'فاشلة', color: '#f0566d' }
  ]);
  const parts = Object.keys(ACC_STATUS).map(k => ({
    label: ACC_STATUS[k].t, value: accs.filter(a => a.status === k).length,
    color: { connected: '#2fbf8f', reconnect: '#eda33c', error: '#f0566d', paused: '#8b95a9' }[k]
  })).filter(p => p.value);
  renderDonut(document.getElementById('ch-donut'), parts);
  document.getElementById('donut-legend').innerHTML = parts.map(p =>
    `<div class="dl-row"><i style="background:${p.color}"></i>${p.label}<span class="dl-v num">${p.value}</span></div>`).join('');

  Bus.on('theme', () => location.reload());
})();
