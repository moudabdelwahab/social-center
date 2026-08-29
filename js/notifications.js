'use strict';
/* notifications.js — مركز الإشعارات */
(function () {
  const root = document.getElementById('notifications-root');
  if (!root) return;
  let filter = 'all';
  const ICONS = {
    campaign_started: ['rocket', 'sc-brand'], campaign_completed: ['check-circle', 'sc-green'],
    job_failed: ['alert', 'sc-red'], account_connected: ['link', 'sc-green'],
    account_disconnected: ['unlink', 'sc-red'], token_expiring: ['key', 'sc-amber'],
    post_published: ['send', 'sc-cyan'], post_scheduled: ['calendar', 'sc-purple'], report_ready: ['chart', 'sc-brand']
  };

  function render() {
    let rows = appState.notifications;
    if (filter === 'unread') rows = rows.filter(n => !n.read);
    const unread = appState.notifications.filter(n => !n.read).length;
    root.innerHTML = `
      <div class="filters-bar">
        <div class="tabs">
          <button class="tab ${filter === 'all' ? 'active' : ''}" onclick="notifFilter('all')">الكل <span class="num">${appState.notifications.length}</span></button>
          <button class="tab ${filter === 'unread' ? 'active' : ''}" onclick="notifFilter('unread')">غير المقروءة <span class="num">${unread}</span></button>
        </div>
        <div class="grow"></div>
        <button class="btn btn-ghost btn-sm" onclick="markAllRead()">${icon('check', 14)} تحديد الكل كمقروء</button>
      </div>
      <div class="card" style="padding:4px 0">
        ${rows.map(n => {
          const [ic, tone] = ICONS[n.type] || ['bell', 'sc-brand'];
          return `<div class="list-row" style="${n.read ? 'opacity:.55' : ''}">
            <div class="lr-ico ${tone}">${icon(ic, 16)}</div>
            <div class="grow"><div class="lr-title">${esc(n.title)}</div>${n.body ? `<div class="lr-sub">${esc(n.body)}</div>` : ''}</div>
            <span class="lr-time">${timeAgo(n.time)}</span>
            ${!n.read ? '<span class="unread-dot"></span>' : ''}
          </div>`;
        }).join('') || emptyState('bell', 'لا إشعارات', 'ستصلك هنا تنبيهات الحملات والحسابات والأخطاء')}
      </div>
      <div class="form-hint mt-2">${icon('info', 12)} قنوات التنبيه مصممة للتوسع: البريد وواتساب وPush تُضاف مستقبلًا من الإعدادات دون تعديل هذه الصفحة.</div>`;
  }

  window.notifFilter = (v) => { filter = v; render(); };
  window.markAllRead = () => { DB.markAllRead(); toast('تم تحديد الكل كمقروء', { type: 'ok', duration: 1800 }); render(); };
  Bus.on('notifications', render);
  render();
})();
