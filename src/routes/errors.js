'use strict';
const express = require('express');
const { db } = require('../db');
const { AppError, wrap } = require('../utils/errors');
const { roleAtLeast } = require('../middleware/auth');

const r = express.Router();

// مركز الأخطاء مع فلاتر التصنيف
r.get('/', wrap(async (req, res) => {
  const ws = req.workspace.id;
  let where = `WHERE e.workspace_id=? AND e.resolved_at IS NULL`;
  const params = [ws];
  if (req.query.category) { where += ` AND e.category=?`; params.push(req.query.category); }
  if (req.query.all === '1') where = `WHERE e.workspace_id=?`;
  const items = db.prepare(
    `SELECT e.*, a.name AS account_name, c.name AS campaign_name FROM errors e
     LEFT JOIN social_accounts a ON a.id=e.account_id LEFT JOIN campaigns c ON c.id=e.campaign_id
     ${where} ORDER BY e.last_seen_at DESC LIMIT 100`
  ).all(...params);
  const byCat = db.prepare(
    `SELECT category, COUNT(*) c FROM errors WHERE workspace_id=? AND resolved_at IS NULL GROUP BY category`
  ).all(ws);
  res.json({ items, byCat });
}));

r.post('/:id/resolve', roleAtLeast('editor'), wrap(async (req, res) => {
  const info = db.prepare(`UPDATE errors SET resolved_at=datetime('now') WHERE id=? AND workspace_id=?`).run(req.params.id, req.workspace.id);
  if (!info.changes) throw new AppError(404, 'الخطأ غير موجود');
  res.json({ ok: true });
}));

// إعادة المحاولة: إعادة المهمة المرتبطة إلى الـQueue
r.post('/:id/retry', roleAtLeast('editor'), wrap(async (req, res) => {
  const e = db.prepare(`SELECT * FROM errors WHERE id=? AND workspace_id=?`).get(req.params.id, req.workspace.id);
  if (!e) throw new AppError(404, 'الخطأ غير موجود');
  if (e.job_id) {
    db.prepare(`UPDATE jobs SET status='pending', run_at=datetime('now'), retry_count=0, error_message=NULL WHERE id=? AND status='failed'`).run(e.job_id);
  }
  db.prepare(`UPDATE errors SET resolved_at=datetime('now') WHERE id=?`).run(e.id);
  res.json({ ok: true, retried: !!e.job_id });
}));

module.exports = r;
