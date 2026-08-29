'use strict';
/** خطأ موحد للتطبيق — status للـHTTP وcategory لتصنيف مركز الأخطاء */
class AppError extends Error {
  constructor(status, message, category = 'internal', extra = {}) {
    super(message);
    this.status = status;
    this.category = category;
    Object.assign(this, extra);
  }
}
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
module.exports = { AppError, wrap };
