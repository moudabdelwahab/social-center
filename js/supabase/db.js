'use strict';
/* ============================================================
   db.js — Data Service Layer الوحيدة. الواجهة لا تلمس Supabase
   مباشرة أبدًا. كل الاستعلامات مُقيّدة بـ workspace وتخضع لـRLS.
   ============================================================ */
const DB = {
  /* سياق المستخدم: الملف + مساحة العمل + الدور */
  async loadContext() {
    const s = await Auth.requireAuth();
    const uid = s.user.id;
    const profile = await q(sb.from('profiles').select('*').eq('id', uid).single(), 'profile');
    const memberships = await q(
      sb.from('workspace_members').select('role, workspaces(id,name,plan_code)').eq('user_id', uid), 'memberships');
    if (!memberships?.length) throw new Error('لا توجد مساحة عمل مرتبطة بحسابك');
    const m = memberships[0];
    S.user = { id: uid, email: s.user.email };
    S.profile = profile;
    S.workspace = m.workspaces;
    S.role = m.role;
    S.memberships = memberships;
    return S;
  },

  /* ---------- Accounts ---------- */
  accounts: {
    list: (f = {}) => {
      let s2 = sb.from('social_accounts').select('*').eq('workspace_id', S.workspace.id).is('deleted_at', null).order('created_at', { ascending: false });
      if (f.status) s2 = s2.eq('status', f.status);
      if (f.platform) s2 = s2.eq('platform', f.platform);
      if (f.q) s2 = s2.or(`name.ilike.%${f.q}%,handle.ilike.%${f.q}%`);
      return q(s2, 'accounts.list');
    },
    get: (id) => q(sb.from('social_accounts').select('*').eq('id', id).single(), 'accounts.get'),
    create: (d) => q(sb.from('social_accounts').insert({ workspace_id: S.workspace.id, ...d }).select().single(), 'accounts.create'),
    update: (id, patch) => q(sb.from('social_accounts').update(patch).eq('id', id), 'accounts.update'),
    remove: (id) => q(sb.from('social_accounts').update({ deleted_at: new Date().toISOString(), status: 'paused' }).eq('id', id), 'accounts.remove'),
    campaignsOf: (id) => q(sb.from('campaign_accounts').select('campaigns(id,name,status,client)').eq('account_id', id), 'accounts.campaigns'),
    jobsOf: (id) => q(sb.from('jobs').select('*').eq('account_id', id).order('id', { ascending: false }).limit(10), 'accounts.jobs')
  },

  /* ---------- Groups ---------- */
  groups: {
    async list() {
      const gs = await q(sb.from('account_groups').select('*').eq('workspace_id', S.workspace.id).is('deleted_at', null).order('created_at', { ascending: false }), 'groups');
      const ms = await q(sb.from('account_group_members').select('group_id, account_id, social_accounts(id,name,platform,status,followers)'), 'group-members');
      return gs.map(g => ({ ...g, members: (ms || []).filter(x => x.group_id === g.id).map(x => x.social_accounts).filter(Boolean) }));
    },
    create: (d) => q(sb.from('account_groups').insert({ workspace_id: S.workspace.id, ...d }).select().single(), 'groups.create'),
    update: (id, patch) => q(sb.from('account_groups').update(patch).eq('id', id), 'groups.update'),
    remove: (id) => q(sb.from('account_groups').update({ deleted_at: new Date().toISOString() }).eq('id', id), 'groups.remove'),
    async setMembers(id, accountIds) {
      await q(sb.from('account_group_members').delete().eq('group_id', id), 'groups.clearMembers');
      if (accountIds.length) await q(sb.from('account_group_members').insert(accountIds.map(a => ({ group_id: id, account_id: a }))), 'groups.setMembers');
    }
  },

  /* ---------- Campaigns ---------- */
  campaigns: {
    async list(f = {}) {
      let s2 = sb.from('campaigns').select('*, campaign_accounts(account_id)').eq('workspace_id', S.workspace.id).is('deleted_at', null).order('created_at', { ascending: false });
      if (f.status) s2 = s2.eq('status', f.status);
      if (f.q) s2 = s2.or(`name.ilike.%${f.q}%,client.ilike.%${f.q}%`);
      const rows = await q(s2, 'campaigns');
      const jobs = await q(sb.from('jobs').select('campaign_id,status').eq('workspace_id', S.workspace.id), 'campaigns.jobs');
      return rows.map(c => {
        const cj = (jobs || []).filter(j => j.campaign_id === c.id);
        return { ...c, accountIds: (c.campaign_accounts || []).map(x => x.account_id),
          jobsTotal: cj.length, jobsOk: cj.filter(j => j.status === 'success').length, jobsFail: cj.filter(j => j.status === 'failed').length };
      });
    },
    get: async (id) => {
      const c = await q(sb.from('campaigns').select('*, campaign_accounts(account_id, social_accounts(id,name,platform,status,followers))').eq('id', id).single(), 'campaigns.get');
      c.assets = (c.campaign_accounts || []).map(x => x.social_accounts).filter(Boolean);
      c.accountIds = c.assets.map(a => a.id);
      return c;
    },
    create: async (d, accountIds = []) => {
      const c = await q(sb.from('campaigns').insert({ workspace_id: S.workspace.id, created_by: S.user.id, ...d }).select().single(), 'campaigns.create');
      if (accountIds.length) await q(sb.from('campaign_accounts').insert(accountIds.map(a => ({ campaign_id: c.id, account_id: a }))), 'campaigns.assets');
      return c;
    },
    update: (id, patch) => q(sb.from('campaigns').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id), 'campaigns.update'),
    remove: (id) => q(sb.from('campaigns').update({ deleted_at: new Date().toISOString() }).eq('id', id), 'campaigns.remove'),
    postsOf: (id) => q(sb.from('posts').select('*').eq('campaign_id', id).is('deleted_at', null).order('created_at', { ascending: false }).limit(10), 'campaigns.posts'),
    jobsOf: (id) => q(sb.from('jobs').select('*, social_accounts(name)').eq('campaign_id', id).order('id', { ascending: false }).limit(12), 'campaigns.jobsOf')
  },

  /* ---------- Posts ---------- */
  posts: {
    async list(f = {}) {
      let s2 = sb.from('posts').select('*, campaigns(name), post_accounts(account_id)').eq('workspace_id', S.workspace.id).is('deleted_at', null).order('created_at', { ascending: false });
      if (f.status) s2 = s2.eq('status', f.status);
      if (f.q) s2 = s2.ilike('content', `%${f.q}%`);
      const rows = await q(s2, 'posts');
      return rows.map(p => ({ ...p, accountIds: (p.post_accounts || []).map(x => x.account_id) }));
    },
    create: async (d, accountIds = []) => {
      const p = await q(sb.from('posts').insert({ workspace_id: S.workspace.id, created_by: S.user.id, ...d }).select().single(), 'posts.create');
      if (accountIds.length) await q(sb.from('post_accounts').insert(accountIds.map(a => ({ post_id: p.id, account_id: a }))), 'posts.accounts');
      return p;
    },
    update: (id, patch) => q(sb.from('posts').update(patch).eq('id', id), 'posts.update'),
    async setAccounts(id, accountIds) {
      await q(sb.from('post_accounts').delete().eq('post_id', id), 'posts.clearAcc');
      if (accountIds.length) await q(sb.from('post_accounts').insert(accountIds.map(a => ({ post_id: id, account_id: a }))), 'posts.setAcc');
    },
    remove: (id) => q(sb.from('posts').update({ deleted_at: new Date().toISOString() }).eq('id', id), 'posts.remove')
  },

  /* ---------- Jobs (Operations) ---------- */
  jobs: {
    list(f = {}) {
      let s2 = sb.from('jobs').select('*, campaigns(name), social_accounts(name)').eq('workspace_id', S.workspace.id).order('id', { ascending: false }).limit(200);
      if (f.status) s2 = s2.eq('status', f.status);
      if (f.campaignId) s2 = s2.eq('campaign_id', f.campaignId);
      return q(s2, 'jobs');
    },
    create: (d) => q(sb.from('jobs').insert({ workspace_id: S.workspace.id, ...d }).select().single(), 'jobs.create'),
    bulkCreate: (rows) => q(sb.from('jobs').insert(rows.map(r => ({ workspace_id: S.workspace.id, ...r }))), 'jobs.bulk'),
    update: (id, patch) => q(sb.from('jobs').update(patch).eq('id', id), 'jobs.update')
  },

  /* ---------- Notifications ---------- */
  notifications: {
    list: () => q(sb.from('notifications').select('*').eq('workspace_id', S.workspace.id).order('id', { ascending: false }).limit(60), 'notif'),
    unreadCount: async () => {
      const { count, error } = await sb.from('notifications').select('id', { count: 'exact', head: true }).eq('workspace_id', S.workspace.id).is('read_at', null);
      if (error) { console.error('[SCC:db] notif.count', error); return 0; }
      return count || 0;
    },
    create: (d) => q(sb.from('notifications').insert({ workspace_id: S.workspace.id, ...d }), 'notif.create'),
    markRead: (id) => q(sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id), 'notif.read'),
    markAllRead: () => q(sb.from('notifications').update({ read_at: new Date().toISOString() }).eq('workspace_id', S.workspace.id).is('read_at', null), 'notif.readAll')
  },

  /* ---------- Errors ---------- */
  errors: {
    list(f = {}) {
      let s2 = sb.from('errors').select('*').eq('workspace_id', S.workspace.id).order('created_at', { ascending: false }).limit(100);
      if (f.status) s2 = s2.eq('status', f.status);
      if (f.category) s2 = s2.eq('category', f.category);
      return q(s2, 'errors');
    },
    update: (id, patch) => q(sb.from('errors').update(patch).eq('id', id), 'errors.update')
  },

  /* ---------- Analytics ---------- */
  analytics: {
    daily: (days = 30) => q(
      sb.from('analytics_daily').select('*').eq('workspace_id', S.workspace.id)
        .gte('date', new Date(Date.now() - days * 864e5).toISOString().slice(0, 10)).order('date'), 'analytics')
  },

  /* ---------- Settings ---------- */
  settings: {
    team: () => q(sb.from('workspace_members').select('role, created_at, profiles(id,full_name,email)').eq('workspace_id', S.workspace.id), 'team'),
    saveProfile: (patch) => q(sb.from('profiles').update(patch).eq('id', S.user.id), 'profile.save'),
    saveWorkspace: (patch) => q(sb.from('workspaces').update(patch).eq('id', S.workspace.id), 'ws.save'),
    plan: () => q(sb.from('plans').select('*').eq('code', S.workspace.plan_code).single(), 'plan')
  },

  /* ---------- Automation ---------- */
  automation: {
    async load() {
      const rows = await q(sb.from('automations').select('*').eq('workspace_id', S.workspace.id).limit(1), 'automation.load');
      return rows?.[0] || null;
    },
    async save(graph) {
      const existing = await this.load();
      if (existing) return q(sb.from('automations').update({ graph, updated_at: new Date().toISOString() }).eq('id', existing.id), 'automation.save');
      return q(sb.from('automations').insert({ workspace_id: S.workspace.id, graph }), 'automation.insert');
    }
  },

  audit: (action, entityType = null, entityId = null, result = 'success') =>
    q(sb.from('audit_logs').insert({ workspace_id: S.workspace.id, user_id: S.user.id, action, entity_type: entityType, entity_id: entityId != null ? String(entityId) : null, result }), 'audit').catch(() => {}),

  /* ---------- Realtime ---------- */
  subscribe(table, cb) {
    if (!sb || !S.workspace) return null;
    return sb.channel(`scc-${table}`)
      .on('postgres_changes', { event: '*', schema: 'public', table, filter: `workspace_id=eq.${S.workspace.id}` }, cb)
      .subscribe();
  }
};
