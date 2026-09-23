-- meta-oauth-callback يكتب حقل metadata في سجل التدقيق، والعمود غير موجود،
-- فكان كل إدخال يفشل بـPGRST204:
--   "Could not find the 'metadata' column of 'audit_logs' in the schema cache"
-- الإدخال غير حرج (لا يُفشل الربط) لكنه يعني ضياع سجل التدقيق بالكامل.
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS metadata jsonb;
