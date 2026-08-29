'use strict';
const express = require('express');
const { db } = require('../db');
const { wrap } = require('../utils/errors');

const r = express.Router();

// إحصائيات لوحة التحكم الرئيسية
r.get('/dashboard', wrap(async (req, res) => {
  const ws = req.workspace.id;
  const one = (sql, ...p) => db.prepare(sql).get(...p)?.c ?? 0;
  const stats = {
    accounts_total: one(`SELECT COUNT(*) c FROM social_accounts WHERE workspace_id=? AND deleted_at IS NULL`, ws),
    accounts_connected: one(`SELECT COUNT(*) c FROM social_accounts WHERE workspace_id=? AND deleted_at IS NULL AND status='connected'`, ws),
    accounts_reconnect: one(`SELECT COUNT(*) c FROM social_accounts WHERE workspace_id=? AND deleted_at IS NULL AND status IN ('reconnect_required','permissions_missing','error')`, ws),
    campaigns_active: one(`SELECT COUNT(*) c FROM campaigns WHERE workspace_id=? AND deleted_at IS NULL AND status='active'`, ws),
    campaigns_scheduled: one(`SELECT COUNT(*) c FROM campaigns WHERE workspace_id=? AND deleted_at IS NULL AND status='scheduled'`, ws),
    posts_scheduled: one(`SELECT COUNT(*) c FROM scheduled_posts WHERE workspace_id=? AND status IN ('scheduled','queued')`, ws),
    posts_published: one(`SELECT COUNT(*) c FROM scheduled_posts WHERE workspace_id=? AND status='published'`, ws) +
                      one(`SELECT COUNT(*) c FROM jobs WHERE workspace_id=? AND action='publish_post' AND status='success' AND scheduled_post_id IS NULL`, ws),
    jobs_failed: one(`SELECT COUNT(*) c FROM jobs WHERE workspace_id=? AND status='failed'`, ws)
  };
  const agg = db.prepare(
    `SELECT COALESCE(SUM(reach),0) reach, COALESCE(SUM(impressions),0) impressions, COALESCE(SUM(engagement),0) engagement
     FROM analytics_daily WHERE workspace_id=?`
  ).get(ws);
  const last30 = db.prepare(
    `SELECT date, SUM(reach) reach, SUM(impressions) impressions, SUM(engagement) engagement,
            SUM(jobs_success) success, SUM(jobs_failed) failed
     FROM analytics_daily WHERE workspace_id=? AND date >= date('now','-30 day') GROUP BY date ORDER BY date`
  ).all(ws);
  const recentNotifications = db.prepare(
    `SELECT id, type, title, body, read_at, created_at FROM notifications WHERE workspace_id=? ORDER BY id DESC LIMIT 6`
  ).all(ws);
  const openErrors = one(`SELECT COUNT(*) c FROM errors WHERE workspace_id=? AND resolved_at IS NULL`, ws);
  res.json({ stats, totals: agg, last30, recentNotifications, openErrors });
}));

// تحليلات حملة واحدة
r.get('/campaign/:id', wrap(async (req, res) => {
  const ws = req.workspace.id;
  const c = db.prepare(`SELECT id, name, status FROM campaigns WHERE id=? AND workspace_id=? AND deleted_at IS NULL`).get(req.params.id, ws);
  if (!c) return res.status(404).json({ error: 'الحملة غير موجودة' });
  const jobs = db.prepare(`SELECT status, COUNT(*) c FROM jobs WHERE campaign_id=? GROUP BY status`).all(c.id);
  const agg = db.prepare(
    `SELECT COALESCE(SUM(reach),0) reach, COALESCE(SUM(impressions),0) impressions, COALESCE(SUM(engagement),0) engagement
     FROM analytics_daily WHERE workspace_id=? AND campaign_id=?`
  ).get(ws, c.id);
  const series = db.prepare(
    `SELECT date, SUM(reach) reach, SUM(engagement) engagement FROM analytics_daily
     WHERE workspace_id=? AND campaign_id=? GROUP BY date ORDER BY date`
  ).all(ws, c.id);
  res.json({ campaign: c, jobs, totals: agg, series });
}));

// مقارنة حملات (A مقابل B مقابل C ...)
r.get('/compare', wrap(async (req, res) => {
  const ws = req.workspace.id;
  const ids = String(req.query.ids || '').split(',').map(Number).filter(Boolean).slice(0, 6);
  const rows = ids.map((id) => {
    const c = db.prepare(`SELECT id, name FROM campaigns WHERE id=? AND workspace_id=?`).get(id, ws);
    if (!c) return null;
    const agg = db.prepare(
      `SELECT COALESCE(SUM(reach),0) reach, COALESCE(SUM(impressions),0) impressions, COALESCE(SUM(engagement),0) engagement,
              COALESCE(SUM(jobs_success),0) success, COALESCE(SUM(jobs_failed),0) failed
       FROM analytics_daily WHERE workspace_id=? AND campaign_id=?`
    ).get(ws, id);
    const total = agg.success + agg.failed;
    return { ...c, ...agg, success_rate: total ? Math.round((agg.success / total) * 100) : null };
  }).filter(Boolean);
  res.json({ items: rows });
}));

module.exports = r;
