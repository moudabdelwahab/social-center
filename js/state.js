'use strict';
/* ============================================================
   state.js — إدارة الحالة + LocalStorage persistence
   appState موحّد، وكل الصفحات تقرأ وتكتب منه
   ============================================================ */
const SCC_KEY = 'scc_state_v3';
const SCC_UI = 'scc_ui_v3';

function seedState() {
  return {
    user: { name: 'سارة الأحمد', email: 'sara@numu.agency', role: 'owner', roleLabel: 'المالك' },
    workspace: { name: 'وكالة النمو الرقمي', plan: 'الاحترافية', planCode: 'professional' },
    accounts: SEED.accounts,
    groups: SEED.groups,
    campaigns: SEED.campaigns,
    posts: SEED.posts,
    jobs: SEED.jobs,
    notifications: SEED.notifications,
    errors: SEED.errors,
    series30: SEED.series30,
    automation: { nodes: [], edges: [], seq: 0 },
    settings: {
      notif: { campaignDone: true, jobFail: true, tokenExpiring: true, weeklyReport: false, newComment: false },
      security: { twoFactor: false, sessionAlerts: true }
    },
    nextId: { account: 21, group: 6, campaign: 9, post: 31, job: 1051, notif: 9, error: 11 }
  };
}

let appState;
try {
  const raw = localStorage.getItem(SCC_KEY);
  appState = raw ? JSON.parse(raw) : seedState();
  if (!appState.automation || !appState.nextId) appState = seedState(); // حماية من نسخة قديمة
} catch { appState = seedState(); }

let _saveT = null;
function saveState() {
  clearTimeout(_saveT);
  _saveT = setTimeout(() => { try { localStorage.setItem(SCC_KEY, JSON.stringify(appState)); } catch {} }, 120);
}
function resetState() { localStorage.removeItem(SCC_KEY); location.reload(); }

/* تفضيلات الواجهة (ثيم / سايدبار) */
const uiPrefs = (() => {
  try { return JSON.parse(localStorage.getItem(SCC_UI)) || {}; } catch { return {}; }
})();
function saveUi() { try { localStorage.setItem(SCC_UI, JSON.stringify(uiPrefs)); } catch {} }

/* أدوات مساعدة عامة */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtNum = (n) => {
  n = Number(n) || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toLocaleString('en-US');
};
const fmtFull = (n) => (Number(n) || 0).toLocaleString('en-US');
const fmtDate = (iso) => {
  if (!iso) return '—';
  const dt = new Date(iso);
  return dt.toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short', year: 'numeric' });
};
const fmtDateTime = (iso) => {
  if (!iso) return '—';
  const dt = new Date(iso);
  return dt.toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'short' }) + ' · ' +
         dt.toLocaleTimeString('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit' });
};
const timeAgo = (iso) => {
  if (!iso) return '—';
  const sec = Math.max(1, (Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return 'الآن';
  if (sec < 3600) { const v = Math.floor(sec / 60); return v === 1 ? 'منذ دقيقة' : v === 2 ? 'منذ دقيقتين' : v <= 10 ? `منذ ${v} دقائق` : `منذ ${v} دقيقة`; }
  if (sec < 86400) { const v = Math.floor(sec / 3600); return v === 1 ? 'منذ ساعة' : v === 2 ? 'منذ ساعتين' : v <= 10 ? `منذ ${v} ساعات` : `منذ ${v} ساعة`; }
  const v = Math.floor(sec / 86400);
  return v === 1 ? 'منذ يوم' : v === 2 ? 'منذ يومين' : v <= 10 ? `منذ ${v} أيام` : `منذ ${v} يومًا`;
};

/* Bus بسيط للأحداث (تحديثات المحاكاة الحية) */
const Bus = {
  _l: {},
  on(ev, fn) { (this._l[ev] = this._l[ev] || []).push(fn); },
  emit(ev, data) { (this._l[ev] || []).forEach((f) => { try { f(data); } catch {} }); }
};

/* قواميس الحالات — أيقونة + نص + لون */
const ACC_STATUS = {
  connected: { t: 'متصل', c: 'green', ic: 'check-circle' },
  reconnect: { t: 'يحتاج إعادة اتصال', c: 'amber', ic: 'retry' },
  error: { t: 'خطأ', c: 'red', ic: 'alert' },
  paused: { t: 'متوقف', c: 'gray', ic: 'pause' }
};
const CAMP_STATUS = {
  draft: { t: 'مسودة', c: 'gray' }, scheduled: { t: 'مجدولة', c: 'blue' },
  active: { t: 'نشطة', c: 'green' }, paused: { t: 'متوقفة', c: 'amber' },
  completed: { t: 'مكتملة', c: 'purple' }
};
const JOB_STATUS = {
  pending: { t: 'قيد الانتظار', c: 'gray' }, processing: { t: 'قيد التنفيذ', c: 'cyan' },
  success: { t: 'نجاح', c: 'green' }, failed: { t: 'فشل', c: 'red' }
};
const JOB_ACTIONS = { publish_post: 'نشر محتوى', sync_account: 'مزامنة حساب', refresh_metrics: 'جمع إحصائيات' };
const POST_STATUS = {
  draft: { t: 'مسودة', c: 'gray' }, scheduled: { t: 'مجدول', c: 'blue' }, published: { t: 'منشور', c: 'green' }
};
const ERR_CATS = {
  authentication: { t: 'مصادقة', c: 'red' }, permission: { t: 'صلاحيات', c: 'red' },
  rate_limit: { t: 'حد الطلبات', c: 'amber' }, network: { t: 'شبكة', c: 'gray' },
  api: { t: 'واجهة API', c: 'amber' }, validation: { t: 'تحقق', c: 'cyan' }, internal: { t: 'داخلي', c: 'gray' }
};
const SEVERITY = { high: { t: 'عالية', c: 'red' }, medium: { t: 'متوسطة', c: 'amber' }, low: { t: 'منخفضة', c: 'gray' } };
const AV_COLORS = ['#6d8dff', '#8b5cf6', '#2fbf8f', '#eda33c', '#f0566d', '#3fc1d8', '#a78bfa', '#5ec2a0'];
