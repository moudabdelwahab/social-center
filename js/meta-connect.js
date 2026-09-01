'use strict';
/* ============================================================
   meta-connect.js — نافذة «ربط حساب جديد» المبسّطة + OAuth حقيقي.
   لا حقول يدوية لـ Meta/Instagram. لا Tokens ولا App Secret في
   الواجهة إطلاقًا — الواجهة ترسل JWT المستخدم فقط وتستقبل رابط
   التفويض ثم توجّه المتصفح. يُحمَّل بعد app.js (يتطلب S و sb).
   ============================================================ */
(function () {
  /* ---------- نتيجة العودة من meta-oauth-callback (params غير حساسة) ---------- */
  const qp = new URLSearchParams(location.search);
  const meta = qp.get('meta');
  if (meta) {
    const reason = qp.get('reason');
    const msgs = {
      connected: {
        t: 'تم ربط حساب Meta بنجاح',
        b: `اكتشف النظام ${qp.get('assets') || 0} أصلًا · اشتراك Webhook: ${qp.get('webhook') || '—'} · حسابات إعلانية: ${qp.get('ads') || 0}`,
        k: 'ok'
      },
      cancelled: { t: 'ألغيتَ الربط من نافذة Meta', b: 'لم يتغير شيء — يمكنك إعادة المحاولة في أي وقت', k: 'info' },
      error: {
        t: 'تعذّر إكمال الربط مع Meta',
        b: ({
          invalid_state: 'انتهت صلاحية جلسة الربط أو أُعيد استخدامها — ابدأ من جديد',
          missing_params: 'وصلت استجابة ناقصة من Meta — أعد المحاولة',
          token_invalid: 'رمز Meta غير صالح — أعد الربط',
          denied_permissions: 'رفضتَ صلاحيات مطلوبة — امنح الصلاحيات لإكمال الربط',
          exchange_failed: 'تعذّر التحقق من الربط مع Meta — حاول مجددًا',
          db: 'حدث خطأ أثناء الحفظ — حاول مجددًا'
        })[reason] || 'حدث خطأ غير متوقع — حاول مجددًا',
        k: 'err'
      }
    };
    const m = msgs[meta];
    if (m) setTimeout(() => toast(m.t, { body: m.b, type: m.k, duration: 7000 }), 400);
    history.replaceState(null, '', location.pathname); // تنظيف الـquery بعد القراءة
  }

  /* ---------- بدء OAuth الحقيقي ---------- */
  window.startMetaOAuth = async function (platformLabel) {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) { toast('انتهت الجلسة — سجّل الدخول من جديد', { type: 'warn' }); return; }
      toast(`جارٍ تجهيز الربط الآمن مع ${platformLabel}…`, { type: 'info', duration: 2000 });
      const res = await fetch(`${SCC_SUPABASE_URL}/functions/v1/meta-oauth-start`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace_id: S.workspace.id })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast(({
          unauthenticated: 'انتهت الجلسة — سجّل الدخول من جديد',
          forbidden: 'لا تملك صلاحية على مساحة العمل هذه',
          insufficient_role: 'الربط يتطلب دور مشرف حملات أو أعلى'
        })[data.error] || 'تعذّر بدء الربط — حاول مجددًا', { type: 'err' });
        return;
      }
      if (!data.url) { toast('استجابة غير صالحة من الخادم', { type: 'err' }); return; }
      location.href = data.url; // توجيه المتصفح إلى Meta OAuth Dialog
    } catch (e) {
      console.error('[meta-oauth]', e);
      toast('تعذّر الاتصال بالخادم — تحقق من الشبكة وحاول مجددًا', { type: 'err' });
    }
  };

  /* ---------- النافذة المبسّطة (تتجاوز القديمة تمامًا) ---------- */
  const PLAT_META = ['meta', 'instagram']; // تمر عبر Meta OAuth الحقيقي
  const PLAT_SOON = ['tiktok', 'linkedin'];  // OAuth غير جاهز بعد — لا فورم وهمي

  window.openConnectAccount = function () {
    const cards = Object.entries(PLATFORMS).map(([k, p]) => {
      const isMeta = PLAT_META.includes(k);
      const btnLabel = k === 'instagram' ? 'المتابعة مع Instagram' : k === 'meta' ? 'المتابعة مع Facebook' : null;
      return `
        <div class="connect-card" data-plat="${k}">
          <div class="cc-head">
            <span class="platform-ic" style="background:${p.color};width:40px;height:40px;font-size:14px">${p.short}</span>
            <div class="grow"><div class="cc-name">${p.name}</div>
              <div class="cc-sub">${k === 'instagram' ? 'حساب أعمال مرتبط بصفحة فيسبوك' : k === 'meta' ? 'صفحات فيسبوك والحسابات الإعلانية' : 'التكامل الرسمي'}</div>
            </div>
          </div>
          ${isMeta ? `
            <div class="cc-note">${icon('shield', 12)} تُكتشف أصولك تلقائيًا بعد الموافقة — بلا إدخال يدوي</div>
            <button class="btn btn-primary btn-block cc-go" data-plat="${k}">${btnLabel}</button>`
          : `
            <div class="cc-note cc-soon">${icon('info', 12)} الربط الرسمي عبر OAuth غير متاح حاليًا لهذه المنصة</div>
            <button class="btn btn-ghost btn-block" disabled>غير متاح حاليًا</button>`}
        </div>`;
    }).join('');

    openModal({
      title: 'ربط حساب جديد',
      sub: 'اختر المنصة — المصادقة تتم عبر OAuth الرسمي فقط، ولن نطلب كلمة مرورك أو معرّفات يدوية أبدًا',
      size: 'lg',
      body: `
        <div class="connect-grid">${cards}</div>
        <div class="form-hint" style="background:var(--brand-soft);border-radius:10px;padding:11px 14px;color:var(--brand);margin-top:16px;line-height:1.9">
          ${icon('check-circle', 13)} بعد الموافقة في نافذة ${PLAT_META.map(k => PLATFORMS[k].name).join(' / ')} ستعود تلقائيًا إلى هنا،
          وسيعرض النظام ما اكتشفه من صفحات وحسابات إنستغرام وحسابات إعلانية لتختار ما تربطه.
        </div>`,
      actions: `<button class="btn btn-ghost" id="cx-cancel">إلغاء</button>`
    });

    document.getElementById('cx-cancel')?.addEventListener('click', function () {
      this.closest('.modal-back')?.classList.remove('show');
      setTimeout(() => { document.querySelector('.modal-back')?.remove(); document.body.style.overflow = ''; }, 200);
    });
    document.querySelectorAll('.cc-go').forEach(btn => {
      btn.onclick = () => {
        const plat = btn.dataset.plat;
        const label = plat === 'instagram' ? 'Instagram' : 'Facebook';
        const done = btnBusy(btn, 'جارٍ التوجيه إلى ' + label + '…');
        startMetaOAuth(label).finally(done);
      };
    });
  };
})();
