'use strict';
const express = require('express');
const { db } = require('../db');
const { AppError, wrap } = require('../utils/errors');
const { roleAtLeast } = require('../middleware/auth');
const { audit } = require('../services/audit');
const { planLimitCheck } = require('./helpers');

const r = express.Router();

r.get('/', wrap(async (req, res) => {
  const ws = db.prepare(
    `SELECT w.id, w.name, w.created_at, p.name AS plan_name, p.code AS plan_code,
            p.max_accounts, p.max_campaigns, p.max_users, p.max_jobs_per_month, p.max_api_requests_per_day
     FROM workspaces w JOIN plans p ON p.id=w.plan_id WHERE w.id=?`
  ).get(req.workspace.id);
  const members = db.prepare(
    `SELECT m.role, m.created_at, u.id, u.name, u.email FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=?`
  ).all(req.workspace.id);
  const usage = {
    accounts: db.prepare(`SELECT COUNT(*) c FROM social_accounts WHERE workspace_id=? AND deleted_at IS NULL`).get(ws.id).c,
    campaigns: db.prepare(`SELECT COUNT(*) c FROM campaigns WHERE workspace_id=? AND deleted_at IS NULL`).get(ws.id).c,
    users: members.length
  };
  res.json({ workspace: ws, members, usage, myRole: req.workspace.role });
}));

r.put('/', roleAtLeast('admin'), wrap(async (req, res) => {
  const { name } = req.body || {};
  if (name) db.prepare(`UPDATE workspaces SET name=? WHERE id=?`).run(name.trim(), req.workspace.id);
  audit({ workspaceId: req.workspace.id, userId: req.user.id, action: 'workspace_updated', entityType: 'workspace', entityId: req.workspace.id, ip: req.ip });
  res.json({ ok: true });
}));

// إضافة عضو موجود بالفعل بالبريد (RBAC)
r.post('/members', roleAtLeast('admin'), wrap(async (req, res) => {
  const { email, role } = req.body || {};
  if (!['admin', 'manager', 'editor', 'viewer'].includes(role)) throw new AppError(400, 'دور غير صالح', 'validation');
  const user = db.prepare(`SELECT id, name FROM users WHERE email=? AND deleted_at IS NULL`).get((email || '').trim());
  if (!user) throw new AppError(404, 'لا يوجد مستخدم بهذا البريد — يجب أن يسجّل أولًا');
  planLimitCheck(req.workspace.id, 'users');
  try {
    db.prepare(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?,?,?)`).run(req.workspace.id, user.id, role);
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new AppError(409, 'هذا المستخدم عضو بالفعل', 'validation');
    throw e;
  }
  audit({ workspaceId: req.workspace.id, userId: req.user.id, action: 'member_added', entityType: 'user', entityId: user.id, metadata: { role }, ip: req.ip });
  res.status(201).json({ ok: true });
}));

r.delete('/members/:userId', roleAtLeast('admin'), wrap(async (req, res) => {
  const target = db.prepare(`SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?`).get(req.workspace.id, req.params.userId);
  if (!target) throw new AppError(404, 'العضو غير موجود');
  if (target.role === 'owner') throw new AppError(400, 'لا يمكن إزالة المالك', 'validation');
  db.prepare(`DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?`).run(req.workspace.id, req.params.userId);
  audit({ workspaceId: req.workspace.id, userId: req.user.id, action: 'member_removed', entityType: 'user', entityId: req.params.userId, ip: req.ip });
  res.json({ ok: true });
}));

module.exports = r;
