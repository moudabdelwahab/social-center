'use strict';
const express = require('express');
const { db, nowUtc } = require('../db');
const { AppError, wrap } = require('../utils/errors');
const { roleAtLeast } = require('../middleware/auth');
const { enqueueJob } = require('../services/jobs');
const { audit } = require('../services/audit');

const r = express.Router();

r.get('/', wrap(async (req, res) => {
  const ws = req.workspace.id;
  const items = db.prepare(
    `SELECT p.*, c.name AS campaign_name FROM posts p LEFT JOIN campaigns c ON c.id=p.campaign_id
     WHERE p.workspace_id=? AND p.deleted_at IS NULL ORDER BY p.id DESC LIMIT 100`
  ).all(ws);
  const scheduled = db.prepare(
    `SELECT sp.*, p.content, a.name AS account_name, c.name AS campaign_name FROM scheduled_posts sp
     JOIN posts p ON p.id=sp.post_id JOIN social_accounts a ON a.id=sp.account_id LEFT JOIN campaigns c ON c.id=p.campaign_id
     WHERE sp.workspace_id=? ORDER BY sp.scheduled_at DESC LIMIT 100`
  ).all(ws);
  res.json({ items, scheduled });
}));

r.post('/', roleAtLeast('editor'), wrap(async (req, res) => {
  const { content, campaignId } = req.body || {};
  if (!content || !content.trim()) throw new AppError(400, 'المحتوى مطلوب', 'validation');
  if (campaignId) {
    const c = db.prepare(`SELECT id FROM campaigns WHERE id=? AND workspace_id=? AND deleted_at IS NULL`).get(campaignId, req.workspace.id);
    if (!c) throw new AppError(404, 'الحملة غير موجودة');
  }
  const info = db.prepare(`INSERT INTO posts (workspace_id, campaign_id, content, created_by) VALUES (?,?,?,?)`)
    .run(req.workspace.id, campaignId || null, content.trim(), req.user.id);
  audit({ workspaceId: req.workspace.id, userId: req.user.id, action: 'post_created', entityType: 'post', entityId: info.lastInsertRowid, ip: req.ip });
  res.status(201).json({ id: info.lastInsertRowid });
}));

r.post('/:id/approve', roleAtLeast('manager'), wrap(async (req, res) => {
  const info = db.prepare(`UPDATE posts SET status='approved' WHERE id=? AND workspace_id=? AND deleted_at IS NULL`).run(req.params.id, req.workspace.id);
  if (!info.changes) throw new AppError(404, 'المنشور غير موجود');
  audit({ workspaceId: req.workspace.id, userId: req.user.id, action: 'post_approved', entityType: 'post', entityId: req.params.id, ip: req.ip });
  res.json({ ok: true });
}));

// الجدولة: تاريخ/وقت + منطقة زمنية + تكرار + حسابات مستهدفة
r.post('/:id/schedule', roleAtLeast('editor'), wrap(async (req, res) => {
  const { accountIds = [], scheduledAt, timezone = 'UTC', recurrence = 'once' } = req.body || {};
  if (!scheduledAt || !accountIds.length) throw new AppError(400, 'حدّد التاريخ/الوقت والحسابات المستهدفة', 'validation');
  const post = db.prepare(`SELECT * FROM posts WHERE id=? AND workspace_id=? AND deleted_at IS NULL`).get(req.params.id, req.workspace.id);
  if (!post) throw new AppError(404, 'المنشور غير موجود');
  const at = String(scheduledAt).replace('T', ' ').slice(0, 19);
  if (at <= nowUtc()) throw new AppError(400, 'موعد الجدولة يجب أن يكون في المستقبل', 'validation');
  if (!['once', 'daily', 'weekly'].includes(recurrence)) throw new AppError(400, 'نوع التكرار غير صالح', 'validation');

  const check = db.prepare(`SELECT id FROM social_accounts WHERE id=? AND workspace_id=? AND deleted_at IS NULL`);
  const ins = db.prepare(`INSERT INTO scheduled_posts (workspace_id, post_id, account_id, scheduled_at, timezone, recurrence) VALUES (?,?,?,?,?,?)`);
  let count = 0;
  const tx = db.transaction(() => {
    for (const id of accountIds) if (check.get(id, req.workspace.id)) { ins.run(req.workspace.id, post.id, id, at, timezone, recurrence); count++; }
    db.prepare(`UPDATE posts SET status='scheduled' WHERE id=?`).run(post.id);
  });
  tx();
  audit({ workspaceId: req.workspace.id, userId: req.user.id, action: 'post_scheduled', entityType: 'post', entityId: post.id, metadata: { accounts: count, at, recurrence }, ip: req.ip });
  res.json({ ok: true, scheduled: count });
}));

// نشر فوري عبر الـQueue (لا تنفيذ مباشر داخل الطلب)
r.post('/:id/publish-now', roleAtLeast('manager'), wrap(async (req, res) => {
  const { accountIds = [] } = req.body || {};
  const post = db.prepare(`SELECT * FROM posts WHERE id=? AND workspace_id=? AND deleted_at IS NULL`).get(req.params.id, req.workspace.id);
  if (!post) throw new AppError(404, 'المنشور غير موجود');
  const check = db.prepare(`SELECT id FROM social_accounts WHERE id=? AND workspace_id=? AND deleted_at IS NULL`);
  const jobs = [];
  for (const id of accountIds) {
    if (!check.get(id, req.workspace.id)) continue;
    jobs.push(enqueueJob({ workspaceId: req.workspace.id, action: 'publish_post', campaignId: post.campaign_id, accountId: id, payload: { content: post.content } }).id);
  }
  audit({ workspaceId: req.workspace.id, userId: req.user.id, action: 'post_publish_requested', entityType: 'post', entityId: post.id, metadata: { jobs: jobs.length }, ip: req.ip });
  res.json({ ok: true, jobs });
}));

r.delete('/:id', roleAtLeast('editor'), wrap(async (req, res) => {
  db.prepare(`UPDATE posts SET deleted_at=datetime('now') WHERE id=? AND workspace_id=?`).run(req.params.id, req.workspace.id);
  res.json({ ok: true });
}));

module.exports = r;
