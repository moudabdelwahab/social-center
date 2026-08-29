-- ============================================================
-- Social Command Center — Database Schema (MVP)
-- مبادئ: Data Isolation عبر workspace_id في كل جدول،
-- Foreign Keys + Indexes + Soft Delete + Idempotency.
-- الترقية إلى PostgreSQL لاحقًا لا تغيّر البنية المنطقية.
-- ============================================================

PRAGMA foreign_keys = ON;

-- ---------- الخطط (SaaS Plans) — الحدود في قاعدة البيانات وليست Hard-coded ----------
CREATE TABLE IF NOT EXISTS plans (
  id                        INTEGER PRIMARY KEY AUTOINCREMENT,
  code                      TEXT NOT NULL UNIQUE,
  name                      TEXT NOT NULL,
  max_accounts              INTEGER NOT NULL,
  max_campaigns             INTEGER NOT NULL,
  max_users                 INTEGER NOT NULL,
  max_jobs_per_month        INTEGER NOT NULL,
  max_api_requests_per_day  INTEGER NOT NULL
);

-- ---------- المستخدمون والـWorkspaces (Multi-Tenant) ----------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at    TEXT
);

CREATE TABLE IF NOT EXISTS workspaces (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  plan_id     INTEGER NOT NULL REFERENCES plans(id),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT
);

CREATE TABLE IF NOT EXISTS workspace_members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('owner','admin','manager','editor','viewer')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workspace_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_members_user ON workspace_members(user_id);

-- ---------- المنصات وقدراتها (Capabilities per Provider) ----------
CREATE TABLE IF NOT EXISTS social_platforms (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  capabilities  TEXT NOT NULL DEFAULT '{}',   -- JSON: publishing/scheduling/comments/analytics/messaging
  enabled       INTEGER NOT NULL DEFAULT 0
);

-- ---------- الحسابات والأصول الاجتماعية ----------
CREATE TABLE IF NOT EXISTS social_accounts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id      INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform_code     TEXT NOT NULL REFERENCES social_platforms(code),
  name              TEXT NOT NULL,
  handle            TEXT,
  avatar_url        TEXT,
  account_type      TEXT NOT NULL DEFAULT 'page' CHECK (account_type IN ('page','profile','business','group')),
  external_id       TEXT,
  status            TEXT NOT NULL DEFAULT 'connected'
                    CHECK (status IN ('connected','reconnect_required','permissions_missing','unavailable','paused','syncing','error')),
  permissions       TEXT NOT NULL DEFAULT '{}',  -- JSON: {publish:true, read_insights:true, ...}
  last_synced_at    TEXT,
  last_activity_at  TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at        TEXT
);
CREATE INDEX IF NOT EXISTS idx_accounts_ws_status ON social_accounts(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_accounts_ws_name   ON social_accounts(workspace_id, name);

-- ---------- الاتصالات والرموز (مشفّرة) ----------
CREATE TABLE IF NOT EXISTS social_connections (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id         INTEGER NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  access_token_enc   TEXT,
  refresh_token_enc  TEXT,
  token_expires_at   TEXT,
  scopes             TEXT NOT NULL DEFAULT '[]',
  status             TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','revoked')),
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT
);
CREATE INDEX IF NOT EXISTS idx_connections_account ON social_connections(account_id);

-- ---------- بيانات اعتماد API لكل Workspace (مشفّرة) ----------
CREATE TABLE IF NOT EXISTS api_credentials (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id       INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform_code      TEXT NOT NULL,
  encrypted_payload  TEXT NOT NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (workspace_id, platform_code)
);

-- ---------- المجموعات ----------
CREATE TABLE IF NOT EXISTS account_groups (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at    TEXT
);

CREATE TABLE IF NOT EXISTS account_group_members (
  group_id    INTEGER NOT NULL REFERENCES account_groups(id) ON DELETE CASCADE,
  account_id  INTEGER NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, account_id)
);

-- ---------- الحملات ----------
CREATE TABLE IF NOT EXISTS campaigns (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  client        TEXT,
  objective     TEXT,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','scheduled','active','paused','completed','failed')),
  budget        REAL,
  start_date    TEXT,
  end_date      TEXT,
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT,
  deleted_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_campaigns_ws_status ON campaigns(workspace_id, status);

CREATE TABLE IF NOT EXISTS campaign_accounts (
  campaign_id  INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  account_id   INTEGER NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, account_id)
);

-- ---------- المحتوى والمنشورات ----------
CREATE TABLE IF NOT EXISTS posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id   INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  content       TEXT NOT NULL,
  media_urls    TEXT NOT NULL DEFAULT '[]',
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft','approved','scheduled','published','failed')),
  created_by    INTEGER REFERENCES users(id),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_posts_ws ON posts(workspace_id, status);

