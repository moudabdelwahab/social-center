-- ============================================================
-- Social Command Center — Supabase Schema كامل + RLS
-- شغّل هذا الملف مرة واحدة في: Supabase Dashboard → SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS plans (
  code text PRIMARY KEY, name text NOT NULL,
  max_accounts int DEFAULT 10, max_campaigns int DEFAULT 5,
  max_users int DEFAULT 2, max_jobs_per_month int DEFAULT 1000
);
INSERT INTO plans VALUES
  ('starter','المبتدئة',10,5,2,1000),
  ('professional','الاحترافية',100,50,10,20000),
  ('business','الأعمال',1000,300,50,200000),
  ('enterprise','المؤسسات',100000,10000,1000,10000000)
ON CONFLICT (code) DO NOTHING;

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text, email text, avatar_color text DEFAULT '#7d83e0',
  preferences jsonb DEFAULT '{}', created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, plan_code text REFERENCES plans(code) DEFAULT 'starter',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'viewer' CHECK (role IN ('owner','admin','manager','editor','viewer')),
  created_at timestamptz DEFAULT now(), PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS social_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  platform text NOT NULL, name text NOT NULL, handle text, account_type text DEFAULT 'page',
  status text NOT NULL DEFAULT 'reconnect' CHECK (status IN ('connected','reconnect','error','paused')),
  followers int DEFAULT 0, permissions jsonb DEFAULT '{}',
  external_id text, access_token_enc text, token_expires_at timestamptz,
  last_sync_at timestamptz, created_at timestamptz DEFAULT now(), deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS account_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL, description text, color text DEFAULT '#7d83e0',
  created_at timestamptz DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS account_group_members (
  group_id uuid REFERENCES account_groups(id) ON DELETE CASCADE,
  account_id uuid REFERENCES social_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, account_id)
);

CREATE TABLE IF NOT EXISTS campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text NOT NULL, description text, client text, objective text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','active','paused','completed','failed')),
  budget numeric, start_date date, end_date date, progress int DEFAULT 0,
  created_by uuid REFERENCES profiles(id), created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS campaign_accounts (
  campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE,
  account_id uuid REFERENCES social_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, account_id)
);

CREATE TABLE IF NOT EXISTS posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  content text NOT NULL, status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','published','failed')),
  scheduled_at timestamptz, published_at timestamptz, recurrence text DEFAULT 'once',
  reach int DEFAULT 0, engagement int DEFAULT 0,
  created_by uuid REFERENCES profiles(id), created_at timestamptz DEFAULT now(), deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS post_accounts (
  post_id uuid REFERENCES posts(id) ON DELETE CASCADE,
  account_id uuid REFERENCES social_accounts(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, account_id)
);

