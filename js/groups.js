'use strict';
/* groups.js — المجموعات من Supabase */
(async function () {
  await new Promise(r => document.addEventListener('scc:ready', r, { once: true }));
  const root = document.getElementById('groups-root');
  if (!root) return;
  let cache = [], allAccounts = [];

  async function render() {
    root.innerHTML = '<div class="skeleton" style="min-height:280px"></div>';
    try { [cache, allAccounts] = await Promise.all([DB.groups.list(), DB.accounts.list()]); }
    catch (e) { toast(e.message, { type: 'err' }); return; }
    root.innerHTML = `
      <div class="between mb-2 wrap">
        <div class="muted small">${cache.length} مجموعات · ${allAccounts.length} حسابًا</div>
        ${can('manager') ? `<button class="btn btn-primary" onclick="openGroupModal()">${icon('plus', 15)} إنشاء مجموعة</button>` : ''}
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">
        ${cache.map(g => `
          <div class="card hoverable group-card">
            <div class="gc-head"><div class="gc-icon" style="background:${g.color}">${icon('folder', 19)}</div>
              <div class="grow"><div class="cc-name">${esc(g.name)}</div><div class="cc-client">${esc(g.description || '')}</div></div></div>
            <div class="gc-stats"><div><b class="num">${g.members.length}</b>حسابات</div></div>
            <div class="avatar-stack">
              ${g.members.slice(0, 6).map(a => accAvatar(a, 28)).join('')}
              ${g.members.length > 6 ? `<div class="acc-avatar more" style="width:28px;height:28px;font-size:10px">+${g.members.length - 6}</div>` : ''}
            </div>
            ${can('manager') ? `<div class="flex" style="gap:6px">
              <button class="btn btn-ghost btn-sm grow" onclick="openMembersModal('${g.id}')">${icon('users', 14)} إدارة الأعضاء</button>
              <button class="btn btn-ghost btn-sm" onclick="openGroupModal('${g.id}')">${icon('edit', 14)}</button>
              <button class="btn btn-danger btn-sm" onclick="delGroup('${g.id}')">${icon('trash', 14)}</button>
            </div>` : ''}
          </div>`).join('') || emptyState('folder', 'لا مجموعات بعد', 'أنشئ مجموعات لتنظيم حساباتك', can('manager') ? `<button class="btn btn-primary" onclick="openGroupModal()">${icon('plus', 15)} إنشاء أول مجموعة</button>` : '')}
      </div>`;
  }

  window.openGroupModal = (id) => {
    const g = id ? cache.find(x => x.id === id) : null;
    const colors = ['#7d83e0', '#8f7cc9', '#4f9d7e', '#c9964a', '#c96a72', '#5f9aa8'];
    const m = openModal({
      title: g ? 'تعديل المجموعة' : 'إنشاء مجموعة', size: 'sm',
      body: `
        <div class="field"><label>اسم المجموعة <span class="req">*</span></label><input class="input" id="g-name" value="${esc(g?.name || '')}" placeholder="مثال: حملة رمضان"></div>
        <div class="field"><label>الوصف</label><input class="input" id="g-desc" value="${esc(g?.description || '')}"></div>
        <div class="field"><label>اللون</label><div class="flex">${colors.map((c, i) => `
          <label style="cursor:pointer"><input type="radio" name="gc" value="${c}" ${(g ? g.color === c : i === 0) ? 'checked' : ''} style="display:none">
          <span style="display:block;width:30px;height:30px;border-radius:9px;background:${c};border:2.5px solid transparent" class="gc-swatch" data-c="${c}"></span></label>`).join('')}</div></div>`,
      actions: `<button class="btn btn-primary" id="g-save">${g ? 'حفظ' : 'إنشاء'}</button><button class="btn btn-ghost" id="g-cancel">إلغاء</button>`
    });
    const mark = () => m.el.querySelectorAll('.gc-swatch').forEach(s => s.style.borderColor = m.el.querySelector(`[name=gc][value="${s.dataset.c}"]`).checked ? '#fff' : 'transparent');
    m.el.querySelectorAll('[name=gc]').forEach(r => r.onchange = mark); mark();
    m.el.querySelector('#g-cancel').onclick = m.close;
    m.el.querySelector('#g-save').onclick = async () => {
      const name = m.el.querySelector('#g-name').value.trim();
      if (!name) return toast('اسم المجموعة مطلوب', { type: 'warn' });
      const data = { name, description: m.el.querySelector('#g-desc').value.trim() || null, color: m.el.querySelector('[name=gc]:checked').value };
      const done = btnBusy(m.el.querySelector('#g-save'));
      try {
        g ? await DB.groups.update(id, data) : await DB.groups.create(data);
        DB.audit(g ? 'group_updated' : 'group_created', 'group', name);
        m.close(); toast(g ? 'تم الحفظ' : 'أُنشئت المجموعة', { type: 'ok' }); render();
      } catch (e) { toast(e.message, { type: 'err' }); }
      done();
    };
  };

  window.openMembersModal = (id) => {
    const g = cache.find(x => x.id === id);
    const members = new Set(g.members.map(a => a.id));
    const m = openModal({
      title: `أعضاء «${esc(g.name)}»`, sub: `${members.size} حسابًا حاليًا`,
      body: `<div class="check-list">${allAccounts.map(a => `
        <label class="check-item"><input type="checkbox" data-aid="${a.id}" ${members.has(a.id) ? 'checked' : ''}>
        ${accAvatar(a, 28)}<span class="grow truncate">${esc(a.name)}</span>${accBadge(a.status)}</label>`).join('') || '<div class="muted small" style="padding:10px">لا حسابات متاحة — اربط حسابًا أولًا</div>'}</div>`,
      actions: `<button class="btn btn-primary" id="gm-save">حفظ التغييرات</button><button class="btn btn-ghost" id="gm-cancel">إلغاء</button>`
    });
    m.el.querySelector('#gm-cancel').onclick = m.close;
    m.el.querySelector('#gm-save').onclick = async () => {
      const done = btnBusy(m.el.querySelector('#gm-save'));
      try {
        await DB.groups.setMembers(id, [...m.el.querySelectorAll('[data-aid]:checked')].map(x => x.dataset.aid));
        m.close(); toast('تم تحديث الأعضاء', { type: 'ok' }); render();
      } catch (e) { toast(e.message, { type: 'err' }); }
      done();
    };
  };

  window.delGroup = (id) => {
    const g = cache.find(x => x.id === id);
    confirmDialog({
      message: `حذف المجموعة <b>${esc(g.name)}</b>؟ لن تتأثر الحسابات نفسها.`, confirmText: 'حذف المجموعة',
      onConfirm: async () => {
        try { await DB.groups.remove(id); DB.audit('group_deleted', 'group', id); toast('تم الحذف', { type: 'ok' }); render(); }
        catch (e) { toast(e.message, { type: 'err' }); }
      }
    });
  };
  render();
})();
