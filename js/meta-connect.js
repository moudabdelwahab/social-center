'use strict';
/* ============================================================
   meta-connect.js — ربط زر «ربط حساب جديد» بتدفق Meta OAuth الحقيقي.
   الأمان محفوظ بالكامل: لا App Secret ولا Tokens في الواجهة —
   الواجهة ترسل JWT المستخدم فقط وتستقبل رابط التفويض ثم توجّه.
   يُحمَّل بعد app.js (يتطلب S و sb المحمّلَين).
   ============================================================ */
(function () {
  /* نتيجة العودة من meta-oauth-callback (query params غير حساسة) */
  const qp = new URLSearchParams(location.search);
  const meta = qp.get('meta');
  if (meta) {
    const msgs = {
      connected: { t: 'تم ربط حساب Meta بنجاح', b: `الأصول: ${qp.get('assets') || 0} · اشتراك Webhook: ${qp.get('webhook') || '—'} · حسابات إعلانية: ${qp.get('ads') || 0}`, k: 'ok' },
      cancelled: { t: 'ألغيتَ التفويض', b: 'لم يتغير شيء — يمكنك إعادة المحاولة متى شئت', k: 'info' },
      error: {
        t: 'تعذّر إكمال ربط Meta',
        b: ({ invalid_state: 'انتهت صلاحية جلسة الربط أو أُعيد استخدامها — ابدأ من جديد', missing_params: 'استجابة ناقصة من Meta', token_invalid: 'رمز Meta غير صالح', db: 'خطأ في الحفظ — حاول مجددًا', exchange_failed: 'فشل تبادل الرموز مع Meta' })[qp.get('reason')] || 'خطأ غير متوقع',
        k: 'err'
      }
    };
    const m = msgs[meta];
    if (m) setTimeout(() => toast(m.t, { body: m.b, type: m.k, duration: 6500 }), 400);
    history.replaceState(null, '', location.pathname); // تنظيف الـquery بعد القراءة
  }

  /* التدفق: JWT المستخدم → meta-oauth-start → توجيه إلى Meta */
  window.startMetaOAuth = async function () {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { toast('انتهت الجلسة — سجّل الدخول من جديد', { type: 'warn' }); return; }
      toast('جارٍ تجهيز الربط الآمن مع Meta…', { type: 'info', duration: 2000 });
      const res = await fetch(`${SCC_SUPABASE_URL}/functions/v1/meta-oauth-start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: S.workspace.id })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const m = { unauthenticated: 'انتهت الجلسة', forbidden: 'لا صلاحية لهذه المساحة', insufficient_role: 'الربط يتطلب دور مشرف أو أعلى' }[data.error] || 'تعذّر بدء الربط';
        toast(m, { type: 'err' }); return;
      }
      location.href = data.url; // توجيه المتصفح إلى Meta OAuth Dialog
    } catch (e) {
      console.error('[meta-oauth]', e);
      toast('تعذّر الاتصال — تحقق من الشبكة وحاول مجددًا', { type: 'err' });
    }
  };

  /* عند فتح نافذة «ربط حساب جديد» واختيار فيسبوك: المتابعة = OAuth الحقيقي */
  const _orig = window.openConnectAccount;
  window.openConnectAccount = function () {
    _orig && _orig();
    setTimeout(() => {
      const goBtn = document.getElementById('ca-go');
      if (!goBtn) return;
      const hint = document.querySelector('.modal .form-hint');
      if (hint) hint.innerHTML = '🔐 اختيار «فيسبوك» يبدأ تفويض Meta الرسمي (OAuth) — تُجلب الصفحات وحسابات إنستغرام والحسابات الإعلانية تلقائيًا.';
      goBtn.onclick = () => {
        const platform = document.querySelector('.modal [name=plat]:checked')?.value;
        if (platform === 'meta') { startMetaOAuth(); return; }
        // باقي المنصات: السلوك اليدوي القائم (إن وجد) أو توضيح عدم الجاهزية
        const name = document.getElementById('ca-name')?.value.trim();
        if (!name) return toast('اختر فيسبوك للربط الرسمي، أو أدخل اسم الحساب للحفظ اليدوي', { type: 'warn' });
        if (typeof window.__saveManualAccount === 'function') window.__saveManualAccount();
      };
    }, 60);
  };
})();
