'use strict';
/* ============================================================
   app.js — الإقلاع المشترك: حارس الجلسة ← تحميل السياق ←
   بناء Sidebar/Topbar ← Realtime للإشعارات
   ============================================================ */
(async function bootLayout() {
  // الثيم فورًا لتجنب الوميض
  if (uiPrefs.theme === 'light') document.documentElement.setAttribute('data-theme', 'light');
  if (uiPrefs.sidebarMini) document.body.classList.add('sidebar-mini');

  try { await DB.loadContext(); }
  catch (e) { if (e.message !== 'unauthenticated') { console.error(e); document.body.innerHTML = `<div style="display:flex;min-height:100vh;align-items:center;justify-content:center;flex-direction:column;gap:12px"><h2>تعذر تحميل مساحة العمل</h2><p class="muted">${esc(e.message)}</p><a href="login.html" style="color:var(--brand)">تسجيل الدخول</a></div>`; } return; }

  const page = document.body.dataset.page || '';
  const title = document.body.dataset.title || '';
  const crumb = document.body.dataset.crumb || '';
  const unread = await DB.notifications.unreadCount().catch(() => 0);
  const openErrors = await DB.errors.list({ status: 'open' }).then(r => r.length).catch(() => 0);
  const accCount = await DB.accounts.list().then(r => r.length).catch(() => 0);
  const activeCamps = await DB.campaigns.list({ status: 'active' }).then(r => r.length).catch(() => 0);

  const NAV = [
    { type: 'link', id: 'dashboard', href: 'dashboard.html', ic: 'home', t: 'الرئيسية' },
    { type: 'sec', t: 'الحسابات' },
    { type: 'link', id: 'accounts', href: 'accounts.html', ic: 'users', t: 'جميع الحسابات', count: accCount },
    { type: 'link', id: 'groups', href: 'groups.html', ic: 'folder', t: 'المجموعات', sub: true },
    { type: 'link', id: 'errors', href: 'errors.html', ic: 'pulse', t: 'حالة الحسابات', sub: true, badgeN: openErrors },
    { type: 'sec', t: 'التسويق' },
    { type: 'link', id: 'campaigns', href: 'campaigns.html', ic: 'target', t: 'جميع الحملات' },
    { type: 'link', id: 'campaigns', href: 'campaigns.html?status=active', ic: 'play', t: 'نشطة', sub: true, count: activeCamps },
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
    <aside class="sidebar" aria-label="التنقل الرئيسي">
      <div class="sidebar-head">
        <div class="logo-mark">س</div>
        <div class="logo-text"><div class="t1">مركز القيادة</div><div class="t2 truncate">${esc(S.workspace.name)}</div></div>
      </div>
      <nav class="sidebar-nav">
        ${NAV.map(n => n.type === 'sec' ? `<div class="sb-section">${n.t}</div>` :
          `<a href="${n.href}" class="sb-link ${n.sub ? 'sb-sublink' : ''} ${n.id === page && !n.href.includes('status=') ? 'active' : ''}" data-tip="${n.t}">
            ${icon(n.ic, 19)}<span>${n.t}</span>
            ${n.badgeN ? `<span class="sb-badge" data-badge="${n.id}">${n.badgeN}</span>` : n.count != null ? `<span class="sb-count num">${n.count}</span>` : ''}
          </a>`).join('')}
      </nav>
      <div class="sidebar-foot"><div class="sys-status"><span class="sys-dot"></span><span class="sys-label">النظام يعمل بشكل طبيعي</span></div></div>
    </aside>
    <div class="main">
      <header class="topbar">
        <button class="hamburger" id="hamburger" aria-label="فتح القائمة">${icon('menu', 18)}</button>
        <div class="topbar-title">${crumb ? `<nav class="breadcrumb">${crumb}</nav>` : ''}<h1>${title}</h1></div>
        <div class="grow"></div>
        <div class="top-search">${icon('search', 16)}
          <input type="search" id="global-search" placeholder="بحث عام: حساب، حملة، منشور…" aria-label="بحث عام" autocomplete="off">
          <div class="search-results" id="search-results" role="listbox"></div>
        </div>
        <button class="icon-btn" id="theme-toggle" aria-label="تبديل المظهر">${icon(uiPrefs.theme === 'light' ? 'moon' : 'sun', 17)}</button>
        <a class="icon-btn" href="notifications.html" aria-label="الإشعارات">${icon('bell', 17)}<span class="dot-badge num ${unread ? '' : 'hidden'}" id="top-notif-badge">${unread || ''}</span></a>
        <div class="dropdown">
          <button class="profile-chip" id="profile-btn" aria-haspopup="true" aria-expanded="false">
            <div class="avatar" style="background:${esc(S.profile?.avatar_color || '#7d83e0')}">${esc((S.profile?.full_name || '؟')[0])}</div>
            <div class="pc-info"><div class="pc-name">${esc(S.profile?.full_name || '')}</div><div class="pc-role">${ROLE_NAMES[S.role] || ''}</div></div>
            ${icon('chevron-down', 14)}
          </button>
          <div class="dropdown-menu" id="profile-menu" role="menu">
            <button class="dd-item" onclick="location.href='settings.html'">${icon('gear', 15)} إعدادات الحساب</button>
            <button class="dd-item" onclick="location.href='settings.html#workspace'">${icon('building', 15)} مساحة العمل</button>
            <div class="dd-sep"></div>
            <button class="dd-item" id="sidebar-toggle">${icon('menu', 15)} طيّ القائمة الجانبية</button>
            <div class="dd-sep"></div>
            <button class="dd-item danger" id="logout-btn">${icon('logout', 15)} تسجيل الخروج</button>
          </div>
        </div>
      </header>
      <div class="page-body page-enter" id="page-body"></div>
    </div>`;
  document.body.prepend(shell);
  const tpl = document.getElementById('page-content');
  if (tpl) shell.querySelector('#page-body').appendChild(tpl.content.cloneNode(true));
  if (!document.getElementById('toasts')) { const t = document.createElement('div'); t.id = 'toasts'; document.body.appendChild(t); }

  /* تفاعلات الهيكل */
  const overlay = shell.querySelector('#drawer-overlay');
  shell.querySelector('#hamburger').onclick = () => document.body.classList.toggle('drawer-open');
  overlay.onclick = () => document.body.classList.remove('drawer-open');
  shell.querySelector('#theme-toggle').onclick = (e) => {
    const light = document.documentElement.getAttribute('data-theme') === 'light';
    light ? document.documentElement.removeAttribute('data-theme') : document.documentElement.setAttribute('data-theme', 'light');
    uiPrefs.theme = light ? 'dark' : 'light'; saveUi();
    e.currentTarget.innerHTML = icon(light ? 'sun' : 'moon', 17);
    Bus.emit('theme');
  };
  shell.querySelector('#sidebar-toggle').onclick = () => {
    document.body.classList.toggle('sidebar-mini');
    uiPrefs.sidebarMini = document.body.classList.contains('sidebar-mini'); saveUi();
    shell.querySelector('#profile-menu').classList.remove('open');
  };
  shell.querySelector('#logout-btn').onclick = () => confirmDialog({
    title: 'تسجيل الخروج', message: 'هل تريد إنهاء الجلسة الحالية؟', confirmText: 'تسجيل الخروج',
    onConfirm: () => Auth.signOut()
  });
  const pBtn = shell.querySelector('#profile-btn'), pMenu = shell.querySelector('#profile-menu');
  pBtn.onclick = (e) => { e.stopPropagation(); pMenu.classList.toggle('open'); };
  document.addEventListener('click', (e) => { if (!pMenu.contains(e.target)) pMenu.classList.remove('open'); });

  /* البحث العام — من Supabase */
  const sInput = shell.querySelector('#global-search'), sBox = shell.querySelector('#search-results');
  let sT = null;
  sInput.addEventListener('input', () => {
    clearTimeout(sT);
    sT = setTimeout(async () => {
      const qv = sInput.value.trim();
      if (qv.length < 2) { sBox.classList.remove('open'); return; }
      try {
        const [accs, camps, posts] = await Promise.all([
          DB.accounts.list({ q: qv }), DB.campaigns.list({ q: qv }), DB.posts.list({ q: qv })
        ]);
        let html = '';
        if (accs.length) html += `<div class="sr-group">الحسابات</div>` + accs.slice(0, 4).map(a => `<div class="sr-item" onclick="location.href='account-details.html?id=${a.id}'">${platformChip(a.platform)}<span class="truncate">${esc(a.name)}</span><span class="t">${ACC_STATUS[a.status]?.t || ''}</span></div>`).join('');
        if (camps.length) html += `<div class="sr-group">الحملات</div>` + camps.slice(0, 4).map(c => `<div class="sr-item" onclick="location.href='campaign-details.html?id=${c.id}'">${icon('target', 15)}<span class="truncate">${esc(c.name)}</span><span class="t">${CAMP_STATUS[c.status]?.t || ''}</span></div>`).join('');
        if (posts.length) html += `<div class="sr-group">المحتوى</div>` + posts.slice(0, 3).map(p => `<div class="sr-item" onclick="location.href='content.html'">${icon('file', 15)}<span class="truncate">${esc(p.content.slice(0, 45))}…</span></div>`).join('');
        sBox.innerHTML = html || `<div class="sr-item muted">لا نتائج مطابقة لـ«${esc(qv)}»</div>`;
        sBox.classList.add('open');
      } catch (e) { console.error(e); }
    }, 300);
  });
  document.addEventListener('click', (e) => { if (!sBox.contains(e.target) && e.target !== sInput) sBox.classList.remove('open'); });

  /* Realtime: إشعار جديد ← Toast + تحديث الشارة */
  DB.subscribe('notifications', async (payload) => {
    if (payload.eventType === 'INSERT') {
      const n = payload.new;
      toast(n.title, { body: n.body || '', type: n.type?.includes('fail') || n.type?.includes('error') ? 'err' : 'info' });
      const b = document.getElementById('top-notif-badge');
      if (b) { b.textContent = (parseInt(b.textContent) || 0) + 1; b.classList.remove('hidden'); }
    }
  });

  document.dispatchEvent(new CustomEvent('scc:ready'));
})();
