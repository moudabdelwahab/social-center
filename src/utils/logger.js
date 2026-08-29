'use strict';
const crypto = require('crypto');

/** Logger بسيط بصيغة JSON — كل سطر يحمل requestId/jobId لتتبع العملية من بدايتها لنهايتها */
function log(level, msg, ctx = {}) {
  const line = JSON.stringify({ ts: new Date().toISOString(), level, msg, ...ctx });
  (level === 'error' ? process.stderr : process.stdout).write(line + '\n');
}

module.exports = {
  info: (msg, ctx) => log('info', msg, ctx),
  warn: (msg, ctx) => log('warn', msg, ctx),
  error: (msg, ctx) => log('error', msg, ctx),

  /** Middleware: يضيف Request ID لكل طلب */
  requestId(req, res, next) {
    req.id = crypto.randomUUID();
    res.set('X-Request-Id', req.id);
    next();
  }
};
