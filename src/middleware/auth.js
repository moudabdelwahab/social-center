'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config');
const { db } = require('../db');

/**
 * مصادقة JWT + حل الـWorkspace + RBAC.
 * العزل متعدد المستأجرين يبدأ هنا: لا يُقبل أي workspace إلا إذا كان المستخدم عضوًا فيه.
 */
const ROLE_RANK = { viewer: 1, editor: 2, manager: 3, admin: 4, owner: 5 };

function authRequired(req, res, next) {
  const token = req.cookies?.scc_token || (req.headers.authorization || '').replace(/^Bearer /i, '');
  if (!token) return res.status(401).json({ error: 'مطلوب تسجيل الدخول' });
  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.sub, email: payload.email, name: payload.name };
    next();
  } catch {
    return res.status(401).json({ error: 'الجلسة منتهية — سجّل الدخول من جديد' });
  }
}

function workspaceRequired(req, res, next) {
  const wsId = parseInt(req.headers['x-workspace-id'] || req.query.workspace_id || '0', 10);
  if (!wsId) return res.status(400).json({ error: 'لم يتم تحديد مساحة العمل' });
  const membership = db.prepare(
    `SELECT workspace_id, role FROM workspace_members WHERE workspace_id = ? AND user_id = ?`
  ).get(wsId, req.user.id);
  if (!membership) return res.status(403).json({ error: 'لا تملك صلاحية الوصول إلى مساحة العمل هذه' });
  req.workspace = { id: wsId, role: membership.role };
  next();
}

function roleAtLeast(minRole) {
  return (req, res, next) => {
    if (ROLE_RANK[req.workspace.role] >= ROLE_RANK[minRole]) return next();
    return res.status(403).json({ error: 'صلاحياتك الحالية لا تسمح بهذه العملية' });
  };
}

module.exports = { authRequired, workspaceRequired, roleAtLeast, ROLE_RANK };
