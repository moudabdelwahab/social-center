-- صور الأصول الحقيقية.
-- تملؤها meta-oauth-callback من Graph API. بيانات عرض فقط: رابط صورة
-- عام، لا رموز إطلاقًا. nullable ليبقى الحرف الأول بديلًا للأصول بلا
-- صورة (الحسابات الإعلانية مثلًا).
ALTER TABLE public.social_accounts
  ADD COLUMN IF NOT EXISTS avatar_url text;

-- الحسابات الإعلانية كانت تُخزَّن بنوع 'business' نفسه الذي تستخدمه
-- حسابات إنستغرام للأعمال، فتعذّر تمييزها في صفحة الحسابات.
UPDATE public.social_accounts
   SET account_type = 'ad_account'
 WHERE platform = 'meta'
   AND external_id LIKE 'act\_%'
   AND account_type <> 'ad_account';

-- الصفحات المرتبطة سلفًا تأخذ رابط الصورة العام الثابت.
UPDATE public.social_accounts
   SET avatar_url = 'https://graph.facebook.com/v21.0/' || external_id || '/picture?type=square&width=160&height=160'
 WHERE platform = 'meta'
   AND account_type = 'page'
   AND external_id IS NOT NULL
   AND avatar_url IS NULL;
