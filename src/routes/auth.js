'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { db } = require('../db');
const { AppError, wrap } = require('../utils/errors');
const { authLimiter } = require('../middleware/rateLimit');
const { authRequired } = require('../middleware/auth');
const { audit } = require('../services/audit');

const r = express.Router();
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function sign(user) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}
function setCookie(res, token) {
  res.set('Set-Cookie', `scc_token=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${config.env === 'production' ? '; Secure' : ''}`);
}

r.post('/register', authLimiter, wrap(async (req, res) => {
  const { email, password, name, workspaceName } = req.body || {};
  if (!EMAIL_RE.test(email || '')) throw new AppError(400, 'البريد الإلكتروني غير صالح', 'validation');
  if (!password || password.length < 8) throw new AppError(400, 'كلمة المرور يجب أن تكون 8 أحرف على الأقل', 'validation');
  if (!name || !workspaceName) throw new AppError(400, 'الاسم واسم مساحة العمل مطلوبان', 'validation');

  const plan = db.prepare(`SELECT id FROM plans WHERE code='starter'`).get();
  const hash = bcrypt.hashSync(password, 12);
  try {
    const tx = db.transaction(() => {
      const u = db.prepare(`INSERT INTO users (email, password_hash, name) VALUES (?,?,?)`).run(email.trim(), hash, name.trim());
      const w = db.prepare(`INSERT INTO workspaces (name, plan_id) VALUES (?,?)`).run(workspaceName.trim(), plan.id);
      db.prepare(`INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?,?, 'owner')`).run(w.lastInsertRowid, u.lastInsertRowid);
      return { userId: u.lastInsertRowid, workspaceId: w.lastInsertRowid };
    });
    const { userId, workspaceId } = tx();
    audit({ workspaceId, userId, action: 'user_registered', entityType: 'user', entityId: userId, ip: req.ip });
    const user = { id: userId, email: email.trim(), name: name.trim() };
    setCookie(res, sign(user));
    res.status(201).json({ user, workspaceId });
  } catch (e) {
    if (String(e.message).includes('UNIQUE')) throw new AppError(409, 'هذا البريد مسجل مسبقًا', 'validation');
    throw e;
  }
}));

r.post('/login', authLimiter, wrap(async (req, res) => {
  const { email, password } = req.body || {};
  const user = db.prepare(`SELECT * FROM users WHERE email = ? AND deleted_at IS NULL`).get((email || '').trim());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    audit({ action: 'login_failed', entityType: 'user', ip: req.ip, result: 'failure', metadata: { email } });
    throw new AppError(401, 'بيانات الدخول غير صحيحة', 'authentication');
  }
  audit({ userId: user.id, action: 'login_success', entityType: 'user', entityId: user.id, ip: req.ip });
  setCookie(res, sign(user));
  res.json({ user: { id: user.id, email: user.email, name: user.name } });
}));

r.post('/logout', (req, res) => {
  res.set('Set-Cookie', 'scc_token=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
  res.json({ ok: true });
});

r.get('/me', authRequired, wrap(async (req, res) => {
  const workspaces = db.prepare(
    `SELECT w.id, w.name, m.role, p.name AS plan, p.code AS plan_code
     FROM workspace_members m JOIN workspaces w ON w.id = m.workspace_id JOIN plans p ON p.id = w.plan_id
     WHERE m.user_id = ? AND w.deleted_at IS NULL`
  ).all(req.user.id);
  res.json({ user: req.user, workspaces });
}));

module.exports = r;
