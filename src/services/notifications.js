'use strict';
const { db } = require('../db');

/** مركز الإشعارات — قابل للتوسع لاحقًا عبر Event Bus إلى Email / WhatsApp / Push */
function notify(workspaceId, { type, title, body = null, userId = null }) {
  db.prepare(
    `INSERT INTO notifications (workspace_id, user_id, type, title, body) VALUES (?, ?, ?, ?, ?)`
  ).run(workspaceId, userId, type, title, body);
}

module.exports = { notify };
