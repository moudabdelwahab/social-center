'use strict';
/* ============================================================
   accounts.js — قائمة الحسابات (بحث/فرز/فلترة/تحديد جماعي
   وإجراءات جماعية) + صفحة تفاصيل الحساب.
   كل الاستعلامات عبر DB (طبقة الخدمة) وتخضع لـRLS — لا service
   role ولا أسرار في الواجهة إطلاقًا.
   ============================================================ */
(async function () {
  await new Promise(r => document.addEventListener('scc:ready', r, { once: true }));

  /* ============ القائمة ============ */
  const listRoot = document.getElementById('accounts-root');
  if (listRoot) {
    /* ---------- حالة الصفحة ---------- */
    let cache = [];                 // كل حسابات المساحة (غير المفصولة)
    let qv = '', status = '', platform = '', accType = '';
    let sortKey = 'created_at', sortDir = 'desc';
    let page = 1, perPage = 20;
    const sel = new Set();          // معرّفات الحسابات المحددة
    let busy = false;               // يمنع تنفيذ إجراءين جماعيين معًا

    const MANAGE = can('manager');  // مزامنة/إيقاف
    const ADMIN = can('admin');     // فصل الحسابات

    /* ---------- اشتقاق الصفوف: فلترة ← فرز ← ترقيم ---------- */
    function filtered() {
      const needle = qv.trim().toLowerCase();
      const rows = cache.filter(a => {
        if (status && a.status !== status) return false;
        if (platform && a.platform !== platform) return false;
        if (accType && a.account_type !== accType) return false;
        if (!needle) return true;
        // البحث: الاسم + المعرّف + المنصة + المعرّف الخارجي
        return [
          a.name, a.handle, a.external_id, a.platform,
          PLATFORMS[a.platform]?.name, accTypeName(a.account_type)
        ].some(v => String(v ?? '').toLowerCase().includes(needle));
      });
      const s = ACC_SORTS[sortKey] || ACC_SORTS.created_at;
      const dir = sortDir === 'asc' ? 1 : -1;
      return rows.sort((x, y) => {
        const a = s.get(x), b = s.get(y);
        if (typeof a === 'number' && typeof b === 'number') return (a - b) * dir;
        return String(a).localeCompare(String(b), 'ar') * dir;
      });
    }

    /* ---------- تحميل البيانات ---------- */
    async function load() {
      try { cache = await DB.accounts.list(); }
      catch (e) { toast(e.message, { type: 'err' }); cache = []; }
      // تنظيف التحديد من أي حساب لم يعد موجودًا (بعد الفصل مثلًا)
      const live = new Set(cache.map(a => a.id));
      [...sel].forEach(id => { if (!live.has(id)) sel.delete(id); });
    }

    /* ---------- بطاقات المنصات ---------- */
    function platformCards() {
      const cards = Object.entries(PLATFORMS).map(([k, p]) => {
        const n = cache.filter(a => a.platform === k).length;
        const active = platform === k;
        return `<button class="plat-card${active ? ' is-active' : ''}" data-plat="${k}"
                  aria-pressed="${active}" title="${esc(p.name)}">
          <span class="platform-ic pc-ic" style="background:${p.color}">${p.short}</span>
          <span class="pc-body"><span class="pc-n num">${n}</span><span class="pc-l">${esc(p.name)}</span></span>
        </button>`;
      }).join('');
      const totalActive = !platform;
      return `<div class="plat-strip">${cards}
        <button class="plat-card pc-total${totalActive ? ' is-active' : ''}" data-plat=""
                aria-pressed="${totalActive}">
          <span class="platform-ic pc-ic" style="background:var(--brand)">${icon('layers', 14)}</span>
          <span class="pc-body"><span class="pc-n num">${cache.length}</span><span class="pc-l">إجمالي الحسابات</span></span>
        </button></div>`;
    }

    /* ---------- رأس عمود قابل للفرز ---------- */
    function th(key, label, extra = '') {
      const on = sortKey === key;
      const arrow = on ? (sortDir === 'asc' ? '▲' : '▼') : '';
      return `<th ${extra}><button class="th-sort${on ? ' is-on' : ''}" data-sort="${key}"
        aria-label="فرز حسب ${esc(label)}">${esc(label)}<span class="th-ar">${arrow}</span></button></th>`;
    }

    /* ---------- الرسم ---------- */
    function render() {
      const rows = filtered();
      const pg = paginate(rows, page, perPage);
      page = pg.page;
      const pageIds = pg.rows.map(a => a.id);
      const selOnPage = pageIds.filter(id => sel.has(id)).length;
      const from = pg.total ? (pg.page - 1) * perPage + 1 : 0;
      const to = Math.min(pg.page * perPage, pg.total);
      const hasFilters = !!(qv || status || platform || accType) || sortKey !== 'created_at' || sortDir !== 'desc';

      listRoot.innerHTML = `
        ${platformCards()}

        <div class="filters-bar">
          <div class="search-inline">${icon('search', 15)}
            <input class="input" id="acc-q" type="search" autocomplete="off"
                   placeholder="بحث بالاسم أو المعرّف أو المنصة…" value="${esc(qv)}"></div>

          <select class="select acc-f" id="acc-plat" aria-label="المنصة">
            <option value="">كل المنصات</option>
            ${Object.entries(PLATFORMS).map(([k, p]) =>
              `<option value="${k}" ${platform === k ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}
          </select>

          <select class="select acc-f" id="acc-status" aria-label="الحالة">
            <option value="">كل الحالات</option>
            ${Object.entries(ACC_STATUS).map(([k, m]) =>
              `<option value="${k}" ${status === k ? 'selected' : ''}>${esc(m.t)}</option>`).join('')}
          </select>

          <select class="select acc-f" id="acc-type" aria-label="النوع">
            <option value="">كل الأنواع</option>
            ${[...new Set(cache.map(a => a.account_type).filter(Boolean))].map(t =>
              `<option value="${esc(t)}" ${accType === t ? 'selected' : ''}>${esc(accTypeName(t))}</option>`).join('')}
          </select>

          <select class="select acc-f" id="acc-sort" aria-label="ترتيب حسب">
            ${Object.entries(ACC_SORTS).map(([k, m]) => `
              <option value="${k}:desc" ${sortKey === k && sortDir === 'desc' ? 'selected' : ''}>${esc(m.t)} ↓</option>
              <option value="${k}:asc"  ${sortKey === k && sortDir === 'asc' ? 'selected' : ''}>${esc(m.t)} ↑</option>`).join('')}
          </select>

          ${hasFilters ? `<button class="btn btn-ghost btn-sm" id="acc-reset">${icon('retry', 14)} إعادة تعيين</button>` : ''}
          <div class="grow"></div>
          ${MANAGE ? `<button class="btn btn-primary" onclick="openConnectAccount()">${icon('plus', 15)} ربط حساب جديد</button>` : ''}
        </div>

        ${sel.size ? `
          <div class="bulk-bar" role="region" aria-label="إجراءات جماعية">
            <span class="bulk-n">${icon('check-circle', 15)} تم تحديد ${sel.size} ${sel.size === 1 ? 'حساب' : 'حسابات'}</span>
            <div class="grow"></div>
            ${ADMIN ? `<button class="btn btn-danger btn-sm" id="bulk-disconnect">${icon('unlink', 14)} فصل الحسابات المحددة</button>` : ''}
            ${MANAGE ? `<button class="btn btn-ghost btn-sm" id="bulk-sync">${icon('sync', 14)} إعادة المزامنة</button>` : ''}
            ${MANAGE && [...sel].some(id => cache.find(a => a.id === id)?.status === 'reconnect')
              ? `<button class="btn btn-ghost btn-sm" id="bulk-reconnect">${icon('link', 14)} إعادة الاتصال</button>` : ''}
            <button class="btn btn-ghost btn-sm" id="bulk-clear">${icon('x', 14)} إلغاء التحديد</button>
          </div>` : ''}

        <div class="table-wrap"><table class="tbl tbl-acc"><thead><tr>
          <th class="col-check"><input type="checkbox" id="acc-all" aria-label="تحديد كل الحسابات الظاهرة"
              ${pageIds.length && selOnPage === pageIds.length ? 'checked' : ''}></th>
          ${th('name', 'الحساب')}
          ${th('platform', 'المنصة')}
          ${th('account_type', 'النوع')}
          ${th('status', 'الحالة')}
          ${th('last_sync_at', 'آخر مزامنة')}
          ${th('created_at', 'تاريخ الإضافة')}
          <th style="text-align:left">الإجراءات</th>
        </tr></thead><tbody>
          ${pg.rows.map(a => `<tr${sel.has(a.id) ? ' class="is-sel"' : ''}>
            <td class="col-check"><input type="checkbox" class="acc-ck" data-id="${a.id}"
                aria-label="تحديد ${esc(a.name)}" ${sel.has(a.id) ? 'checked' : ''}></td>
            <td><a href="account-details.html?id=${a.id}" style="color:inherit">${accCell(a)}</a></td>
            <td><span class="flex" style="gap:7px">${platformChip(a.platform)}</span></td>
            <td class="small muted">${esc(accTypeName(a.account_type))}</td>
            <td>${accBadge(a.status)}</td>
            <td class="small muted">${timeAgo(a.last_sync_at)}</td>
            <td class="small muted">${fmtDate(a.created_at)}</td>
            <td><div class="row-actions">
              ${MANAGE ? `
                <button class="btn btn-ghost btn-xs" title="مزامنة" onclick="syncAcc('${a.id}')">${icon('sync', 13)}</button>
                ${a.status === 'paused'
                  ? `<button class="btn btn-ghost btn-xs" title="استئناف" onclick="pauseAcc('${a.id}',false)">${icon('play', 13)}</button>`
                  : `<button class="btn btn-ghost btn-xs" title="إيقاف" onclick="pauseAcc('${a.id}',true)">${icon('pause', 13)}</button>`}` : ''}
              ${ADMIN ? `<button class="btn btn-danger btn-xs" title="فصل" onclick="disconnectAcc('${a.id}')">${icon('unlink', 13)}</button>` : ''}
              <a class="btn btn-ghost btn-xs" title="فتح" href="account-details.html?id=${a.id}">${icon('external', 13)}</a>
            </div></td></tr>`).join('') ||
          `<tr><td colspan="8">${
            cache.length
              ? emptyState('search', 'لا نتائج مطابقة', 'جرّب تعديل البحث أو الفلاتر', '<button class="btn btn-ghost" id="acc-reset2">إعادة تعيين الفلاتر</button>')
              : emptyState('users', 'لم تتم إضافة أي حسابات بعد', 'اربط أول حساب عبر OAuth الرسمي للبدء',
                  MANAGE ? `<button class="btn btn-primary" onclick="openConnectAccount()">${icon('plus', 15)} ربط حساب جديد</button>` : '')
          }</td></tr>`}
        </tbody></table></div>

        ${pg.total ? `<div class="tbl-foot">
          <span class="small muted">من ${from} إلى ${to} من ${pg.total} ${pg.total === 1 ? 'حساب' : 'حسابات'}</span>
          <div class="grow"></div>
          <label class="small muted flex" style="gap:7px">عرض
            <select class="select select-xs" id="acc-per">
              ${[10, 20, 50, 100].map(n => `<option value="${n}" ${perPage === n ? 'selected' : ''}>${n}</option>`).join('')}
            </select> لكل صفحة</label>
          ${pagerHtml(pg, 'accPage')}
        </div>` : ''}`;

      wire(pageIds, selOnPage);
    }

    /* ---------- ربط الأحداث بعد كل رسم ---------- */
    function wire(pageIds, selOnPage) {
      // البحث — بلا فقدان التركيز أو موضع المؤشر
      const qi = document.getElementById('acc-q');
      if (qi) {
        qi.addEventListener('input', () => {
          qv = qi.value; page = 1;
          clearTimeout(qi._t);
          qi._t = setTimeout(() => { const p = qi.selectionStart; render();
            const n = document.getElementById('acc-q'); if (n) { n.focus(); try { n.setSelectionRange(p, p); } catch {} } }, 200);
        });
      }
      const on = (id, ev, fn) => document.getElementById(id)?.addEventListener(ev, fn);
      on('acc-plat', 'change', e => { platform = e.target.value; page = 1; render(); });
      on('acc-status', 'change', e => { status = e.target.value; page = 1; render(); });
      on('acc-type', 'change', e => { accType = e.target.value; page = 1; render(); });
      on('acc-sort', 'change', e => { const [k, d] = e.target.value.split(':'); sortKey = k; sortDir = d; page = 1; render(); });
      on('acc-per', 'change', e => { perPage = Number(e.target.value) || 20; page = 1; render(); });
      const reset = () => { qv = status = platform = accType = ''; sortKey = 'created_at'; sortDir = 'desc'; page = 1; render(); };
      on('acc-reset', 'click', reset); on('acc-reset2', 'click', reset);

      // بطاقات المنصات
      document.querySelectorAll('.plat-card').forEach(b =>
        b.addEventListener('click', () => { platform = b.dataset.plat === platform ? '' : b.dataset.plat; page = 1; render(); }));

      // رؤوس الفرز
      document.querySelectorAll('.th-sort').forEach(b =>
        b.addEventListener('click', () => {
          const k = b.dataset.sort;
          if (sortKey === k) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
          else { sortKey = k; sortDir = k === 'name' || k === 'platform' || k === 'account_type' ? 'asc' : 'desc'; }
          render();
        }));

      // تحديد الكل (الظاهر حاليًا) + الحالة الوسطى
      const all = document.getElementById('acc-all');
      if (all) {
        all.indeterminate = selOnPage > 0 && selOnPage < pageIds.length;
        all.addEventListener('change', () => {
          if (all.checked) pageIds.forEach(id => sel.add(id));
          else pageIds.forEach(id => sel.delete(id));
          render();
        });
      }
      document.querySelectorAll('.acc-ck').forEach(ck =>
        ck.addEventListener('change', () => { ck.checked ? sel.add(ck.dataset.id) : sel.delete(ck.dataset.id); render(); }));

      // الإجراءات الجماعية
      on('bulk-clear', 'click', () => { sel.clear(); render(); });
      on('bulk-disconnect', 'click', bulkDisconnect);
      on('bulk-sync', 'click', bulkSync);
      on('bulk-reconnect', 'click', () => {
        if (typeof startMetaOAuth === 'function') startMetaOAuth('Facebook');
        else toast('إعادة الاتصال غير متاحة الآن', { type: 'warn' });
      });
    }

    /* ---------- نتيجة كل حساب بعد إجراء جماعي ---------- */
    function resultsModal(title, results) {
      const okN = results.filter(r => r.ok).length;
      const failN = results.length - okN;
      const m = openModal({
        title, size: 'sm',
        body: `<div class="small muted mb-2">نجح ${okN} من ${results.length}${failN ? ` · فشل ${failN}` : ''}</div>
          <div class="mini-list" style="max-height:260px;overflow:auto">${results.map(r => `
            <div class="mini-row">
              <div class="grow"><div class="lr-title">${esc(r.name)}</div>
                ${r.ok ? '' : `<div class="lr-sub">${esc(r.error || 'خطأ غير معروف')}</div>`}</div>
              <span class="badge ${r.ok ? 'bg-green' : 'bg-red'}">${r.ok ? 'تم' : 'فشل'}</span>
            </div>`).join('')}</div>`,
        actions: `<button class="btn btn-primary" id="rm-ok">تم</button>`
      });
      m.el.querySelector('#rm-ok').onclick = m.close;
    }

    /* ملخّص سريع عبر toast، وتفصيل لكل حساب عند وجود أي فشل */
    function showResults(title, results) {
      const okN = results.filter(r => r.ok).length;
      const failN = results.length - okN;
      if (!failN) { toast(title, { body: `تمت العملية على ${okN} ${okN === 1 ? 'حساب' : 'حسابات'}`, type: 'ok' }); return; }
      toast(title, { body: `نجح ${okN} · فشل ${failN}`, type: failN === results.length ? 'err' : 'warn' });
      resultsModal(title, results);
    }

    /* ---------- فصل جماعي ---------- */
    function bulkDisconnect() {
      if (busy || !sel.size) return;
      const targets = [...sel].map(id => cache.find(a => a.id === id)).filter(Boolean);
      if (!targets.length) return;
      confirmDialog({
        title: 'فصل الحسابات المحددة',
        message: `سيتم فصل <b>${targets.length}</b> ${targets.length === 1 ? 'حساب' : 'حسابات'} وإبطال صلاحياتها:
          <div class="mini-list mt-2" style="max-height:180px;overflow:auto">
            ${targets.map(a => `<div class="mini-row"><div class="grow"><div class="lr-title">${esc(a.name)}</div>
              <div class="lr-sub">${esc(PLATFORMS[a.platform]?.name || a.platform)} · ${esc(accTypeName(a.account_type))}</div></div></div>`).join('')}
          </div>
          <div class="form-hint mt-2">لن تفشل العملية كلها إذا فشل حساب — ستظهر نتيجة كل حساب.</div>`,
        confirmText: `فصل ${targets.length} ${targets.length === 1 ? 'حساب' : 'حسابات'}`,
        onConfirm: async () => {
          busy = true;
          const settled = await Promise.allSettled(targets.map(a => DB.accounts.remove(a.id)));
          const results = settled.map((s, i) => ({
            name: targets[i].name, ok: s.status === 'fulfilled',
            error: s.status === 'rejected' ? (s.reason?.message || String(s.reason)) : null
          }));
          results.forEach((r, i) => { if (r.ok) { sel.delete(targets[i].id); DB.audit('account_disconnected', 'account', targets[i].id); } });
          const okN = results.filter(r => r.ok).length;
          if (okN) await DB.notifications.create({
            type: 'account_disconnected', title: 'تم فصل حسابات',
            body: `${okN} ${okN === 1 ? 'حساب' : 'حسابات'}: ${results.filter(r => r.ok).map(r => r.name).join('، ')}`
          }).catch(() => {});
          busy = false;
          showResults('فصل الحسابات', results);
          await load(); render();   // تحديث القائمة بلا إعادة تحميل الصفحة
        }
      });
    }

    /* ---------- مزامنة جماعية ---------- */
    async function bulkSync() {
      if (busy || !sel.size) return;
      busy = true;
      const targets = [...sel].map(id => cache.find(a => a.id === id)).filter(Boolean);
      toast('جارٍ إعادة المزامنة…', { type: 'info', duration: 1500 });
      const stamp = new Date().toISOString();
      const settled = await Promise.allSettled(targets.map(a => DB.accounts.update(a.id, { last_sync_at: stamp })));
      const results = settled.map((s, i) => ({
        name: targets[i].name, ok: s.status === 'fulfilled',
        error: s.status === 'rejected' ? (s.reason?.message || String(s.reason)) : null
      }));
      busy = false;
      showResults('إعادة المزامنة', results);
      await load(); render();
    }

    /* ---------- إجراءات الصف الواحد ---------- */
    window.accPage = (p) => { page = p; render(); };

    window.syncAcc = async (id) => {
      try {
        await DB.accounts.update(id, { last_sync_at: new Date().toISOString() });
        toast('تم تحديث وقت المزامنة', { body: 'المزامنة الفعلية مع المنصة تتطلب ربط OAuth', type: 'ok' });
      } catch (e) { toast(e.message, { type: 'err' }); }
      await load(); render();
    };

    window.pauseAcc = async (id, pause) => {
      try {
        await DB.accounts.update(id, { status: pause ? 'paused' : 'connected' });
        DB.audit(pause ? 'account_paused' : 'account_resumed', 'account', id);
        toast(pause ? 'تم الإيقاف المؤقت' : 'تم الاستئناف', { type: 'info' });
      } catch (e) { toast(e.message, { type: 'err' }); }
      await load(); render();
    };

    window.disconnectAcc = (id) => {
      const a = cache.find(x => x.id === id);
      confirmDialog({
        message: `سيتم فصل الحساب <b>${esc(a?.name)}</b> وإبطال صلاحياته. هل أنت متأكد؟`,
        confirmText: 'فصل الحساب',
        onConfirm: async () => {
          try {
            await DB.accounts.remove(id);
            DB.audit('account_disconnected', 'account', id);
            await DB.notifications.create({ type: 'account_disconnected', title: 'تم فصل حساب', body: a?.name }).catch(() => {});
            sel.delete(id);
            toast('تم فصل الحساب', { type: 'ok' });
          } catch (e) { toast(e.message, { type: 'err' }); }
          await load(); render();
        }
      });
    };

    /* نافذة «ربط حساب جديد» تعيش في js/meta-connect.js (OAuth حقيقي). */
    listRoot.innerHTML = '<div class="skeleton" style="min-height:320px"></div>';
    await load();
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
              <button class="btn btn-ghost btn-sm" onclick="reconnectDet()">${icon('link', 14)} إعادة الاتصال</button>
              <button class="btn btn-ghost btn-sm" onclick="pauseAccDet('${a.id}',${a.status !== 'paused'})">${icon(a.status === 'paused' ? 'play' : 'pause', 14)} ${a.status === 'paused' ? 'استئناف' : 'إيقاف'}</button>` : ''}
            ${can('admin') ? `<button class="btn btn-danger btn-sm" onclick="disconnectDet('${a.id}')">${icon('unlink', 14)} فصل الحساب</button>` : ''}
          </div>
        </div></div>
        <div class="grid" style="grid-template-columns:1fr 1fr;align-items:start" id="ad-cols">
          <div class="flex-col">
            <div class="card"><div class="card-title mb-2">${icon('info', 17)} معلومات الحساب</div>
              <div class="kv-grid" style="grid-template-columns:1fr">
                <div class="kv"><span class="k">المنصة</span><span class="v">${PLATFORMS[a.platform]?.name || a.platform}</span></div>
                <div class="kv"><span class="k">النوع</span><span class="v">${esc(accTypeName(a.account_type))}</span></div>
                <div class="kv"><span class="k">المعرّف الخارجي</span><span class="v mono">${esc(a.external_id || '— بانتظار OAuth')}</span></div>
                <div class="kv"><span class="k">تاريخ الإضافة</span><span class="v">${fmtDate(a.created_at)}</span></div>
                <div class="kv"><span class="k">آخر مزامنة</span><span class="v">${timeAgo(a.last_sync_at)}</span></div>
              </div></div>
            <div class="card"><div class="card-title mb-2">${icon('key', 17)} الصلاحيات</div>
              ${Object.entries(PERMS).map(([k, label]) => `
                <div class="perm-row"><span>${label}</span>
                ${perms[k] ? '<span class="badge bg-green">' + icon('check', 11) + ' ممنوحة</span>' : '<span class="badge bg-gray"><span class="bd"></span>غير ممنوحة</span>'}</div>`).join('')}
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
    window.reconnectDet = () => {
      if (typeof startMetaOAuth === 'function') startMetaOAuth('Facebook');
      else toast('إعادة الاتصال غير متاحة الآن', { type: 'warn' });
    };
    window.pauseAccDet = async (aid, pause) => {
      try { await DB.accounts.update(aid, { status: pause ? 'paused' : 'connected' }); }
      catch (e) { toast(e.message, { type: 'err' }); }
      render();
    };
    window.disconnectDet = (aid) => confirmDialog({
      message: 'سيتم فصل هذا الحساب نهائيًا.', confirmText: 'فصل الحساب',
      onConfirm: async () => {
        try { await DB.accounts.remove(aid); DB.audit('account_disconnected', 'account', aid); location.href = 'accounts.html'; }
        catch (e) { toast(e.message, { type: 'err' }); }
      }
    });
    window.syncAcc = async (aid) => {
      try { await DB.accounts.update(aid, { last_sync_at: new Date().toISOString() }); toast('تم تحديث وقت المزامنة', { type: 'ok' }); }
      catch (e) { toast(e.message, { type: 'err' }); }
      render();
    };
    render();
  }
})();
