'use strict';
/* مركز القيادة الاجتماعي — SPA بلا اعتماديات خارجية، RTL، عربية بالكامل */
const state = { user: null, workspaces: [], ws: null, view: 'dashboard', params: {}, unread: 0, pollTimer: null };

/* ---------------- HTTP ---------------- */
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', 'X-Requested-With': 'fetch' };
  if (state.ws) headers['X-Workspace-Id'] = state.ws.id;
  const res = await fetch('/api' + path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (res.status === 401 && !path.startsWith('/auth')) { logout(false); throw new Error('انتهت الجلسة'); }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'حدث خطأ غير متوقع');
  return data;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
const fmtDate = (s) => (s ? new Date(String(s).replace(' ', 'T') + 'Z').toLocaleString('ar-EG-u-nu-latn', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }) : '—');

function toast(msg, type = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.textContent = msg;
  document.getElementById('toasts').appendChild(el);
  setTimeout(() => el.remove(), 4200);
}

/* ---------------- قواميس الحالات (أيقونة + لون — لا اعتماد على اللون وحده) ---------------- */
const ACC_STATUS = {
  connected: { t: 'متصل', c: 'green', i: '✓' },
  reconnect_required: { t: 'يحتاج إعادة اتصال', c: 'amber', i: '↻' },
  permissions_missing: { t: 'صلاحيات ناقصة', c: 'amber', i: '⚠' },
  unavailable: { t: 'غير متاح', c: 'gray', i: '⊘' },
  paused: { t: 'متوقف', c: 'gray', i: '⏸' },
  syncing: { t: 'قيد المزامنة', c: 'cyan', i: '⟳' },
  error: { t: 'حدث خطأ', c: 'red', i: '✕' }
};
const CAMP_STATUS = {
  draft: { t: 'مسودة', c: 'gray' }, scheduled: { t: 'مجدولة', c: 'blue' }, active: { t: 'نشطة', c: 'green' },
  paused: { t: 'متوقفة', c: 'amber' }, completed: { t: 'مكتملة', c: 'purple' }, failed: { t: 'فشلت', c: 'red' }
};
const JOB_STATUS = {
  pending: { t: 'قيد الانتظار', c: 'gray' }, processing: { t: 'قيد التنفيذ', c: 'cyan' }, success: { t: 'نجاح', c: 'green' },
  failed: { t: 'فشل', c: 'red' }, cancelled: { t: 'ملغاة', c: 'gray' }, retrying: { t: 'إعادة محاولة', c: 'amber' }
};
const JOB_ACTIONS = { publish_post: 'نشر محتوى', sync_account: 'مزامنة حساب', refresh_connection: 'تحديث اتصال', refresh_metrics: 'جلب إحصائيات' };
const ERR_CATS = { authentication: 'مصادقة', permission: 'صلاحيات', rate_limit: 'حد الطلبات', network: 'شبكة', api: 'واجهة API', validation: 'تحقق', internal: 'داخلي' };
const POST_STATUS = { draft: { t: 'مسودة', c: 'gray' }, approved: { t: 'معتمد', c: 'blue' }, scheduled: { t: 'مجدول', c: 'cyan' }, published: { t: 'منشور', c: 'green' }, failed: { t: 'فشل', c: 'red' } };
const PLATFORM_ICONS = { meta: 'Ⓜ️', instagram: '📸', tiktok: '🎵', linkedin: '💼', mock: '🧪' };
const AV_COLORS = ['#5b8cff', '#7c5bff', '#34c98e', '#f5a623', '#f2556a', '#38c4dd', '#a78bfa'];

const badge = (s, map) => { const m = map[s] || { t: s, c: 'gray' }; return `<span class="badge b-${m.c}"><i></i>${m.i ? m.i + ' ' : ''}${m.t}</span>`; };

/* ---------------- الهيكل والتنقل ---------------- */
function navigate(view, params = {}) {
  state.view = view; state.params = params;
  clearInterval(state.pollTimer); state.pollTimer = null;
  render();
  window.scrollTo(0, 0);
}
function startPolling(fn, ms = 6000) { clearInterval(state.pollTimer); state.pollTimer = setInterval(fn, ms); }

async function refreshUnread() {
  if (!state.ws) return;
  try { const d = await api('/notifications'); state.unread = d.unread; const b = document.getElementById('nav-badge'); if (b) b.style.display = d.unread ? '' : 'none', b.textContent = d.unread; } catch {}
}

function layout(content, crumb) {
  const nav = [
    ['dashboard', '🏠', 'الرئيسية'],
    ['sec', '', 'الحسابات'],
    ['accounts', '👥', 'جميع الحسابات'],
    ['groups', '🗂', 'المجموعات'],
    ['errors', '🚨', 'المشاكل'],
    ['sec', '', 'التسويق'],
    ['campaigns', '🎯', 'جميع الحملات'],
    ['posts', '📝', 'المحتوى والجدولة'],
    ['jobs', '⚙️', 'العمليات'],
    ['analytics', '📊', 'التحليلات'],
    ['notifications', '🔔', 'الإشعارات'],
    ['settings', '⚙', 'الإعدادات']
  ];
  return `
  <div class="layout">
    <aside class="sidebar">
      <div class="sb-brand"><div class="logo-mark">س</div><div><div class="name">مركز القيادة</div><div class="plan">${esc(state.ws?.plan || '')} — ${esc(state.ws?.name || '')}</div></div></div>
      ${nav.map(([v, ico, t]) => v === 'sec'
        ? `<div class="sb-sec">${t}</div>`
        : `<button class="sb-link ${state.view === v ? 'on' : ''}" onclick="navigate('${v}')"><span class="ico">${ico}</span>${t}${v === 'notifications' ? `<span class="badge" id="nav-badge" style="${state.unread ? '' : 'display:none'}">${state.unread}</span>` : ''}</button>`).join('')}
    </aside>
    <main class="main">
      <div class="topbar">
        <div><h2>${crumb}</h2></div>
        <div style="flex:1"></div>
        <div class="search-box"><input id="global-search" placeholder="بحث عام… (حساب / حملة / منشور)" onkeydown="if(event.key==='Enter')globalSearch(this.value)"></div>
        <button class="icon-btn" onclick="navigate('notifications')" title="الإشعارات">🔔${state.unread ? `<span class="n-badge">${state.unread}</span>` : ''}</button>
        <div class="avatar" title="${esc(state.user?.name)}" onclick="if(confirm('تسجيل الخروج؟'))logout()">${esc((state.user?.name || '؟')[0])}</div>
      </div>
      <div id="page">${content}</div>
    </main>
  </div>`;
}

/* ---------------- العرض الرئيسي ---------------- */
const app = document.getElementById('app');
function render() {
  if (!state.user) return renderAuth();
  const V = VIEWS[state.view] || VIEWS.dashboard;
  V();
}
const setPage = (html) => { document.getElementById('page').innerHTML = html; };

