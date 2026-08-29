'use strict';
const express = require('express');
const { db } = require('../db');
const { AppError, wrap } = require('../utils/errors');
const { roleAtLeast } = require('../middleware/auth');
const { getProvider } = require('../integrations/providers');
const { encrypt } = require('../utils/crypto');
const { enqueueJob } = require('../services/jobs');
const { audit } = require('../services/audit');
const { notify } = require('../services/notifications');

const r = express.Router();
const { planLimitCheck } = require('./helpers');

// قائمة الحسابات + بحث + فلاتر + Pagination
r.get('/', wrap(async (req, res) => {
  const ws = req.workspace.id;
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || '12', 10)));
  const status = req.query.status || null;
  const q = (req.query.q || '').trim();
  let where = `WHERE a.workspace_id = ? AND a.deleted_at IS NULL`;
  const params = [ws];
  if (status) { where += ` AND a.status = ?`; params.push(status); }
  if (q) { where += ` AND (a.name LIKE ? OR a.handle LIKE ?)`; params.push(`%${q}%`, `%${q}%`); }
  const total = db.prepare(`SELECT COUNT(*) c FROM social_accounts a ${where}`).get(...params).c;
  const items = db.prepare(
    `SELECT a.*, (SELECT COUNT(*) FROM campaign_accounts ca WHERE ca.account_id = a.id) AS campaigns_count
     FROM social_accounts a ${where} ORDER BY a.created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, (page - 1) * limit);
  const statuses = db.prepare(
    `SELECT status, COUNT(*) c FROM social_accounts WHERE workspace_id=? AND deleted_at IS NULL GROUP BY status`
  ).all(ws);
  res.json({ items, total, page, pages: Math.ceil(total / limit), statuses });
}));

// إضافة حساب (Mock OAuth عبر طبقة التكامل)
r.post('/', roleAtLeast('manager'), wrap(async (req, res) => {
  const { name, handle, platform, accountType } = req.body || {};
  if (!name || !platform) throw new AppError(400, 'اسم الحساب والمنصة مطلوبان', 'validation');
  planLimitCheck(req.workspace.id, 'accounts');
  const { impl } = getProvider(platform);
  const conn = await impl.connectAccount({ name, handle });
  const ws = req.workspace.id;
  const tx = db.transaction(() => {
    const a = db.prepare(
      `INSERT INTO social_accounts (workspace_id, platform_code, name, handle, account_type, external_id, status, permissions, last_synced_at)
       VALUES (?,?,?,?,?,?, 'connected', ?, datetime('now'))`
    ).run(ws, platform, name, handle || null, accountType || 'page', conn.externalId, JSON.stringify(conn.permissions));
    db.prepare(
      `INSERT INTO social_connections (account_id, access_token_enc, refresh_token_enc, token_expires_at, scopes)
       VALUES (?,?,?, datetime('now', '+' || ? || ' seconds'), ?)`
    ).run(a.lastInsertRowid, encrypt(conn.accessToken), encrypt(conn.refreshToken), conn.expiresInSec, JSON.stringify(Object.keys(conn.permissions)));
    return a.lastInsertRowid;
  });
  const id = tx();
  audit({ workspaceId: ws, userId: req.user.id, action: 'account_connected', entityType: 'account', entityId: id, ip: req.ip });
  notify(ws, { type: 'account_connected', title: 'تم ربط حساب جديد', body: name });
  res.status(201).json({ id });
}));

// تفاصيل الحساب + الصلاحيات + آخر العمليات
r.get('/:id', wrap(async (req, res) => {
  const a = db.prepare(`SELECT * FROM social_accounts WHERE id=? AND workspace_id=? AND deleted_at IS NULL`).get(req.params.id, req.workspace.id);
  if (!a) throw new AppError(404, 'الحساب غير موجود');
  const conn = db.prepare(`SELECT status, token_expires_at, scopes FROM social_connections WHERE account_id=? ORDER BY id DESC LIMIT 1`).get(a.id);
  const campaigns = db.prepare(
    `SELECT c.id, c.name, c.status FROM campaign_accounts ca JOIN campaigns c ON c.id = ca.campaign_id WHERE ca.account_id=? AND c.deleted_at IS NULL`
  ).all(a.id);
  const recentJobs = db.prepare(`SELECT id, action, status, created_at, error_message FROM jobs WHERE account_id=? ORDER BY id DESC LIMIT 10`).all(a.id);
  res.json({ account: { ...a, permissions: JSON.parse(a.permissions || '{}') }, connection: conn, campaigns, recentJobs });
}));

r.post('/:id/reconnect', roleAtLeast('manager'), wrap(async (req, res) => {
  const a = db.prepare(`SELECT * FROM social_accounts WHERE id=? AND workspace_id=? AND deleted_at IS NULL`).get(req.params.id, req.workspace.id);
  if (!a) throw new AppError(404, 'الحساب غير موجود');
  db.prepare(`UPDATE social_accounts SET status='syncing' WHERE id=?`).run(a.id);
  const job = enqueueJob({ workspaceId: req.workspace.id, action: 'refresh_connection', accountId: a.id });
  audit({ workspaceId: req.workspace.id, userId: req.user.id, action: 'account_reconnect_requested', entityType: 'account', entityId: a.id, ip: req.ip });
  res.json({ jobId: job.id });
}));

r.post('/:id/sync', roleAtLeast('editor'), wrap(async (req, res) => {
  const a = db.prepare(`SELECT id FROM social_accounts WHERE id=? AND workspace_id=? AND deleted_at IS NULL`).get(req.params.id, req.workspace.id);
  if (!a) throw new AppError(404, 'الحساب غير موجود');
  const job = enqueueJob({ workspaceId: req.workspace.id, action: 'sync_account', accountId: a.id });
  res.json({ jobId: job.id });
}));

r.post('/:id/pause', roleAtLeast('manager'), wrap(async (req, res) => {
  const info = db.prepare(`UPDATE social_accounts SET status='paused' WHERE id=? AND workspace_id=? AND deleted_at IS NULL`).run(req.params.id, req.workspace.id);
  if (!info.changes) throw new AppError(404, 'الحساب غير موجود');
  audit({ workspaceId: req.workspace.id, userId: req.user.id, action: 'account_paused', entityType: 'account', entityId: req.params.id, ip: req.ip });
  res.json({ ok: true });
}));

r.post('/:id/resume', roleAtLeast('manager'), wrap(async (req, res) => {
  const info = db.prepare(`UPDATE social_accounts SET status='connected' WHERE id=? AND workspace_id=? AND deleted_at IS NULL`).run(req.params.id, req.workspace.id);
  if (!info.changes) throw new AppError(404, 'الحساب غير موجود');
  res.json({ ok: true });
}));

// فصل الحساب (Soft Delete + Revoke)
r.delete('/:id', roleAtLeast('admin'), wrap(async (req, res) => {
  const a = db.prepare(`SELECT * FROM social_accounts WHERE id=? AND workspace_id=? AND deleted_at IS NULL`).get(req.params.id, req.workspace.id);
  if (!a) throw new AppError(404, 'الحساب غير موجود');
  try { await getProvider(a.platform_code).impl.disconnectAccount(); } catch { /* المتابعة حتى لو فشل الفصل الخارجي */ }
  db.prepare(`UPDATE social_accounts SET deleted_at=datetime('now'), status='unavailable' WHERE id=?`).run(a.id);
  db.prepare(`UPDATE social_connections SET status='revoked', updated_at=datetime('now') WHERE account_id=?`).run(a.id);
  audit({ workspaceId: req.workspace.id, userId: req.user.id, action: 'account_disconnected', entityType: 'account', entityId: a.id, ip: req.ip });
  notify(req.workspace.id, { type: 'account_disconnected', title: 'تم فصل حساب', body: a.name });
  res.json({ ok: true });
}));

module.exports = r;
