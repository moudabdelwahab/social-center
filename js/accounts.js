'use strict';
/* accounts.js — الحسابات من Supabase + صفحة التفاصيل */
(async function () {
  await new Promise(r => document.addEventListener('scc:ready', r, { once: true }));

  /* ============ القائمة ============ */
  const listRoot = document.getElementById('accounts-root');
  if (listRoot) {
    let qv = '', status = '', platform = '', page = 1, cache = [];
    async function render() {
      listRoot.innerHTML = '<div class="skeleton" style="min-height:280px"></div>';
      try { cache = await DB.accounts.list(); } catch (e) { toast(e.message, { type: 'err' }); cache = []; }
      const counts = Object.fromEntries(Object.keys(ACC_STATUS).map(k => [k, cache.filter(a => a.status === k).length]));
      const rows = cache.filter(a =>
        (!status || a.status === status) && (!platform || a.platform === platform) &&
        (!qv || a.name.includes(qv) || (a.handle || '').includes(qv)));
      const pg = paginate(rows, page, 9);
      listRoot.innerHTML = `
        <div class="health-strip">
          ${Object.entries(ACC_STATUS).map(([k, m]) => `
            <button class="health-item" onclick="accFilterStatus('${status === k ? '' : k}')">
              <span class="hi-dot" style="background:var(--${m.c === 'blue' ? 'brand' : m.c})"></span>
              <span class="hi-n num">${counts[k]}</span><span class="hi-l">${m.t}</span></button>`).join('')}
        </div>
        <div class="filters-bar">
          <div class="search-inline">${icon('search', 15)}<input class="input" id="acc-q" placeholder="بحث باسم الحساب أو المعرّف…" value="${esc(qv)}"></div>
          <select class="select" id="acc-plat" style="max-width:170px"><option value="">كل المنصات</option>
            ${Object.entries(PLATFORMS).map(([k, p]) => `<option value="${k}" ${platform === k ? 'selected' : ''}>${p.name}</option>`).join('')}</select>
          <div class="grow"></div>
          ${can('manager') ? `<button class="btn btn-primary" onclick="openConnectAccount()">${icon('plus', 15)} ربط حساب جديد</button>` : ''}
        </div>
        <div class="table-wrap"><table class="tbl"><thead><tr>
          <th>الحساب</th><th>المنصة</th><th>النوع</th><th>الحالة</th><th>آخر مزامنة</th><th style="text-align:left">الإجراءات</th>
        </tr></thead><tbody>
          ${pg.rows.map(a => `<tr>
            <td><a href="account-details.html?id=${a.id}" style="color:inherit">${accCell(a)}</a></td>
            <td><span class="flex" style="gap:7px">${platformChip(a.platform)}</span></td>
            <td class="small muted">${{ page: 'صفحة', business: 'أعمال', profile: 'شخصي', group: 'مجموعة' }[a.account_type] || a.account_type}</td>
            <td>${accBadge(a.status)}</td>
            <td class="small muted">${timeAgo(a.last_sync_at)}</td>
            <td><div class="row-actions">
              ${can('manager') ? `
                <button class="btn btn-ghost btn-xs" title="مزامنة" onclick="syncAcc('${a.id}')">${icon('sync', 13)}</button>
                ${a.status === 'paused'
                  ? `<button class="btn btn-ghost btn-xs" title="استئناف" onclick="pauseAcc('${a.id}',false)">${icon('play', 13)}</button>`
                  : `<button class="btn btn-ghost btn-xs" title="إيقاف" onclick="pauseAcc('${a.id}',true)">${icon('pause', 13)}</button>`}` : ''}
              ${can('admin') ? `<button class="btn btn-danger btn-xs" title="فصل" onclick="disconnectAcc('${a.id}')">${icon('unlink', 13)}</button>` : ''}
            </div></td></tr>`).join('') ||
          `<tr><td colspan="6">${emptyState('users', 'لم تتم إضافة أي حسابات بعد', 'اربط أول حساب عبر OAuth الرسمي للبدء', can('manager') ? `<button class="btn btn-primary" onclick="openConnectAccount()">${icon('plus', 15)} ربط حساب جديد</button>` : '')}</td></tr>`}
        </tbody></table></div>
        ${pagerHtml(pg, 'accPage')}`;
      const qi = document.getElementById('acc-q');
      qi?.addEventListener('input', () => { qv = qi.value; page = 1; clearTimeout(qi._t); qi._t = setTimeout(renderList, 250); });
      document.getElementById('acc-plat')?.addEventListener('change', (e) => { platform = e.target.value; page = 1; renderList(); });
    }
    function renderList() { render(); }
    window.accPage = (p) => { page = p; render(); };
    window.accFilterStatus = (v) => { status = v; page = 1; render(); };
    window.syncAcc = async (id) => {
      toast('جارٍ المزامنة…', { type: 'info', duration: 1500 });
      await DB.accounts.update(id, { last_sync_at: new Date().toISOString() }).catch(e => toast(e.message, { type: 'err' }));
      toast('تم تحديث وقت المزامنة', { body: 'المزامنة الفعلية مع المنصة تتطلب ربط OAuth', type: 'ok' }); render();
    };
    window.pauseAcc = async (id, pause) => {
      await DB.accounts.update(id, { status: pause ? 'paused' : 'connected' }).catch(e => toast(e.message, { type: 'err' }));
      DB.audit(pause ? 'account_paused' : 'account_resumed', 'account', id);
      toast(pause ? 'تم الإيقاف المؤقت' : 'تم الاستئناف', { type: 'info' }); render();
    };
    window.disconnectAcc = (id) => {
      const a = cache.find(x => x.id === id);
      confirmDialog({
        message: `سيتم فصل الحساب <b>${esc(a?.name)}</b> وإبطال صلاحياته. هل أنت متأكد؟`, confirmText: 'فصل الحساب',
        onConfirm: async () => {
          try { await DB.accounts.remove(id); DB.audit('account_disconnected', 'account', id);
            await DB.notifications.create({ type: 'account_disconnected', title: 'تم فصل حساب', body: a?.name });
            toast('تم فصل الحساب', { type: 'ok' }); render();
          } catch (e) { toast(e.message, { type: 'err' }); }
        }
      });
    };
    window.openConnectAccount = () => {
      const m = openModal({
        title: 'ربط حساب جديد', sub: 'المصادقة عبر OAuth الرسمي فقط — لن نطلب كلمة مرورك أبدًا',
        body: `
          <div class="field"><label>المنصة <span class="req">*</span></label>
            <div class="grid" style="grid-template-columns:1fr 1fr;gap:9px">
              ${Object.entries(PLATFORMS).map(([k, p], i) => `
                <label class="pal-item" style="cursor:pointer;margin:0"><input type="radio" name="plat" value="${k}" ${i === 0 ? 'checked' : ''} style="accent-color:var(--brand)">
                <span class="platform-ic" style="background:${p.color}">${p.short}</span> ${p.name}</label>`).join('')}
            </div></div>
          <div class="field"><label>اسم الحساب / الصفحة <span class="req">*</span></label><input class="input" id="ca-name" placeholder="مثال: صفحة متجر الأناقة"></div>
          <div class="form-row">
            <div class="field"><label>المعرّف</label><input class="input mono" id="ca-handle" placeholder="@store"></div>
            <div class="field"><label>النوع</label><select class="select" id="ca-type"><option value="page">صفحة</option><option value="business">حساب أعمال</option><option value="profile">شخصي</option><option value="group">مجموعة</option></select></div>
          </div>
          <div class="form-hint" style="background:var(--amber-soft);border-radius:10px;padding:10px 13px;color:var(--amber)">${icon('alert', 13)} تكامل Meta OAuth غير متصل بعد. سيُحفظ الحساب بحالة «يحتاج إعادة اتصال» حتى اكتمال الربط الرسمي.</div>`,
        actions: `<button class="btn btn-primary" id="ca-go">${icon('link', 15)} حفظ الحساب</button><button class="btn btn-ghost" id="ca-cancel">إلغاء</button>`
      });
      m.el.querySelector('#ca-cancel').onclick = m.close;
      m.el.querySelector('#ca-go').onclick = async () => {
        const name = m.el.querySelector('#ca-name').value.trim();
        if (!name) return toast('اسم الحساب مطلوب', { type: 'warn' });
        const done = btnBusy(m.el.querySelector('#ca-go'), 'جارٍ الحفظ…');
        try {
          await DB.accounts.create({
            name, platform: m.el.querySelector('[name=plat]:checked').value,
            handle: m.el.querySelector('#ca-handle').value.trim() || null,
            account_type: m.el.querySelector('#ca-type').value, status: 'reconnect',
            permissions: { publish: false, readData: false, insights: false, comments: false, messages: false }
          });
          DB.audit('account_created', 'account', name);
          m.close(); toast('حُفظ الحساب — أكمل الربط عند توفر OAuth', { type: 'ok' }); render();
        } catch (e) { toast(e.message, { type: 'err' }); }
        done();
      };
    };
    render();
  }

  /* ============ التفاصيل ============ */
  const detRoot = document.getElementById('account-detail-root');
  if (detRoot) {
    const id = new URLSearchParams(location.search).get('id');
    async function render() {
      detRoot.innerHTML = '<div class="skeleton" style="min-height:320px"></div>';
      let a;
      try { a = await DB.accounts.get(id); } catch { detRoot.innerHTML = emptyState('users', 'الحساب غير موجود', 'ربما تم فصله', '<a class="btn btn-primary" href="accounts.html">عودة للحسابات</a>'); return; }
      const [camps, jobs] = await Promise.all([
        DB.accounts.campaignsOf(id).then(r => r.map(x => x.campaigns).filter(Boolean)),
        DB.accounts.jobsOf(id)
      ]);
      const PERMS = { publish: 'النشر', readData: 'قراءة البيانات', insights: 'قراءة الإحصائيات', comments: 'إدارة التعليقات', messages: 'إدارة الرسائل' };
      const perms = a.permissions || {};
      detRoot.innerHTML = `
        <div class="card mb-2"><div class="acc-profile">
          ${accAvatar(a, 64)}
          <div class="grow"><h2>${esc(a.name)}</h2>
            <div class="flex wrap mt-1" style="gap:8px">${platformChip(a.platform)}<span class="small muted num">${esc(a.handle || '')}</span>${accBadge(a.status)}</div></div>
          <div class="flex wrap">
            ${can('manager') ? `
              <button class="btn btn-ghost btn-sm" onclick="syncAcc('${a.id}')">${icon('sync', 14)} مزامنة</button>
              <button class="btn btn-ghost btn-sm" disabled title="يتطلب إعداد Meta OAuth — قريبًا">${icon('link', 14)} إعادة الاتصال (قريبًا)</button>
              <button class="btn btn-ghost btn-sm" onclick="pauseAccDet('${a.id}',${a.status !== 'paused'})">${icon(a.status === 'paused' ? 'play' : 'pause', 14)} ${a.status === 'paused' ? 'استئناف' : 'إيقاف'}</button>` : ''}
            ${can('admin') ? `<button class="btn btn-danger btn-sm" onclick="disconnectDet('${a.id}')">${icon('unlink', 14)} فصل الحساب</button>` : ''}
          </div>
        </div></div>
        <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start" id="ad-cols">
          <div class="flex-col">
            <div class="card"><div class="card-title mb-2">${icon('info', 17)} معلومات الحساب</div>
              <div class="kv-grid" style="grid-template-columns:1fr">
                <div class="kv"><span class="k">المنصة</span><span class="v">${PLATFORMS[a.platform]?.name || a.platform}</span></div>
                <div class="kv"><span class="k">النوع</span><span class="v">${{ page: 'صفحة', business: 'أعمال', profile: 'شخصي', group: 'مجموعة' }[a.account_type] || a.account_type}</span></div>
                <div class="kv"><span class="k">المعرّف الخارجي</span><span class="v mono">${esc(a.external_id || '— بانتظار OAuth')}</span></div>
                <div class="kv"><span class="k">تاريخ الإضافة</span><span class="v">${fmtDate(a.created_at)}</span></div>
                <div class="kv"><span class="k">آخر مزامنة</span><span class="v">${timeAgo(a.last_sync_at)}</span></div>
              </div></div>
            <div class="card"><div class="card-title mb-2">${icon('key', 17)} الصلاحيات</div>
              ${Object.entries(PERMS).map(([k, label]) => `
                <div class="perm-row"><span>${label}</span>
                ${perms[k] ? '<span class="badge bg-green">' + icon('check', 11) + ' ممنوحة</span>' : '<span class="badge bg-gray"><span class="bd"></span>بانتظار الربط</span>'}</div>`).join('')}
              <div class="form-hint mt-1">${icon('info', 12)} تُمنح الصلاحيات عبر تدفق OAuth الرسمي عند اكتمال تكامل Meta.</div>
            </div>
          </div>
          <div class="flex-col">
            <div class="card"><div class="card-title mb-2">${icon('target', 17)} الحملات المرتبطة (${camps.length})</div>
              <div class="mini-list">${camps.map(c => `
                <div class="mini-row clickable" onclick="location.href='campaign-details.html?id=${c.id}'">
                  <div class="grow"><div class="lr-title">${esc(c.name)}</div><div class="lr-sub">${esc(c.client || '')}</div></div>${campBadge(c.status)}
                </div>`).join('') || '<div class="muted small">لا حملات مرتبطة</div>'}</div></div>
            <div class="card"><div class="card-title mb-2">${icon('activity', 17)} آخر العمليات</div>
              <div class="mini-list">${jobs.map(j => `
                <div class="mini-row"><div class="grow"><div class="lr-title">${JOB_ACTIONS[j.action] || j.action}</div><div class="lr-sub">${timeAgo(j.created_at)}</div></div>${jobBadge(j.status)}</div>`).join('') || '<div class="muted small">لا عمليات بعد</div>'}</div></div>
          </div>
        </div>`;
      if (innerWidth < 900) document.getElementById('ad-cols').style.gridTemplateColumns = '1fr';
    }
    window.pauseAccDet = async (aid, pause) => { await DB.accounts.update(aid, { status: pause ? 'paused' : 'connected' }).catch(e => toast(e.message, { type: 'err' })); render(); };
    window.disconnectDet = (aid) => confirmDialog({
      message: 'سيتم فصل هذا الحساب نهائيًا.', confirmText: 'فصل الحساب',
      onConfirm: async () => { await DB.accounts.remove(aid).catch(e => toast(e.message, { type: 'err' })); location.href = 'accounts.html'; }
    });
    window.syncAcc = async (aid) => {
      await DB.accounts.update(aid, { last_sync_at: new Date().toISOString() }).catch(e => toast(e.message, { type: 'err' }));
      toast('تم تحديث وقت المزامنة', { type: 'ok' }); render();
    };
    render();
  }
})();
