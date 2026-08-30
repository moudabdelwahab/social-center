'use strict';
/* content.js — مكتبة المحتوى من Supabase: إنشاء/تعديل/نسخ/جدولة/نشر */
(async function () {
  const root = document.getElementById('content-root');
  if (!root) return;
  await new Promise(r => document.addEventListener('scc:ready', r, { once: true }));
  let status = '', qv = '', cache = [], camps = [], accs = [];

  async function render() {
    root.innerHTML = '<div class="skeleton" style="min-height:280px"></div>';
    try { [cache, camps, accs] = await Promise.all([DB.posts.list(), DB.campaigns.list(), DB.accounts.list()]); }
    catch (e) { toast(e.message, { type: 'err' }); return; }
    const rows = cache.filter(p => (!status || p.status === status) && (!qv || p.content.includes(qv)));
    const counts = Object.fromEntries(Object.keys(POST_STATUS).map(k => [k, cache.filter(p => p.status === k).length]));
    root.innerHTML = `
      <div class="between mb-2 wrap">
        <div class="tabs">
          <button class="tab ${!status ? 'active' : ''}" onclick="postFilter('')">الكل <span class="num">${cache.length}</span></button>
          ${Object.entries(POST_STATUS).map(([k, m]) => `<button class="tab ${status === k ? 'active' : ''}" onclick="postFilter('${k}')">${m.t} <span class="num">${counts[k]}</span></button>`).join('')}
        </div>
        <div class="flex">
          <div class="search-inline" style="position:relative">${icon('search', 15)}<input class="input" id="ct-q" style="padding-inline-start:36px" placeholder="بحث في المحتوى…" value="${esc(qv)}"></div>
          ${can('editor') ? `<button class="btn btn-primary" onclick="openPostEditor()">${icon('plus', 15)} محتوى جديد</button>` : ''}
        </div>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(340px,1fr))">
        ${rows.map(p => `
          <div class="card hoverable post-card">
            <div class="between"><span>${postBadge(p.status)}</span><span class="tiny muted">${timeAgo(p.created_at)}</span></div>
            <div class="pc-content">${esc(p.content.length > 150 ? p.content.slice(0, 150) + '…' : p.content)}</div>
            <div class="pc-meta">
              ${p.campaigns?.name ? `<span>${icon('target', 12)} ${esc(p.campaigns.name)}</span>` : '<span>بدون حملة</span>'}
              ${p.scheduled_at ? `<span>${icon('calendar', 12)} ${fmtDateTime(p.scheduled_at)}</span>` : ''}
              ${p.recurrence && p.recurrence !== 'once' ? `<span>${icon('sync', 12)} ${{ daily: 'يومي', weekly: 'أسبوعي' }[p.recurrence]}</span>` : ''}
            </div>
            <div class="pc-foot">
              <button class="btn btn-ghost btn-xs" onclick="previewPost('${p.id}')">${icon('eye', 12)} معاينة</button>
              ${can('editor') ? `
                <button class="btn btn-ghost btn-xs" onclick="openPostEditor('${p.id}')">${icon('edit', 12)} تعديل</button>
                <button class="btn btn-ghost btn-xs" onclick="duplicatePost('${p.id}')">${icon('copy', 12)} نسخ</button>
                <div class="grow"></div>
                ${p.status !== 'published' ? `<button class="btn btn-ghost btn-xs" onclick="openScheduleModal('${p.id}')">${icon('calendar', 12)} جدولة</button>` : ''}` : '<div class="grow"></div>'}
              ${can('editor') ? `<button class="btn btn-danger btn-xs" onclick="delPost('${p.id}')">${icon('trash', 12)}</button>` : ''}
            </div>
          </div>`).join('') || emptyState('file', 'لا محتوى مطابق', 'أنشئ أول منشور أو عدّل البحث', can('editor') ? `<button class="btn btn-primary" onclick="openPostEditor()">${icon('plus', 15)} محتوى جديد</button>` : '')}
      </div>`;
    const qi = document.getElementById('ct-q');
    qi?.addEventListener('input', () => { qv = qi.value; clearTimeout(qi._t); qi._t = setTimeout(render, 250); });
  }
  window.postFilter = (v) => { status = v; render(); };

  window.openPostEditor = (id) => {
    const p = id ? cache.find(x => x.id === id) : null;
    const m = openModal({
      title: p ? 'تعديل المحتوى' : 'محتوى جديد', size: 'lg',
      body: `
        <div class="field"><label>الحملة</label><select class="select" id="pe-camp">
          <option value="">بدون حملة</option>
          ${camps.map(c => `<option value="${c.id}" ${p?.campaign_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select></div>
        <div class="field"><label>نص المحتوى <span class="req">*</span></label>
          <textarea class="textarea" id="pe-content" rows="5">${esc(p?.content || '')}</textarea>
          <div class="form-hint"><span id="pe-count" class="num">${(p?.content || '').length}</span> / 2200 حرف</div></div>`,
      actions: `<button class="btn btn-primary" id="pe-save">${p ? 'حفظ التعديلات' : 'حفظ كمسودة'}</button><button class="btn btn-ghost" id="pe-cancel">إلغاء</button>`
    });
    const ta = m.el.querySelector('#pe-content');
    ta.addEventListener('input', () => m.el.querySelector('#pe-count').textContent = ta.value.length);
    m.el.querySelector('#pe-cancel').onclick = m.close;
    m.el.querySelector('#pe-save').onclick = async () => {
      const content = ta.value.trim();
      if (!content) return toast('المحتوى فارغ', { type: 'warn' });
      if (content.length > 2200) return toast('المحتوى يتجاوز 2200 حرف', { type: 'err' });
      const campId = m.el.querySelector('#pe-camp').value || null;
      const done = btnBusy(m.el.querySelector('#pe-save'));
      try {
        if (p) await DB.posts.update(id, { content, campaign_id: campId });
        else await DB.posts.create({ content, campaign_id: campId });
        DB.audit(p ? 'post_updated' : 'post_created', 'post', id || content.slice(0, 30));
        m.close(); toast('تم الحفظ', { type: 'ok' }); render();
      } catch (e) { toast(e.message, { type: 'err' }); }
      done();
    };
  };

  window.previewPost = (id) => {
    const p = cache.find(x => x.id === id);
    const a = accs.find(x => x.id === (p.accountIds || [])[0]) || accs[0];
    openModal({
      title: 'معاينة المنشور', sub: 'كما سيظهر تقريبًا على المنصة', size: 'sm',
      body: `<div class="post-preview">
        <div class="pp-head">${a ? accAvatar(a, 36) : ''}<div><div style="font-weight:700;font-size:13px">${esc(a?.name || '—')}</div><div class="tiny muted">${a ? PLATFORMS[a.platform]?.name : ''} · الآن</div></div></div>
        <div class="pp-body">${esc(p.content)}</div>
        <div class="pp-stats"><span>${icon('message', 13)} تفاعل</span><span>${icon('copy', 13)} مشاركة</span><span>${icon('send', 13)} إرسال</span></div></div>`,
      actions: `<button class="btn btn-ghost" id="pp-close">إغلاق</button>`
    }).el.querySelector('#pp-close').onclick = function () { this.closest('.modal-back').classList.remove('show'); setTimeout(() => { this.closest('.modal-back')?.remove(); document.body.style.overflow = ''; }, 200); };
  };

  window.duplicatePost = async (id) => {
    const p = cache.find(x => x.id === id);
    try { await DB.posts.create({ content: p.content + ' (نسخة)', campaign_id: p.campaign_id }, p.accountIds || []); toast('أُنشئت نسخة كمسودة', { type: 'ok' }); render(); }
    catch (e) { toast(e.message, { type: 'err' }); }
  };
  window.delPost = (id) => confirmDialog({
    message: 'حذف هذا المحتوى نهائيًا؟', confirmText: 'حذف',
    onConfirm: async () => { try { await DB.posts.remove(id); toast('تم الحذف', { type: 'ok' }); render(); } catch (e) { toast(e.message, { type: 'err' }); } }
  });

  window.openScheduleModal = (id) => {
    const p = cache.find(x => x.id === id);
    const defAccs = new Set(p.accountIds || []);
    const m = openModal({
      title: 'جدولة المنشور', sub: 'حدّد الموعد والحسابات المستهدفة',
      body: `
        <div class="form-row">
          <div class="field"><label>التاريخ والوقت <span class="req">*</span></label><input class="input" id="sc-at" type="datetime-local"></div>
          <div class="field"><label>التكرار</label><select class="select" id="sc-rec"><option value="once">مرة واحدة</option><option value="daily">يومي</option><option value="weekly">أسبوعي</option></select></div>
        </div>
        <div class="field"><label>الحسابات المستهدفة <span class="req">*</span></label>
          <div class="check-list" style="max-height:180px">${accs.map(a => `
            <label class="check-item"><input type="checkbox" data-aid="${a.id}" ${defAccs.has(a.id) ? 'checked' : ''}>${accAvatar(a, 26)}<span class="grow truncate">${esc(a.name)}</span><span class="tiny muted">${PLATFORMS[a.platform]?.name}</span></label>`).join('') || '<div class="muted small" style="padding:8px">لا حسابات — اربط حسابًا أولًا</div>'}
          </div></div>`,
      actions: `<button class="btn btn-primary" id="sc-save">${icon('calendar', 14)} تأكيد الجدولة</button><button class="btn btn-ghost" id="sc-cancel">إلغاء</button>`
    });
    m.el.querySelector('#sc-cancel').onclick = m.close;
    m.el.querySelector('#sc-save').onclick = async () => {
      const at = m.el.querySelector('#sc-at').value;
      const accIds = [...m.el.querySelectorAll('[data-aid]:checked')].map(x => x.dataset.aid);
      if (!at) return toast('حدّد موعد النشر', { type: 'warn' });
      if (new Date(at) < new Date()) return toast('الموعد يجب أن يكون في المستقبل', { type: 'warn' });
      if (!accIds.length) return toast('اختر حسابًا واحدًا على الأقل', { type: 'warn' });
      const done = btnBusy(m.el.querySelector('#sc-save'));
      try {
        await DB.posts.update(id, { status: 'scheduled', scheduled_at: new Date(at).toISOString(), recurrence: m.el.querySelector('#sc-rec').value });
        await DB.posts.setAccounts(id, accIds);
        await DB.jobs.bulkCreate(accIds.map(a => ({ post_id: id, campaign_id: p.campaign_id, account_id: a, action: 'publish_post', run_at: new Date(at).toISOString() })));
        DB.audit('post_scheduled', 'post', id);
        m.close(); toast(`تمت الجدولة على ${accIds.length} حسابات`, { body: 'ستُنفَّذ مهام النشر عند اتصال مزوّد النشر', type: 'ok' }); render();
      } catch (e) { toast(e.message, { type: 'err' }); }
      done();
    };
  };
  render();
})();
