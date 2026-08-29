'use strict';
const config = require('../config');

/**
 * Rate Limiter بسيط في الذاكرة (يناسب الـMVP).
 * عند التوسع الأفقي يُستبدل بـRedis دون تغيير الواجهة.
 */
function makeLimiter(maxPerWindow) {
  const hits = new Map();
  setInterval(() => hits.clear(), config.rateLimit.windowMs).unref();
  return (req, res, next) => {
    const key = req.user?.id || req.ip;
    const n = (hits.get(key) || 0) + 1;
    hits.set(key, n);
    res.set('X-RateLimit-Limit', String(maxPerWindow));
    if (n > maxPerWindow) {
      res.set('Retry-After', String(Math.ceil(config.rateLimit.windowMs / 1000)));
      return res.status(429).json({ error: 'عدد الطلبات كبير — حاول بعد قليل' });
    }
    next();
  };
}

module.exports = {
  apiLimiter: makeLimiter(config.rateLimit.apiMax),
  authLimiter: makeLimiter(config.rateLimit.authMax)
};
