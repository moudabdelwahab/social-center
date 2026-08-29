'use strict';
/* groups.js — إدارة المجموعات */
(function () {
  const root = document.getElementById('groups-root');
  if (!root) return;

  function render() {
    const gs = appState.groups;
    root.innerHTML = `
      <div class="between mb-2 wrap">
        <div class="muted small">${gs.length} مجموعات تنظّم ${appState.accounts.length} حسابًا</div>
        <button class="btn btn-primary" onclick="openGroupModal()">${icon('plus', 15)} إنشاء مجموعة</button>
      </div>
      <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(320px,1fr))">
        ${gs.map(g => {
          const accs = g.accountIds.map(id => appState.accounts.find(a => a.id === id)).filter(Boolean);
          const camps = appState.campaigns.filter(c => c.status === 'active' && c.accountIds.some(id => g.accountIds.includes(id)));
          return `<div class="card hoverable group-card">
            <div class="gc-head">
              <div class="gc-icon" style="background:${g.color}">${icon('folder', 19)}</div>
              <div class="grow"><div class="cc-name">${esc(g.name)}</div><div class="cc-client">${esc(g.desc || '')}</div></div>
            </div>
            <div class="gc-stats">
              <div><b class="num">${accs.length}</b>حسابات</div>
              <div><b class="num">${camps.length}</b>حملات نشطة</div>
              <div><b class="num">${fmtNum(accs.reduce((s, a) => s + a.followers, 0))}</b>متابع إجمالي</div>
            </div>
            <div class="avatar-stack">
              ${accs.slice(0, 6).map(a => accAvatar(a, 28)).join('')}
              ${accs.length > 6 ? `<div class="acc-avatar more" style="width:28px;height:28px;font-size:10px">+${accs.length - 6}</div>` : ''}
            </div>
            <div class="flex" style="gap:6px">
              <button class="btn btn-ghost btn-sm grow" onclick="openMembersModal(${g.id})">${icon('users', 14)} إدارة الأعضاء</button>
              <button class="btn btn-ghost btn-sm" onclick="openGroupModal(${g.id})">${icon('edit', 14)}</button>
              <button class="btn btn-danger btn-sm" onclick="delGroup(${g.id})">${icon('trash', 14)}</button>
            </div>
          </div>`;
        }).join('') || emptyState('folder', 'لا مجموعات بعد', 'أنشئ مجموعات مثل «عملاء رمضان» لتنظيم أصولك', `<button class="btn btn-primary" onclick="openGroupModal()">${icon('plus', 15)} إنشاء أول مجموعة</button>`)}
      </div>`;
  }

  window.openGroupModal = (id) => {
    const g = id ? appState.groups.find(x => x.id === id) : null;
    const colors = ['#6d8dff', '#8b5cf6', '#2fbf8f', '#eda33c', '#f0566d', '#3fc1d8'];
    const m = openModal({
      title: g ? 'تعديل المجموعة' : 'إنشاء مجموعة', size: 'sm',
      body: `
        <div class="field"><label>اسم المجموعة <span class="req">*</span></label><input class="input" id="g-name" value="${esc(g?.name || '')}" placeholder="مثال: حملة رمضان"></div>
        <div class="field"><label>الوصف</label><input class="input" id="g-desc" value="${esc(g?.desc || '')}" placeholder="وصف قصير"></div>
        <div class="field"><label>اللون</label><div class="flex">${colors.map((c, i) => `
          <label style="cursor:pointer"><input type="radio" name="gc" value="${c}" ${(g ? g.color === c : i === 0) ? 'checked' : ''} style="display:none">
          <span style="display:block;width:30px;height:30px;border-radius:9px;background:${c};border:2.5px solid transparent" class="gc-swatch" data-c="${c}"></span></label>`).join('')}</div></div>`,
      actions: `<button class="btn btn-primary" id="g-save">${g ? 'حفظ' : 'إنشاء'}</button><button class="btn btn-ghost" id="g-cancel">إلغاء</button>`
    });
    const mark = () => m.el.querySelectorAll('.gc-swatch').forEach(s => s.style.borderColor = m.el.querySelector(`[name=gc][value="${s.dataset.c}"]`).checked ? '#fff' : 'transparent');
    m.el.querySelectorAll('[name=gc]').forEach(r => r.onchange = mark); mark();
    m.el.querySelector('#g-cancel').onclick = m.close;
    m.el.querySelector('#g-save').onclick = () => {
      const name = m.el.querySelector('#g-name').value.trim();
      if (!name) return toast('اسم المجموعة مطلوب', { type: 'warn' });
      const data = { name, desc: m.el.querySelector('#g-desc').value.trim(), color: m.el.querySelector('[name=gc]:checked').value };
      g ? DB.updateGroup(id, data) : DB.addGroup(data);
      m.close(); toast(g ? 'تم حفظ المجموعة' : 'تم إنشاء المجموعة', { type: 'ok' }); render();
    };
  };

  window.openMembersModal = (id) => {
    const g = appState.groups.find(x => x.id === id);
    const members = new Set(g.accountIds);
    const m = openModal({
      title: `أعضاء «${esc(g.name)}»`, sub: `${g.accountIds.length} حسابًا حاليًا`,
      body: `<div class="check-list">${appState.accounts.map(a => `
        <label class="check-item"><input type="checkbox" data-aid="${a.id}" ${members.has(a.id) ? 'checked' : ''}>
        ${accAvatar(a, 28)}<span class="grow truncate">${esc(a.name)}</span>${accBadge(a.status)}</label>`).join('')}</div>`,
      actions: `<button class="btn btn-primary" id="gm-save">حفظ التغييرات</button><button class="btn btn-ghost" id="gm-cancel">إلغاء</button>`
    });
    m.el.querySelector('#gm-cancel').onclick = m.close;
    m.el.querySelector('#gm-save').onclick = () => {
      DB.updateGroup(id, { accountIds: [...m.el.querySelectorAll('[data-aid]:checked')].map(x => +x.dataset.aid) });
      m.close(); toast('تم تحديث أعضاء المجموعة', { type: 'ok' }); render();
    };
  };

  window.delGroup = (id) => {
    const g = appState.groups.find(x => x.id === id);
    confirmDialog({
      message: `حذف المجموعة <b>${esc(g.name)}</b>؟ لن تتأثر الحسابات نفسها.`,
      confirmText: 'حذف المجموعة',
      onConfirm: () => { DB.removeGroup(id); toast('تم حذف المجموعة', { type: 'ok' }); render(); }
    });
  };

  render();
})();
