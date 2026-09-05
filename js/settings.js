'use strict';
/* settings.js — إعدادات حقيقية: الملف/مساحة العمل/الفريق تحفظ في Supabase */
(async function () {
  await new Promise(r => document.addEventListener('scc:ready', r, { once: true }));
  const root = document.getElementById('settings-root');
  if (!root) return;
  let panel = location.hash.replace('#', '') || 'profile';
  let team = [], plan = null, accs = [], camps = [];
  try { [team, plan, accs, camps] = await Promise.all([DB.settings.team(), DB.settings.plan().catch(() => null), DB.accounts.list(), DB.campaigns.list()]); } catch (e) { toast(e.message, { type: 'err' }); }

  const NAV = [
    ['profile', 'الحساب الشخصي', 'users'], ['workspace', 'مساحة العمل', 'building'],
    ['team', 'الفريق', 'users'], ['roles', 'الأدوار والصلاحيات', 'shield'],
    ['notifications', 'الإشعارات', 'bell'], ['security', 'الأمان', 'key'],
    ['platforms', 'المنصات المتصلة', 'layers'], ['billing', 'الفوترة والخطة', 'card']
  ];
  const prefs = S.profile?.preferences || {};
  const toggleRow = (title, sub, key) => `
    <div class="setting-row"><div><div class="sr-t">${title}</div><div class="sr-s">${sub}</div></div>
      <span class="toggle"><input type="checkbox" ${prefs[key] ? 'checked' : ''} onchange="setToggle('${key}',this.checked)"><span class="tk"></span></span></div>`;

  function panels() {
    return {
      profile: `<div class="card"><div class="card-title mb-2">${icon('users', 17)} الملف الشخصي</div>
        <div class="flex mb-2"><div class="avatar" style="width:56px;height:56px;font-size:21px;border-radius:15px;background:${esc(S.profile?.avatar_color || '#7d83e0')}">${esc((S.profile?.full_name || '؟')[0])}</div>
        <div class="muted small">${esc(S.user?.email || '')}</div></div>
        <div class="form-row">
          <div class="field"><label>الاسم الكامل</label><input class="input" id="pf-name" value="${esc(S.profile?.full_name || '')}"></div>
          <div class="field"><label>البريد الإلكتروني</label><input class="input mono" value="${esc(S.user?.email || '')}" disabled><div class="form-hint">تغيير البريد يتم عبر دعم المنصة</div></div>
        </div>
        <button class="btn btn-primary" id="pf-save" onclick="saveProfile(this)">حفظ التغييرات</button></div>`,
      workspace: `<div class="card"><div class="card-title mb-2">${icon('building', 17)} مساحة العمل</div>
        <div class="form-row">
          <div class="field"><label>اسم مساحة العمل</label><input class="input" id="ws-name" value="${esc(S.workspace.name)}" ${can('admin') ? '' : 'disabled'}></div>
          <div class="field"><label>الخطة</label><input class="input" value="${esc(plan?.name || S.workspace.plan_code)}" disabled></div>
        </div>
        ${can('admin') ? `<button class="btn btn-primary" id="ws-save" onclick="saveWorkspace(this)">حفظ</button>` : '<div class="form-hint">تعديل مساحة العمل يتطلب صلاحية مدير أو مالك</div>'}
        <div class="form-hint mt-2">${icon('info', 12)} دورك الحالي: <b>${ROLE_NAMES[S.role]}</b></div></div>`,
      team: `<div class="card"><div class="between mb-2"><div class="card-title">${icon('users', 17)} أعضاء الفريق (${team.length})</div>
        ${can('admin') ? `<button class="btn btn-primary btn-sm" disabled title="دعوة الأعضاء تتطلب Edge Function — قريبًا">${icon('plus', 14)} دعوة عضو (قريبًا)</button>` : ''}</div>
        <div class="mini-list">${team.map(t => `
          <div class="mini-row"><div class="avatar" style="width:36px;height:36px;font-size:13px;background:${esc(t.profiles?.avatar_color || '#7d83e0')}">${esc((t.profiles?.full_name || '؟')[0])}</div>
            <div class="grow"><div class="lr-title">${esc(t.profiles?.full_name || '—')} ${t.profiles?.id === S.user.id ? '<span class="badge bg-blue">أنت</span>' : ''}</div>
            <div class="lr-sub mono">${esc(t.profiles?.email || '')}</div></div>
            <span class="badge bg-purple">${ROLE_NAMES[t.role] || t.role}</span></div>`).join('')}</div>
        <div class="form-hint mt-1">${icon('info', 12)} دعوة أعضاء جدد ستتاح عبر Edge Function ترسل بريد دعوة آمن — قيد التطوير.</div></div>`,
      roles: `<div class="card"><div class="card-title mb-2">${icon('shield', 17)} مصفوفة الصلاحيات (تُفرض عبر RLS في قاعدة البيانات)</div>
        <div class="table-wrap" style="border:none"><table class="tbl"><thead><tr><th>الصلاحية</th><th>المالك</th><th>مدير</th><th>مشرف</th><th>محرر</th><th>مشاهد</th></tr></thead><tbody>
          ${[['إدارة الفريق والفوترة', [1, 1, 0, 0, 0]], ['ربط وفصل الحسابات', [1, 1, 1, 0, 0]], ['إنشاء وإطلاق الحملات', [1, 1, 1, 0, 0]], ['إنشاء وتعديل المحتوى', [1, 1, 1, 1, 0]], ['جدولة المنشورات', [1, 1, 1, 1, 0]], ['عرض التحليلات والتقارير', [1, 1, 1, 1, 1]]].map(([perm, cols]) => `
            <tr><td>${perm}</td>${cols.map(v => `<td>${v ? '<span class="text-green">' + icon('check', 14) + '</span>' : '<span class="muted">' + icon('x', 13) + '</span>'}</td>`).join('')}</tr>`).join('')}
        </tbody></table></div>
        <div class="form-hint mt-1">${icon('info', 12)} حتى لو حاول مستخدم تنفيذ عملية يدويًا، تمنعه سياسات RLS ما لم يملك الدور المناسب.</div></div>`,
      notifications: `<div class="card"><div class="card-title mb-2">${icon('bell', 17)} تفضيلات التنبيه — تحفظ في ملفك</div>
        ${toggleRow('اكتمال الحملات', 'عند انتهاء تنفيذ مهام الحملة', 'campaignDone')}
        ${toggleRow('فشل العمليات', 'تنبيه فوري عند فشل نشر أو مزامنة', 'jobFail')}
        ${toggleRow('انتهاء صلاحية الاتصال', 'قبل انتهاء رموز الوصول', 'tokenExpiring')}
        ${toggleRow('التقرير الأسبوعي', 'ملخص الأداء كل أسبوع', 'weeklyReport')}
        <div class="form-hint mt-1">${icon('info', 12)} القنوات الخارجية (البريد / واتساب / Push) تُضاف لاحقًا.</div></div>`,
      security: `<div class="card"><div class="card-title mb-2">${icon('key', 17)} الأمان</div>
        <div class="setting-row"><div><div class="sr-t">تغيير كلمة المرور</div><div class="sr-s">يُرسل رابط آمن إلى بريدك</div></div>
          <button class="btn btn-ghost btn-sm" id="sec-reset" onclick="sendReset(this)">إرسال رابط التغيير</button></div>
        <div class="setting-row"><div><div class="sr-t">المصادقة الثنائية (2FA)</div><div class="sr-s">طبقة حماية إضافية</div></div>
          <span class="badge bg-gray"><span class="bd"></span>قريبًا</span></div>
        <div class="setting-row"><div><div class="sr-t">إنهاء كل الجلسات</div><div class="sr-s">تسجيل خروج من كل الأجهزة</div></div>
          <button class="btn btn-danger btn-sm" onclick="confirmDialog({title:'إنهاء الجلسات',message:'سيتم تسجيل خروجك الآن.',confirmText:'متابعة',onConfirm:()=>Auth.signOut()})">إنهاء الكل</button></div></div>
        <div class="card"><div class="card-title mb-2">${icon('shield', 17)} حماية البيانات</div>
          <div class="mini-list small muted">
            <div class="mini-row">${icon('check', 14)} الجلسات عبر Supabase Auth مع تجديد تلقائي للرموز</div>
            <div class="mini-row">${icon('check', 14)} كل الجداول محمية بسياسات Row Level Security</div>
            <div class="mini-row">${icon('check', 14)} لا بيانات أعمال في LocalStorage — تفضيلات الواجهة فقط</div>
          </div></div>`,
      platforms: `<div class="card"><div class="card-title mb-2">${icon('layers', 17)} المنصات والقدرات</div>
        ${Object.entries(PLATFORMS).map(([k, p]) => {
          const n = accs.filter(a => a.platform === k).length;
          const caps = { meta: 'نشر · جدولة · تعليقات · تحليلات · رسائل', instagram: 'نشر · جدولة · تعليقات · تحليلات', tiktok: 'نشر · تحليلات', linkedin: 'نشر · جدولة · تحليلات' }[k];
          return `<div class="setting-row">
            <div class="flex"><span class="platform-ic" style="background:${p.color};width:34px;height:34px;font-size:12px">${p.short}</span>
            <div><div class="sr-t">${p.name}</div><div class="sr-s">${caps}</div></div></div>
            <div class="flex">${n ? `<span class="badge bg-green">${icon('check', 11)} ${n} حسابات</span>` : '<span class="badge bg-gray"><span class="bd"></span>التكامل غير متصل بعد</span>'}</div>
          </div>`;
        }).join('')}
        <div class="form-hint mt-1">${icon('info', 12)} ربط Meta الفعلي يتطلب إعداد OAuth (App ID + Secret) عبر Edge Functions — طبقة Providers جاهزة للاستقبال.</div></div>`,
      billing: `<div class="card"><div class="card-title mb-2">${icon('card', 17)} خطتك: ${esc(plan?.name || S.workspace.plan_code)}</div>
        <div class="kv-grid" style="grid-template-columns:1fr 1fr">
          <div class="kv"><span class="k">الحسابات</span><span class="v num">${accs.length} / ${plan?.max_accounts ?? '—'}</span></div>
          <div class="kv"><span class="k">الحملات</span><span class="v num">${camps.length} / ${plan?.max_campaigns ?? '—'}</span></div>
          <div class="kv"><span class="k">أعضاء الفريق</span><span class="v num">${team.length} / ${plan?.max_users ?? '—'}</span></div>
          <div class="kv"><span class="k">عمليات الشهر</span><span class="v num">— / ${plan ? fmtNum(plan.max_jobs_per_month) : '—'}</span></div>
        </div>
        <div class="form-hint mt-2">${icon('info', 12)} الترقية والفوترة ستُربط ببوابة دفع — قريبًا. الحدود تُقرأ من قاعدة البيانات وليست ثابتة في الكود.</div></div>`
    };
  }

  function render() {
    const P = panels();
    root.innerHTML = `
      <div class="settings-layout">
        <nav class="settings-nav">${NAV.map(([id, t, ic]) => `<button class="${panel === id ? 'active' : ''}" onclick="setPanel('${id}')">${icon(ic, 16)} ${t}</button>`).join('')}</nav>
        <div class="settings-panel active">${P[panel] || P.profile}</div>
      </div>`;
  }
  window.setPanel = (p) => { panel = p; history.replaceState(null, '', '#' + p); render(); };
  window.saveProfile = async (btn) => {
    const done = btnBusy(btn);
    try {
      await DB.settings.saveProfile({ full_name: document.getElementById('pf-name').value.trim() });
      S.profile.full_name = document.getElementById('pf-name').value.trim();
      DB.audit('profile_updated', 'profile', S.user.id);
      toast('تم حفظ الملف الشخصي', { type: 'ok' });
    } catch (e) { toast(e.message, { type: 'err' }); }
    done();
  };
  window.saveWorkspace = async (btn) => {
    const done = btnBusy(btn);
    try {
      await DB.settings.saveWorkspace({ name: document.getElementById('ws-name').value.trim() });
      S.workspace.name = document.getElementById('ws-name').value.trim();
      DB.audit('workspace_updated', 'workspace', S.workspace.id);
      toast('تم حفظ مساحة العمل', { type: 'ok' });
    } catch (e) { toast(e.message, { type: 'err' }); }
    done();
  };
  window.setToggle = async (key, v) => {
    const np = { ...(S.profile?.preferences || {}), [key]: v };
    try { await DB.settings.saveProfile({ preferences: np }); S.profile.preferences = np; toast('حُفظت التفضيلات', { type: 'ok', duration: 1500 }); }
    catch (e) { toast(e.message, { type: 'err' }); }
  };
  window.sendReset = async (btn) => {
    const done = btnBusy(btn, 'جارٍ الإرسال…');
    try { await Auth.sendReset(S.user.email); toast('أُرسل رابط تغيير كلمة المرور إلى بريدك', { type: 'ok' }); }
    catch (e) { toast(e.message, { type: 'err' }); }
    done();
  };
  render();
})();
