'use strict';
/* ============================================================
   data-provider.js — طبقة تجريد البيانات
   UI ← Application Logic ← DataProvider ← (MockProvider الآن)
   مستقبلًا: يُستبدل MockProvider بـ SupabaseProvider / MetaProvider
   بنفس الواجهة دون تعديل أي صفحة.
   ============================================================ */

const MockProvider = {
  _ok(data) { return Promise.resolve(data); }, // جاهزة للتحويل إلى async حقيقية

  // ----- Accounts -----
  listAccounts(filter = {}) {
    let rows = appState.accounts;
    if (filter.status) rows = rows.filter((a) => a.status === filter.status);
    if (filter.q) { const q = filter.q.trim(); rows = rows.filter((a) => a.name.includes(q) || (a.handle || '').includes(q)); }
    if (filter.platform) rows = rows.filter((a) => a.platform === filter.platform);
    return this._ok(rows);
  },
  getAccount(id) { return this._ok(appState.accounts.find((a) => a.id === id)); },
  addAccount(data) {
    const acc = {
      id: appState.nextId.account++, status: 'connected', followers: Math.round(2000 + Math.random() * 40000),
      lastSync: new Date().toISOString(), addedAt: new Date().toISOString(), campaigns: [],
      perms: { publish: true, readData: true, insights: true, comments: true, messages: data.platform === 'meta' },
      ...data
    };
    appState.accounts.unshift(acc); saveState(); return this._ok(acc);
  },
  updateAccount(id, patch) {
    const a = appState.accounts.find((x) => x.id === id);
    if (a) { Object.assign(a, patch); saveState(); }
    return this._ok(a);
  },
  removeAccount(id) {
    appState.accounts = appState.accounts.filter((a) => a.id !== id);
    appState.groups.forEach((g) => g.accountIds = g.accountIds.filter((x) => x !== id));
    saveState(); return this._ok(true);
  },

  // ----- Groups -----
  listGroups() { return this._ok(appState.groups); },
  addGroup(data) { const g = { id: appState.nextId.group++, accountIds: [], ...data }; appState.groups.unshift(g); saveState(); return this._ok(g); },
  updateGroup(id, patch) { const g = appState.groups.find((x) => x.id === id); if (g) { Object.assign(g, patch); saveState(); } return this._ok(g); },
  removeGroup(id) { appState.groups = appState.groups.filter((g) => g.id !== id); saveState(); return this._ok(true); },

  // ----- Campaigns -----
  listCampaigns(filter = {}) {
    let rows = appState.campaigns;
    if (filter.status) rows = rows.filter((c) => c.status === filter.status);
    if (filter.q) rows = rows.filter((c) => c.name.includes(filter.q) || (c.client || '').includes(filter.q));
    return this._ok(rows);
  },
  getCampaign(id) { return this._ok(appState.campaigns.find((c) => c.id === id)); },
  addCampaign(data) {
    const c = { id: appState.nextId.campaign++, progress: 0, jobsTotal: 0, jobsOk: 0, jobsFail: 0, reach: 0, engagement: 0, impressions: 0, status: 'draft', accountIds: [], ...data };
    appState.campaigns.unshift(c); saveState(); return this._ok(c);
  },
  updateCampaign(id, patch) { const c = appState.campaigns.find((x) => x.id === id); if (c) { Object.assign(c, patch); saveState(); } return this._ok(c); },
  removeCampaign(id) { appState.campaigns = appState.campaigns.filter((c) => c.id !== id); saveState(); return this._ok(true); },

  // ----- Posts -----
  listPosts(filter = {}) {
    let rows = appState.posts;
    if (filter.status) rows = rows.filter((p) => p.status === filter.status);
    if (filter.q) rows = rows.filter((p) => p.content.includes(filter.q));
    return this._ok(rows);
  },
  addPost(data) { const p = { id: appState.nextId.post++, status: 'draft', reach: 0, engagement: 0, createdAt: new Date().toISOString(), ...data }; appState.posts.unshift(p); saveState(); return this._ok(p); },
  updatePost(id, patch) { const p = appState.posts.find((x) => x.id === id); if (p) { Object.assign(p, patch); saveState(); } return this._ok(p); },
  removePost(id) { appState.posts = appState.posts.filter((p) => p.id !== id); saveState(); return this._ok(true); },

  // ----- Jobs -----
  listJobs(filter = {}) {
    let rows = appState.jobs;
    if (filter.status) rows = rows.filter((j) => j.status === filter.status);
    if (filter.campaignId) rows = rows.filter((j) => j.campaignId === filter.campaignId);
    return this._ok(rows);
  },
  addJob(data) { const j = { id: appState.nextId.job++, progress: 0, duration: null, error: null, ...data }; appState.jobs.unshift(j); saveState(); return this._ok(j); },
  updateJob(id, patch) { const j = appState.jobs.find((x) => x.id === id); if (j) { Object.assign(j, patch); saveState(); } return this._ok(j); },

  // ----- Notifications / Errors -----
  listNotifications() { return this._ok(appState.notifications); },
  addNotification(data) { const n = { id: appState.nextId.notif++, read: false, time: new Date().toISOString(), ...data }; appState.notifications.unshift(n); saveState(); Bus.emit('notifications'); return this._ok(n); },
  markAllRead() { appState.notifications.forEach((n) => n.read = true); saveState(); Bus.emit('notifications'); return this._ok(true); },

  listErrors(filter = {}) {
    let rows = appState.errors;
    if (filter.status) rows = rows.filter((e) => e.status === filter.status);
    if (filter.category) rows = rows.filter((e) => e.category === filter.category);
    return this._ok(rows);
  },
  updateError(id, patch) { const e = appState.errors.find((x) => x.id === id); if (e) { Object.assign(e, patch); saveState(); } return this._ok(e); },
  addError(data) { const e = { id: appState.nextId.error++, status: 'open', occurrences: 1, time: new Date().toISOString(), ...data }; appState.errors.unshift(e); saveState(); return this._ok(e); },

  // ----- Analytics -----
  getSeries() { return this._ok(appState.series30); }
};

/* نقطة التبديل المستقبلية: const DB = new SupabaseProvider(...) */
const DB = MockProvider;