CREATE TABLE IF NOT EXISTS jobs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  campaign_id uuid REFERENCES campaigns(id) ON DELETE SET NULL,
  account_id uuid REFERENCES social_accounts(id) ON DELETE SET NULL,
  post_id uuid REFERENCES posts(id) ON DELETE SET NULL,
  action text NOT NULL, status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','success','failed','retrying','cancelled')),
  progress int DEFAULT 0, payload jsonb DEFAULT '{}', retry_count int DEFAULT 0, max_retries int DEFAULT 4,
  run_at timestamptz DEFAULT now(), started_at timestamptz, completed_at timestamptz,
  duration_sec numeric, error_message text, created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_jobs_ws ON jobs(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS job_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id bigint REFERENCES jobs(id) ON DELETE CASCADE,
  attempt_no int, status text, error_message text, created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id uuid, type text NOT NULL, title text NOT NULL, body text,
  read_at timestamptz, created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_ws ON notifications(workspace_id, created_at DESC);

CREATE TABLE IF NOT EXISTS errors (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('authentication','permission','rate_limit','network','api','validation','internal')),
  severity text DEFAULT 'medium', message text NOT NULL,
  account_name text, campaign_name text, job_id bigint,
  occurrences int DEFAULT 1, status text DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at timestamptz DEFAULT now(), resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS analytics_daily (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid NOT NULL, campaign_id uuid, date date NOT NULL DEFAULT CURRENT_DATE,
  reach int DEFAULT 0, impressions int DEFAULT 0, engagement int DEFAULT 0,
  jobs_success int DEFAULT 0, jobs_failed int DEFAULT 0,
  UNIQUE (workspace_id, campaign_id, date)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  workspace_id uuid, user_id uuid, action text NOT NULL,
  entity_type text, entity_id text, result text DEFAULT 'success',
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name text DEFAULT 'سير الأتمتة الرئيسي', graph jsonb DEFAULT '{"nodes":[],"edges":[],"seq":0}',
  updated_at timestamptz DEFAULT now()
);

-- ---------- دوال RLS آمنة (تمنع recursion) ----------
CREATE OR REPLACE FUNCTION public.is_member(ws uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = ws AND user_id = auth.uid()) $$;
CREATE OR REPLACE FUNCTION public.my_role(ws uuid) RETURNS text
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT role FROM workspace_members WHERE workspace_id = ws AND user_id = auth.uid() $$;
CREATE OR REPLACE FUNCTION public.can_write(ws uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.my_role(ws) IN ('owner','admin','manager','editor') $$;
CREATE OR REPLACE FUNCTION public.can_manage(ws uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.my_role(ws) IN ('owner','admin','manager') $$;
CREATE OR REPLACE FUNCTION public.can_admin(ws uuid) RETURNS boolean
LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT public.my_role(ws) IN ('owner','admin') $$;

-- ---------- Trigger: Profile + Workspace + Owner تلقائيًا عند التسجيل ----------
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE ws_id uuid; ws_name text;
BEGIN
  INSERT INTO profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)), NEW.email);
  ws_name := COALESCE(NULLIF(NEW.raw_user_meta_data->>'workspace_name',''),
             COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)) || '''s Workspace');
  INSERT INTO workspaces (name) VALUES (ws_name) RETURNING id INTO ws_id;
  INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (ws_id, NEW.id, 'owner');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------- تفعيل RLS ----------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE automations ENABLE ROW LEVEL SECURITY;

CREATE POLICY p_profiles_self ON profiles FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY p_profiles_team ON profiles FOR SELECT USING (
  EXISTS (SELECT 1 FROM workspace_members a JOIN workspace_members b ON a.workspace_id=b.workspace_id
          WHERE a.user_id = auth.uid() AND b.user_id = profiles.id));
CREATE POLICY p_ws_read ON workspaces FOR SELECT USING (public.is_member(id));
CREATE POLICY p_ws_ins ON workspaces FOR INSERT WITH CHECK (true);
CREATE POLICY p_ws_upd ON workspaces FOR UPDATE USING (public.can_admin(id));
CREATE POLICY p_wm_read ON workspace_members FOR SELECT USING (public.is_member(workspace_id));
CREATE POLICY p_wm_ins ON workspace_members FOR INSERT WITH CHECK (user_id = auth.uid() OR public.can_admin(workspace_id));
CREATE POLICY p_wm_upd ON workspace_members FOR UPDATE USING (public.can_admin(workspace_id));
CREATE POLICY p_wm_del ON workspace_members FOR DELETE USING (public.can_admin(workspace_id) AND role <> 'owner');
CREATE POLICY p_acc_sel ON social_accounts FOR SELECT USING (public.is_member(workspace_id) AND deleted_at IS NULL);
CREATE POLICY p_acc_ins ON social_accounts FOR INSERT WITH CHECK (public.can_manage(workspace_id));
CREATE POLICY p_acc_upd ON social_accounts FOR UPDATE USING (public.can_manage(workspace_id));
CREATE POLICY p_acc_del ON social_accounts FOR DELETE USING (public.can_admin(workspace_id));
CREATE POLICY p_grp_all ON account_groups FOR ALL USING (public.is_member(workspace_id)) WITH CHECK (public.can_manage(workspace_id));
CREATE POLICY p_agm_sel ON account_group_members FOR SELECT USING (
  EXISTS (SELECT 1 FROM account_groups g WHERE g.id=group_id AND public.is_member(g.workspace_id)));
CREATE POLICY p_agm_w ON account_group_members FOR ALL USING (
  EXISTS (SELECT 1 FROM account_groups g WHERE g.id=group_id AND public.can_manage(g.workspace_id)));
CREATE POLICY p_camp_sel ON campaigns FOR SELECT USING (public.is_member(workspace_id) AND deleted_at IS NULL);
CREATE POLICY p_camp_ins ON campaigns FOR INSERT WITH CHECK (public.can_manage(workspace_id));
CREATE POLICY p_camp_upd ON campaigns FOR UPDATE USING (public.can_manage(workspace_id));
CREATE POLICY p_camp_del ON campaigns FOR DELETE USING (public.can_admin(workspace_id));
CREATE POLICY p_ca_sel ON campaign_accounts FOR SELECT USING (
  EXISTS (SELECT 1 FROM campaigns c WHERE c.id=campaign_id AND public.is_member(c.workspace_id)));
CREATE POLICY p_ca_w ON campaign_accounts FOR ALL USING (
  EXISTS (SELECT 1 FROM campaigns c WHERE c.id=campaign_id AND public.can_manage(c.workspace_id)));
CREATE POLICY p_posts_sel ON posts FOR SELECT USING (public.is_member(workspace_id) AND deleted_at IS NULL);
CREATE POLICY p_posts_ins ON posts FOR INSERT WITH CHECK (public.can_write(workspace_id));
CREATE POLICY p_posts_upd ON posts FOR UPDATE USING (public.can_write(workspace_id));
CREATE POLICY p_posts_del ON posts FOR DELETE USING (public.can_write(workspace_id));
CREATE POLICY p_pa_sel ON post_accounts FOR SELECT USING (
  EXISTS (SELECT 1 FROM posts p WHERE p.id=post_id AND public.is_member(p.workspace_id)));
CREATE POLICY p_pa_w ON post_accounts FOR ALL USING (
  EXISTS (SELECT 1 FROM posts p WHERE p.id=post_id AND public.can_write(p.workspace_id)));
CREATE POLICY p_jobs_sel ON jobs FOR SELECT USING (public.is_member(workspace_id));
CREATE POLICY p_jobs_ins ON jobs FOR INSERT WITH CHECK (public.can_write(workspace_id));
CREATE POLICY p_jobs_upd ON jobs FOR UPDATE USING (public.can_write(workspace_id));
CREATE POLICY p_ja_sel ON job_attempts FOR SELECT USING (
  EXISTS (SELECT 1 FROM jobs j WHERE j.id=job_id AND public.is_member(j.workspace_id)));
CREATE POLICY p_ja_ins ON job_attempts FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM jobs j WHERE j.id=job_id AND public.can_write(j.workspace_id)));
CREATE POLICY p_notif_sel ON notifications FOR SELECT USING (public.is_member(workspace_id));
CREATE POLICY p_notif_ins ON notifications FOR INSERT WITH CHECK (public.is_member(workspace_id));
CREATE POLICY p_notif_upd ON notifications FOR UPDATE USING (public.is_member(workspace_id));
CREATE POLICY p_err_sel ON errors FOR SELECT USING (public.is_member(workspace_id));
CREATE POLICY p_err_ins ON errors FOR INSERT WITH CHECK (public.is_member(workspace_id));
CREATE POLICY p_err_upd ON errors FOR UPDATE USING (public.can_write(workspace_id));
CREATE POLICY p_an_sel ON analytics_daily FOR SELECT USING (public.is_member(workspace_id));
CREATE POLICY p_an_w ON analytics_daily FOR ALL USING (public.can_write(workspace_id));
CREATE POLICY p_audit_sel ON audit_logs FOR SELECT USING (public.is_member(workspace_id));
CREATE POLICY p_audit_ins ON audit_logs FOR INSERT WITH CHECK (public.is_member(workspace_id));
CREATE POLICY p_auto_all ON automations FOR ALL USING (public.is_member(workspace_id)) WITH CHECK (public.can_manage(workspace_id));

-- ---------- Realtime ----------
ALTER PUBLICATION supabase_realtime ADD TABLE jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE campaigns;
