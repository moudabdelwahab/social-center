'use strict';
/* accounts.js — قائمة الحسابات + صفحة التفاصيل */
(function () {
  /* ============ قائمة الحسابات ============ */
  const listRoot = document.getElementById('accounts-root');
  if (listRoot) {
    let q = '', status = '', platform = '', page = 1;
    const go = (p) => { page = p; render(); };

    function render() {
      const s = appState;
      const counts = Object.fromEntries(Object.keys(ACC_STATUS).map(k => [k, s.accounts.filter(a => a.status === k).length]));
      const rows = s.accounts.filter(a =>
        (!status || a.status === status) && (!platform || a.platform === platform) &&
        (!q || a.name.includes(q) || (a.handle || '').includes(q)));
      const pg = paginate(rows, page, 9);

      listRoot.innerHTML = `
        <div class="health-strip">
          ${Object.entries(ACC_STATUS).map(([k, m]) => `
            <button class="health-item" onclick="accFilterStatus('${status === k ? '' : k}')">
              <span class="hi-dot" style="background:var(--${m.c === 'blue' ? 'brand' : m.c})"></span>
              <span class="hi-n num">${counts[k]}</span><span class="hi-l">${m.t}</span>
            </button>`).join('')}
        </div>
        <div class="filters-bar">
          <div class="search-inline">${icon('search', 15)}<input class="input" id="acc-q" placeholder="بحث باسم الحساب أو المعرّف…" value="${esc(q)}"></div>
          <select class="select" id="acc-plat" style="max-width:170px">
            <option value="">كل المنصات</option>
            ${Object.entries(SEED.platforms).map(([k, p]) => `<option value="${k}" ${platform === k ? 'selected' : ''}>${p.name}</option>`).join('')}
          </select>
          <div class="grow"></div>
          <button class="btn btn-primary" onclick="openConnectAccount()">${icon('plus', 15)} ربط حساب جديد</button>
        </div>
        <div class="table-wrap"><table class="tbl"><thead><tr>
          <th>الحساب</th><th>المنصة</th><th>النوع</th><th>المتابعون</th><th>الحالة</th><th>آخر مزامنة</th><th>الحملات</th><th style="text-align:left">الإجراءات</th>
        </tr></thead><tbody>
          ${pg.rows.map(a => `<tr>
            <td><a href="account-details.html?id=${a.id}" style="color:inherit">${accCell(a)}</a></td>
            <td><span class="flex" style="gap:7px">${platformChip(a.platform)}</span></td>
            <td class="small muted">${{ page: 'صفحة', business: 'أعمال', profile: 'شخصي', group: 'مجموعة' }[a.type]}</td>
            <td class="num">${fmtNum(a.followers)}</td>
            <td>${accBadge(a.status)}</td>
            <td class="small muted">${timeAgo(a.lastSync)}</td>
            <td><span class="badge bg-blue"><span class="bd"></span>${a.campaigns.length}</span></td>
            <td><div class="row-actions">
              <button class="btn btn-ghost btn-xs" title="مزامنة" onclick="Engine.syncAccount(${a.id},renderAccounts)">${icon('sync', 13)}</button>
              ${a.status !== 'connected' ? `<button class="btn btn-ghost btn-xs" title="إعادة اتصال" onclick="Engine.reconnectAccount(${a.id},renderAccounts)">${icon('link', 13)}</button>` : ''}
              <button class="btn btn-ghost btn-xs" title="${a.status === 'paused' ? 'استئناف' : 'إيقاف'}" onclick="togglePause(${a.id})">${icon(a.status === 'paused' ? 'play' : 'pause', 13)}</button>
              <button class="btn btn-danger btn-xs" title="فصل" onclick="disconnectAcc(${a.id})">${icon('unlink', 13)}</button>
            </div></td></tr>`).join('') ||
          `<tr><td colspan="8">${emptyState('users', 'لا حسابات مطابقة', 'جرّب تعديل البحث أو اربط حسابًا جديدًا')}</td></tr>`}
        </tbody></table></div>
        ${pagerHtml(pg, 'accPage')}`;

      const qi = document.getElementById('acc-q');
      qi.addEventListener('input', () => { q = qi.value; page = 1; clearTimeout(qi._t); qi._t = setTimeout(render, 250); });
      document.getElementById('acc-plat').onchange = (e) => { platform = e.target.value; page = 1; render(); };
    }
    window.accPage = go;
    window.accFilterStatus = (v) => { status = v; page = 1; render(); };
    window.renderAccounts = render;
    window.togglePause = (id) => {
      const a = appState.accounts.find(x => x.id === id);
      DB.updateAccount(id, { status: a.status === 'paused' ? 'connected' : 'paused' });
      toast(a.status === 'paused' ? 'تم الاستئناف' : 'تم الإيقاف المؤقت', { body: a.name, type: 'info' });
      render();
    };
    window.disconnectAcc = (id) => {
      const a = appState.accounts.find(x => x.id === id);
      confirmDialog({
        message: `سيتم فصل الحساب <b>${esc(a.name)}</b> وإبطال رموز الوصول الخاصة به. الحملات المرتبطة ستتوقف عن استخدامه.`,
        confirmText: 'فصل الحساب',
        onConfirm: () => { DB.removeAccount(id); DB.addNotification({ type: 'account_disconnected', title: 'تم فصل حساب', body: a.name }); toast('تم فصل الحساب', { type: 'ok' }); render(); }
      });
    };
    window.openConnectAccount = () => {
      const m = openModal({
        title: 'ربط حساب جديد', sub: 'المصادقة عبر OAuth الرسمي — لن نطلب كلمة مرورك أبدًا',
        body: `
          <div class="field"><label>اختر المنصة <span class="req">*</span></label>
            <div class="grid" style="grid-template-columns:1fr 1fr;gap:9px">
              ${Object.entries(SEED.platforms).map(([k, p], i) => `
                <label class="pal-item" style="cursor:pointer;margin:0">
                  <input type="radio" name="plat" value="${k}" ${i === 0 ? 'checked' : ''} style="accent-color:var(--brand)">
                  <span class="platform-ic" style="background:${p.color}">${p.short}</span> ${p.name}
                </label>`).join('')}
            </div></div>
          <div class="field"><label>اسم الحساب / الصفحة <span class="req">*</span></label><input class="input" id="ca-name" placeholder="مثال: صفحة متجر الأناقة"></div>
          <div class="form-row">
            <div class="field"><label>المعرّف</label><input class="input mono" id="ca-handle" placeholder="@store"></div>
            <div class="field"><label>النوع</label><select class="select" id="ca-type"><option value="page">صفحة</option><option value="business">حساب أعمال</option><option value="profile">شخصي</option><option value="group">مجموعة</option></select></div>
          </div>
          <div class="form-hint" style="background:var(--brand-soft);border-radius:10px;padding:10px 13px;color:var(--brand)">${icon('shield', 13)} ستُمنح صلاحيات: النشر، قراءة البيانات، الإحصائيات، إدارة التعليقات.</div>`,
        actions: `<button class="btn btn-primary" id="ca-go">${icon('link', 15)} متابعة عبر OAuth</button><button class="btn btn-ghost" id="ca-cancel">إلغاء</button>`
      });
      m.el.querySelector('#ca-cancel').onclick = m.close;
      m.el.querySelector('#ca-go').onclick = () => {
        const name = m.el.querySelector('#ca-name').value.trim();
        if (!name) return toast('اسم الحساب مطلوب', { type: 'warn' });
        const platform = m.el.querySelector('[name=plat]:checked').value;
        m.el.querySelector('#ca-go').innerHTML = 'جارٍ التفويض…';
        setTimeout(() => {
          DB.addAccount({ name, platform, handle: m.el.querySelector('#ca-handle').value.trim(), type: m.el.querySelector('#ca-type').value });
          DB.addNotification({ type: 'account_connected', title: 'تم ربط حساب جديد', body: `${name} (${SEED.platforms[platform].name})` });
          m.close(); toast('تم ربط الحساب بنجاح', { body: name, type: 'ok' }); render();
        }, 1400);
      };
    };
    render();
  }

  /* ============ تفاصيل الحساب ============ */
  const detRoot = document.getElementById('account-detail-root');
  if (detRoot) {
    const id = +new URLSearchParams(location.search).get('id');
    const render = () => {
      const a = appState.accounts.find(x => x.id === id);
      if (!a) { detRoot.innerHTML = emptyState('users', 'الحساب غير موجود', 'ربما تم فصله', '<a class="btn btn-primary" href="accounts.html">عودة للحسابات</a>'); return; }
      const PERMS = { publish: 'النشر', readData: 'قراءة البيانات', insights: 'قراءة الإحصائيات', comments: 'إدارة التعليقات', messages: 'إدارة الرسائل' };
      const camps = appState.campaigns.filter(c => a.campaigns.includes(c.id));
      const jobs = appState.jobs.filter(j => j.accountId === a.id).slice(0, 8);
      detRoot.innerHTML = `
        <div class="card mb-2"><div class="acc-profile">
          ${accAvatar(a, 64)}
          <div class="grow"><h2>${esc(a.name)}</h2>
            <div class="flex wrap mt-1" style="gap:8px">${platformChip(a.platform)}<span class="small muted num">${esc(a.handle)}</span>${accBadge(a.status)}</div></div>
          <div class="flex wrap">
            <button class="btn btn-ghost btn-sm" onclick="Engine.syncAccount(${a.id},renderAccDetail)">${icon('sync', 14)} مزامنة</button>
            <button class="btn btn-ghost btn-sm" onclick="Engine.reconnectAccount(${a.id},renderAccDetail)">${icon('link', 14)} إعادة الاتصال</button>
            <button class="btn btn-ghost btn-sm" onclick="togglePauseDet(${a.id})">${icon(a.status === 'paused' ? 'play' : 'pause', 14)} ${a.status === 'paused' ? 'استئناف' : 'إيقاف'}</button>
            <button class="btn btn-danger btn-sm" onclick="disconnectDet(${a.id})">${icon('unlink', 14)} فصل الحساب</button>
          </div>
        </div></div>
        <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start" id="ad-cols">
          <div class="flex-col">
            <div class="card"><div class="card-title mb-2">${icon('info', 17)} معلومات الحساب</div>
              <div class="kv-grid" style="grid-template-columns:1fr">
                <div class="kv"><span class="k">المنصة</span><span class="v">${SEED.platforms[a.platform].name}</span></div>
                <div class="kv"><span class="k">النوع</span><span class="v">${{ page: 'صفحة', business: 'أعمال', profile: 'شخصي', group: 'مجموعة' }[a.type]}</span></div>
                <div class="kv"><span class="k">المعرّف الخارجي</span><span class="v mono">${a.platform}_${a.id}83x</span></div>
                <div class="kv"><span class="k">المتابعون</span><span class="v num">${fmtFull(a.followers)}</span></div>
                <div class="kv"><span class="k">تاريخ الإضافة</span><span class="v">${fmtDate(a.addedAt)}</span></div>
                <div class="kv"><span class="k">آخر مزامنة</span><span class="v">${timeAgo(a.lastSync)}</span></div>
              </div></div>
            <div class="card"><div class="card-title mb-2">${icon('key', 17)} الصلاحيات</div>
              ${Object.entries(PERMS).map(([k, label]) => `
                <div class="perm-row"><span>${label}</span>
                ${a.perms[k] ? '<span class="badge bg-green">' + icon('check', 11) + ' ممنوحة</span>' : '<span class="badge bg-red">' + icon('x', 11) + ' غير ممنوحة</span>'}</div>`).join('')}
              ${!a.perms.messages ? `<div class="form-hint mt-1">${icon('info', 12)} بعض الصلاحيات غير متاحة لهذه المنصة عبر API الرسمية.</div>` : ''}
            </div>
          </div>
          <div class="flex-col">
            <div class="card"><div class="card-title mb-2">${icon('target', 17)} الحملات المرتبطة (${camps.length})</div>
              <div class="mini-list">${camps.map(c => `
                <div class="mini-row clickable" onclick="location.href='campaign-details.html?id=${c.id}'">
                  <div class="grow"><div class="lr-title">${esc(c.name)}</div><div class="lr-sub">${esc(c.client)}</div></div>${campBadge(c.status)}
                </div>`).join('') || '<div class="muted small">لا حملات مرتبطة بهذا الحساب</div>'}</div></div>
            <div class="card"><div class="card-title mb-2">${icon('activity', 17)} آخر العمليات</div>
              <div class="mini-list">${jobs.map(j => `
                <div class="mini-row"><div class="grow"><div class="lr-title">${JOB_ACTIONS[j.action]}</div><div class="lr-sub">${timeAgo(j.startedAt)}</div></div>${jobBadge(j.status)}</div>`).join('') || '<div class="muted small">لا عمليات بعد</div>'}</div></div>
          </div>
        </div>`;
      if (innerWidth < 900) document.getElementById('ad-cols').style.gridTemplateColumns = '1fr';
    };
    window.renderAccDetail = render;
    window.togglePauseDet = (aid) => { const a = appState.accounts.find(x => x.id === aid); DB.updateAccount(aid, { status: a.status === 'paused' ? 'connected' : 'paused' }); render(); };
    window.disconnectDet = (aid) => confirmDialog({
      message: 'سيتم فصل هذا الحساب نهائيًا وإبطال رموزه.', confirmText: 'فصل الحساب',
      onConfirm: () => { DB.removeAccount(aid); location.href = 'accounts.html'; }
    });
    render();
  }
})();
