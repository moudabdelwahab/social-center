'use strict';
const express = require('express');
const { db, nowUtc } = require('../db');
const { AppError, wrap } = require('../utils/errors');
const { roleAtLeast } = require('../middleware/auth');

const r = express.Router();

// سجل العمليات مع فلاتر: المنصة/الحملة/الحساب/الحالة/النوع
r.get('/', wrap(async (req, res) => {
  const ws = req.workspace.id;
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const limit = Math.min(100, parseInt(req.query.limit || '25', 10));
  let where = `WHERE j.workspace_id=?`;
  const params = [ws];
  if (req.query.status) { where += ` AND j.status=?`; params.push(req.query.status); }
  if (req.query.action) { where += ` AND j.action=?`; params.push(req.query.action); }
  if (req.query.campaignId) { where += ` AND j.campaign_id=?`; params.push(req.query.campaignId); }
  if (req.query.accountId) { where += ` AND j.account_id=?`; params.push(req.query.accountId); }
  const total = db.prepare(`SELECT COUNT(*) c FROM jobs j ${where}`).get(...params).c;
  const items = db.prepare(
    `SELECT j.id, j.action, j.status, j.retry_count, j.run_at, j.started_at, j.completed_at, j.error_message, j.created_at,
            a.name AS account_name, a.platform_code, c.name AS campaign_name
     FROM jobs j LEFT JOIN social_accounts a ON a.id=j.account_id LEFT JOIN campaigns c ON c.id=j.campaign_id
     ${where} ORDER BY j.id DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, (page - 1) * limit);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));

r.get('/:id', wrap(async (req, res) => {
  const job = db.prepare(`SELECT * FROM jobs WHERE id=? AND workspace_id=?`).get(req.params.id, req.workspace.id);
  if (!job) throw new AppError(404, 'المهمة غير موجودة');
  const attempts = db.prepare(`SELECT * FROM job_attempts WHERE job_id=? ORDER BY attempt_no`).all(job.id);
  res.json({ job, attempts });
}));

r.post('/:id/retry', roleAtLeast('editor'), wrap(async (req, res) => {
  const info = db.prepare(
    `UPDATE jobs SET status='pending', run_at=?, retry_count=0, error_message=NULL WHERE id=? AND workspace_id=? AND status IN ('failed','cancelled')`
  ).run(nowUtc(), req.params.id, req.workspace.id);
  if (!info.changes) throw new AppError(400, 'لا يمكن إعادة هذه المهمة');
  res.json({ ok: true });
}));

r.post('/:id/cancel', roleAtLeast('editor'), wrap(async (req, res) => {
  const info = db.prepare(
    `UPDATE jobs SET status='cancelled', completed_at=datetime('now') WHERE id=? AND workspace_id=? AND status IN ('pending','retrying')`
  ).run(req.params.id, req.workspace.id);
  if (!info.changes) throw new AppError(400, 'لا يمكن إلغاء هذه المهمة');
  res.json({ ok: true });
}));

module.exports = r;
