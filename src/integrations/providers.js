'use strict';
/**
 * ============================================================
 * Social Integration Layer — طبقة التكامل المستقلة
 * كل Provider ينفّذ نفس الـInterface:
 *   connectAccount / disconnectAccount / refreshConnection
 *   getAccount / publishPost / getMetrics / syncAccount
 * إضافة منصة جديدة = ملف Provider جديد + تسجيله هنا. لا تعديل على الـCore.
 * ============================================================
 */

class ProviderError extends Error {
  constructor(category, message, { retryable = false, status = null } = {}) {
    super(message);
    this.category = category;   // authentication | permission | rate_limit | network | api | validation | internal
    this.retryable = retryable;
    this.status = status;
  }
}

/** القدرات المعلنة لكل منصة — العمليات غير المدعومة تُرفض قبل التنفيذ */
const CAPABILITIES = {
  meta:      { publishing: true,  scheduling: true,  comments: true,  analytics: true,  messaging: true  },
  instagram: { publishing: true,  scheduling: true,  comments: true,  analytics: true,  messaging: false },
  tiktok:    { publishing: true,  scheduling: false, comments: false, analytics: true,  messaging: false },
  linkedin:  { publishing: true,  scheduling: true,  comments: false, analytics: true,  messaging: false },
  mock:      { publishing: true,  scheduling: true,  comments: true,  analytics: true,  messaging: true  }
};

/* ---------------- MockSocialProvider (للتطوير فقط) ----------------
   يحاكي سلوك API حقيقي: زمن استجابة، أخطاء عشوائية، Rate Limit،
   انتهاء رموز. عند ربط Meta الفعلي يُستبدل بـ MetaProvider. */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class MockSocialProvider {
  constructor() { this.code = 'mock'; this.capabilities = CAPABILITIES.mock; }

  async #simulate(op, failRate = 0.07) {
    await sleep(120 + Math.random() * 400);
    const roll = Math.random();
    if (roll < failRate * 0.25) throw new ProviderError('network', `انقطاع الشبكة أثناء ${op}`, { retryable: true });
    if (roll < failRate * 0.5)  throw new ProviderError('api', `خطأ مؤقت في خوادم المنصة أثناء ${op}`, { retryable: true, status: 500 });
    if (roll < failRate * 0.75) throw new ProviderError('rate_limit', 'تم تجاوز حد الطلبات (HTTP 429)', { retryable: true, status: 429 });
    if (roll < failRate)        throw new ProviderError('authentication', 'انتهت صلاحية رمز الوصول', { retryable: false, status: 401 });
  }

  async connectAccount({ name, handle }) {
    await this.#simulate('ربط الحساب', 0);
    return {
      externalId: 'mock_' + Math.random().toString(36).slice(2, 12),
      accessToken: 'mock_at_' + Math.random().toString(36).slice(2),
      refreshToken: 'mock_rt_' + Math.random().toString(36).slice(2),
      expiresInSec: 60 * 60 * 24 * 60,
      permissions: { publish: true, read_insights: true, manage_comments: true, read_data: true, manage_messages: true },
      avatarUrl: null, name, handle
    };
  }

  async disconnectAccount() { await this.#simulate('فصل الحساب', 0); return { ok: true }; }

  async refreshConnection(conn) {
    await this.#simulate('تحديث الاتصال');
    if (conn?.tokenExpired) throw new ProviderError('authentication', 'الرمز منتهٍ — يلزم إعادة التفويض', { retryable: false, status: 401 });
    return { accessToken: 'mock_at_' + Math.random().toString(36).slice(2), expiresInSec: 60 * 60 * 24 * 60 };
  }

  async getAccount() { await this.#simulate('قراءة الحساب'); return { ok: true }; }

  async syncAccount() {
    await this.#simulate('مزامنة الحساب');
    return { syncedAt: new Date().toISOString() };
  }

  async publishPost({ content }) {
    await this.#simulate('نشر المحتوى');
    return {
      externalPostId: 'mock_post_' + Math.random().toString(36).slice(2, 10),
      url: 'https://example.invalid/post',
      metrics: {
        reach: Math.floor(200 + Math.random() * 5000),
        impressions: Math.floor(400 + Math.random() * 9000),
        engagement: Math.floor(20 + Math.random() * 600)
      },
      contentPreview: (content || '').slice(0, 60)
    };
  }

  async getMetrics() {
    await this.#simulate('جلب الإحصائيات');
    return {
      reach: Math.floor(100 + Math.random() * 3000),
      impressions: Math.floor(300 + Math.random() * 7000),
      engagement: Math.floor(10 + Math.random() * 400)
    };
  }
}

/* ---------------- MetaProvider (هيكل جاهز للربط الرسمي) ----------------
   يُفعّل بعد إضافة App ID/Secret في الإعدادات وإكمال OAuth الرسمي.
   حاليًا يرفض الاتصال بوضوح بدل أي التفاف غير رسمي. */
class MetaProvider extends MockSocialProvider {
  constructor() { super(); this.code = 'meta'; this.capabilities = CAPABILITIES.meta; }
  async connectAccount() {
    throw new ProviderError('validation', 'ربط Meta يتطلب إكمال إعداد OAuth الرسمي من صفحة الإعدادات أولًا', { retryable: false });
  }
}

const registry = { mock: new MockSocialProvider(), meta: new MetaProvider() };

function getProvider(code) {
  // المنصات غير المفعّلة بعد تعود للمزود التجريبي مع إبقاء قدرات المنصة المطلوبة
  const p = registry[code] || registry.mock;
  return { impl: p, capabilities: CAPABILITIES[code] || CAPABILITIES.mock };
}

function assertCapability(code, action) {
  const caps = CAPABILITIES[code] || CAPABILITIES.mock;
  const map = {
    publish_post: 'publishing', schedule_post: 'scheduling', get_comments: 'comments',
    get_metrics: 'analytics', refresh_metrics: 'analytics', send_message: 'messaging'
  };
  const cap = map[action];
  if (cap && !caps[cap]) {
    throw new ProviderError('validation', 'هذه العملية غير متاحة لهذه المنصة عبر واجهة API الرسمية', { retryable: false });
  }
}

module.exports = { getProvider, assertCapability, ProviderError, CAPABILITIES };
