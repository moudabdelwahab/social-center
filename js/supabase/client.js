'use strict';
/* عميل Supabase الموحّد لكل التطبيق */
const sb = (() => {
  if (!window.supabase?.createClient) { console.error('[SCC] مكتبة supabase-js لم تُحمَّل'); return null; }
  if (!SCC_SUPABASE_ANON_KEY || SCC_SUPABASE_ANON_KEY.startsWith('PASTE')) {
    console.error('[SCC] لم يتم ضبط anon key في js/supabase/config.js');
  }
  return window.supabase.createClient(SCC_SUPABASE_URL, SCC_SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
})();

/* تحويل أخطاء Supabase إلى رسائل عربية واضحة — التفاصيل التقنية تبقى في Console */
function mapDbError(err) {
  const m = (err?.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'البريد الإلكتروني أو كلمة المرور غير صحيحة';
  if (m.includes('already registered') || m.includes('already been registered')) return 'هذا البريد مسجل مسبقًا — جرّب تسجيل الدخول';
  if (m.includes('email not confirmed')) return 'يجب تأكيد البريد الإلكتروني أولًا — راجع صندوق الوارد';
  if (m.includes('password') && m.includes('least')) return 'كلمة المرور ضعيفة — 8 أحرف على الأقل';
  if (m.includes('row-level security') || err?.code === '42501') return 'لا تملك صلاحية تنفيذ هذه العملية';
  if (m.includes('duplicate') || err?.code === '23505') return 'هذا العنصر موجود مسبقًا';
  if (m.includes('violates foreign key')) return 'لا يمكن تنفيذ العملية — العنصر مرتبط ببيانات أخرى';
  if (m.includes('failed to fetch') || m.includes('network')) return 'تعذر الاتصال بالخادم — تحقق من اتصالك';
  if (m.includes('jwt')) return 'انتهت الجلسة — سجّل الدخول من جديد';
  return 'حدث خطأ غير متوقع — حاول مرة أخرى';
}
async function q(promise, ctx) {
  const { data, error } = await promise;
  if (error) { console.error('[SCC:db]', ctx || '', error); throw new Error(mapDbError(error)); }
  return data;
}
