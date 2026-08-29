'use strict';
/* ============================================================
   app.js — الإقلاع المشترك لكل صفحة:
   بناء Sidebar + Topbar + الثيم + البحث العام + القوائم
   يعمل عبر file:// مباشرة (كل صفحة HTML مستقلة)
   ============================================================ */

(function bootLayout() {
  const page = document.body.dataset.page || '';
  const title = document.body.dataset.title || '';
  const crumb = document.body.dataset.crumb || '';

  // تطبيق تفضيلات الواجهة فورًا (قبل الرسم لتجنب الوميض)
  if (uiPrefs.theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  if (uiPrefs.sidebarMini) document.body.classList.add('sidebar-mini');

  const unread = appState.notifications.filter((n) => !n.read).length;
  const openErrors = appState.errors.filter((e) => e.status === 'open').length;
  const activeCampaigns = appState.campaigns.filter((c) => c.status === 'active').length;

  const NAV = [
    { type: 'link', id: 'dashboard', href: 'dashboard.html', ic: 'home', t: 'الرئيسية' },
    { type: 'sec', t: 'الحسابات' },
    { type: 'link', id: 'accounts', href: 'accounts.html', ic: 'users', t: 'جميع الحسابات', count: appState.accounts.length },
    { type: 'link', id: 'groups', href: 'groups.html', ic: 'folder', t: 'المجموعات', sub: true },
    { type: 'link', id: 'errors', href: 'errors.html', ic: 'pulse', t: 'حالة الحسابات', sub: true, badgeN: openErrors },
    { type: 'sec', t: 'التسويق' },
    { type: 'link', id: 'campaigns', href: 'campaigns.html', ic: 'target', t: 'جميع الحملات' },
    { type: 'link', id: 'campaigns', href: 'campaigns.html?status=active', ic: 'play', t: 'نشطة', sub: true, count: activeCampaigns },
    { type: 'link', id: 'campaigns', href: 'campaigns.html?status=scheduled', ic: 'calendar', t: 'مجدولة', sub: true },
    { type: 'link', id: 'campaigns', href: 'campaigns.html?status=completed', ic: 'check-circle', t: 'مكتملة', sub: true },
    { type: 'link', id: 'content', href: 'content.html', ic: 'file', t: 'المحتوى' },
    { type: 'link', id: 'operations', href: 'operations.html', ic: 'activity', t: 'العمليات' },
    { type: 'link', id: 'analytics', href: 'analytics.html', ic: 'chart', t: 'التحليلات' },
    { type: 'link', id: 'notifications', href: 'notifications.html', ic: 'bell', t: 'الإشعارات', badgeN: unread },
    { type: 'link', id: 'settings', href: 'settings.html', ic: 'gear', t: 'الإعدادات' }
  ];

  const shell = document.createElement('div');
  shell.className = 'app-shell';
  shell.innerHTML = `
    <div class="drawer-overlay" id="drawer-overlay"></div>
    <aside class="sidebar" id="sidebar" aria-label="التنقل الرئيسي">
      <div class="sidebar-head">
        <div class="logo-mark">س</div>
        <div class="logo-text"><div class="t1">مركز القيادة</div><div class="t2 truncate">${esc(appState.workspace.name)} · ${esc(appState.workspace.plan)}</div></div>
      </div>
      <nav class="sidebar-nav">
        ${NAV.map((n) => n.type === 'sec'
          ? `<div class="sb-section">${n.t}</div>`
          : `<a href="${n.href}" class="sb-link ${n.sub ? 'sb-sublink' : ''} ${n.id === page && !n.href.includes('status=') ? 'active' : ''}" data-tip="${n.t}">
              ${icon(n.ic, 19)}<span>${n.t}</span>
              ${n.badgeN ? `<span class="sb-badge" data-badge="${n.id}">${n.badgeN}</span>` : n.count != null ? `<span class="sb-count num">${n.count}</span>` : ''}
            </a>`).join('')}
      </nav>
      <div class="sidebar-foot">
        <div class="sys-status"><span class="sys-dot"></span><span class="sys-label">النظام يعمل بشكل طبيعي</span></div>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="hamburger" id="hamburger" aria-label="فتح القائمة">${icon('menu', 18)}</button>
        <div class="topbar-title">
          ${crumb ? `<nav class="breadcrumb" aria-label="مسار التنقل">${crumb}</nav>` : ''}
          <h1>${title}</h1>
        </div>
        <div class="grow"></div>
        <div class="top-search">
          ${icon('search', 16)}
          <input type="search" id="global-search" placeholder="بحث عام: حساب، حملة، منشور…" aria-label="بحث عام" autocomplete="off">
          <div class="search-results" id="search-results" role="listbox"></div>
        </div>
        <button class="icon-btn" id="theme-toggle" aria-label="تبديل الوضع الليلي">${icon(uiPrefs.theme === 'light' ? 'moon' : 'sun', 17)}</button>
        <a class="icon-btn" href="notifications.html" aria-label="الإشعارات">${icon('bell', 17)}${unread ? `<span class="dot-badge num" id="top-notif-badge">${unread}</span>` : '<span class="dot-badge num hidden" id="top-notif-badge"></span>'}</a>
        <div class="dropdown">
          <button class="profile-chip" id="profile-btn" aria-haspopup="true" aria-expanded="false">
            <div class="avatar">${esc(appState.user.name[0])}</div>
            <div class="pc-info"><div class="pc-name">${esc(appState.user.name)}</div><div class="pc-role">${esc(appState.user.roleLabel)}</div></div>
            ${icon('chevron-down', 14)}
          </button>
          <div class="dropdown-menu" id="profile-menu" role="menu">
            <button class="dd-item" onclick="location.href='settings.html'">${icon('gear', 15)} إعدادات الحساب</button>
            <button class="dd-item" onclick="location.href='settings.html#workspace'">${icon('building', 15)} مساحة العمل</button>
            <div class="dd-sep"></div>
            <button class="dd-item" id="sidebar-toggle">${icon('menu', 15)} طيّ القائمة الجانبية</button>
            <button class="dd-item danger" id="reset-demo">${icon('trash', 15)} إعادة تعيين البيانات التجريبية</button>
            <div class="dd-sep"></div>
            <button class="dd-item danger">${icon('logout', 15)} تسجيل الخروج</button>
          </div>
        </div>
      </header>
      <div class="page-body page-enter" id="page-body"></div>
    </div>`;

  // نقل محتوى <template id="page-content"> إلى جسم الصفحة
  const tpl = document.getElementById('page-content');
  document.body.prepend(shell);
  const bodyBox = shell.querySelector('#page-body');
  if (tpl) bodyBox.appendChild(tpl.content.cloneNode(true));
  document.getElementById('toasts') || Object.assign(document.body.appendChild(document.createElement('div')), { id: 'toasts' });

  /* ---- تفاعلات الهيكل ---- */
  const overlay = shell.querySelector('#drawer-overlay');
  shell.querySelector('#hamburger').onclick = () => document.body.classList.toggle('drawer-open');
  overlay.onclick = () => document.body.classList.remove('drawer-open');

  shell.querySelector('#theme-toggle').onclick = (e) => {
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    if (light) document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', 'light');
    uiPrefs.theme = light ? 'dark' : 'light'; saveUi();
    e.currentTarget.innerHTML = icon(light ? 'sun' : 'moon', 17);
    Bus.emit('theme');
  };

  shell.querySelector('#sidebar-toggle').onclick = () => {
    document.body.classList.toggle('sidebar-mini');
    uiPrefs.sidebarMini = document.body.classList.contains('sidebar-mini'); saveUi();
    shell.querySelector('#profile-menu').classList.remove('open');
  };
  shell.querySelector('#reset-demo').onclick = () => confirmDialog({
    message: 'سيتم مسح كل البيانات التجريبية المخزنة محليًا وإعادة توليدها من جديد. هل تريد المتابعة؟',
    confirmText: 'إعادة التعيين', onConfirm: resetState
  });

  const pBtn = shell.querySelector('#profile-btn'), pMenu = shell.querySelector('#profile-menu');
  pBtn.onclick = (e) => { e.stopPropagation(); pMenu.classList.toggle('open'); pBtn.setAttribute('aria-expanded', pMenu.classList.contains('open')); };
  document.addEventListener('click', (e) => { if (!pMenu.contains(e.target)) pMenu.classList.remove('open'); });

  /* ---- البحث العام ---- */
  const sInput = shell.querySelector('#global-search'), sBox = shell.querySelector('#search-results');
  sInput.addEventListener('input', () => {
    const q = sInput.value.trim();
    if (q.length < 2) { sBox.classList.remove('open'); return; }
    const accs = appState.accounts.filter((a) => a.name.includes(q) || (a.handle || '').includes(q)).slice(0, 4);
    const camps = appState.campaigns.filter((c) => c.name.includes(q) || (c.client || '').includes(q)).slice(0, 4);
    const posts = appState.posts.filter((p) => p.content.includes(q)).slice(0, 3);
    let html = '';
    if (accs.length) html += `<div class="sr-group">الحسابات</div>` + accs.map((a) => `<div class="sr-item" onclick="location.href='account-details.html?id=${a.id}'">${platformChip(a.platform)}<span class="truncate">${esc(a.name)}</span><span class="t">${ACC_STATUS[a.status].t}</span></div>`).join('');
    if (camps.length) html += `<div class="sr-group">الحملات</div>` + camps.map((c) => `<div class="sr-item" onclick="location.href='campaign-details.html?id=${c.id}'">${icon('target', 15)}<span class="truncate">${esc(c.name)}</span><span class="t">${CAMP_STATUS[c.status].t}</span></div>`).join('');
    if (posts.length) html += `<div class="sr-group">المحتوى</div>` + posts.map((p) => `<div class="sr-item" onclick="location.href='content.html?q=${encodeURIComponent(q)}'">${icon('file', 15)}<span class="truncate">${esc(p.content.slice(0, 45))}…</span></div>`).join('');
    sBox.innerHTML = html || `<div class="sr-item muted">لا نتائج مطابقة لـ«${esc(q)}»</div>`;
    sBox.classList.add('open');
  });
  document.addEventListener('click', (e) => { if (!sBox.contains(e.target) && e.target !== sInput) sBox.classList.remove('open'); });

  /* تحديث شارة الإشعارات حيًّا */
  Bus.on('notifications', () => {
    const n = appState.notifications.filter((x) => !x.read).length;
    const b = document.getElementById('top-notif-badge');
    if (b) { b.textContent = n; b.classList.toggle('hidden', !n); }
    const sb = document.querySelector('[data-badge="notifications"]');
    if (sb) { if (n) { sb.textContent = n; sb.classList.remove('hidden'); } else sb.remove(); }
  });

  // إشارة جاهزية الهيكل لصفحات المحتوى
  document.dispatchEvent(new CustomEvent('scc:ready'));
})();