/* ---------------- المصادقة ---------------- */
function renderAuth() {
  app.innerHTML = `
  <div class="auth-wrap"><div class="auth-card">
    <div class="auth-logo"><div class="logo-mark">س</div><div><h1>مركز القيادة الاجتماعي</h1><div class="sub">إدارة الحسابات والحملات والأتمتة من مكان واحد</div></div></div>
    <div class="auth-tabs">
      <button id="tab-login" class="on" onclick="authTab('login')">تسجيل الدخول</button>
      <button id="tab-register" onclick="authTab('register')">إنشاء حساب</button>
    </div>
    <div id="auth-form"></div>
    <div class="demo-hint">🧪 <b>حساب تجريبي جاهز:</b><br>البريد: <code>demo@scc.local</code> — كلمة المرور: <code>Demo12345</code></div>
  </div></div>`;
  authTab('login');
}
function authTab(t) {
  document.getElementById('tab-login').className = t === 'login' ? 'on' : '';
  document.getElementById('tab-register').className = t === 'register' ? 'on' : '';
  document.getElementById('auth-form').innerHTML = t === 'login' ? `
    <label>البريد الإلكتروني</label><input id="a-email" type="email" dir="ltr" placeholder="you@company.com">
    <label>كلمة المرور</label><input id="a-pass" type="password" dir="ltr" placeholder="••••••••" onkeydown="if(event.key==='Enter')doLogin()">
    <div style="margin-top:20px"><button class="btn btn-primary" style="width:100%;justify-content:center" onclick="doLogin()">دخول →</button></div>`
  : `
    <label>الاسم الكامل</label><input id="a-name" placeholder="مثال: سارة الأحمد">
    <label>اسم مساحة العمل (الشركة)</label><input id="a-ws" placeholder="مثال: وكالة النمو للتسويق">
    <label>البريد الإلكتروني</label><input id="a-email" type="email" dir="ltr" placeholder="you@company.com">
    <label>كلمة المرور (8 أحرف فأكثر)</label><input id="a-pass" type="password" dir="ltr" placeholder="••••••••" onkeydown="if(event.key==='Enter')doRegister()">
    <div style="margin-top:20px"><button class="btn btn-primary" style="width:100%;justify-content:center" onclick="doRegister()">إنشاء الحساب ومساحة العمل ←</button></div>`;
}
async function doLogin() {
  try {
    await api('/auth/login', { method: 'POST', body: { email: val('a-email'), password: val('a-pass') } });
    await boot();
  } catch (e) { toast(e.message, 'err'); }
}
async function doRegister() {
  try {
    await api('/auth/register', { method: 'POST', body: { name: val('a-name'), workspaceName: val('a-ws'), email: val('a-email'), password: val('a-pass') } });
    toast('تم إنشاء حسابك بنجاح — أهلًا بك', 'ok');
    await boot();
  } catch (e) { toast(e.message, 'err'); }
}
async function logout(callApi = true) {
  if (callApi) try { await api('/auth/logout', { method: 'POST' }); } catch {}
  state.user = null; state.ws = null; renderAuth();
}
const val = (id) => document.getElementById(id)?.value?.trim() || '';

async function boot() {
  const me = await api('/auth/me');
  state.user = me.user; state.workspaces = me.workspaces;
  if (!me.workspaces.length) { toast('لا توجد مساحة عمل'); return; }
  state.ws = me.workspaces[0];
  await refreshUnread();
  navigate('dashboard');
  setInterval(refreshUnread, 30000);
}

