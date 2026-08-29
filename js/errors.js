'use strict';
/* errors.js — مركز الأخطاء */
(function () {
  const root = document.getElementById('errors-root');
  if (!root) return;
  let cat = '', showResolved = false;

  function render() {
    const open = appState.errors.filter(e => e.status === 'open');
    const rows = appState.errors.filter(e => (showResolved || e.status === 'open') && (!cat || e.category === cat));
    root.innerHTML = `
      <div class="filters-bar">
        <div class="chips">
          <span class="chip ${!cat ? 'active' : ''}" onclick="errFilter('')">الكل <span class="n num">${open.length}</span></span>
          ${Object.entries(ERR_CATS).map(([k, m]) => `<span class="chip ${cat === k ? 'active' : ''}" onclick="errFilter('${k}')">${m.t} <span class="n num">${open.filter(e => e.category === k).length}</span></span>`).join('')}
        </div>
        <div class="grow"></div>
        <label class="flex small muted" style="gap:7px;cursor:pointer">
          <span class="toggle"><input type="checkbox" ${showResolved ? 'checked' : ''} onchange="errToggleResolved(this.checked)"><span class="tk"></span></span>
          عرض المحلولة
        </label>
      </div>
      <div class="table-wrap"><table class="tbl"><thead><tr>
        <th>التصنيف</th><th>الخطورة</th><th>الخطأ</th><th>الحساب</th><th>الحملة</th><th>التكرار</th><th>آخر حدوث</th><th>الحالة</th><th></th>
      </tr></thead><tbody>
        ${rows.map(e => `<tr>
          <td><span class="badge bg-${ERR_CATS[e.category].c}"><span class="bd"></span>${ERR_CATS[e.category].t}</span></td>
          <td><span class="badge bg-${SEVERITY[e.severity].c}">${icon('alert', 11)} ${SEVERITY[e.severity].t}</span></td>
          <td style="max-width:260px">${esc(e.message)}</td>
          <td class="small">${esc(e.account)}</td>
          <td class="small muted">${esc(e.campaign)}</td>
          <td><span class="badge bg-gray num">${e.occurrences}×</span></td>
          <td class="small muted">${timeAgo(e.time)}</td>
          <td>${e.status === 'open' ? '<span class="badge bg-red"><span class="bd"></span>مفتوح</span>' : '<span class="badge bg-green">' + icon('check', 11) + ' محلول</span>'}</td>
          <td><div class="row-actions">
            ${e.status === 'open' && e.jobId ? `<button class="btn btn-ghost btn-xs" onclick="errRetry(${e.id})">${icon('retry', 12)} إعادة المحاولة</button>` : ''}
            ${e.status === 'open' ? `<button class="btn btn-success btn-xs" onclick="errResolve(${e.id})">${icon('check', 12)} حل</button>` : ''}
          </div></td>
        </tr>`).join('') || `<tr><td colspan="9">${emptyState('check-circle', 'لا أخطاء — كل شيء يعمل بسلاسة', 'ستظهر هنا أي مشاكل في الاتصال أو النشر أو الصلاحيات')}</td></tr>`}
      </tbody></table></div>`;
  }

  window.errFilter = (v) => { cat = v; render(); };
  window.errToggleResolved = (v) => { showResolved = v; render(); };
  window.errResolve = (id) => { DB.updateError(id, { status: 'resolved' }); toast('تم إغلاق الخطأ', { type: 'ok' }); render(); };
  window.errRetry = (id) => {
    const e = appState.errors.find(x => x.id === id);
    toast('جارٍ إعادة المحاولة…', { body: e.message, type: 'info', duration: 1800 });
    setTimeout(() => {
      DB.updateError(id, { status: 'resolved' });
      if (e.jobId) { const j = appState.jobs.find(x => x.id === e.jobId); if (j) { j.status = 'success'; j.progress = 100; j.error = null; saveState(); Bus.emit('jobs'); } }
      toast('نجحت إعادة المحاولة وأُغلق الخطأ', { type: 'ok' }); render();
    }, 1700);
  };
  Bus.on('jobs', () => render());
  render();
})();
