'use strict';
const express = require('express');
const { db } = require('../db');
const { AppError, wrap } = require('../utils/errors');
const { roleAtLeast } = require('../middleware/auth');
const { enqueueJob } = require('../services/jobs');
const { audit } = require('../services/audit');
const { notify } = require('../services/notifications');
const { planLimitCheck } = require('./helpers');

const r = express.Router();
const VALID_STATUS = ['draft', 'scheduled', 'active', 'paused', 'completed', 'failed'];

r.get('/', wrap(async (req, res) => {
  const ws = req.workspace.id;
  const status = req.query.status || null;
  const q = (req.query.q || '').trim();
  let where = `WHERE c.workspace_id=? AND c.deleted_at IS NULL`;
  const params = [ws];
  if (status) { where += ` AND c.status=?`; params.push(status); }
  if (q) { where += ` AND (c.name LIKE ? OR c.client LIKE ?)`; params.push(`%${q}%`, `%${q}%`); }
  const items = db.prepare(
    `SELECT c.*,
       (SELECT COUNT(*) FROM campaign_accounts ca WHERE ca.campaign_id=c.id) AS assets_count,
       (SELECT COUNT(*) FROM jobs j WHERE j.campaign_id=c.id) AS jobs_count,
       (SELECT COUNT(*) FROM jobs j WHERE j.campaign_id=c.id AND j.status='success') AS jobs_success,
       (SELECT COUNT(*) FROM jobs j WHERE j.campaign_id=c.id AND j.status='failed') AS jobs_failed
     FROM campaigns c ${where} ORDER BY c.created_at DESC LIMIT 100`
  ).all(...params);
  res.json({ items });
}));

r.post('/', roleAtLeast('manager'), wrap(async (req, res) => {
  const { name, description, client, objective, budget, startDate, endDate } = req.body || {};
  if (!name) throw new AppError(400, 'اسم الحملة مطلوب', 'validation');
  if (startDate && endDate && endDate < startDate) throw new AppError(400, 'تاريخ النهاية قبل تاريخ البداية', 'validation');
  planLimitCheck(req.workspace.id, 'campaigns');
  const info = db.prepare(
    `INSERT INTO campaigns (workspace_id, name, description, client, objective, budget, start_date, end_date, created_by)
     VALUES (?,?,?,?,?,?,?,?,?)`
  ).run(req.workspace.id, name, description || null, client || null, objective || null, budget ?? null, startDate || null, endDate || null, req.user.id);
  audit({ workspaceId: req.workspace.id, userId: req.user.id, action: 'campaign_created', entityType: 'campaign', entityId: info.lastInsertRowid, ip: req.ip });
  res.status(201).json({ id: info.lastInsertRowid });
}));

function getCampaign(req) {
  const c = db.prepare(`SELECT * FROM campaigns WHERE id=? AND workspace_id=? AND deleted_at IS NULL`).get(req.params.id, req.workspace.id);
  if (!c) throw new AppError(404, 'الحملة غير موجودة');
  return c;
}

r.get('/:id', wrap(async (req, res) => {
  const c = getCampaign(req);
  const assets = db.prepare(
    `SELECT a.id, a.name, a.platform_code, a.status, a.account_type FROM campaign_accounts ca JOIN social_accounts a ON a.id=ca.account_id WHERE ca.campaign_id=? AND a.deleted_at IS NULL`
  ).all(c.id);
  const jobs = db.prepare(
    `SELECT status, COUNT(*) c FROM jobs WHERE campaign_id=? GROUP BY status`
  ).all(c.id);
  const posts = db.prepare(`SELECT id, content, status, created_at FROM posts WHERE campaign_id=? AND deleted_at IS NULL ORDER BY id DESC LIMIT 20`).all(c.id);
  const timeline = db.prepare(
    `SELECT action, result, created_at FROM audit_logs WHERE workspace_id=? AND entity_type='campaign' AND entity_id=? ORDER BY id`
  ).all(req.workspace.id, String(c.id));
  res.json({ campaign: c, assets, jobs, posts, timeline });
}));

