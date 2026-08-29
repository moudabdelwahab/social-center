'use strict';
require('dotenv').config();
const crypto = require('crypto');
const path = require('path');

/**
 * الإعدادات المركزية — لا توجد أي Secrets داخل الكود.
 * في الإنتاج: أي متغير مفقود يوقف التشغيل. في التطوير: يولّد قيمة مؤقتة مع تحذير.
 */
function requiredSecret(name) {
  if (process.env[name] && process.env[name].length >= 16) return process.env[name];
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`[config] متغير البيئة المطلوب مفقود أو ضعيف: ${name}`);
  }
  const ephemeral = crypto.randomBytes(32).toString('hex');
  console.warn(`[config] ⚠ ${name} غير مضبوط — استخدام قيمة مؤقتة للتطوير فقط. اضبطه في .env`);
  return ephemeral;
}

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '8080', 10),
  jwtSecret: requiredSecret('JWT_SECRET'),
  encryptionSecret: requiredSecret('ENCRYPTION_KEY'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '12h',
  dbPath: process.env.DB_PATH
    ? path.resolve(process.env.DB_PATH)
    : path.join(__dirname, '..', 'data', 'app.db'),

  worker: {
    pollMs: 1500,
    batchSize: 10,
    maxRetries: 4,
    // Exponential Backoff: 30ث ← 2د ← 5د ← 15د
    backoffSeconds: [30, 120, 300, 900]
  },
  schedulerPollMs: 15000,

  rateLimit: {
    windowMs: 60_000,
    apiMax: 600,
    authMax: 30
  }
};
