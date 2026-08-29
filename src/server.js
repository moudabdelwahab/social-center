'use strict';
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const config = require('./config');
const logger = require('./utils/logger');
const { authRequired, workspaceRequired, apiLimiter } = (() => {
  const auth = require('./middleware/auth');
  const rl = require('./middleware/rateLimit');
  return { ...auth, ...rl };
})();

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use(logger.requestId);

// Cookie parser خفيف (HttpOnly Cookie للجلسة)
app.use((req, _res, next) => {
  req.cookies = {};
  (req.headers.cookie || '').split(';').forEach((c) => {
    const i = c.indexOf('=');
    if (i > -1) req.cookies[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  next();
});

// Security Headers
app.use((_req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  res.set('Referrer-Policy', 'no-referrer');
  // CSRF: الجلسة SameSite=Strict + نقبل JSON فقط + تحقق من ترويسة مخصصة للطلبات المعدِّلة
  next();
});
app.use('/api', (req, res, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-requested-with'] !== 'fetch') {
    return res.status(403).json({ error: 'طلب مرفوض (حماية CSRF)' });
  }
  next();
});
app.use('/api', apiLimiter);

// حالة الصحة
app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// المسارات المحمية
const authChain = [authRequired, workspaceRequired];
app.use('/api/auth', require('./routes/auth'));
app.use('/api/accounts', authChain, require('./routes/accounts'));
app.use('/api/groups', authChain, require('./routes/groups'));
app.use('/api/campaigns', authChain, require('./routes/campaigns'));
app.use('/api/posts', authChain, require('./routes/posts'));
app.use('/api/jobs', authChain, require('./routes/jobs'));
app.use('/api/analytics', authChain, require('./routes/analytics'));
app.use('/api/notifications', authChain, require('./routes/notifications'));
app.use('/api/errors', authChain, require('./routes/errors'));
app.use('/api/audit', authChain, require('./routes/auditRoute'));
app.use('/api/settings', authChain, require('./routes/settings'));
app.use('/api/integrations', authChain, require('./routes/integrations'));

app.use('/api', (_req, res) => res.status(404).json({ error: 'المسار غير موجود' }));

// معالج الأخطاء المركزي — لا تسريب لتفاصيل داخلية
app.use((err, req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) logger.error('http.error', { requestId: req.id, error: err.message, stack: err.stack });
  res.status(status).json({ error: status >= 500 ? 'خطأ داخلي في الخادم' : err.message, requestId: req.id });
});

// الواجهة الأمامية (ملفات ثابتة)
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

const { startEngines } = require('./services/jobs');
app.listen(config.port, () => {
  startEngines();
  logger.info('server.started', { port: config.port, env: config.env, pid: process.pid });
});
