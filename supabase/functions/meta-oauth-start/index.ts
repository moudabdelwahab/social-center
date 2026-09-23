// ============================================================
// Supabase Edge Function: meta-oauth-start  (verify_jwt = true)
// يستدعيها المستخدم المسجَّل من الواجهة → تنشئ state أحادي
// الاستخدام في oauth_states → تعيد رابط تفويض Meta.
// لا تحتوي أي سرّ، ولا تعيد أي Token — الرابط فقط.
// CORS: يسمح فقط بالـProduction origin (https://social.md3.in)
// ويتعامل مع preflight (OPTIONS) صراحةً. لا أسرار في الترويسات.
// ============================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

const META_APP_ID = Deno.env.get('META_APP_ID') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
// نفس التعبير حرفيًا في meta-oauth-callback — تطابق redirect_uri شرطٌ لنجاح التبديل
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/meta-oauth-callback`;

// ---------- CORS: الـorigin الإنتاجي فقط — لا wildcard ----------
const ALLOWED_ORIGIN = Deno.env.get('FRONTEND_URL') ?? 'https://social.md3.in';

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? '';
  // لا نعيد إلا الـorigin المطابق تمامًا؛ أي origin آخر لا يحصل على السماح
  const allow = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

const json = (req: Request, body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), 'Content-Type': 'application/json; charset=utf-8' },
  });

// الصلاحيات — مطابقة لوظائف Mad3oom الفعلية فقط، بلا زيادات
const SCOPES = [
  'pages_show_list',
  'pages_manage_posts',
  'pages_read_engagement',
  'read_insights',
  'instagram_basic',
  'instagram_content_publish',
  'ads_read',
].join(',');

Deno.serve(async (req: Request) => {
  // ---------- preflight: يُرد قبل أي منطق ----------
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(req) });
  }

  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);

  // 1) مصادقة المستخدم من JWT (verify_jwt=true تحقق شكلي، وهنا نتحقق فعليًا)
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json(req, { error: 'unauthenticated' }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userData?.user) return json(req, { error: 'unauthenticated' }, 401);
  const userId = userData.user.id;

  // 2) عضوية الـWorkspace والدور (manager فما فوق يربط حسابات)
  let workspaceId = '';
  try { workspaceId = (await req.json())?.workspace_id ?? ''; } catch { return json(req, { error: 'bad_request' }, 400); }
  if (!workspaceId) return json(req, { error: 'workspace_required' }, 400);

  const { data: membership } = await admin
    .from('workspace_members').select('role')
    .eq('workspace_id', workspaceId).eq('user_id', userId).maybeSingle();
  if (!membership) return json(req, { error: 'forbidden' }, 403);
  if (!['owner', 'admin', 'manager'].includes(membership.role)) {
    return json(req, { error: 'insufficient_role' }, 403);
  }

  // 3) state أحادي الاستخدام مرتبط بالمستخدم والـWorkspace
  const state = crypto.randomUUID() + '.' + crypto.randomUUID();
  const { error: stErr } = await admin.from('oauth_states').insert({ state, user_id: userId, workspace_id: workspaceId });
  if (stErr) { console.error('[oauth-start] state insert failed:', stErr.code); return json(req, { error: 'internal' }, 500); }

  // 4) رابط تفويض Meta
  const url = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  url.searchParams.set('client_id', META_APP_ID);
  url.searchParams.set('redirect_uri', REDIRECT_URI);
  url.searchParams.set('state', state);
  url.searchParams.set('scope', SCOPES);
  url.searchParams.set('response_type', 'code');

  return json(req, { url: url.toString() });
});
