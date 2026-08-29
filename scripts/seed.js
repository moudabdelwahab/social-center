'use strict';
/** Seed: الخطط + المنصات + حساب تجريبي اختياري */
const { db } = require('../src/db');
const bcrypt = require('bcryptjs');

const plans = [
  { code: 'starter', name: 'المبتدئة', max_accounts: 10, max_campaigns: 5, max_users: 2, max_jobs_per_month: 1000, max_api_requests_per_day: 5000 },
  { code: 'professional', name: 'الاحترافية', max_accounts: 100, max_campaigns: 50, max_users: 10, max_jobs_per_month: 20000, max_api_requests_per_day: 100000 },
  { code: 'business', name: 'الأعمال', max_accounts: 1000, max_campaigns: 300, max_users: 50, max_jobs_per_month: 200000, max_api_requests_per_day: 1000000 },
  { code: 'enterprise', name: 'المؤسسات', max_accounts: 100000, max_campaigns: 10000, max_users: 1000, max_jobs_per_month: 10000000, max_api_requests_per_day: 100000000 }
];
const insPlan = db.prepare(`INSERT OR IGNORE INTO plans (code,name,max_accounts,max_campaigns,max_users,max_jobs_per_month,max_api_requests_per_day) VALUES (@code,@name,@max_accounts,@max_campaigns,@max_users,@max_jobs_per_month,@max_api_requests_per_day)`);
plans.forEach((p) => insPlan.run(p));

const platforms = [
  { code: 'meta', name: 'Meta (Facebook)', capabilities: '{"publishing":true,"scheduling":true,"comments":true,"analytics":true,"messaging":true}', enabled: 0 },
  { code: 'instagram', name: 'Instagram', capabilities: '{"publishing":true,"scheduling":true,"comments":true,"analytics":true,"messaging":false}', enabled: 0 },
  { code: 'tiktok', name: 'TikTok', capabilities: '{"publishing":true,"scheduling":false,"comments":false,"analytics":true,"messaging":false}', enabled: 0 },
  { code: 'linkedin', name: 'LinkedIn', capabilities: '{"publishing":true,"scheduling":true,"comments":false,"analytics":true,"messaging":false}', enabled: 0 },
  { code: 'mock', name: 'مزود تجريبي (Mock)', capabilities: '{"publishing":true,"scheduling":true,"comments":true,"analytics":true,"messaging":true}', enabled: 1 }
];
const insPlat = db.prepare(`INSERT OR IGNORE INTO social_platforms (code,name,capabilities,enabled) VALUES (@code,@name,@capabilities,@enabled)`);
platforms.forEach((p) => insPlat.run(p));

// حساب تجريبي: demo@scc.local / Demo12345
const email = 'demo@scc.local';
if (!db.prepare(`SELECT id FROM users WHERE email=?`).get(email)) {
  const plan = db.prepare(`SELECT id FROM plans WHERE code='professional'`).get();
  const u = db.prepare(`INSERT INTO users (email,password_hash,name) VALUES (?,?,?)`).run(email, bcrypt.hashSync('Demo12345', 12), 'مستخدم تجريبي');
  const w = db.prepare(`INSERT INTO workspaces (name, plan_id) VALUES (?,?)`).run('شركة المثال للتسويق', plan.id);
  db.prepare(`INSERT INTO workspace_members (workspace_id,user_id,role) VALUES (?,?, 'owner')`).run(w.lastInsertRowid, u.lastInsertRowid);
  console.log('تم إنشاء الحساب التجريبي → demo@scc.local / Demo12345');
}
console.log('✔ Seed مكتمل');
