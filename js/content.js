'use strict';
/* content.js — مكتبة المحتوى والجدولة */
(function () {
  const root = document.getElementById('content-root');
  if (!root) return;
  let status = '', q = new URLSearchParams(location.search).get('q') || '';

  function render() {
    const rows = appState.posts.filter(p => (!status || p.status === status) && (!q || p.content.includes(q)));
    const counts = Object.fromEntries(Object.keys(POST_STATUS).map(k => [k, appState.posts.filter(p => p.status === k).length]));
    root.innerHTML = `
      <div class="between mb-2 wrap">
        <div class="tabs">
          <button class="tab ${!status ? 'active' : ''}" onclick="postFilter('')">الكل <span class="num">${appState.posts.length}</span></button>
          <button class="tab ${status === 'draft' ? 'active' : ''}" onclick="postFilter('draft')">مسودات <span class="num">${counts.draft}</span></button>
          <button class="tab ${status === 'scheduled' ? 'active' : ''}" onclick="postFilter('scheduled')">مجدولة <span class="num">${counts.scheduled}</span></button>
          <button class="tab ${status === 'published' ? 'active' : ''}" onclick="postFilter('published')">منشورة <span class="num">${counts.published}</span></button>
        </div>
        <div class="flex">
          <div class="search-inline" style="position:relative">${icon('search', 15)}<input class="input" id="ct-q" style="padding-inline-start:36px" placeholder="بحث في المحتوى…" value="${esc(q)}"></div>
          <button class="btn btn-primary" onclick="openPostEditor()">${icon('plus', 15)} محتوى جديد</button>
        </div>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(340px,1fr))">
        ${rows.map(p => {
          const c = appState.campaigns.find(x => x.id === p.campaignId);
          return `<div class="card hoverable post-card">
            <div class="between"><span>${postBadge(p.status)}</span><span class="tiny muted">${timeAgo(p.createdAt)}</span></div>
            <div class="pc-content">${esc(p.content.length > 150 ? p.content.slice(0, 150) + '…' : p.content)}</div>
            <div class="pc-meta">
              ${c ? `<span>${icon('target', 12)} ${esc(c.name)}</span>` : '<span>بدون حملة</span>'}
              ${p.scheduledAt ? `<span>${icon('calendar', 12)} ${fmtDateTime(p.scheduledAt)}</span>` : ''}
              ${p.reach ? `<span>${icon('eye', 12)} <span class="num">${fmtNum(p.reach)}</span></span><span>${icon('message', 12)} <span class="num">${fmtNum(p.engagement)}</span></span>` : ''}
            </div>
            <div class="pc-foot">
              <button class="btn btn-ghost btn-xs" onclick="previewPost(${p.id})">${icon('eye', 12)} معاينة</button>
              <button class="btn btn-ghost btn-xs" onclick="openPostEditor(${p.id})">${icon('edit', 12)} تعديل</button>
              <button class="btn btn-ghost btn-xs" onclick="duplicatePost(${p.id})">${icon('copy', 12)} نسخ</button>
              <div class="grow"></div>
              ${p.status !== 'published' ? `<button class="btn btn-ghost btn-xs" onclick="openScheduleModal(${p.id})">${icon('calendar', 12)} جدولة</button>
              <button class="btn btn-primary btn-xs" onclick="publishNow(${p.id})">${icon('send', 12)} نشر</button>` : ''}
              <button class="btn btn-danger btn-xs" onclick="delPost(${p.id})">${icon('trash', 12)}</button>
            </div>
          </div>`;
        }).join('') || emptyState('file', 'لا محتوى مطابق', 'أنشئ أول منشور أو عدّل البحث', `<button class="btn btn-primary" onclick="openPostEditor()">${icon('plus', 15)} محتوى جديد</button>`)}
      </div>`;
    const qi = document.getElementById('ct-q');
    qi.addEventListener('input', () => { q = qi.value; clearTimeout(qi._t); qi._t = setTimeout(render, 250); });
  }

  window.postFilter = (v) => { status = v; render(); };

  window.openPostEditor = (id) => {
    const p = id ? appState.posts.find(x => x.id === id) : null;
    const m = openModal({
      title: p ? 'تعديل المحتوى' : 'محتوى جديد', size: 'lg',
      body: `
        <div class="field"><label>الحملة</label><select class="select" id="pe-camp">
          <option value="">بدون حملة</option>
          ${appState.campaigns.map(c => `<option value="${c.id}" ${p?.campaignId === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
        </select></div>
        <div class="field"><label>نص المحتوى <span class="req">*</span></label>
          <textarea class="textarea" id="pe-content" rows="5" placeholder="اكتب محتوى المنشور هنا…">${esc(p?.content || '')}</textarea>
          <div class="form-hint"><span id="pe-count" class="num">${(p?.content || '').length}</span> / 2200 حرف</div></div>`,
      actions: `<button class="btn btn-primary" id="pe-save">${p ? 'حفظ التعديلات' : 'حفظ كمسودة'}</button><button class="btn btn-ghost" id="pe-cancel">إلغاء</button>`
    });
    const ta = m.el.querySelector('#pe-content');
    ta.addEventListener('input', () => m.el.querySelector('#pe-count').textContent = ta.value.length);
    m.el.querySelector('#pe-cancel').onclick = m.close;
    m.el.querySelector('#pe-save').onclick = () => {
      const content = ta.value.trim();
      if (!content) return toast('المحتوى فارغ', { type: 'warn' });
      if (content.length > 2200) return toast('المحتوى يتجاوز 2200 حرف', { type: 'err' });
      const campId = +m.el.querySelector('#pe-camp').value || null;
      if (p) { DB.updatePost(id, { content, campaignId: campId }); toast('تم حفظ التعديلات', { type: 'ok' }); }
      else { DB.addPost({ content, campaignId: campId, accountIds: campId ? (appState.campaigns.find(c => c.id === campId)?.accountIds || []).slice(0, 2) : [] }); toast('حُفظت المسودة', { type: 'ok' }); }
      m.close(); render();
    };
  };

  window.previewPost = (id) => {
    const p = appState.posts.find(x => x.id === id);
    const a = appState.accounts.find(x => x.id === (p.accountIds || [])[0]) || appState.accounts[0];
    openModal({
      title: 'معاينة المنشور', sub: 'كما سيظهر تقريبًا على المنصة', size: 'sm',
      body: `<div class="post-preview">
        <div class="pp-head">${accAvatar(a, 36)}<div><div style="font-weight:700;font-size:13px">${esc(a.name)}</div><div class="tiny muted">${SEED.platforms[a.platform].name} · الآن</div></div></div>
        <div class="pp-body">${esc(p.content)}</div>
        <div class="pp-stats"><span>${icon('message', 13)} تفاعل</span><span>${icon('copy', 13)} مشاركة</span><span>${icon('send', 13)} إرسال</span></div>
      </div>`,
      actions: `<button class="btn btn-ghost" onclick="this.closest('.modal-back').classList.remove('show');setTimeout(()=>this.closest('.modal-back')?.remove(),200);document.body.style.overflow=''">إغلاق</button>`
    });
  };

  window.duplicatePost = (id) => {
    const p = appState.posts.find(x => x.id === id);
    DB.addPost({ content: p.content + ' (نسخة)', campaignId: p.campaignId, accountIds: p.accountIds });
    toast('تم إنشاء نسخة كمسودة', { type: 'ok' }); render();
  };

  window.delPost = (id) => confirmDialog({
    message: 'حذف هذا المحتوى نهائيًا؟', confirmText: 'حذف',
    onConfirm: () => { DB.removePost(id); toast('تم الحذف', { type: 'ok' }); render(); }
  });

  window.openScheduleModal = (id) => {
    const p = appState.posts.find(x => x.id === id);
    const defAccs = new Set(p.accountIds || []);
    const m = openModal({
      title: 'جدولة المنشور', sub: 'حدّد الموعد والحسابات المستهدفة',
      body: `
        <div class="form-row">
          <div class="field"><label>التاريخ والوقت <span class="req">*</span></label><input class="input" id="sc-at" type="datetime-local"></div>
          <div class="field"><label>التكرار</label><select class="select" id="sc-rec"><option value="once">مرة واحدة</option><option value="daily">يومي</option><option value="weekly">أسبوعي</option></select></div>
        </div>
        <div class="field"><label>الحسابات المستهدفة <span class="req">*</span></label>
          <div class="check-list" style="max-height:180px">${appState.accounts.filter(a => a.status === 'connected').map(a => `
            <label class="check-item"><input type="checkbox" data-aid="${a.id}" ${defAccs.has(a.id) ? 'checked' : ''}>${accAvatar(a, 26)}<span class="grow truncate">${esc(a.name)}</span><span class="tiny muted">${SEED.platforms[a.platform].name}</span></label>`).join('')}
          </div></div>`,
      actions: `<button class="btn btn-primary" id="sc-save">${icon('calendar', 14)} تأكيد الجدولة</button><button class="btn btn-ghost" id="sc-cancel">إلغاء</button>`
    });
    m.el.querySelector('#sc-cancel').onclick = m.close;
    m.el.querySelector('#sc-save').onclick = () => {
      const at = m.el.querySelector('#sc-at').value;
      const accs = [...m.el.querySelectorAll('[data-aid]:checked')].map(x => +x.dataset.aid);
      if (!at) return toast('حدّد موعد النشر', { type: 'warn' });
      if (new Date(at) < new Date()) return toast('الموعد يجب أن يكون في المستقبل', { type: 'warn' });
      if (!accs.length) return toast('اختر حسابًا واحدًا على الأقل', { type: 'warn' });
      DB.updatePost(id, { status: 'scheduled', scheduledAt: new Date(at).toISOString(), accountIds: accs });
      m.close();
      toast('تمت الجدولة بنجاح', { body: `سيُنشر على ${accs.length} حسابات — ${fmtDateTime(new Date(at).toISOString())}`, type: 'ok' });
      DB.addNotification({ type: 'post_scheduled', title: 'تمت جدولة منشور', body: fmtDateTime(new Date(at).toISOString()) });
      render();
    };
  };

  window.publishNow = (id) => {
    const p = appState.posts.find(x => x.id === id);
    toast('جارٍ النشر عبر قائمة الانتظار…', { type: 'info', duration: 2000 });
    setTimeout(() => {
      DB.updatePost(id, { status: 'published', publishedAt: new Date().toISOString(), reach: Math.round(1500 + Math.random() * 20000), engagement: Math.round(120 + Math.random() * 1800) });
      const j = DB.addJob({ campaignId: p.campaignId, accountId: (p.accountIds || [])[0], action: 'publish_post', status: 'success', progress: 100, startedAt: new Date().toISOString(), duration: 3 });
      Bus.emit('jobs');
      toast('تم النشر بنجاح', { body: `مهمة #${j.id}`, type: 'ok' }); render();
    }, 2100);
  };

  render();
})();
