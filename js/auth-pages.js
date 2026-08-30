'use strict';
/* auth-pages.js — منطق صفحات الدخول/التسجيل/الاستعادة */
(function () {
  const show = (id, msg, ok) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = msg; el.className = 'auth-msg ' + (ok ? 'ok' : 'err');
    el.style.display = msg ? 'block' : 'none';
  };
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* إذا كان المستخدم مسجلًا أصلًا ← Dashboard */
  Auth.session().then(s => {
    if (s && document.getElementById('login-form')) location.replace('dashboard.html');
  });

  /* ---------- تسجيل الدخول ---------- */
  const lf = document.getElementById('login-form');
  if (lf) lf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = lf.email.value.trim(), pw = lf.password.value;
    if (!EMAIL_RE.test(email)) return show('login-msg', 'البريد الإلكتروني غير صالح');
    if (!pw) return show('login-msg', 'أدخل كلمة المرور');
    const done = btnBusy(lf.querySelector('button[type=submit]'), 'جارٍ تسجيل الدخول…');
    show('login-msg', '');
    try { await Auth.signIn(email, pw); location.replace('dashboard.html'); }
    catch (err) { show('login-msg', err.message); done(); }
  });

  /* ---------- إنشاء حساب ---------- */
  const sf = document.getElementById('signup-form');
  if (sf) sf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = sf.fullname.value.trim(), email = sf.email.value.trim();
    const pw = sf.password.value, pw2 = sf.password2.value;
    if (name.length < 2) return show('signup-msg', 'أدخل الاسم الكامل');
    if (!EMAIL_RE.test(email)) return show('signup-msg', 'البريد الإلكتروني غير صالح');
    if (pw.length < 8) return show('signup-msg', 'كلمة المرور يجب أن تكون 8 أحرف على الأقل');
    if (pw !== pw2) return show('signup-msg', 'كلمتا المرور غير متطابقتين');
    if (!sf.terms.checked) return show('signup-msg', 'يجب الموافقة على الشروط والأحكام');
    const done = btnBusy(sf.querySelector('button[type=submit]'), 'جارٍ إنشاء الحساب…');
    show('signup-msg', '');
    try {
      const data = await Auth.signUp({ name, email, password: pw, workspaceName: '' });
      if (data.session) location.replace('dashboard.html');
      else {
        show('signup-msg', 'تم إنشاء حسابك! تحقق من بريدك لتأكيد الحساب ثم سجّل الدخول.', true);
        done();
        sf.reset();
      }
    } catch (err) { show('signup-msg', err.message); done(); }
  });

  /* ---------- نسيت كلمة المرور ---------- */
  const ff = document.getElementById('forgot-form');
  if (ff) ff.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = ff.email.value.trim();
    if (!EMAIL_RE.test(email)) return show('forgot-msg', 'البريد الإلكتروني غير صالح');
    const done = btnBusy(ff.querySelector('button[type=submit]'), 'جارٍ الإرسال…');
    show('forgot-msg', '');
    try {
      await Auth.sendReset(email);
      show('forgot-msg', 'أُرسل رابط إعادة التعيين إلى بريدك — تحقق من صندوق الوارد.', true);
    } catch (err) { show('forgot-msg', err.message); }
    done();
  });

  /* ---------- تعيين كلمة مرور جديدة ---------- */
  const rf = document.getElementById('reset-form');
  if (rf) {
    Auth.session().then(s => { if (!s) show('reset-msg', 'الرابط غير صالح أو منتهٍ — اطلب رابطًا جديدًا'); });
    rf.addEventListener('submit', async (e) => {
      e.preventDefault();
      const pw = rf.password.value, pw2 = rf.password2.value;
      if (pw.length < 8) return show('reset-msg', 'كلمة المرور يجب أن تكون 8 أحرف على الأقل');
      if (pw !== pw2) return show('reset-msg', 'كلمتا المرور غير متطابقتين');
      const done = btnBusy(rf.querySelector('button[type=submit]'), 'جارٍ الحفظ…');
      show('reset-msg', '');
      try {
        await Auth.updatePassword(pw);
        show('reset-msg', 'تم تعيين كلمة المرور الجديدة — جارٍ تحويلك…', true);
        setTimeout(() => location.replace('dashboard.html'), 1200);
      } catch (err) { show('reset-msg', err.message); done(); }
    });
  }
})();