CREATE TABLE IF NOT EXISTS scheduled_posts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  post_id       INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  account_id    INTEGER NOT NULL REFERENCES social_accounts(id) ON DELETE CASCADE,
  scheduled_at  TEXT NOT NULL,
  timezone      TEXT NOT NULL DEFAULT 'UTC',
  recurrence    TEXT NOT NULL DEFAULT 'once' CHECK (recurrence IN ('once','daily','weekly')),
  status        TEXT NOT NULL DEFAULT 'scheduled'
                CHECK (status IN ('scheduled','queued','published','failed','cancelled')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_sched_due ON scheduled_posts(status, scheduled_at);

-- ---------- نظام الـQueue (Jobs) ----------
CREATE TABLE IF NOT EXISTS jobs (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id      INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  idempotency_key   TEXT NOT NULL UNIQUE,          -- منع التكرار (Idempotency)
  campaign_id       INTEGER REFERENCES campaigns(id) ON DELETE SET NULL,
  account_id        INTEGER REFERENCES social_accounts(id) ON DELETE SET NULL,
  scheduled_post_id INTEGER REFERENCES scheduled_posts(id) ON DELETE SET NULL,
  action            TEXT NOT NULL,                 -- publish_post / sync_account / refresh_metrics / refresh_connection
  payload           TEXT NOT NULL DEFAULT '{}',
  status            TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','success','failed','cancelled','retrying')),
  run_at            TEXT NOT NULL DEFAULT (datetime('now')),
  started_at        TEXT,
  completed_at      TEXT,
  retry_count       INTEGER NOT NULL DEFAULT 0,
  max_retries       INTEGER NOT NULL DEFAULT 4,
  error_message     TEXT,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_jobs_poll ON jobs(status, run_at);
CREATE INDEX IF NOT EXISTS idx_jobs_ws    ON jobs(workspace_id, created_at);
CREATE INDEX IF NOT EXISTS idx_jobs_campaign ON jobs(campaign_id);

CREATE TABLE IF NOT EXISTS job_attempts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id        INTEGER NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  attempt_no    INTEGER NOT NULL,
  status        TEXT NOT NULL,
  error_message TEXT,
  duration_ms   INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_attempts_job ON job_attempts(job_id);

-- ---------- التحليلات (تجميع يومي، 0 بدل NULL لتفعيل UPSERT) ----------
CREATE TABLE IF NOT EXISTS analytics_daily (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER NOT NULL,
  campaign_id   INTEGER NOT NULL DEFAULT 0,
  account_id    INTEGER NOT NULL DEFAULT 0,
  date          TEXT NOT NULL,
  reach         INTEGER NOT NULL DEFAULT 0,
  impressions   INTEGER NOT NULL DEFAULT 0,
  engagement    INTEGER NOT NULL DEFAULT 0,
  jobs_success  INTEGER NOT NULL DEFAULT 0,
  jobs_failed   INTEGER NOT NULL DEFAULT 0,
  UNIQUE (workspace_id, campaign_id, account_id, date)
);
CREATE INDEX IF NOT EXISTS idx_analytics_ws_date ON analytics_daily(workspace_id, date);

-- ---------- الإشعارات ----------
CREATE TABLE IF NOT EXISTS notifications (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id       INTEGER,
  type          TEXT NOT NULL,
  title         TEXT NOT NULL,
  body          TEXT,
  read_at       TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_ws ON notifications(workspace_id, read_at);

-- ---------- سجل التدقيق (Audit Logs) ----------
CREATE TABLE IF NOT EXISTS audit_logs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id  INTEGER,
  user_id       INTEGER,
  action        TEXT NOT NULL,
  entity_type   TEXT,
  entity_id     TEXT,
  ip            TEXT,
  result        TEXT NOT NULL DEFAULT 'success',
  metadata      TEXT NOT NULL DEFAULT '{}',
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_ws ON audit_logs(workspace_id, created_at);

-- ---------- مركز الأخطاء ----------
CREATE TABLE IF NOT EXISTS errors (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_id   INTEGER NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  category       TEXT NOT NULL
                 CHECK (category IN ('authentication','permission','rate_limit','network','api','validation','internal')),
  code           TEXT,
  message        TEXT NOT NULL,
  account_id     INTEGER,
  campaign_id    INTEGER,
  job_id         INTEGER,
  occurrences    INTEGER NOT NULL DEFAULT 1,
  first_seen_at  TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at   TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at    TEXT
);
CREATE INDEX IF NOT EXISTS idx_errors_ws ON errors(workspace_id, resolved_at);
