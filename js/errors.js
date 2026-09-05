'use strict';
/* errors.js — مركز الأخطاء من قاعدة البيانات */
(async function () {
  await new Promise(r => document.addEventListener('scc:ready', r, { once: true }));
  const root = document.getElementById('errors-root');
  if (!root) return;
  let cat = '', showResolved = false;

  async function render() {
    root.innerHTML = '<div class="skeleton" style="min-height:280px"></div>';
    let rows, open;
    try {
      rows = await DB.errors.list({ category: cat || undefined });
      open = rows.filter(e => e.status === 'open');
      if (!showResolved) rows = rows.filter(e => e.status === 'open');
    } catch (e) { toast(e.message, { type: 'err' }); return; }
    root.innerHTML = `
      <div class="filters-bar">
        <div class="chips">
          <span class="chip ${!cat ? 'active' : ''}" onclick="errFilter('')">الكل <span class="n num">${open.length}</span></span>
          ${Object.entries(ERR_CATS).map(([k, m]) => `<span class="chip ${cat === k ? 'active' : ''}" onclick="errFilter('${k}')">${m.t} <span class="n num">${open.filter(e => e.category === k).length}</span></span>`).join('')}
        </div>
        <div class="grow"></div>
        <label class="flex small muted" style="gap:7px;cursor:pointer">
          <span class="toggle"><input type="checkbox" ${showResolved ? 'checked' : ''} onchange="errToggleResolved(this.checked)"><span class="tk"></span></span>عرض المحلولة
        </label>
      </div>
      <div class="table-wrap"><table class="tbl"><thead><tr>
        <th>التصنيف</th><th>الخطورة</th><th>الخطأ</th><th>الحساب</th><th>الحملة</th><th>التكرار</th><th>آخر حدوث</th><th>الحالة</th><th></th>
      </tr></thead><tbody>
        ${rows.map(e => `<tr>
          <td><span class="badge bg-${ERR_CATS[e.category]?.c || 'gray'}"><span class="bd"></span>${ERR_CATS[e.category]?.t || e.category}</span></td>
          <td><span class="badge bg-${SEVERITY[e.severity]?.c || 'gray'}">${icon('alert', 11)} ${SEVERITY[e.severity]?.t || e.severity}</span></td>
          <td style="max-width:260px">${esc(e.message)}</td>
          <td class="small">${esc(e.account_name || '—')}</td>
          <td class="small muted">${esc(e.campaign_name || '—')}</td>
          <td><span class="badge bg-gray num">${e.occurrences}×</span></td>
          <td class="small muted">${timeAgo(e.created_at)}</td>
          <td>${e.status === 'open' ? '<span class="badge bg-red"><span class="bd"></span>مفتوح</span>' : '<span class="badge bg-green">' + icon('check', 11) + ' محلول</span>'}</td>
          <td><div class="row-actions">
            ${can('editor') && e.status === 'open' && e.job_id ? `<button class="btn btn-ghost btn-xs" onclick="errRetry(${e.id},${e.job_id})">${icon('retry', 12)} إعادة المحاولة</button>` : ''}
            ${can('editor') && e.status === 'open' ? `<button class="btn btn-success btn-xs" onclick="errResolve(${e.id})">${icon('check', 12)} حل</button>` : ''}
          </div></td></tr>`).join('') ||
        `<tr><td colspan="9">${emptyState('check-circle', 'لا أخطاء — كل شيء يعمل بسلاسة', 'ستظهر هنا مشاكل الاتصال أو النشر أو الصلاحيات عند حدوثها')}</td></tr>`}
      </tbody></table></div>`;
  }
  window.errFilter = (v) => { cat = v; render(); };
  window.errToggleResolved = (v) => { showResolved = v; render(); };
  window.errResolve = async (id) => {
    try { await DB.errors.update(id, { status: 'resolved', resolved_at: new Date().toISOString() }); toast('أُغلق الخطأ', { type: 'ok' }); render(); }
    catch (e) { toast(e.message, { type: 'err' }); }
  };
  window.errRetry = async (id, jobId) => {
    try {
      await DB.jobs.update(jobId, { status: 'pending', retry_count: 0, error_message: null });
      await DB.errors.update(id, { status: 'resolved', resolved_at: new Date().toISOString() });
      DB.audit('error_retried', 'error', id);
      toast('أُعيدت المهمة إلى قائمة الانتظار', { type: 'ok' }); render();
    } catch (e) { toast(e.message, { type: 'err' }); }
  };
  render();
})();
