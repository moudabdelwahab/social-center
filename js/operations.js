'use strict';
/* operations.js — سجل العمليات من جدول jobs الحقيقي + Realtime */
(async function () {
  await new Promise(r => document.addEventListener('scc:ready', r, { once: true }));
  const root = document.getElementById('operations-root');
  if (!root) return;
  let status = '', campId = '', page = 1, camps = [];

  async function render() {
    root.innerHTML = '<div class="skeleton" style="min-height:280px"></div>';
    let rows;
    try {
      [rows, camps] = await Promise.all([DB.jobs.list({ status: status || undefined, campaignId: campId || undefined }), DB.campaigns.list()]);
    } catch (e) { toast(e.message, { type: 'err' }); return; }
    const pg = paginate(rows, page, 12);
    const all = await DB.jobs.list().catch(() => []);
    const counts = Object.fromEntries(Object.keys(JOB_STATUS).map(k => [k, all.filter(j => j.status === k).length]));
    root.innerHTML = `
      <div class="filters-bar">
        <div class="chips">
          <span class="chip ${!status ? 'active' : ''}" onclick="opFilter('')">الكل <span class="n num">${all.length}</span></span>
          ${Object.entries(JOB_STATUS).map(([k, m]) => `<span class="chip ${status === k ? 'active' : ''}" onclick="opFilter('${k}')">${m.t} <span class="n num">${counts[k]}</span></span>`).join('')}
        </div>
        <div class="grow"></div>
        <select class="select" id="op-camp" style="max-width:220px"><option value="">كل الحملات</option>
          ${camps.map(c => `<option value="${c.id}" ${campId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
        <button class="btn btn-ghost btn-sm" onclick="opRefresh()">${icon('sync', 14)} تحديث</button>
      </div>
      <div class="table-wrap"><table class="tbl"><thead><tr>
        <th>#</th><th>العملية</th><th>الحملة</th><th>الحساب</th><th>الحالة</th><th>المحاولات</th><th>أُنشئت</th><th>الخطأ</th><th></th>
      </tr></thead><tbody>
        ${pg.rows.map(j => `<tr>
          <td class="tiny muted num">${j.id}</td>
          <td class="cell-main">${JOB_ACTIONS[j.action] || j.action}</td>
          <td class="small">${j.campaigns?.name ? `<a href="campaign-details.html?id=${j.campaign_id}">${esc(j.campaigns.name)}</a>` : '—'}</td>
          <td class="small">${esc(j.social_accounts?.name || '—')}</td>
          <td>${jobBadge(j.status)}</td>
          <td class="num small">${j.retry_count}</td>
          <td class="small muted">${timeAgo(j.created_at)}</td>
          <td class="tiny text-red" style="max-width:180px">${esc(j.error_message || '—')}</td>
          <td><div class="row-actions">
            ${can('editor') && ['failed', 'cancelled'].includes(j.status) ? `<button class="btn btn-ghost btn-xs" onclick="opRetry(${j.id})">${icon('retry', 12)} إعادة</button>` : ''}
            ${can('editor') && ['pending', 'retrying'].includes(j.status) ? `<button class="btn btn-danger btn-xs" onclick="opCancel(${j.id})">إلغاء</button>` : ''}
          </div></td></tr>`).join('') ||
        `<tr><td colspan="9">${emptyState('activity', 'لا عمليات بعد', 'أطلق حملة أو جدّل منشورًا لتظهر المهام هنا — الحالات تُقرأ مباشرة من قاعدة البيانات')}</td></tr>`}
      </tbody></table></div>
      ${pagerHtml(pg, 'opPage')}
      <div class="form-hint mt-1">${icon('info', 12)} التحديث لحظي عبر Realtime — أي تغيير من الـWorker يظهر فورًا دون تحديث الصفحة.</div>`;
    document.getElementById('op-camp')?.addEventListener('change', (e) => { campId = e.target.value; page = 1; render(); });
  }
  window.opFilter = (v) => { status = v; page = 1; render(); };
  window.opPage = (p) => { page = p; render(); };
  window.opRefresh = () => render();
  window.opRetry = async (id) => {
    try { await DB.jobs.update(id, { status: 'pending', retry_count: 0, error_message: null }); DB.audit('job_retried', 'job', id); toast('أُعيدت المهمة إلى قائمة الانتظار', { type: 'ok' }); }
    catch (e) { toast(e.message, { type: 'err' }); }
  };
  window.opCancel = async (id) => {
    try { await DB.jobs.update(id, { status: 'cancelled' }); DB.audit('job_cancelled', 'job', id); toast('أُلغيت المهمة', { type: 'info' }); }
    catch (e) { toast(e.message, { type: 'err' }); }
  };
  let deb = null;
  DB.subscribe('jobs', () => { clearTimeout(deb); deb = setTimeout(render, 400); });
  render();
})();
