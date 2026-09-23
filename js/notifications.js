'use strict';
/* notifications.js — مركز الإشعارات من قاعدة البيانات + Realtime */
(async function () {
  await new Promise(r => document.addEventListener('scc:ready', r, { once: true }));
  const root = document.getElementById('notifications-root');
  if (!root) return;
  let filter = 'all';
  async function render() {
    root.innerHTML = '<div class="skeleton" style="min-height:280px"></div>';
    let rows;
    try {
      rows = await DB.notifications.list();
    } catch (e) {
      // لا نترك الهيكل العظمي معلّقًا — نعرض خطأ صريحًا وزر إعادة محاولة
      toast(e.message, { type: 'err' });
      root.innerHTML = `<div class="card">${emptyState('alert', 'تعذّر تحميل الإشعارات', e.message || 'حدث خطأ غير متوقع',
        '<button class="btn btn-primary" onclick="notifReload()">إعادة المحاولة</button>')}</div>`;
      return;
    }
    const unread = rows.filter(n => !n.read_at).length;
    const shown = filter === 'unread' ? rows.filter(n => !n.read_at) : rows;
    root.innerHTML = `
      <div class="filters-bar">
        <div class="tabs">
          <button class="tab ${filter === 'all' ? 'active' : ''}" onclick="notifFilter('all')">الكل <span class="num">${rows.length}</span></button>
          <button class="tab ${filter === 'unread' ? 'active' : ''}" onclick="notifFilter('unread')">غير المقروءة <span class="num">${unread}</span></button>
        </div>
        <div class="grow"></div>
        <button class="btn btn-ghost btn-sm" onclick="markAllRead()">${icon('check', 14)} تحديد الكل كمقروء</button>
      </div>
      <div class="card" style="padding:4px 0">
        ${shown.map(n => {
          const [ic, tone] = notifIcon(n.type);
          return `<div class="list-row clickable" style="${n.read_at ? 'opacity:.55' : ''}" onclick="markRead(${n.id},this)">
            <div class="lr-ico ${tone}">${icon(ic, 16)}</div>
            <div class="grow"><div class="lr-title">${esc(n.title)}</div>${n.body ? `<div class="lr-sub">${esc(n.body)}</div>` : ''}</div>
            <span class="lr-time">${timeAgo(n.created_at)}</span>
            ${!n.read_at ? '<span class="unread-dot"></span>' : ''}</div>`;
        }).join('') || emptyState('bell', 'لا إشعارات', 'ستصلك هنا تنبيهات الحملات والحسابات والأخطاء')}
      </div>
      <div class="form-hint mt-2">${icon('info', 12)} الإشعارات الجديدة تظهر لحظيًا عبر Realtime. قنوات البريد وواتساب وPush تُفعَّل من الإعدادات مستقبلًا.</div>`;
  }
  window.notifFilter = (v) => { filter = v; render(); };
  window.notifReload = () => render();
  window.markRead = async (id, el) => {
    try { await DB.notifications.markRead(id); el.style.opacity = '.55'; el.querySelector('.unread-dot')?.remove(); } catch {}
  };
  window.markAllRead = async () => {
    try { await DB.notifications.markAllRead(); toast('تم تحديد الكل كمقروء', { type: 'ok', duration: 1800 }); render(); }
    catch (e) { toast(e.message, { type: 'err' }); }
  };
  let deb = null;
  DB.subscribe('notifications', () => { clearTimeout(deb); deb = setTimeout(render, 400); });
  render();
})();