/* ---------------- مكونات مشتركة ---------------- */
function modal(title, sub, body, actions = '') {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal">${title ? `<h3>${title}</h3>` : ''}${sub ? `<div class="m-sub">${sub}</div>` : ''}${body}${actions ? `<div class="m-actions">${actions}</div>` : ''}</div>`;
  back.addEventListener('click', (e) => { if (e.target === back) back.remove(); });
  document.body.appendChild(back);
  return back;
}
function confirmDialog(msg, onYes) {
  const m = modal('تأكيد العملية', '', `<p style="font-size:14px;line-height:1.9">${msg}</p>`,
    `<button class="btn btn-danger" id="cf-yes">تأكيد</button><button class="btn btn-ghost" id="cf-no">إلغاء</button>`);
  m.querySelector('#cf-yes').onclick = () => { m.remove(); onYes(); };
  m.querySelector('#cf-no').onclick = () => m.remove();
}
function statCard(lbl, v, sub, ico) {
  return `<div class="card stat"><div class="lbl">${ico || ''} ${lbl}</div><div class="val">${v}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;
}
function globalSearch(q) {
  q = q.trim();
  if (!q) return;
  state.searchQuery = q;
  navigate('accounts', { q });
  toast(`بحث عن: ${q}`);
}
function barChart(series, keyA, keyB, labelA, labelB) {
  const max = Math.max(1, ...series.map((s) => Math.max(s[keyA] || 0, s[keyB] || 0)));
  return `<div class="bar-chart">${series.map((s) => `
    <div class="bar-col"><div class="bars">
      <div class="bar r" style="height:${Math.round(((s[keyA] || 0) / max) * 110)}px" title="${labelA}: ${fmt(s[keyA])}"></div>
      <div class="bar e" style="height:${Math.round(((s[keyB] || 0) / max) * 110)}px" title="${labelB}: ${fmt(s[keyB])}"></div>
    </div><div class="d">${esc(s.date?.slice(5) || '')}</div></div>`).join('')}</div>
    <div class="legend"><span><i style="background:var(--brand)"></i>${labelA}</span><span><i style="background:var(--green)"></i>${labelB}</span></div>`;
}

/* ---------------- العروض ---------------- */
const VIEWS = {};

VIEWS.dashboard = async () => {
  app.innerHTML = layout('<div class="grid stats-grid">' + '<div class="skel"></div>'.repeat(8) + '</div>', 'لوحة التحكم الرئيسية');
  const d = await api('/analytics/dashboard');
  const s = d.stats;
  setPage(`
    <div class="grid stats-grid">
      ${statCard('إجمالي الحسابات', fmt(s.accounts_total), `${fmt(s.accounts_connected)} متصل`, '👥')}
      ${statCard('تحتاج إعادة اتصال', fmt(s.accounts_reconnect), s.accounts_reconnect ? 'تتطلب تدخلك' : 'كل شيء سليم', '↻')}
      ${statCard('حملات نشطة', fmt(s.campaigns_active), `${fmt(s.campaigns_scheduled)} مجدولة`, '🎯')}
      ${statCard('منشورات مجدولة', fmt(s.posts_scheduled), `${fmt(s.posts_published)} تم نشرها`, '🗓')}
      ${statCard('عمليات فاشلة', fmt(s.jobs_failed), d.openErrors ? `${fmt(d.openErrors)} خطأ مفتوح` : 'لا أخطاء مفتوحة', '⚠️')}
      ${statCard('إجمالي الوصول', fmt(d.totals.reach), 'آخر التراكمات', '📡')}
      ${statCard('إجمالي المشاهدات', fmt(d.totals.impressions), '', '👁')}
      ${statCard('إجمالي التفاعل', fmt(d.totals.engagement), '', '💬')}
    </div>
    <div class="section-title">📈 أداء آخر 30 يومًا</div>
    <div class="card chart-card">${d.last30.length ? barChart(d.last30, 'reach', 'engagement', 'الوصول', 'التفاعل') : '<div class="empty"><div class="big">📊</div>ستظهر البيانات هنا بعد تشغيل أول حملة ونشر المحتوى</div>'}</div>
    <div class="section-title">🔔 آخر الإشعارات</div>
    <div class="table-wrap"><table><thead><tr><th>الإشعار</th><th>النوع</th><th>الوقت</th></tr></thead><tbody>
      ${d.recentNotifications.map((n) => `<tr><td><b>${esc(n.title)}</b>${n.body ? `<div class="acc-meta">${esc(n.body)}</div>` : ''}</td><td>${esc(n.type)}</td><td class="acc-meta">${fmtDate(n.created_at)}</td></tr>`).join('') || '<tr><td colspan="3" class="empty">لا إشعارات بعد</td></tr>'}
    </tbody></table></div>
    <div style="margin-top:26px;display:flex;gap:10px;flex-wrap:wrap">
      <button class="btn btn-primary" onclick="navigate('accounts');setTimeout(openAddAccount,150)">+ ربط حساب جديد</button>
      <button class="btn btn-ghost" onclick="navigate('campaigns');setTimeout(openCampaignWizard,150)">+ إنشاء حملة</button>
      <button class="btn btn-ghost" onclick="navigate('posts')">+ إنشاء محتوى</button>
    </div>`);
  startPolling(() => VIEWS.dashboard(), 20000);
};

/* ---------------- الحسابات ---------------- */
VIEWS.accounts = async (q = state.params.q || '', status = '', page = 1) => {
  if (!document.getElementById('page')) return;
  app.innerHTML = layout('<div class="grid stats-grid">' + '<div class="skel"></div>'.repeat(6) + '</div>', 'الحسابات والأصول');
  const d = await api(`/accounts?page=${page}&q=${encodeURIComponent(q)}${status ? '&status=' + status : ''}`);
  const chips = [{ s: '', t: 'الكل' }, ...Object.entries(ACC_STATUS).map(([s, m]) => ({ s, t: m.t, n: d.statuses.find((x) => x.status === s)?.c }))];
  setPage(`
    <div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
      <div class="search-box" style="flex:1;min-width:220px"><input id="acc-q" value="${esc(q)}" placeholder="بحث باسم الحساب أو المعرف…" onkeydown="if(event.key==='Enter')VIEWS.accounts(this.value)"></div>
      <button class="btn btn-primary" onclick="openAddAccount()">+ ربط حساب</button>
    </div>
    <div class="chips">${chips.map((c) => `<span class="chip ${status === c.s ? 'on' : ''}" onclick="VIEWS.accounts('${esc(q)}','${c.s}')">${c.t}${c.n != null ? ` (${c.n})` : ''}</span>`).join('')}</div>
    ${d.items.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(300px,1fr))">${d.items.map((a) => accountCard(a)).join('')}</div>`
    : '<div class="empty"><div class="big">👥</div>لا توجد حسابات مطابقة — اربط أول حساب لتبدأ</div>'}
    ${d.pages > 1 ? `<div class="pager">${Array.from({ length: d.pages }, (_, i) => `<button class="btn btn-sm ${i + 1 === page ? 'btn-primary' : 'btn-ghost'}" onclick="VIEWS.accounts('${esc(q)}','${status}',${i + 1})">${i + 1}</button>`).join('')}</div>` : ''}`);
};

function accountCard(a) {
  const st = ACC_STATUS[a.status] || {};
  return `<div class="card account-card">
    <div class="acc-head">
      <div class="acc-avatar" style="background:${AV_COLORS[a.id % AV_COLORS.length]}">${esc(a.name[0] || '؟')}</div>
      <div style="flex:1;min-width:0"><div class="acc-name">${esc(a.name)}</div><div class="acc-meta">${PLATFORM_ICONS[a.platform_code] || ''} ${esc(a.platform_code)} · ${esc(a.account_type)} ${a.handle ? '· ' + esc(a.handle) : ''}</div></div>
      ${badge(a.status, ACC_STATUS)}
    </div>
    <div class="acc-row"><span>الحملات المرتبطة: <b style="color:var(--text)">${fmt(a.campaigns_count)}</b></span><span>آخر مزامنة: ${fmtDate(a.last_synced_at)}</span></div>
    <div class="acc-actions">
      <button class="btn btn-ghost btn-sm" onclick="openAccountDetail(${a.id})">التفاصيل</button>
      ${['reconnect_required', 'error', 'permissions_missing'].includes(a.status) ? `<button class="btn btn-primary btn-sm" onclick="accountAction(${a.id},'reconnect','طلب إعادة الاتصال')">↻ إعادة اتصال</button>` : ''}
      ${a.status === 'paused' ? `<button class="btn btn-ghost btn-sm" onclick="accountAction(${a.id},'resume')">▶ استئناف</button>` : `<button class="btn btn-ghost btn-sm" onclick="accountAction(${a.id},'pause')">⏸ تعطيل</button>`}
      <button class="btn btn-ghost btn-sm" onclick="accountAction(${a.id},'sync')">⟳ مزامنة</button>
      <button class="btn btn-danger btn-sm" onclick="confirmDialog('سيتم فصل الحساب <b>${esc(a.name)}</b> وإبطال رموزه. هل أنت متأكد؟',()=>delAccount(${a.id}))">فصل</button>
    </div></div>`;
}
async function accountAction(id, act, msg) {
  try { await api(`/accounts/${id}/${act}`, { method: 'POST' }); toast(msg || 'تم إرسال العملية إلى قائمة التنفيذ', 'ok'); setTimeout(() => VIEWS.accounts(), 900); }
  catch (e) { toast(e.message, 'err'); }
}
async function delAccount(id) {
  try { await api(`/accounts/${id}`, { method: 'DELETE' }); toast('تم فصل الحساب', 'ok'); VIEWS.accounts(); } catch (e) { toast(e.message, 'err'); }
}

async function openAddAccount() {
  const p = await api('/integrations/platforms');
  const body = `
    <label>المنصة</label><select id="na-platform">${p.items.map((x) => `<option value="${x.code}">${PLATFORM_ICONS[x.code] || ''} ${esc(x.name)}${x.enabled ? '' : ' (تجريبي عبر Mock)'}</option>`).join('')}</select>
    <label>اسم الحساب / الصفحة</label><input id="na-name" placeholder="مثال: صفحة متجر الأناقة">
    <div class="form-row">
      <div><label>المعرّف (اختياري)</label><input id="na-handle" dir="ltr" placeholder="@store"></div>
      <div><label>نوع الحساب</label><select id="na-type"><option value="page">صفحة</option><option value="profile">حساب شخصي</option><option value="business">حساب أعمال</option><option value="group">مجموعة</option></select></div>
    </div>
    <div class="demo-hint" style="margin-top:16px">🔐 الربط يتم عبر تدفق OAuth الرسمي — لن نطلب كلمة مرورك أبدًا. حاليًا يعمل المزوّد التجريبي (Mock) لاختبار البنية، ويُستبدل بمزوّد Meta الرسمي دون أي تعديل على النظام.</div>`;
  const m = modal('ربط حساب جديد', 'أضف حسابًا أو صفحة تملك صلاحية إدارتها', body,
    `<button class="btn btn-primary" id="na-go">ربط الحساب ←</button><button class="btn btn-ghost" onclick="this.closest('.modal-back').remove()">إلغاء</button>`);
  m.querySelector('#na-go').onclick = async () => {
    try {
      await api('/accounts', { method: 'POST', body: { name: val('na-name'), handle: val('na-handle'), platform: document.getElementById('na-platform').value, accountType: document.getElementById('na-type').value } });
      m.remove(); toast('تم ربط الحساب بنجاح', 'ok'); VIEWS.accounts();
    } catch (e) { toast(e.message, 'err'); }
  };
}

async function openAccountDetail(id) {
  const d = await api(`/accounts/${id}`);
  const a = d.account;
  const PERMS = { publish: 'النشر', read_data: 'قراءة البيانات', read_insights: 'قراءة الإحصائيات', manage_comments: 'إدارة التعليقات', manage_messages: 'إدارة الرسائل' };
  const perms = Object.entries(PERMS).map(([k, label]) => {
    const has = a.permissions[k];
    return `<div class="perm-row"><span>${label}</span>${has ? '<span class="badge b-green"><i></i>✓ ممنوحة</span>' : '<span class="badge b-red"><i></i>✕ غير ممنوحة</span>'}</div>`;
  }).join('');
  const m = modal('', '', `
    <div class="acc-head" style="margin-bottom:16px">
      <div class="acc-avatar" style="background:${AV_COLORS[a.id % AV_COLORS.length]};width:52px;height:52px;font-size:20px">${esc(a.name[0])}</div>
      <div><div class="acc-name" style="font-size:17px">${esc(a.name)}</div><div class="acc-meta">${PLATFORM_ICONS[a.platform_code]} ${esc(a.platform_code)} · ${esc(a.account_type)} · ID: ${esc(a.external_id || '—')}</div></div>
      <div style="flex:1"></div>${badge(a.status, ACC_STATUS)}
    </div>
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:8px 20px;font-size:13px;margin-bottom:8px">
      <div class="acc-row"><span>تاريخ الإضافة</span><b style="color:var(--text)">${fmtDate(a.created_at)}</b></div>
      <div class="acc-row"><span>آخر مزامنة</span><b style="color:var(--text)">${fmtDate(a.last_synced_at)}</b></div>
      <div class="acc-row"><span>حالة الرمز</span><b style="color:var(--text)">${d.connection ? (d.connection.status === 'active' ? '✓ نشط — ينتهي ' + fmtDate(d.connection.token_expires_at) : '⚠ ' + d.connection.status) : '—'}</b></div>
      <div class="acc-row"><span>آخر نشاط</span><b style="color:var(--text)">${fmtDate(a.last_activity_at)}</b></div>
    </div>
    <div class="section-title" style="margin-top:18px">الصلاحيات المطلوبة والممنوحة</div>${perms}
    <div class="section-title">الحملات المرتبطة (${d.campaigns.length})</div>
    ${d.campaigns.map((c) => `<div class="perm-row"><span><a onclick="closeModals();openCampaignDetail(${c.id})" style="cursor:pointer">${esc(c.name)}</a></span>${badge(c.status, CAMP_STATUS)}</div>`).join('') || '<div class="acc-meta">لا حملات مرتبطة</div>'}
    <div class="section-title">آخر العمليات</div>
    ${d.recentJobs.map((j) => `<div class="perm-row"><span>${JOB_ACTIONS[j.action] || j.action} <span class="acc-meta">${fmtDate(j.created_at)}</span></span>${badge(j.status, JOB_STATUS)}</div>`).join('') || '<div class="acc-meta">لا عمليات بعد</div>'}`,
    `<button class="btn btn-ghost" onclick="this.closest('.modal-back').remove()">إغلاق</button>`);
  m.querySelector('.modal').classList.add('wide');
}
function closeModals() { document.querySelectorAll('.modal-back').forEach((x) => x.remove()); }

/* ---------------- المجموعات ---------------- */
VIEWS.groups = async () => {
  app.innerHTML = layout('<div class="skel" style="min-height:300px"></div>', 'المجموعات');
  const d = await api('/groups');
  setPage(`
    <div style="margin-bottom:16px"><button class="btn btn-primary" onclick="openGroupModal()">+ إنشاء مجموعة</button></div>
    ${d.items.length ? `<div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(280px,1fr))">${d.items.map((g) => `
      <div class="card"><div style="display:flex;align-items:center;gap:10px">
        <div style="font-size:22px">🗂</div>
        <div style="flex:1"><div class="acc-name">${esc(g.name)}</div><div class="acc-meta">${esc(g.description || '')}</div></div>
        <span class="badge b-blue"><i></i>${fmt(g.accounts_count)} حسابًا</span></div>
        <div class="acc-actions" style="margin-top:12px">
          <button class="btn btn-ghost btn-sm" onclick="openGroupDetail(${g.id},'${esc(g.name)}')">إدارة الأعضاء</button>
          <button class="btn btn-danger btn-sm" onclick="confirmDialog('حذف المجموعة <b>${esc(g.name)}</b>؟ (لن تُحذف الحسابات)',()=>delGroup(${g.id}))">حذف</button>
        </div></div>`).join('')}</div>`
    : '<div class="empty"><div class="big">🗂</div>أنشئ مجموعات لتنظيم حساباتك — مثل "عملاء رمضان" أو "صفحات المتاجر"</div>'}`);
};
function openGroupModal() {
  const m = modal('إنشاء مجموعة', '', `<label>اسم المجموعة</label><input id="g-name" placeholder="مثال: حملة رمضان"><label>الوصف (اختياري)</label><input id="g-desc" placeholder="وصف قصير">`,
    `<button class="btn btn-primary" id="g-go">إنشاء ←</button><button class="btn btn-ghost" onclick="this.closest('.modal-back').remove()">إلغاء</button>`);
  m.querySelector('#g-go').onclick = async () => {
    try { await api('/groups', { method: 'POST', body: { name: val('g-name'), description: val('g-desc') } }); m.remove(); toast('تم إنشاء المجموعة', 'ok'); VIEWS.groups(); }
    catch (e) { toast(e.message, 'err'); }
  };
}
async function delGroup(id) { try { await api(`/groups/${id}`, { method: 'DELETE' }); toast('تم حذف المجموعة', 'ok'); VIEWS.groups(); } catch (e) { toast(e.message, 'err'); } }
async function openGroupDetail(id, name) {
  const [g, accs] = await Promise.all([api(`/groups/${id}`), api('/accounts?limit=50')]);
  const memberIds = new Set(g.accounts.map((a) => a.id));
  const m = modal(`إدارة أعضاء: ${name}`, `${g.accounts.length} حسابًا حاليًا`, `
    <div class="check-list">${accs.items.map((a) => `
      <label><input type="checkbox" data-aid="${a.id}" ${memberIds.has(a.id) ? 'checked' : ''}> ${esc(a.name)} <span class="acc-meta">(${esc(a.platform_code)})</span> ${badge(a.status, ACC_STATUS)}</label>`).join('') || '<div class="acc-meta">لا حسابات متاحة</div>'}</div>`,
    `<button class="btn btn-primary" id="gm-save">حفظ التغييرات ←</button><button class="btn btn-ghost" onclick="this.closest('.modal-back').remove()">إلغاء</button>`);
  m.querySelector('#gm-save').onclick = async () => {
    const checked = [...m.querySelectorAll('input:checked')].map((x) => +x.dataset.aid);
    const toAdd = checked.filter((x) => !memberIds.has(x));
    const toRemove = [...memberIds].filter((x) => !checked.includes(x));
    try {
      if (toAdd.length) await api(`/groups/${id}/accounts`, { method: 'POST', body: { accountIds: toAdd } });
      if (toRemove.length) await api(`/groups/${id}/accounts`, { method: 'POST', body: { accountIds: toRemove, remove: true } });
      m.remove(); toast('تم تحديث المجموعة', 'ok'); VIEWS.groups();
    } catch (e) { toast(e.message, 'err'); }
  };
}

/* ---------------- الحملات ---------------- */
VIEWS.campaigns = async (status = '') => {
  app.innerHTML = layout('<div class="skel" style="min-height:300px"></div>', 'الحملات');
  const d = await api(`/campaigns${status ? '?status=' + status : ''}`);
  const chips = [{ s: '', t: 'الكل' }, ...Object.entries(CAMP_STATUS).map(([s, m]) => ({ s, t: m.t }))];
  setPage(`
    <div style="display:flex;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">
      <div class="chips" style="margin:0">${chips.map((c) => `<span class="chip ${status === c.s ? 'on' : ''}" onclick="VIEWS.campaigns('${c.s}')">${c.t}</span>`).join('')}</div>
      <button class="btn btn-primary" onclick="openCampaignWizard()">+ إنشاء حملة</button>
    </div>
    <div class="table-wrap"><table><thead><tr><th>الحملة</th><th>الحالة</th><th>الأصول</th><th>العمليات</th><th>ناجحة</th><th>فاشلة</th><th>الفترة</th><th></th></tr></thead><tbody>
    ${d.items.map((c) => `<tr>
      <td><a style="font-weight:700;cursor:pointer" onclick="openCampaignDetail(${c.id})">${esc(c.name)}</a><div class="acc-meta">${esc(c.client || '')} ${c.objective ? '· ' + esc(c.objective) : ''}</div></td>
      <td>${badge(c.status, CAMP_STATUS)}</td><td>${fmt(c.assets_count)}</td><td>${fmt(c.jobs_count)}</td>
      <td style="color:var(--green)">${fmt(c.jobs_success)}</td><td style="color:var(--red)">${fmt(c.jobs_failed)}</td>
      <td class="acc-meta">${c.start_date || '—'} ← ${c.end_date || '—'}</td>
      <td><button class="btn btn-ghost btn-sm" onclick="openCampaignDetail(${c.id})">فتح</button></td></tr>`).join('') || '<tr><td colspan="8" class="empty">لا حملات — أنشئ أول حملة تسويقية</td></tr>'}
    </tbody></table></div>`);
};

/* معالج إنشاء الحملة (خطوتان: المعلومات ثم اختيار الأصول) */
async function openCampaignWizard() {
  const [accs, grps] = await Promise.all([api('/accounts?limit=50'), api('/groups')]);
  const step1 = `
    <div class="steps"><div class="step on"><div class="n">1</div><div class="t">معلومات الحملة</div></div><div class="step-line"></div><div class="step"><div class="n">2</div><div class="t">اختيار الأصول</div></div><div class="step-line"></div><div class="step"><div class="n">3</div><div class="t">الإطلاق</div></div></div>
    <label>اسم الحملة *</label><input id="cw-name" placeholder="مثال: حملة إطلاق المنتج الجديد">
    <label>وصف الحملة</label><textarea id="cw-desc" rows="2" placeholder="ما هدف هذه الحملة؟"></textarea>
    <div class="form-row">
      <div><label>العميل</label><input id="cw-client" placeholder="اسم العميل"></div>
      <div><label>الهدف</label><select id="cw-obj"><option value="">—</option><option>زيادة الوعي</option><option>توليد العملاء</option><option>المبيعات</option><option>التفاعل</option></select></div>
    </div>
    <div class="form-row">
      <div><label>تاريخ البداية</label><input id="cw-start" type="date"></div>
      <div><label>تاريخ النهاية</label><input id="cw-end" type="date"></div>
    </div>
    <label>الميزانية (اختياري)</label><input id="cw-budget" type="number" min="0" placeholder="0">`;
  const m = modal('إنشاء حملة جديدة', 'معالج من خطوتين: المعلومات ثم ربط الأصول', `<div id="cw-body">${step1}</div>`,
    `<button class="btn btn-primary" id="cw-next">التالي: اختيار الأصول ←</button><button class="btn btn-ghost" onclick="this.closest('.modal-back').remove()">إلغاء</button>`);
  m.querySelector('.modal').classList.add('wide');
  let campaignId = null;
  m.querySelector('#cw-next').onclick = async () => {
    if (!campaignId) {
      try {
        const r = await api('/campaigns', { method: 'POST', body: { name: val('cw-name'), description: val('cw-desc'), client: val('cw-client'), objective: document.getElementById('cw-obj').value, budget: val('cw-budget') ? +val('cw-budget') : null, startDate: val('cw-start'), endDate: val('cw-end') } });
        campaignId = r.id;
      } catch (e) { return toast(e.message, 'err'); }
      m.querySelector('#cw-body').innerHTML = `
        <div class="steps"><div class="step done"><div class="n">✓</div><div class="t">معلومات الحملة</div></div><div class="step-line"></div><div class="step on"><div class="n">2</div><div class="t">اختيار الأصول</div></div><div class="step-line"></div><div class="step"><div class="n">3</div><div class="t">الإطلاق</div></div></div>
        <label>اختر مجموعات كاملة</label>
        <div class="check-list" style="max-height:140px">${grps.items.map((g) => `<label><input type="checkbox" data-gid="${g.id}"> 🗂 ${esc(g.name)} <span class="acc-meta">(${g.accounts_count} حسابًا)</span></label>`).join('') || '<div class="acc-meta">لا مجموعات</div>'}</div>
        <label>أو حسابات فردية</label>
        <div class="check-list" style="max-height:180px">${accs.items.map((a) => `<label><input type="checkbox" data-aid="${a.id}"> ${esc(a.name)} <span class="acc-meta">(${esc(a.platform_code)})</span></label> ${''}`).join('') || '<div class="acc-meta">لا حسابات بعد — اربط حسابًا أولًا</div>'}</div>
        <div style="margin-top:12px;font-size:13px;color:var(--muted)">تم اختيار <b id="cw-count" style="color:var(--brand)">0</b> أصلًا</div>`;
      m.querySelector('#cw-body').addEventListener('change', () => {
        m.querySelector('#cw-count').textContent = m.querySelectorAll('#cw-body input:checked').length;
      });
      m.querySelector('#cw-next').textContent = 'حفظ وإطلاق الحملة ←';
    } else {
      const accountIds = [...m.querySelectorAll('[data-aid]:checked')].map((x) => +x.dataset.aid);
      const groupIds = [...m.querySelectorAll('[data-gid]:checked')].map((x) => +x.dataset.gid);
      try {
        const r = await api(`/campaigns/${campaignId}/accounts`, { method: 'POST', body: { accountIds, groupIds } });
        m.remove();
        toast(`تم ربط ${r.assets} أصلًا بالحملة`, 'ok');
        openCampaignDetail(campaignId, true);
      } catch (e) { toast(e.message, 'err'); }
    }
  };
}

/* صفحة الحملة: ملخص + مخطط سير + تحليلات + جدول زمني */
async function openCampaignDetail(id, justCreated = false) {
  const d = await api(`/campaigns/${id}`);
  const c = d.campaign;
  const an = await api(`/analytics/campaign/${id}`).catch(() => null);
  const jm = Object.fromEntries(d.jobs.map((j) => [j.status, j.c]));
  const total = d.jobs.reduce((s, j) => s + j.c, 0);
  const done = (jm.success || 0) + (jm.failed || 0);
  const pct = total ? Math.round((done / total) * 100) : 0;
  const stages = ['إنشاء الحملة', 'ربط الأصول', 'إعداد المحتوى', 'الجدولة', 'التنفيذ عبر API', 'جمع النتائج', 'التقارير'];
  const activeStage = c.status === 'draft' ? (d.assets.length ? 2 : 1) : c.status === 'active' ? 4 : c.status === 'completed' ? 6 : 3;
  const m = modal('', '', `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;flex-wrap:wrap">
      <h3 style="font-size:19px">${esc(c.name)}</h3>${badge(c.status, CAMP_STATUS)}
      <div style="flex:1"></div>
      ${c.status === 'draft' ? `<button class="btn btn-primary btn-sm" onclick="campaignStatus(${c.id},'active')">▶ إطلاق الحملة</button>` : ''}
      ${c.status === 'active' ? `<button class="btn btn-ghost btn-sm" onclick="campaignStatus(${c.id},'paused')">⏸ إيقاف مؤقت</button><button class="btn btn-ghost btn-sm" onclick="campaignStatus(${c.id},'completed')">✔ إنهاء</button>` : ''}
      ${c.status === 'paused' ? `<button class="btn btn-primary btn-sm" onclick="campaignStatus(${c.id},'active')">▶ استئناف</button>` : ''}
    </div>
    <div class="acc-meta" style="margin-bottom:14px">${esc(c.description || '')} ${c.client ? '· العميل: ' + esc(c.client) : ''} ${c.objective ? '· الهدف: ' + esc(c.objective) : ''} ${c.budget ? '· الميزانية: ' + fmt(c.budget) : ''}</div>
    <div class="grid stats-grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr))">
      ${statCard('الأصول', fmt(d.assets.length))}
      ${statCard('المهام', fmt(total))}
      ${statCard('ناجحة', fmt(jm.success || 0))}
      ${statCard('فاشلة', fmt(jm.failed || 0))}
      ${statCard('الوصول', fmt(an?.totals?.reach ?? 0))}
      ${statCard('التفاعل', fmt(an?.totals?.engagement ?? 0))}
    </div>
    ${total ? `<div style="margin-top:16px"><div class="acc-row" style="margin-bottom:6px"><span>تقدم التنفيذ</span><b>${done} / ${total} (${pct}%)</b></div><div class="progress"><div style="width:${pct}%"></div></div></div>` : ''}
    <div class="section-title">مخطط سير الحملة</div>
    <div class="flow">${stages.map((s, i) => `<div class="flow-node ${i === activeStage ? 'hl' : ''}" style="${i < activeStage ? 'border-color:rgba(52,201,142,.4)' : ''}">${i < activeStage ? '✓ ' : ''}${s}</div>${i < stages.length - 1 ? '<div class="flow-arrow"></div>' : ''}`).join('')}</div>
    <div class="section-title">الأصول المرتبطة (${d.assets.length})</div>
    <div class="check-list" style="max-height:150px">${d.assets.map((a) => `<label style="cursor:default">${esc(a.name)} <span class="acc-meta">(${esc(a.platform_code)})</span> ${badge(a.status, ACC_STATUS)}</label>`).join('') || '<div class="acc-meta">لم تُربط أصول بعد</div>'}</div>
    ${an?.series?.length ? `<div class="section-title">الأداء اليومي</div><div class="card chart-card">${barChart(an.series, 'reach', 'engagement', 'الوصول', 'التفاعل')}</div>` : ''}
    <div class="section-title">المنشورات (${d.posts.length})</div>
    ${d.posts.map((p) => `<div class="perm-row"><span>${esc(p.content.slice(0, 70))}…</span>${badge(p.status, POST_STATUS)}</div>`).join('') || '<div class="acc-meta">لا منشورات بعد — أضف محتوى من قسم المحتوى</div>'}
    <div class="section-title">الجدول الزمني</div>
    <div class="tl">${d.timeline.map((t) => `<div class="tl-item">${esc(t.action)} <span class="t">— ${fmtDate(t.created_at)}</span></div>`).join('') || '<div class="acc-meta">—</div>'}</div>`,
    `<button class="btn btn-ghost" onclick="this.closest('.modal-back').remove()">إغلاق</button>`);
  m.querySelector('.modal').classList.add('wide');
  if (justCreated) toast('الحملة جاهزة — أطلقها عندما تريد', 'ok');
}
async function campaignStatus(id, status) {
  try {
    const r = await api(`/campaigns/${id}/status`, { method: 'POST', body: { status } });
    closeModals();
    toast(status === 'active' ? `أُطلقت الحملة — أُرسلت ${r.enqueued ?? 0} مهمة إلى قائمة التنفيذ` : 'تم تحديث الحالة', 'ok');
    VIEWS.campaigns();
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------------- المحتوى والجدولة ---------------- */
VIEWS.posts = async () => {
  app.innerHTML = layout('<div class="skel" style="min-height:300px"></div>', 'المحتوى والجدولة');
  const [d, camps, accs] = await Promise.all([api('/posts'), api('/campaigns'), api('/accounts?limit=50')]);
  setPage(`
    <div style="margin-bottom:16px"><button class="btn btn-primary" onclick="openPostModal(${JSON.stringify(camps.items.map((c) => ({ id: c.id, name: c.name }))).replace(/"/g, '&quot;')})">+ إنشاء محتوى</button></div>
    <div class="section-title" style="margin-top:0">المنشورات (${d.items.length})</div>
    <div class="table-wrap"><table><thead><tr><th>المحتوى</th><th>الحملة</th><th>الحالة</th><th>التاريخ</th><th></th></tr></thead><tbody>
      ${d.items.map((p) => `<tr>
        <td style="max-width:340px">${esc(p.content.slice(0, 90))}${p.content.length > 90 ? '…' : ''}</td>
        <td>${esc(p.campaign_name || '—')}</td><td>${badge(p.status, POST_STATUS)}</td><td class="acc-meta">${fmtDate(p.created_at)}</td>
        <td style="white-space:nowrap">
          ${p.status === 'draft' ? `<button class="btn btn-ghost btn-sm" onclick="postAction(${p.id},'approve')">اعتماد</button>` : ''}
          <button class="btn btn-ghost btn-sm" onclick='openScheduleModal(${p.id},${JSON.stringify(accs.items.map((a) => ({ id: a.id, name: a.name, p: a.platform_code }))).replace(/'/g, '&#39;')})'>🗓 جدولة</button>
          <button class="btn btn-primary btn-sm" onclick='publishNow(${p.id},${JSON.stringify(accs.items.map((a) => a.id)).replace(/'/g, '&#39;')})'>نشر فوري</button>
        </td></tr>`).join('') || '<tr><td colspan="5" class="empty">لا محتوى بعد</td></tr>'}
    </tbody></table></div>
    <div class="section-title">المنشورات المجدولة (${d.scheduled.length})</div>
    <div class="table-wrap"><table><thead><tr><th>المحتوى</th><th>الحساب</th><th>الحملة</th><th>الموعد (UTC)</th><th>التكرار</th><th>الحالة</th></tr></thead><tbody>
      ${d.scheduled.map((s) => `<tr><td style="max-width:280px">${esc(s.content.slice(0, 60))}…</td><td>${esc(s.account_name)}</td><td>${esc(s.campaign_name || '—')}</td><td class="acc-meta">${fmtDate(s.scheduled_at)}</td><td>${{ once: 'مرة واحدة', daily: 'يومي', weekly: 'أسبوعي' }[s.recurrence]}</td><td>${badge(s.status, { scheduled: { t: 'مجدول', c: 'blue' }, queued: { t: 'في الطابور', c: 'cyan' }, published: { t: 'منشور', c: 'green' }, failed: { t: 'فشل', c: 'red' }, cancelled: { t: 'ملغي', c: 'gray' } })}</td></tr>`).join('') || '<tr><td colspan="6" class="empty">لا منشورات مجدولة</td></tr>'}
    </tbody></table></div>`);
};
function openPostModal(camps) {
  const m = modal('إنشاء محتوى', 'اكتب المحتوى واربطه بحملة (اختياري)', `
    <label>الحملة</label><select id="p-camp"><option value="">بدون حملة</option>${camps.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('')}</select>
    <label>نص المحتوى *</label><textarea id="p-content" rows="4" placeholder="اكتب محتوى المنشور هنا…"></textarea>`,
    `<button class="btn btn-primary" id="p-go">حفظ ←</button><button class="btn btn-ghost" onclick="this.closest('.modal-back').remove()">إلغاء</button>`);
  m.querySelector('#p-go').onclick = async () => {
    try {
      await api('/posts', { method: 'POST', body: { content: val('p-content'), campaignId: document.getElementById('p-camp').value || null } });
      m.remove(); toast('تم حفظ المحتوى كمسودة', 'ok'); VIEWS.posts();
    } catch (e) { toast(e.message, 'err'); }
  };
}
async function postAction(id, act) { try { await api(`/posts/${id}/${act}`, { method: 'POST' }); toast('تم الاعتماد', 'ok'); VIEWS.posts(); } catch (e) { toast(e.message, 'err'); } }
function openScheduleModal(postId, accs) {
  const m = modal('جدولة المنشور', 'حدد الوقت والحسابات المستهدفة (التوقيت UTC)', `
    <div class="form-row">
      <div><label>التاريخ والوقت *</label><input id="s-at" type="datetime-local"></div>
      <div><label>التكرار</label><select id="s-rec"><option value="once">مرة واحدة</option><option value="daily">يومي</option><option value="weekly">أسبوعي</option></select></div>
    </div>
    <label>الحسابات المستهدفة *</label>
    <div class="check-list">${accs.map((a) => `<label><input type="checkbox" data-aid="${a.id}"> ${esc(a.name)} <span class="acc-meta">(${a.p})</span></label>`).join('')}</div>`,
    `<button class="btn btn-primary" id="s-go">جدولة ←</button><button class="btn btn-ghost" onclick="this.closest('.modal-back').remove()">إلغاء</button>`);
  m.querySelector('#s-go').onclick = async () => {
    const accountIds = [...m.querySelectorAll('[data-aid]:checked')].map((x) => +x.dataset.aid);
    try {
      const r = await api(`/posts/${postId}/schedule`, { method: 'POST', body: { accountIds, scheduledAt: val('s-at'), recurrence: document.getElementById('s-rec').value } });
      m.remove(); toast(`تمت جدولة ${r.scheduled} نشرة — سيقوم الـScheduler بالتنفيذ تلقائيًا`, 'ok'); VIEWS.posts();
    } catch (e) { toast(e.message, 'err'); }
  };
}
async function publishNow(id, accIds) {
  try {
    const r = await api(`/posts/${id}/publish-now`, { method: 'POST', body: { accountIds: accIds } });
    toast(`أُرسلت ${r.jobs.length} مهمة نشر إلى قائمة التنفيذ`, 'ok');
    setTimeout(() => VIEWS.posts(), 2500);
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------------- سجل العمليات ---------------- */
VIEWS.jobs = async (f = {}, page = 1) => {
  app.innerHTML = layout('<div class="skel" style="min-height:300px"></div>', 'سجل العمليات');
  const qs = new URLSearchParams({ page, ...(f.status ? { status: f.status } : {}), ...(f.action ? { action: f.action } : {}) }).toString();
  const d = await api(`/jobs?${qs}`);
  const chips = [{ s: '', t: 'الكل' }, ...Object.entries(JOB_STATUS).map(([s, m]) => ({ s, t: m.t }))];
  setPage(`
    <div class="chips">${chips.map((c) => `<span class="chip ${(f.status || '') === c.s ? 'on' : ''}" onclick="VIEWS.jobs({status:'${c.s}',action:'${f.action || ''}'})">${c.t}</span>`).join('')}</div>
    <div class="table-wrap"><table><thead><tr><th>#</th><th>العملية</th><th>الحملة</th><th>الحساب</th><th>الحالة</th><th>المحاولات</th><th>التنفيذ</th><th>الخطأ</th><th></th></tr></thead><tbody>
      ${d.items.map((j) => `<tr>
        <td class="acc-meta">${j.id}</td><td>${JOB_ACTIONS[j.action] || j.action}</td>
        <td>${esc(j.campaign_name || '—')}</td><td>${esc(j.account_name || '—')}</td>
        <td>${badge(j.status, JOB_STATUS)}</td><td>${j.retry_count}</td>
        <td class="acc-meta">${fmtDate(j.completed_at || j.started_at || j.run_at)}</td>
        <td class="acc-meta" style="max-width:200px">${esc(j.error_message || '—')}</td>
        <td style="white-space:nowrap">${['failed', 'cancelled'].includes(j.status) ? `<button class="btn btn-ghost btn-sm" onclick="jobAction(${j.id},'retry')">↻ إعادة</button>` : ''}${['pending', 'retrying'].includes(j.status) ? `<button class="btn btn-danger btn-sm" onclick="jobAction(${j.id},'cancel')">إلغاء</button>` : ''}</td>
      </tr>`).join('') || '<tr><td colspan="9" class="empty">لا عمليات — أطلق حملة أو انشر محتوى لترى الطابور يعمل</td></tr>'}
    </tbody></table></div>
    ${d.pages > 1 ? `<div class="pager">${Array.from({ length: d.pages }, (_, i) => `<button class="btn btn-sm ${i + 1 === page ? 'btn-primary' : 'btn-ghost'}" onclick="VIEWS.jobs(${JSON.stringify(f).replace(/"/g, '&quot;')},${i + 1})">${i + 1}</button>`).join('')}</div>` : ''}`);
  startPolling(() => VIEWS.jobs(f, page), 8000);
};
async function jobAction(id, act) { try { await api(`/jobs/${id}/${act}`, { method: 'POST' }); toast('تم', 'ok'); VIEWS.jobs(); } catch (e) { toast(e.message, 'err'); } }