r.put('/:id', roleAtLeast('manager'), wrap(async (req, res) => {
  const c = getCampaign(req);
  const { name, description, client, objective, budget, startDate, endDate } = req.body || {};
  db.prepare(
    `UPDATE campaigns SET name=COALESCE(?,name), description=COALESCE(?,description), client=COALESCE(?,client),
     objective=COALESCE(?,objective), budget=COALESCE(?,budget), start_date=COALESCE(?,start_date), end_date=COALESCE(?,end_date),
     updated_at=datetime('now') WHERE id=?`
  ).run(name ?? null, description ?? null, client ?? null, objective ?? null, budget ?? null, startDate ?? null, endDate ?? null, c.id);
  audit({ workspaceId: req.workspace.id, userId: req.user.id, action: 'campaign_updated', entityType: 'campaign', entityId: c.id, ip: req.ip });
  res.json({ ok: true });
}));

// ربط الأصول: حسابات مباشرة + مجموعات كاملة
r.post('/:id/accounts', roleAtLeast('manager'), wrap(async (req, res) => {
  const c = getCampaign(req);
  const { accountIds = [], groupIds = [], replace = true } = req.body || {};
  const ws = req.workspace.id;
  const ids = new Set(accountIds.map(Number));
  for (const gid of groupIds) {
    const rows = db.prepare(
      `SELECT m.account_id FROM account_group_members m JOIN account_groups g ON g.id=m.group_id
       WHERE m.group_id=? AND g.workspace_id=? AND g.deleted_at IS NULL`
    ).all(gid, ws);
    rows.forEach((row) => ids.add(row.account_id));
  }
  const check = db.prepare(`SELECT id FROM social_accounts WHERE id=? AND workspace_id=? AND deleted_at IS NULL`);
  const valid = [...ids].filter((id) => check.get(id, ws));
  const tx = db.transaction(() => {
    if (replace) db.prepare(`DELETE FROM campaign_accounts WHERE campaign_id=?`).run(c.id);
    const ins = db.prepare(`INSERT OR IGNORE INTO campaign_accounts (campaign_id, account_id) VALUES (?,?)`);
    valid.forEach((id) => ins.run(c.id, id));
  });
  tx();
  audit({ workspaceId: ws, userId: req.user.id, action: 'campaign_assets_updated', entityType: 'campaign', entityId: c.id, metadata: { assets: valid.length }, ip: req.ip });
  res.json({ ok: true, assets: valid.length });
}));

// تغيير الحالة / الإطلاق: الإطلاق ينشئ Jobs للمزامنة عبر الـQueue
r.post('/:id/status', roleAtLeast('manager'), wrap(async (req, res) => {
  const c = getCampaign(req);
  const { status } = req.body || {};
  if (!VALID_STATUS.includes(status)) throw new AppError(400, 'حالة غير صالحة', 'validation');
  db.prepare(`UPDATE campaigns SET status=?, updated_at=datetime('now') WHERE id=?`).run(status, c.id);
  audit({ workspaceId: req.workspace.id, userId: req.user.id, action: `campaign_status_${status}`, entityType: 'campaign', entityId: c.id, ip: req.ip });

  if (status === 'active') {
    const assets = db.prepare(`SELECT account_id FROM campaign_accounts WHERE campaign_id=?`).all(c.id);
    let enqueued = 0;
    for (const a of assets) {
      const job = enqueueJob({ workspaceId: req.workspace.id, action: 'sync_account', campaignId: c.id, accountId: a.account_id });
      if (job.created) enqueued++;
    }
    notify(req.workspace.id, { type: 'campaign_started', title: 'بدأت حملة', body: `${c.name} — ${assets.length} أصل` });
    return res.json({ ok: true, enqueued, assets: assets.length });
  }
  if (status === 'completed') notify(req.workspace.id, { type: 'campaign_completed', title: 'اكتملت حملة', body: c.name });
  res.json({ ok: true });
}));

r.delete('/:id', roleAtLeast('admin'), wrap(async (req, res) => {
  const c = getCampaign(req);
  db.prepare(`UPDATE campaigns SET deleted_at=datetime('now'), status='paused' WHERE id=?`).run(c.id);
  audit({ workspaceId: req.workspace.id, userId: req.user.id, action: 'campaign_deleted', entityType: 'campaign', entityId: c.id, ip: req.ip });
  res.json({ ok: true });
}));

module.exports = r;
