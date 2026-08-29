'use strict';
const express = require('express');
const { db } = require('../db');
const { wrap } = require('../utils/errors');

const r = express.Router();

r.get('/', wrap(async (req, res) => {
  const items = db.prepare(
    `SELECT * FROM notifications WHERE workspace_id=? ORDER BY id DESC LIMIT 50`
  ).all(req.workspace.id);
  const unread = db.prepare(`SELECT COUNT(*) c FROM notifications WHERE workspace_id=? AND read_at IS NULL`).get(req.workspace.id).c;
  res.json({ items, unread });
}));

r.post('/read-all', wrap(async (req, res) => {
  db.prepare(`UPDATE notifications SET read_at=datetime('now') WHERE workspace_id=? AND read_at IS NULL`).run(req.workspace.id);
  res.json({ ok: true });
}));

module.exports = r;