/* ---------------- مركز الأخطاء ---------------- */
VIEWS.errors = async (cat = '') => {
  app.innerHTML = layout('<div class="skel" style="min-height:300px"></div>', 'مركز الأخطاء');
  const d = await api(`/errors${cat ? '?category=' + cat : ''}`);
  const chips = [{ s: '', t: 'الكل' }, ...Object.entries(ERR_CATS).map(([s, t]) => ({ s, t, n: d.byCat.find((x) => x.category === s)?.c }))];
  setPage(`
    <div class="chips">${chips.map((c) => `<span class="chip ${cat === c.s ? 'on' : ''}" onclick="VIEWS.errors('${c.s}')">${c.t}${c.n != null ? ` (${c.n})` : ''}</span>`).join('')}</div>
    <div class="table-wrap"><table><thead><tr><th>التصنيف</th><th>الخطأ</th><th>الحساب</th><th>الحملة</th><th>التكرار</th><th>آخر حدوث</th><th></th></tr></thead><tbody>
      ${d.items.map((e) => `<tr>
        <td><span class="badge b-${e.category === 'rate_limit' ? 'amber' : e.category === 'authentication' || e.category === 'permission' ? 'red' : 'gray'}"><i></i>${ERR_CATS[e.category]}</span></td>
        <td style="max-width:300px">${esc(e.message)}</td>
        <td>${esc(e.account_name || '—')}</td><td>${esc(e.campaign_name || '—')}</td>
        <td>${fmt(e.occurrences)}</td><td class="acc-meta">${fmtDate(e.last_seen_at)}</td>
        <td style="white-space:nowrap">${e.job_id ? `<button class="btn btn-ghost btn-sm" onclick="errAction(${e.id},'retry')">↻ إعادة المحاولة</button>` : ''}<button class="btn btn-ghost btn-sm" onclick="errAction(${e.id},'resolve')">✔ حل</button></td>
      </tr>`).join('') || '<tr><td colspan="7" class="empty">✓ لا أخطاء مفتوحة — كل شيء يعمل بسلاسة</td></tr>'}
    </tbody></table></div>`);
};
async function errAction(id, act) { try { await api(`/errors/${id}/${act}`, { method: 'POST' }); toast(act === 'retry' ? 'أُعيدت المهمة إلى الطابور' : 'تم إغلاق الخطأ', 'ok'); VIEWS.errors(); } catch (e) { toast(e.message, 'err'); } }

