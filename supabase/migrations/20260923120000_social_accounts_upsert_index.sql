-- ============================================================
-- إصلاح 42P10 في meta-oauth-callback.
--
-- كان uq_social_accounts_external فهرسًا فريدًا *جزئيًا*:
--   CREATE UNIQUE INDEX ... (workspace_id, platform, external_id)
--     WHERE external_id IS NOT NULL;
--
-- PostgREST يبني من onConflict الجملة:
--   ON CONFLICT (workspace_id, platform, external_id) DO UPDATE ...
-- بلا WHERE، وPostgres لا يستطيع مطابقة فهرس جزئي بمواصفة استدلال
-- بلا نفس المُسنَد، فيرفع 42P10:
--   "there is no unique or exclusion constraint matching the
--    ON CONFLICT specification"
--
-- إزالة المُسنَد لا تغيّر السلوك: في فهرس فريد عادي تُعدّ قيم NULL
-- متمايزة، فتبقى صفوف external_id IS NULL مسموحة كما كانت تمامًا،
-- ويصبح الفهرس قابلًا للاستدلال في ON CONFLICT.
-- ============================================================

DROP INDEX IF EXISTS public.uq_social_accounts_external;

CREATE UNIQUE INDEX IF NOT EXISTS uq_social_accounts_external
  ON public.social_accounts (workspace_id, platform, external_id);
