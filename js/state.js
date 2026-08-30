'use strict';
/* ============================================================
   state.js — سياق التشغيل + أدوات مساعدة + قواميس الحالات
   لا توجد هنا أي بيانات أعمال — البيانات تأتي من Supabase فقط.
   LocalStorage مسموح فقط لتفضيلات الواجهة (ثيم/سايدبار).
   ============================================================ */

/* سياق الجلسة — يمتلئ عبر DB.loadContext() */
const S = { user: null, profile: null, workspace: null, role: null, memberships: [] };

/* تفضيلات الواجهة فقط */
const SCC_UI = 'scc_ui_v3';
const uiPrefs = (() => { try { return JSON.parse(localStorage.getItem(SCC_UI)) || {}; } catch { return {}; } })();
function saveUi() { try { localStorage.setItem(SCC_UI, JSON.stringify(uiPrefs)); } catch {} }

/* صلاحيات الدور في الواجهة (الإنفاذ الحقيقي عبر RLS) */
const ROLE_RANK = { viewer: 1, editor: 2, manager: 3, admin: 4, owner: 5 };
const ROLE_NAMES = { owner: 'المالك', admin: 'مدير', manager: 'مشرف حملات', editor: 'محرر', viewer: 'مشاهد' };
const can = (level) => ROLE_RANK[S.role] >= ROLE_RANK[level];

/* أدوات عامة */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNum = (n) => { n = Number(n) || 0; if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M'; if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K'; return n.toLocaleString('en-US'); };
const fmtFull = (n) => (Number(n) || 0).toLocaleString('en-US');
const fmtDate = (iso) => { if (!iso) return '—'; return new Date(iso).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' }); };
const fmtDateTime = (iso) => { if (!iso) return '—'; const d2 = new Date(iso); return d2.toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short' }) + ' · ' + d2.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' }); };
const timeAgo = (iso) => {
  if (!iso) return '—';
  const sec = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return 'الآن';
  if (sec < 3600) { const v = Math.floor(sec / 60); return v === 1 ? 'منذ دقيقة' : v === 2 ? 'منذ دقيقتين' : v <= 10 ? `منذ ${v} دقائق` : `منذ ${v} دقيقة`; }
  if (sec < 86400) { const v = Math.floor(sec / 3600); return v === 1 ? 'منذ ساعة' : v === 2 ? 'منذ ساعتين' : v <= 10 ? `منذ ${v} ساعات` : `منذ ${v} ساعة`; }
  const v = Math.floor(sec / 86400);
  return v === 1 ? 'منذ يوم' : v === 2 ? 'منذ يومين' : v <= 10 ? `منذ ${v} أيام` : `منذ ${v} يومًا`;
};

/* ناقل أحداث داخلي بسيط */
const Bus = { _l: {}, on(ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn); }, emit(ev, d) { (this._l[ev] || []).forEach((f) => { try { f(d); } catch {} }); } };

/* قواميس الحالات — أيقونة + نص + لون */
const ACC_STATUS = {
  connected: { t: 'متصل', c: 'green', ic: 'check-circle' },
  reconnect: { t: 'يحتاج إعادة اتصال', c: 'amber', ic: 'retry' },
  error: { t: 'خطأ', c: 'red', ic: 'alert' },
  paused: { t: 'متوقف', c: 'gray', ic: 'pause' }
};
const CAMP_STATUS = {
  draft: { t: 'مسودة', c: 'gray' }, scheduled: { t: 'مجدولة', c: 'blue' }, active: { t: 'نشطة', c: 'green' },
  paused: { t: 'متوقفة', c: 'amber' }, completed: { t: 'مكتملة', c: 'purple' }, failed: { t: 'فشلت', c: 'red' }
};
const JOB_STATUS = {
  pending: { t: 'قيد الانتظار', c: 'gray' }, processing: { t: 'قيد التنفيذ', c: 'cyan' }, success: { t: 'نجاح', c: 'green' },
  failed: { t: 'فشل', c: 'red' }, retrying: { t: 'إعادة محاولة', c: 'amber' }, cancelled: { t: 'ملغاة', c: 'gray' }
};
const JOB_ACTIONS = { publish_post: 'نشر محتوى', sync_account: 'مزامنة حساب', refresh_metrics: 'جمع إحصائيات' };
const POST_STATUS = { draft: { t: 'مسودة', c: 'gray' }, scheduled: { t: 'مجدول', c: 'blue' }, published: { t: 'منشور', c: 'green' }, failed: { t: 'فشل', c: 'red' } };
const ERR_CATS = {
  authentication: { t: 'مصادقة', c: 'red' }, permission: { t: 'صلاحيات', c: 'red' }, rate_limit: { t: 'حد الطلبات', c: 'amber' },
  network: { t: 'شبكة', c: 'gray' }, api: { t: 'واجهة API', c: 'amber' }, validation: { t: 'تحقق', c: 'cyan' }, internal: { t: 'داخلي', c: 'gray' }
};
const SEVERITY = { high: { t: 'عالية', c: 'red' }, medium: { t: 'متوسطة', c: 'amber' }, low: { t: 'منخفضة', c: 'gray' } };
const PLATFORMS = {
  meta: { name: 'فيسبوك', color: '#1877f2', short: 'f' },
  instagram: { name: 'إنستغرام', color: '#c13584', short: 'ig' },
  tiktok: { name: 'تيك توك', color: '#3a3a42', short: 'tt' },
  linkedin: { name: 'لينكدإن', color: '#0a66c2', short: 'in' }
};
const AV_COLORS = ['#7d83e0', '#8f7cc9', '#4f9d7e', '#c9964a', '#c96a72', '#5f9aa8', '#9a8fc7', '#6aa88f'];

/* حالة زر أثناء الحفظ — تمنع الضغط المزدوج */
function btnBusy(btn, label = 'جارٍ الحفظ…') {
  const old = btn.innerHTML;
  btn.disabled = true; btn.innerHTML = label;
  return () => { btn.disabled = false; btn.innerHTML = old; };
}
