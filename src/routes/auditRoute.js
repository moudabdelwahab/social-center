'use strict';
const express = require('express');
const { db } = require('../db');
const { wrap } = require('../utils/errors');

const r = express.Router();

// سجل التدقيق مع فلاتر (العملية/الكيان/التاريخ)
r.get('/', wrap(async (req, res) => {
  const ws = req.workspace.id;
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  let where = `WHERE l.workspace_id=?`;
  const params = [ws];
  if (req.query.action) { where += ` AND l.action LIKE ?`; params.push(`%${req.query.action}%`); }
  if (req.query.entity) { where += ` AND l.entity_type=?`; params.push(req.query.entity); }
  const total = db.prepare(`SELECT COUNT(*) c FROM audit_logs l ${where}`).get(...params).c;
  const items = db.prepare(
    `SELECT l.*, u.name AS user_name FROM audit_logs l LEFT JOIN users u ON u.id=l.user_id
     ${where} ORDER BY l.id DESC LIMIT 25 OFFSET ?`
  ).all(...params, (page - 1) * 25);
  res.json({ items, total, page, pages: Math.ceil(total / 25) });
}));

module.exports = r;
