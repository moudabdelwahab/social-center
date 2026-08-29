'use strict';
/* operations.js — سجل العمليات مع تحديث حي */
(function () {
  const root = document.getElementById('operations-root');
  if (!root) return;
  let status = '', campId = '', page = 1;

  function render() {
    const rows = appState.jobs.filter(j => (!status || j.status === status) && (!campId || j.campaignId === +campId));
    const pg = paginate(rows, page, 12);
    const counts = Object.fromEntries(Object.keys(JOB_STATUS).map(k => [k, appState.jobs.filter(j => j.status === k).length]));
    root.innerHTML = `
      <div class="filters-bar">
        <div class="chips">
          <span class="chip ${!status ? 'active' : ''}" onclick="opFilter('')">الكل <span class="n num">${appState.jobs.length}</span></span>
          ${Object.entries(JOB_STATUS).map(([k, m]) => `<span class="chip ${status === k ? 'active' : ''}" onclick="opFilter('${k}')">${m.t} <span class="n num">${counts[k]}</span></span>`).join('')}
        </div>
        <div class="grow"></div>
        <select class="select" id="op-camp" style="max-width:220px">
          <option value="">كل الحملات</option>
          ${appState.campaigns.map(c => `<option value="${c.id}" ${+campId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="table-wrap"><table class="tbl"><thead><tr>
        <th>#</th><th>العملية</th><th>الحملة</th><th>الحساب</th><th>الحالة</th><th>التقدم</th><th>بدأت</th><th>المدة</th><th></th>
      </tr></thead><tbody>
        ${pg.rows.map(j => {
          const c = appState.campaigns.find(x => x.id === j.campaignId);
          const a = appState.accounts.find(x => x.id === j.accountId);
          return `<tr>
            <td class="tiny muted num">${j.id}</td>
            <td class="cell-main">${JOB_ACTIONS[j.action]}</td>
            <td class="small">${c ? `<a href="campaign-details.html?id=${c.id}">${esc(c.name)}</a>` : '—'}</td>
            <td class="small">${a ? esc(a.name) : '—'}</td>
            <td>${jobBadge(j.status)}</td>
            <td class="op-progress-cell">${j.status === 'processing'
              ? `<div class="flex" style="gap:8px"><span class="live-dot"></span><div class="progress grow"><div class="fill" style="width:${j.progress}%"></div></div><span class="tiny num muted">${j.progress}٪</span></div>`
              : j.status === 'failed' ? `<span class="tiny text-red truncate" style="display:block;max-width:190px">${esc(j.error || 'فشل')}</span>` : `<span class="tiny muted num">${j.progress}٪</span>`}</td>
            <td class="small muted">${timeAgo(j.startedAt)}</td>
            <td class="small muted num">${j.duration != null ? j.duration + ' ث' : '—'}</td>
            <td>${j.status === 'failed' ? `<button class="btn btn-ghost btn-xs" onclick="Engine.retryJob(${j.id})">${icon('retry', 12)} إعادة</button>` : ''}</td>
          </tr>`;
        }).join('') || `<tr><td colspan="9">${emptyState('activity', 'لا عمليات مطابقة', 'أطلق حملة لتبدأ المهام بالظهور هنا')}</td></tr>`}
      </tbody></table></div>
      ${pagerHtml(pg, 'opPage')}`;
    document.getElementById('op-camp').onchange = (e) => { campId = e.target.value; page = 1; render(); };
  }

  window.opFilter = (v) => { status = v; page = 1; render(); };
  window.opPage = (p) => { page = p; render(); };
  let deb = null;
  Bus.on('jobs', () => { clearTimeout(deb); deb = setTimeout(render, 350); });
  render();
})();
