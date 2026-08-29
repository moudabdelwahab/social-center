'use strict';
/* settings.js — الإعدادات: الحساب، مساحة العمل، الفريق، الأدوار، الإشعارات، الأمان، المنصات، الفوترة */
(function () {
  const root = document.getElementById('settings-root');
  if (!root) return;
  let panel = location.hash.replace('#', '') || 'profile';

  const NAV = [
    ['profile', 'الحساب الشخصي', 'users'], ['workspace', 'مساحة العمل', 'building'],
    ['team', 'الفريق', 'users'], ['roles', 'الأدوار والصلاحيات', 'shield'],
    ['notifications', 'الإشعارات', 'bell'], ['security', 'الأمان', 'key'],
    ['platforms', 'المنصات المتصلة', 'layers'], ['billing', 'الفوترة والخطة', 'card']
  ];
  const team = [
    { name: 'سارة الأحمد', email: 'sara@numu.agency', role: 'المالك', you: true },
    { name: 'محمد العتيبي', email: 'm.otaibi@numu.agency', role: 'مدير' },
    { name: 'نورة القحطاني', email: 'noura@numu.agency', role: 'مشرف حملات' },
    { name: 'خالد الشمري', email: 'k.shamri@numu.agency', role: 'محرر' },
    { name: 'ريم الدوسري', email: 'reem@numu.agency', role: 'مشاهد' }
  ];
  const toggleRow = (title, sub, key, group) => `
    <div class="setting-row"><div><div class="sr-t">${title}</div><div class="sr-s">${sub}</div></div>
      <span class="toggle"><input type="checkbox" ${appState.settings[group][key] ? 'checked' : ''} onchange="setToggle('${group}','${key}',this.checked)"><span class="tk"></span></span></div>`;

  function panels() {
    return {
      profile: `<div class="card"><div class="card-title mb-2">${icon('users', 17)} الملف الشخصي</div>
        <div class="flex mb-2"><div class="avatar" style="width:56px;height:56px;font-size:21px;border-radius:15px">${esc(appState.user.name[0])}</div>
        <div><button class="btn btn-ghost btn-sm">تغيير الصورة</button><div class="form-hint">PNG أو JPG — بحد أقصى 2MB</div></div></div>
        <div class="form-row">
          <div class="field"><label>الاسم الكامل</label><input class="input" id="pf-name" value="${esc(appState.user.name)}"></div>
          <div class="field"><label>البريد الإلكتروني</label><input class="input mono" id="pf-email" value="${esc(appState.user.email)}"></div>
        </div>
        <button class="btn btn-primary" onclick="saveProfile()">حفظ التغييرات</button></div>`,
      workspace: `<div class="card"><div class="card-title mb-2">${icon('building', 17)} مساحة العمل</div>
        <div class="form-row">
          <div class="field"><label>اسم مساحة العمل</label><input class="input" id="ws-name" value="${esc(appState.workspace.name)}"></div>
          <div class="field"><label>المنطقة الزمنية</label><select class="select"><option>Asia/Riyadh (UTC+3)</option><option>Asia/Dubai (UTC+4)</option><option>Africa/Cairo (UTC+2)</option></select></div>
        </div>
        <button class="btn btn-primary" onclick="saveWorkspace()">حفظ</button></div>
        <div class="card danger-zone"><div class="card-title mb-2 text-red">${icon('alert', 17)} منطقة الخطر</div>
          <div class="setting-row"><div><div class="sr-t">إعادة تعيين البيانات التجريبية</div><div class="sr-s">مسح كل البيانات المحلية وتوليد بيانات جديدة</div></div>
          <button class="btn btn-danger btn-sm" onclick="confirmDialog({message:'سيتم مسح كل شيء وإعادة التوليد. متابعة؟',confirmText:'إعادة تعيين',onConfirm:resetState})">إعادة تعيين</button></div></div>`,
      team: `<div class="card"><div class="between mb-2"><div class="card-title">${icon('users', 17)} أعضاء الفريق (${team.length})</div>
        <button class="btn btn-primary btn-sm" onclick="inviteMember()">${icon('plus', 14)} دعوة عضو</button></div>
        <div class="mini-list">${team.map(t => `
          <div class="mini-row"><div class="avatar" style="width:36px;height:36px;font-size:13px">${esc(t.name[0])}</div>
            <div class="grow"><div class="lr-title">${esc(t.name)} ${t.you ? '<span class="badge bg-blue">أنت</span>' : ''}</div><div class="lr-sub mono">${esc(t.email)}</div></div>
            <span class="badge bg-purple">${t.role}</span>
            ${!t.you ? `<button class="btn btn-ghost btn-xs">${icon('more', 14)}</button>` : ''}
          </div>`).join('')}</div></div>`,
      roles: `<div class="card"><div class="card-title mb-2">${icon('shield', 17)} مصفوفة الصلاحيات (RBAC)</div>
        <div class="table-wrap" style="border:none"><table class="tbl"><thead><tr><th>الصلاحية</th><th>المالك</th><th>مدير</th><th>مشرف</th><th>محرر</th><th>مشاهد</th></tr></thead><tbody>
          ${[['إدارة الفريق والفوترة', [1, 0, 0, 0, 0]], ['ربط وفصل الحسابات', [1, 1, 1, 0, 0]], ['إنشاء وإطلاق الحملات', [1, 1, 1, 0, 0]], ['إنشاء وتعديل المحتوى', [1, 1, 1, 1, 0]], ['جدولة المنشورات', [1, 1, 1, 1, 0]], ['عرض التحليلات والتقارير', [1, 1, 1, 1, 1]]].map(([perm, cols]) => `
            <tr><td>${perm}</td>${cols.map(v => `<td>${v ? '<span class="text-green">' + icon('check', 14) + '</span>' : '<span class="muted">' + icon('x', 13) + '</span>'}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div>
        <div class="form-hint mt-1">${icon('info', 12)} الأدوار قابلة للتوسع — يمكن إضافة أدوار مخصصة في خطة المؤسسات.</div></div>`,
      notifications: `<div class="card"><div class="card-title mb-2">${icon('bell', 17)} تفضيلات التنبيه</div>
        ${toggleRow('اكتمال الحملات', 'عند انتهاء تنفيذ كل مهام الحملة', 'campaignDone', 'notif')}
        ${toggleRow('فشل العمليات', 'تنبيه فوري عند فشل نشر أو مزامنة', 'jobFail', 'notif')}
        ${toggleRow('انتهاء صلاحية الاتصال', 'قبل انتهاء رموز الوصول بـ 48 ساعة', 'tokenExpiring', 'notif')}
        ${toggleRow('التقرير الأسبوعي', 'ملخص الأداء كل يوم أحد', 'weeklyReport', 'notif')}
        ${toggleRow('التعليقات الجديدة', 'عند وصول تعليقات على المنشورات', 'newComment', 'notif')}
        <div class="form-hint mt-1">${icon('info', 12)} القنوات الخارجية (البريد / واتساب / Push) تُفعَّل من إعدادات المنصات عند ربطها.</div></div>`,
      security: `<div class="card"><div class="card-title mb-2">${icon('key', 17)} الأمان</div>
        ${toggleRow('المصادقة الثنائية (2FA)', 'طبقة حماية إضافية عند تسجيل الدخول', 'twoFactor', 'security')}
        ${toggleRow('تنبيهات الجلسات', 'إشعار عند تسجيل دخول من جهاز جديد', 'sessionAlerts', 'security')}
        <div class="setting-row"><div><div class="sr-t">تغيير كلمة المرور</div><div class="sr-s">آخر تغيير قبل 3 أشهر</div></div><button class="btn btn-ghost btn-sm" onclick="toast('أُرسل رابط التغيير إلى بريدك',{type:'ok'})">إرسال رابط التغيير</button></div>
        <div class="setting-row"><div><div class="sr-t">الجلسات النشطة</div><div class="sr-s">جهازان متصلان حاليًا</div></div><button class="btn btn-ghost btn-sm" onclick="toast('تم إنهاء الجلسات الأخرى',{type:'ok'})">إنهاء الكل</button></div></div>
        <div class="card"><div class="card-title mb-2">${icon('shield', 17)} حماية البيانات</div>
          <div class="mini-list small muted">
            <div class="mini-row">${icon('check', 14)} رموز الوصول مشفّرة بـ AES-256-GCM قبل التخزين</div>
            <div class="mini-row">${icon('check', 14)} لا تُطلب كلمات مرور المنصات — OAuth الرسمي فقط</div>
            <div class="mini-row">${icon('check', 14)} سجل تدقيق كامل لكل عملية حساسة</div>
          </div></div>`,
      platforms: `<div class="card"><div class="card-title mb-2">${icon('layers', 17)} المنصات والقدرات</div>
        ${Object.entries(SEED.platforms).map(([k, p]) => {
          const n = appState.accounts.filter(a => a.platform === k).length;
          const caps = { meta: 'نشر · جدولة · تعليقات · تحليلات · رسائل', instagram: 'نشر · جدولة · تعليقات · تحليلات', tiktok: 'نشر · تحليلات', linkedin: 'نشر · جدولة · تحليلات' }[k];
          return `<div class="setting-row">
            <div class="flex"><span class="platform-ic" style="background:${p.color};width:34px;height:34px;font-size:12px">${p.short}</span>
            <div><div class="sr-t">${p.name}</div><div class="sr-s">${caps}</div></div></div>
            <div class="flex">${n ? `<span class="badge bg-green">${icon('check', 11)} ${n} حسابات</span>` : '<span class="badge bg-gray"><span class="bd"></span>غير مربوط</span>'}
            <a class="btn btn-ghost btn-sm" href="accounts.html">${icon('plus', 13)} ربط</a></div>
          </div>`;
        }).join('')}
        <div class="form-hint mt-1">${icon('info', 12)} كل منصة تُدار عبر Provider مستقل بواجهة موحدة — إضافة منصة جديدة لا تعدّل النواة.</div></div>`,
      billing: `<div class="card"><div class="card-title mb-2">${icon('card', 17)} خطتك الحالية: ${appState.workspace.plan}</div>
        <div class="kv-grid" style="grid-template-columns:1fr 1fr">
          <div class="kv"><span class="k">الحسابات</span><span class="v num">${appState.accounts.length} / 100</span></div>
          <div class="kv"><span class="k">الحملات</span><span class="v num">${appState.campaigns.length} / 50</span></div>
          <div class="kv"><span class="k">أعضاء الفريق</span><span class="v num">5 / 10</span></div>
          <div class="kv"><span class="k">عمليات الشهر</span><span class="v num">8.4K / 20K</span></div>
        </div></div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(200px,1fr))">
          ${[['المبتدئة', '٩٩', '10 حسابات · 5 حملات · مستخدمان', false], ['الاحترافية', '٢٩٩', '100 حساب · 50 حملة · 10 مستخدمين', true], ['الأعمال', '٧٩٩', '1000 حساب · تحليلات متقدمة · أتمتة', false], ['المؤسسات', 'مخصص', 'حدود مخصصة · SLA · دعم مخصص', false]].map(([n, pr, f, cur]) => `
            <div class="plan-card ${cur ? 'current' : ''}">
              ${cur ? '<span class="badge bg-blue" style="position:absolute;top:14px;inset-inline-end:14px">الحالية</span>' : ''}
              <h3>${n}</h3><div class="pc-price num">${pr} <span class="small muted" style="font-weight:400">${pr === 'مخصص' ? '' : 'ر.س/شهر'}</span></div>
              <div class="small muted">${f}</div>
              ${cur ? '' : `<button class="btn btn-ghost btn-sm mt-2 btn-block" onclick="toast('طلب الترقية أُرسل لفريق المبيعات',{type:'ok'})">الترقية</button>`}
            </div>`).join('')}
        </div>`
    };
  }

  function render() {
    const P = panels();
    root.innerHTML = `
      <div class="settings-layout">
        <nav class="settings-nav">
          ${NAV.map(([id, t, ic]) => `<button class="${panel === id ? 'active' : ''}" onclick="setPanel('${id}')">${icon(ic, 16)} ${t}</button>`).join('')}
        </nav>
        <div class="settings-panel active">${P[panel] || P.profile}</div>
      </div>`;
  }
  window.setPanel = (p) => { panel = p; history.replaceState(null, '', '#' + p); render(); };
  window.setToggle = (group, key, v) => { appState.settings[group][key] = v; saveState(); toast('حُفظت التفضيلات', { type: 'ok', duration: 1500 }); };
  window.saveProfile = () => {
    appState.user.name = document.getElementById('pf-name').value.trim() || appState.user.name;
    appState.user.email = document.getElementById('pf-email').value.trim() || appState.user.email;
    saveState(); toast('تم حفظ الملف الشخصي', { type: 'ok' });
  };
  window.saveWorkspace = () => {
    appState.workspace.name = document.getElementById('ws-name').value.trim() || appState.workspace.name;
    saveState(); toast('تم حفظ مساحة العمل', { type: 'ok' });
  };
  window.inviteMember = () => {
    const m = openModal({
      title: 'دعوة عضو جديد', size: 'sm',
      body: `<div class="field"><label>البريد الإلكتروني <span class="req">*</span></label><input class="input mono" id="im-email" placeholder="name@company.com"></div>
        <div class="field"><label>الدور</label><select class="select" id="im-role"><option>مشاهد</option><option>محرر</option><option>مشرف حملات</option><option>مدير</option></select></div>`,
      actions: `<button class="btn btn-primary" id="im-send">إرسال الدعوة</button><button class="btn btn-ghost" id="im-cancel">إلغاء</button>`
    });
    m.el.querySelector('#im-cancel').onclick = m.close;
    m.el.querySelector('#im-send').onclick = () => {
      const em = m.el.querySelector('#im-email').value.trim();
      if (!em.includes('@')) return toast('بريد غير صالح', { type: 'warn' });
      m.close(); toast('أُرسلت الدعوة', { body: em, type: 'ok' });
    };
  };
  render();
})();