/* ---------------- التحليلات ---------------- */
VIEWS.analytics = async () => {
  app.innerHTML = layout('<div class="skel" style="min-height:300px"></div>', 'التحليلات');
  const [dash, camps] = await Promise.all([api('/analytics/dashboard'), api('/campaigns')]);
  const withData = camps.items.slice(0, 6).map((c) => c.id);
  const cmp = withData.length ? await api(`/analytics/compare?ids=${withData.join(',')}`) : { items: [] };
  setPage(`
    <div class="section-title" style="margin-top:0">📈 آخر 30 يومًا — كل مساحة العمل</div>
    <div class="card chart-card">${dash.last30.length ? barChart(dash.last30, 'reach', 'engagement', 'الوصول', 'التفاعل') : '<div class="empty"><div class="big">📊</div>لا بيانات بعد</div>'}</div>
    <div class="section-title">نجاح العمليات مقابل الفشل</div>
    <div class="card chart-card">${dash.last30.length ? barChart(dash.last30, 'success', 'failed', 'عمليات ناجحة', 'عمليات فاشلة') : '<div class="empty">—</div>'}</div>
    <div class="section-title">⚖ مقارنة الحملات</div>
    <div class="table-wrap"><table><thead><tr><th>الحملة</th><th>الوصول</th><th>المشاهدات</th><th>التفاعل</th><th>ناجحة</th><th>فاشلة</th><th>معدل النجاح</th></tr></thead><tbody>
      ${cmp.items.map((c) => `<tr><td style="font-weight:600">${esc(c.name)}</td><td>${fmt(c.reach)}</td><td>${fmt(c.impressions)}</td><td>${fmt(c.engagement)}</td><td style="color:var(--green)">${fmt(c.success)}</td><td style="color:var(--red)">${fmt(c.failed)}</td><td>${c.success_rate != null ? c.success_rate + '%' : '—'}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">أنشئ حملات لتقارن بينها</td></tr>'}
    </tbody></table></div>`);
};

/* ---------------- الإشعارات ---------------- */
VIEWS.notifications = async () => {
  app.innerHTML = layout('<div class="skel" style="min-height:300px"></div>', 'مركز الإشعارات');
  const d = await api('/notifications');
  const ICONS = { job_failed: '⚠️', account_connected: '🔗', account_disconnected: '✂️', campaign_started: '🚀', campaign_completed: '🏁' };
  setPage(`
    <div style="margin-bottom:16px"><button class="btn btn-ghost" onclick="api('/notifications/read-all',{method:'POST'}).then(()=>{state.unread=0;VIEWS.notifications()})">تحديد الكل كمقروء</button></div>
    <div class="table-wrap"><table><tbody>
      ${d.items.map((n) => `<tr style="${n.read_at ? 'opacity:.55' : ''}">
        <td style="width:40px;font-size:19px">${ICONS[n.type] || '🔔'}</td>
        <td><b>${esc(n.title)}</b>${n.body ? `<div class="acc-meta">${esc(n.body)}</div>` : ''}</td>
        <td class="acc-meta" style="white-space:nowrap">${fmtDate(n.created_at)}</td></tr>`).join('') || '<tr><td class="empty">لا إشعارات</td></tr>'}
    </tbody></table></div>
    <div class="demo-hint" style="margin-top:18px">📬 قنوات الإشعارات مصممة للتوسع: Email وWhatsApp وPush تُضاف عبر Event Bus دون تعديل الواجهة.</div>`);
};

/* ---------------- الإعدادات ---------------- */
VIEWS.settings = async () => {
  app.innerHTML = layout('<div class="skel" style="min-height:300px"></div>', 'الإعدادات');
  const [d, plats, audit] = await Promise.all([api('/settings'), api('/integrations/platforms'), api('/audit?limit=15')]);
  const w = d.workspace;
  const ROLE_NAMES = { owner: 'المالك', admin: 'مدير', manager: 'مشرف حملات', editor: 'محرر', viewer: 'مشاهد' };
  const usageBar = (cur, max) => `<div class="acc-row"><span>${fmt(cur)} / ${fmt(max)}</span></div><div class="progress" style="margin-top:5px"><div style="width:${Math.min(100, Math.round((cur / max) * 100))}%"></div></div>`;
  setPage(`
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(330px,1fr))">
      <div class="card"><div class="section-title" style="margin-top:0">🏢 بيانات الشركة</div>
        <label>اسم مساحة العمل</label><input id="set-name" value="${esc(w.name)}">
        <div style="margin-top:14px"><button class="btn btn-primary btn-sm" onclick="saveWorkspace()">حفظ</button></div>
        <div class="acc-meta" style="margin-top:14px">الخطة الحالية: <b style="color:var(--brand)">${esc(w.plan_name)}</b> · دورك: <b>${ROLE_NAMES[d.myRole]}</b></div>
      </div>
      <div class="card"><div class="section-title" style="margin-top:0">📦 استهلاك الخطة</div>
        <div style="margin-bottom:14px"><div class="acc-meta">الحسابات</div>${usageBar(d.usage.accounts, w.max_accounts)}</div>
        <div style="margin-bottom:14px"><div class="acc-meta">الحملات</div>${usageBar(d.usage.campaigns, w.max_campaigns)}</div>
        <div><div class="acc-meta">أعضاء الفريق</div>${usageBar(d.usage.users, w.max_users)}</div>
      </div>
      <div class="card"><div class="section-title" style="margin-top:0">👥 أعضاء الفريق (${d.members.length})</div>
        ${d.members.map((m) => `<div class="perm-row"><span>${esc(m.name)} <span class="acc-meta">${esc(m.email)}</span></span><span class="badge b-blue"><i></i>${ROLE_NAMES[m.role]}</span></div>`).join('')}
        ${['owner', 'admin'].includes(d.myRole) ? `<div style="display:flex;gap:8px;margin-top:14px"><input id="mem-email" dir="ltr" placeholder="email@user.com" style="flex:2"><select id="mem-role" style="flex:1"><option value="viewer">مشاهد</option><option value="editor">محرر</option><option value="manager">مشرف</option><option value="admin">مدير</option></select><button class="btn btn-primary btn-sm" onclick="addMember()">إضافة</button></div>` : ''}
      </div>
      <div class="card"><div class="section-title" style="margin-top:0">🔌 المنصات والقدرات</div>
        ${plats.items.map((p) => `<div class="perm-row"><span>${PLATFORM_ICONS[p.code] || ''} ${esc(p.name)}</span><span>${Object.entries(p.capabilities).filter(([, v]) => v).map(([k]) => ({ publishing: 'نشر', scheduling: 'جدولة', comments: 'تعليقات', analytics: 'تحليلات', messaging: 'رسائل' })[k]).join(' · ')}</span></div>`).join('')}
        <div class="demo-hint" style="margin-top:14px">🔐 ربط Meta الفعلي يتطلب إعداد OAuth الرسمي (App ID + Secret) عبر متغيرات البيئة — لا تُخزَّن أي أسرار في الكود. الرموز تُشفَّر بـ AES-256-GCM قبل التخزين.</div>
      </div>
    </div>
    <div class="section-title">🧾 آخر سجلات التدقيق</div>
    <div class="table-wrap"><table><thead><tr><th>المستخدم</th><th>العملية</th><th>الكيان</th><th>النتيجة</th><th>الوقت</th></tr></thead><tbody>
      ${audit.items.map((l) => `<tr><td>${esc(l.user_name || 'النظام')}</td><td>${esc(l.action)}</td><td class="acc-meta">${esc(l.entity_type || '—')} #${esc(l.entity_id || '')}</td><td>${l.result === 'success' ? '<span class="badge b-green"><i></i>نجاح</span>' : '<span class="badge b-red"><i></i>فشل</span>'}</td><td class="acc-meta">${fmtDate(l.created_at)}</td></tr>`).join('')}
    </tbody></table></div>`);
};
async function saveWorkspace() { try { await api('/settings', { method: 'PUT', body: { name: val('set-name') } }); toast('تم الحفظ', 'ok'); } catch (e) { toast(e.message, 'err'); } }
async function addMember() {
  try {
    await api('/settings/members', { method: 'POST', body: { email: val('mem-email'), role: document.getElementById('mem-role').value } });
    toast('تمت إضافة العضو', 'ok'); VIEWS.settings();
  } catch (e) { toast(e.message, 'err'); }
}

/* ---------------- الإقلاع ---------------- */
(async () => {
  try { await boot(); } catch { renderAuth(); }
})();
