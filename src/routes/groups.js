'use strict';
const express = require('express');
const { db } = require('../db');
const { AppError, wrap } = require('../utils/errors');
const { roleAtLeast } = require('../middleware/auth');
const { audit } = require('../services/audit');

const r = express.Router();

r.get('/', wrap(async (req, res) => {
  const items = db.prepare(
    `SELECT g.*, (SELECT COUNT(*) FROM account_group_members m WHERE m.group_id=g.id) AS accounts_count
     FROM account_groups g WHERE g.workspace_id=? AND g.deleted_at IS NULL ORDER BY g.created_at DESC`
  ).all(req.workspace.id);
  res.json({ items });
}));

r.post('/', roleAtLeast('manager'), wrap(async (req, res) => {
  const { name, description } = req.body || {};
  if (!name) throw new AppError(400, 'اسم المجموعة مطلوب', 'validation');
  const info = db.prepare(`INSERT INTO account_groups (workspace_id, name, description) VALUES (?,?,?)`)
    .run(req.workspace.id, name, description || null);
  audit({ workspaceId: req.workspace.id, userId: req.user.id, action: 'group_created', entityType: 'group', entityId: info.lastInsertRowid, ip: req.ip });
  res.status(201).json({ id: info.lastInsertRowid });
}));

r.get('/:id', wrap(async (req, res) => {
  const g = db.prepare(`SELECT * FROM account_groups WHERE id=? AND workspace_id=? AND deleted_at IS NULL`).get(req.params.id, req.workspace.id);
  if (!g) throw new AppError(404, 'المجموعة غير موجودة');
  const accounts = db.prepare(
    `SELECT a.id, a.name, a.platform_code, a.status, a.account_type FROM account_group_members m
     JOIN social_accounts a ON a.id = m.account_id WHERE m.group_id=? AND a.deleted_at IS NULL`
  ).all(g.id);
  res.json({ group: g, accounts });
}));

r.put('/:id', roleAtLeast('manager'), wrap(async (req, res) => {
  const { name, description } = req.body || {};
  const info = db.prepare(`UPDATE account_groups SET name=COALESCE(?,name), description=COALESCE(?,description) WHERE id=? AND workspace_id=? AND deleted_at IS NULL`)
    .run(name || null, description ?? null, req.params.id, req.workspace.id);
  if (!info.changes) throw new AppError(404, 'المجموعة غير موجودة');
  res.json({ ok: true });
}));

r.delete('/:id', roleAtLeast('manager'), wrap(async (req, res) => {
  const info = db.prepare(`UPDATE account_groups SET deleted_at=datetime('now') WHERE id=? AND workspace_id=? AND deleted_at IS NULL`)
    .run(req.params.id, req.workspace.id);
  if (!info.changes) throw new AppError(404, 'المجموعة غير موجودة');
  audit({ workspaceId: req.workspace.id, userId: req.user.id, action: 'group_deleted', entityType: 'group', entityId: req.params.id, ip: req.ip });
  res.json({ ok: true });
}));

r.post('/:id/accounts', roleAtLeast('manager'), wrap(async (req, res) => {
  const g = db.prepare(`SELECT id FROM account_groups WHERE id=? AND workspace_id=? AND deleted_at IS NULL`).get(req.params.id, req.workspace.id);
  if (!g) throw new AppError(404, 'المجموعة غير موجودة');
  const { accountIds = [], remove = false } = req.body || {};
  const ins = db.prepare(`INSERT OR IGNORE INTO account_group_members (group_id, account_id) VALUES (?,?)`);
  const del = db.prepare(`DELETE FROM account_group_members WHERE group_id=? AND account_id=?`);
  const check = db.prepare(`SELECT id FROM social_accounts WHERE id=? AND workspace_id=? AND deleted_at IS NULL`);
  const tx = db.transaction(() => {
    for (const id of accountIds) {
      if (!check.get(id, req.workspace.id)) continue; // عزل: لا حسابات من Workspace آخر
      remove ? del.run(g.id, id) : ins.run(g.id, id);
    }
  });
  tx();
  res.json({ ok: true });
}));

module.exports = r;
