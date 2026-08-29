'use strict';
const { db } = require('../db');

/** تسجيل كل العمليات المهمة: من فعل؟ ماذا فعل؟ على أي كيان؟ وما النتيجة؟ */
const stmt = db.prepare(
  `INSERT INTO audit_logs (workspace_id, user_id, action, entity_type, entity_id, ip, result, metadata)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
);

function audit({ workspaceId = null, userId = null, action, entityType = null, entityId = null, ip = null, result = 'success', metadata = {} }) {
  try {
    stmt.run(workspaceId, userId, action, entityType, entityId != null ? String(entityId) : null, ip, result, JSON.stringify(metadata));
  } catch (e) {
    console.error('[audit] فشل تسجيل حدث تدقيق:', e.message);
  }
}

module.exports = { audit };
