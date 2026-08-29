'use strict';
/**
 * Queue Engine + Scheduler + Retry (Exponential Backoff) + Idempotency.
 * العمليات الثقيلة لا تُنفَّذ داخل HTTP Request أبدًا: Job → Queue → Worker → Provider → DB.
 */
const { db, nowUtc } = require('../db');
const config = require('../config');
const logger = require('../utils/logger');
const { getProvider, assertCapability, ProviderError } = require('../integrations/providers');
const { notify } = require('./notifications');
const { audit } = require('./audit');
const { encrypt } = require('../utils/crypto');

/* ---------------- إنشاء المهام (Idempotent) ---------------- */
function enqueueJob({ workspaceId, action, campaignId = null, accountId = null, scheduledPostId = null, payload = {}, runAt = null, idempotencyKey = null }) {
  const key = idempotencyKey || `${action}:${workspaceId}:${campaignId || 0}:${accountId || 0}:${scheduledPostId || 0}:${runAt || nowUtc()}:${JSON.stringify(payload)}`;
  try {
    const info = db.prepare(
      `INSERT INTO jobs (workspace_id, idempotency_key, campaign_id, account_id, scheduled_post_id, action, payload, run_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(workspaceId, key, campaignId, accountId, scheduledPostId, action, JSON.stringify(payload), runAt || nowUtc());
    return { id: info.lastInsertRowid, created: true };
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) {
      const existing = db.prepare(`SELECT id FROM jobs WHERE idempotency_key = ?`).get(key);
      return { id: existing?.id, created: false }; // نفس المهمة وصلت مرتين — لا تكرار
    }
    throw e;
  }
}

/* ---------------- تصنيف الأخطاء وتسجيلها ---------------- */
function recordError({ workspaceId, category, message, accountId, campaignId, jobId, code }) {
  const existing = db.prepare(
    `SELECT id FROM errors WHERE workspace_id=? AND category=? AND message=? AND COALESCE(account_id,0)=COALESCE(?,0)
     AND COALESCE(campaign_id,0)=COALESCE(?,0) AND resolved_at IS NULL`
  ).get(workspaceId, category, message, accountId, campaignId);
  if (existing) {
    db.prepare(`UPDATE errors SET occurrences=occurrences+1, last_seen_at=datetime('now') WHERE id=?`).run(existing.id);
    return existing.id;
  }
  return db.prepare(
    `INSERT INTO errors (workspace_id, category, code, message, account_id, campaign_id, job_id) VALUES (?,?,?,?,?,?,?)`
  ).run(workspaceId, category, code || null, message, accountId, campaignId, jobId).lastInsertRowid;
}

function bumpAnalytics(wsId, campaignId, accountId, patch) {
  const date = nowUtc().slice(0, 10);
  db.prepare(
    `INSERT INTO analytics_daily (workspace_id, campaign_id, account_id, date) VALUES (?,?,?,?)
     ON CONFLICT (workspace_id, campaign_id, account_id, date) DO NOTHING`
  ).run(wsId, campaignId || 0, accountId || 0, date);
  const sets = Object.keys(patch).map((k) => `${k} = ${k} + @${k}`).join(', ');
  db.prepare(
    `UPDATE analytics_daily SET ${sets} WHERE workspace_id=@ws AND campaign_id=@c AND account_id=@a AND date=@d`
  ).run({ ...patch, ws: wsId, c: campaignId || 0, a: accountId || 0, d: date });
}

/* ---------------- تنفيذ المهمة عبر طبقة التكامل ---------------- */
async function executeJob(job) {
  const account = job.account_id
    ? db.prepare(`SELECT * FROM social_accounts WHERE id = ?`).get(job.account_id) : null;
  const platformCode = account?.platform_code || 'mock';
  assertCapability(platformCode, job.action);
  const { impl } = getProvider(platformCode);
  const payload = JSON.parse(job.payload || '{}');

  switch (job.action) {
    case 'publish_post': {
      const result = await impl.publishPost({ content: payload.content });
      if (job.scheduled_post_id) {
        db.prepare(`UPDATE scheduled_posts SET status='published' WHERE id=?`).run(job.scheduled_post_id);
        const sp = db.prepare(`SELECT post_id FROM scheduled_posts WHERE id=?`).get(job.scheduled_post_id);
        if (sp) db.prepare(`UPDATE posts SET status='published' WHERE id=?`).run(sp.post_id);
      }
      if (result.metrics) bumpAnalytics(job.workspace_id, job.campaign_id, job.account_id, {
        reach: result.metrics.reach, impressions: result.metrics.impressions,
        engagement: result.metrics.engagement, jobs_success: 1
      });
      else bumpAnalytics(job.workspace_id, job.campaign_id, job.account_id, { jobs_success: 1 });
      return result;
    }
    case 'sync_account': {
      const r = await impl.syncAccount();
      if (account) db.prepare(`UPDATE social_accounts SET last_synced_at=datetime('now'), status='connected', last_activity_at=datetime('now') WHERE id=?`).run(account.id);
      bumpAnalytics(job.workspace_id, job.campaign_id, job.account_id, { jobs_success: 1 });
      return r;
    }
    case 'refresh_connection': {
      const r = await impl.refreshConnection({});
      if (account) {
        db.prepare(`UPDATE social_connections SET access_token_enc=?, token_expires_at=datetime('now', '+' || ? || ' seconds'), status='active', updated_at=datetime('now') WHERE account_id=?`)
          .run(encrypt(r.accessToken), r.expiresInSec, account.id);
        db.prepare(`UPDATE social_accounts SET status='connected' WHERE id=?`).run(account.id);
      }
      bumpAnalytics(job.workspace_id, job.campaign_id, job.account_id, { jobs_success: 1 });
      return { ok: true };
    }
    case 'refresh_metrics': {
      const m = await impl.getMetrics();
      bumpAnalytics(job.workspace_id, job.campaign_id, job.account_id, {
        reach: m.reach, impressions: m.impressions, engagement: m.engagement, jobs_success: 1
      });
      return m;
    }
    default:
      throw new ProviderError('internal', `إجراء غير معروف: ${job.action}`, { retryable: false });
  }
}

/* ---------------- الـWorker ---------------- */
let workerTimer = null, schedulerTimer = null, running = false;

async function processDueJobs() {
  if (running) return;
  running = true;
  try {
    const due = db.prepare(
      `SELECT * FROM jobs WHERE status IN ('pending','retrying') AND run_at <= ? ORDER BY run_at LIMIT ?`
    ).all(nowUtc(), config.worker.batchSize);

    for (const job of due) {
      // Job Lock: الاستيلاء الذري يمنع تنفيذ نفس المهمة من عاملَين
      const locked = db.prepare(
        `UPDATE jobs SET status='processing', started_at=datetime('now') WHERE id=? AND status IN ('pending','retrying')`
      ).run(job.id, );
      if (locked.changes === 0) continue;

      const t0 = Date.now();
      try {
        const result = await executeJob(job);
        db.prepare(`UPDATE jobs SET status='success', completed_at=datetime('now'), error_message=NULL WHERE id=?`).run(job.id);
        db.prepare(`INSERT INTO job_attempts (job_id, attempt_no, status, duration_ms) VALUES (?,?,?,?)`)
          .run(job.id, job.retry_count + 1, 'success', Date.now() - t0);
        logger.info('job.success', { jobId: job.id, action: job.action, ms: Date.now() - t0, result: !!result });
      } catch (err) {
        const category = err.category || 'internal';
        const retryable = err.retryable !== false && category !== 'validation' && category !== 'permission';
        const attempt = job.retry_count + 1;
        db.prepare(`INSERT INTO job_attempts (job_id, attempt_no, status, error_message, duration_ms) VALUES (?,?,?,?,?)`)
          .run(job.id, attempt, 'failed', err.message, Date.now() - t0);

        if (retryable && attempt <= job.max_retries) {
          const delaySec = config.worker.backoffSeconds[Math.min(attempt - 1, config.worker.backoffSeconds.length - 1)];
          db.prepare(`UPDATE jobs SET status='retrying', retry_count=?, run_at=?, error_message=? WHERE id=?`)
            .run(attempt, nowUtc(delaySec * 1000), err.message, job.id);
          logger.warn('job.retry', { jobId: job.id, attempt, retryInSec: delaySec, error: err.message });
        } else {
          db.prepare(`UPDATE jobs SET status='failed', completed_at=datetime('now'), retry_count=?, error_message=? WHERE id=?`)
            .run(attempt, err.message, job.id);
          bumpAnalytics(job.workspace_id, job.campaign_id, job.account_id, { jobs_failed: 1 });
          recordError({ workspaceId: job.workspace_id, category, message: err.message, accountId: job.account_id, campaignId: job.campaign_id, jobId: job.id });
          if (category === 'authentication' && job.account_id) {
            db.prepare(`UPDATE social_accounts SET status='reconnect_required' WHERE id=?`).run(job.account_id);
          }
          notify(job.workspace_id, { type: 'job_failed', title: 'فشلت عملية في النظام', body: `${job.action}: ${err.message}` });
          audit({ workspaceId: job.workspace_id, action: 'job_failed', entityType: 'job', entityId: job.id, result: 'failure', metadata: { error: err.message, category } });
          logger.error('job.failed', { jobId: job.id, action: job.action, category, error: err.message });
        }
      }
    }
  } finally { running = false; }
}

/* ---------------- الـScheduler: تحويل المنشورات المستحقة إلى Jobs ---------------- */
function processScheduler() {
  const due = db.prepare(
    `SELECT sp.*, p.content, p.campaign_id FROM scheduled_posts sp
     JOIN posts p ON p.id = sp.post_id
     WHERE sp.status = 'scheduled' AND sp.scheduled_at <= ? LIMIT 50`
  ).all(nowUtc());
  for (const sp of due) {
    const r = enqueueJob({
      workspaceId: sp.workspace_id, action: 'publish_post',
      campaignId: sp.campaign_id, accountId: sp.account_id, scheduledPostId: sp.id,
      payload: { content: sp.content },
      runAt: sp.scheduled_at,
      idempotencyKey: `sp:${sp.id}:${sp.scheduled_at}` // منع النشر المكرر
    });
    if (r.created) db.prepare(`UPDATE scheduled_posts SET status='queued' WHERE id=?`).run(sp.id);
    // التكرار (يومي/أسبوعي): جدولة الدورة التالية
    if (sp.recurrence !== 'once' && r.created) {
      const next = new Date(new Date(sp.scheduled_at.replace(' ', 'T') + 'Z').getTime() + (sp.recurrence === 'daily' ? 864e5 : 7 * 864e5));
      db.prepare(`INSERT INTO scheduled_posts (workspace_id, post_id, account_id, scheduled_at, timezone, recurrence) VALUES (?,?,?,?,?,?)`)
        .run(sp.workspace_id, sp.post_id, sp.account_id, next.toISOString().replace('T', ' ').slice(0, 19), sp.timezone, sp.recurrence);
    }
  }
}

function startEngines() {
  workerTimer = setInterval(() => processDueJobs().catch((e) => logger.error('worker.tick', { error: e.message })), config.worker.pollMs);
  schedulerTimer = setInterval(() => { try { processScheduler(); } catch (e) { logger.error('scheduler.tick', { error: e.message }); } }, config.schedulerPollMs);
  workerTimer.unref(); schedulerTimer.unref();
  logger.info('engines.started', { workerPollMs: config.worker.pollMs, schedulerPollMs: config.schedulerPollMs });
}
function stopEngines() { clearInterval(workerTimer); clearInterval(schedulerTimer); }

module.exports = { enqueueJob, startEngines, stopEngines, recordError, bumpAnalytics };
