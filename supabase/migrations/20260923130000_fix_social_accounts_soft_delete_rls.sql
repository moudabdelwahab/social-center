-- ============================================================
-- إصلاح: المالك/المدير يتلقّى 42501 "new row violates row-level
-- security policy" عند فصل حساب.
--
-- DB.accounts.remove() حذف ناعم: UPDATE ... SET deleted_at = now().
-- وPostgres يطبّق سياسات SELECT على الصف *بعد* التحديث، وكانت
-- p_acc_sel هي USING (is_member AND deleted_at IS NULL). الصف بعد
-- التحديث يحمل deleted_at غير NULL فيخرج من سياسة SELECT فيُرفض
-- التحديث كله — لكل الأدوار بما فيها owner. سياسة UPDATE
-- (can_manage) لم تكن يومًا سبب المنع.
--
-- الإصلاح بلا إضعاف أي ضابط:
--  1) p_acc_sel: المشرفون فأعلى يرون الصفوف المحذوفة ناعمًا أيضًا.
--     المشاهد والمحرر لا يرونها. والتطبيق ما زال يرشّح
--     deleted_at IS NULL في كل استعلامات القوائم، فتبقى الحسابات
--     المفصولة مخفية في الواجهة.
--  2) p_acc_upd: تكتسب WITH CHECK صريحة: لا يجوز أن *ينتهي* الصف
--     محذوفًا ناعمًا إلا إذا كان المنفّذ admin فأعلى. هذا أكثر
--     تشددًا من السابق: كانت السياسة تسمح لأي manager بالحذف
--     الناعم والواجهة وحدها تخفي الزر. الفصل الآن admin-only في
--     قاعدة البيانات نفسها.
-- تبقى RLS مفعّلة ولا تُحذف أي سياسة.
-- ============================================================

ALTER POLICY p_acc_sel ON public.social_accounts
  USING (
    public.is_member(workspace_id)
    AND (deleted_at IS NULL OR public.can_manage(workspace_id))
  );

ALTER POLICY p_acc_upd ON public.social_accounts
  USING (public.can_manage(workspace_id))
  WITH CHECK (
    public.can_manage(workspace_id)
    AND (deleted_at IS NULL OR public.can_admin(workspace_id))
  );
