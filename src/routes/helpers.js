'use strict';
const { db } = require('../db');
const { AppError } = require('../utils/errors');

/** حدود الخطة من قاعدة البيانات — لا يوجد Hard-coded limits */
function planLimitCheck(workspaceId, resource) {
  const ws = db.prepare(`SELECT p.* FROM workspaces w JOIN plans p ON p.id=w.plan_id WHERE w.id=?`).get(workspaceId);
  if (!ws) throw new AppError(404, 'مساحة العمل غير موجودة');
  const map = {
    accounts: { col: 'max_accounts', sql: `SELECT COUNT(*) c FROM social_accounts WHERE workspace_id=? AND deleted_at IS NULL`, label: 'الحسابات' },
    campaigns: { col: 'max_campaigns', sql: `SELECT COUNT(*) c FROM campaigns WHERE workspace_id=? AND deleted_at IS NULL`, label: 'الحملات' },
    users: { col: 'max_users', sql: `SELECT COUNT(*) c FROM workspace_members WHERE workspace_id=?`, label: 'المستخدمين' }
  };
  const cfg = map[resource];
  const current = db.prepare(cfg.sql).get(workspaceId).c;
  if (current >= ws[cfg.col]) {
    throw new AppError(402, `وصلت إلى حد خطتك (${ws.name}): ${ws[cfg.col]} ${cfg.label}. رقِّ خطتك للمزيد.`, 'validation');
  }
}

module.exports = { planLimitCheck };
