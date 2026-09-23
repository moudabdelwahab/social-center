// ============================================================
// Supabase Edge Function: meta-oauth-callback  (verify_jwt = false)
// تعيد Meta توجيه المتصفح هنا بعد التفويض.
// state أحادي الاستخدام → رمز طويل → اكتشاف (صفحات + إنستغرام
// أعمال + حسابات إعلانية) → اشتراك كل صفحة في Webhook التطبيق
// (/subscribed_apps) → تخزين آمن → تحويل إلى الواجهة.
// الرموز لا تظهر للواجهة ولا تُسجَّل إطلاقًا.
// ============================================================
import { createClient } from 'jsr:@supabase/supabase-js@2';

const META_APP_ID = Deno.env.get('META_APP_ID') ?? '';
const META_APP_SECRET = Deno.env.get('META_APP_SECRET') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const FRONTEND = Deno.env.get('FRONTEND_URL') ?? 'https://social.md3.in';
const GRAPH = 'https://graph.facebook.com/v26.0';
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/meta-oauth-callback`;

const SCOPES_LIST = ['pages_show_list', 'pages_manage_posts', 'pages_read_engagement', 'read_insights', 'instagram_basic', 'instagram_content_publish', 'ads_read'];
const WEBHOOK_FIELDS = 'feed,messages'; // حقول اشتراك الصفحة في التطبيق

/** تحويل المتصفح إلى الواجهة بنتيجة غير حساسة فقط */
const go = (params: Record<string, string>) =>
  Response.redirect(`${FRONTEND}/pages/accounts.html?${new URLSearchParams(params)}`, 302);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ============================================================
// تسجيل آمن — يُسجَّل فقط: حالة HTTP + كود/نوع/رسالة Meta + fbtrace_id.
// لا يُسجَّل إطلاقًا: أي Token، أو App Secret، أو authorization code،
// أو ترويسة Authorization، أو أي URL (لأن روابط Graph تحمل الرمز).
// ============================================================
type MetaErr = Error & { status?: number; code?: number; subcode?: number; mtype?: string; fbtrace?: string };

function logMeta(stage: string, status: number, data: unknown) {
  const e = (data as { error?: Record<string, unknown> } | null)?.error ?? {};
  console.error('[oauth-callback] meta_error ' + JSON.stringify({
    stage,
    http_status: status,
    meta_code: e.code ?? null,
    meta_subcode: e.error_subcode ?? null,
    meta_type: e.type ?? null,
    meta_message: e.message ?? null,
    fbtrace_id: e.fbtrace_id ?? null,
  }));
}

function metaError(stage: string, status: number, data: unknown): MetaErr {
  const e = (data as { error?: Record<string, unknown> } | null)?.error ?? {};
  const err = new Error(String(e.message ?? `graph_http_${status}`)) as MetaErr;
  err.status = status;
  err.code = e.code as number | undefined;
  err.subcode = e.error_subcode as number | undefined;
  err.mtype = e.type as string | undefined;
  err.fbtrace = e.fbtrace_id as string | undefined;
  err.name = `MetaError(${stage})`;
  return err;
}

/** طلب Graph بـGET — يرمي MetaErr مع تسجيل آمن عند الفشل */
async function graphGet(stage: string, path: string, params: Record<string, string>) {
  const res = await fetch(`${GRAPH}${path}?${new URLSearchParams(params)}`);
  const data = await res.json().catch(() => null);
  // Meta قد تُعيد 200 مع حقل error في بعض الحالات — نتعامل مع الحالتين
  if (!res.ok || (data as { error?: unknown } | null)?.error) {
    logMeta(stage, res.status, data);
    throw metaError(stage, res.status, data);
  }
  return data;
}

/** صفحة نتائج مُرقّمة — الرابط نفسه يحمل الرمز فلا يُسجَّل أبدًا */
async function graphPage(stage: string, fullUrl: string) {
  const res = await fetch(fullUrl);
  const data = await res.json().catch(() => null);
  if (!res.ok || (data as { error?: unknown } | null)?.error) {
    logMeta(stage, res.status, data);
    throw metaError(stage, res.status, data);
  }
  return data;
}

/** تسجيل مرحلة تشخيصية آمنة — أرقام وأسماء فقط، بلا أي رمز */
function logStage(stage: string, data: Record<string, unknown>) {
  console.log('[oauth-callback] ' + stage + ' ' + JSON.stringify(data));
}

/** إخفاء وسط المعرّف: 8443…5218 */
const maskId = (id: string) => (id.length > 8 ? `${id.slice(0, 4)}…${id.slice(-4)}` : id);

/** الصلاحيات الممنوحة على مستوى صفحة بعينها */
const PAGE_SCOPES = [
  'pages_show_list', 'pages_manage_posts', 'pages_read_engagement',
  'pages_manage_metadata', 'pages_manage_engagement', 'pages_messaging',
  'pages_read_user_content',
];

/**
 * اكتشاف الصفحات من granular_scopes.
 *
 * مع Facebook Login for Business تُمنح الصلاحيات لصفحات بعينها، و/me/accounts
 * تُعيد {"data":[]} لأن المستخدم لا يحمل دورًا كلاسيكيًا على الصفحة. المصدر
 * الموثوق لما وافق عليه المستخدم فعلًا هو granular_scopes[].target_ids داخل
 * debug_token، ثم نقرأ كل صفحة بمعرّفها ونطلب رمزها.
 *
 * نستخدم App Access Token (app_id|app_secret) لا رمز المستخدم، لأن debug_token
 * برمز المستخدم لا ينجح إلا لمطوّري التطبيق أنفسهم.
 */
async function pagesFromGranularScopes(userToken: string): Promise<Record<string, unknown>[]> {
  let dbg;
  try {
    dbg = await graphGet('debug_token', '/debug_token', {
      input_token: userToken,
      access_token: `${META_APP_ID}|${META_APP_SECRET}`,
    });
  } catch { return []; }

  const granular = (dbg?.data?.granular_scopes ?? []) as { scope: string; target_ids?: string[] }[];
  const byScope = new Map<string, Set<string>>();
  for (const g of granular) {
    if (g.target_ids?.length) byScope.set(g.scope, new Set(g.target_ids));
  }
  const ids = new Set<string>();
  for (const sc of PAGE_SCOPES) for (const id of byScope.get(sc) ?? []) ids.add(id);

  logStage('granular_scopes', {
    scopes_with_targets: [...byScope.keys()],
    page_ids_found: ids.size,
    page_ids_masked: [...ids].map(maskId),
  });
  if (!ids.size) return [];

  const has = (sc: string, id: string) => byScope.get(sc)?.has(id) ?? false;
  const out: Record<string, unknown>[] = [];
  for (const id of ids) {
    try {
      // access_token هنا هو Page Access Token الذي تُعيده Meta لهذه الصفحة
      const pg = await graphGet('page_node', `/${id}`, {
        fields: 'id,name,username,followers_count,fan_count,access_token,' +
                'instagram_business_account{id,username,name,profile_picture_url}',
        access_token: userToken,
      });
      // tasks غير موجودة على عقدة الصفحة — نشتقّها من الصلاحيات الممنوحة لها
      const tasks: string[] = [];
      if (has('pages_manage_posts', id)) tasks.push('CREATE_CONTENT');
      if (has('pages_read_engagement', id)) tasks.push('ANALYZE');
      if (has('pages_manage_engagement', id)) tasks.push('MODERATE');
      if (has('pages_messaging', id)) tasks.push('MESSAGING');
      out.push({
        id: pg.id, name: pg.name, access_token: pg.access_token,
        tasks, followers: pg.followers_count ?? pg.fan_count ?? 0, username: pg.username ?? null,
        avatar_url: `${GRAPH}/${pg.id}/picture?type=square&width=160&height=160`,
        source: 'granular_scopes',
        instagram: pg.instagram_business_account
          ? {
              id: pg.instagram_business_account.id,
              username: pg.instagram_business_account.username ?? null,
              name: pg.instagram_business_account.name ?? null,
              avatar_url: pg.instagram_business_account.profile_picture_url ?? null,
            }
          : null,
      });
    } catch { /* سُجّل في graphGet — نكمل ببقية الصفحات */ }
  }
  return out;
}

/** اشتراك صفحة في Webhook التطبيق — الخطوة الإلزامية التي لا يغني عنها تفعيل الحقول في لوحة Meta */
async function subscribePage(pageId: string, pageToken: string): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`${GRAPH}/${pageId}/subscribed_apps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ subscribed_fields: WEBHOOK_FIELDS, access_token: pageToken }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || (data as { success?: boolean } | null)?.success !== true) {
      logMeta('subscribe_page', res.status, data);
      return { ok: false, error: String((data as { error?: { message?: string } } | null)?.error?.message ?? `http_${res.status}`) };
    }
    return { ok: true };
  } catch (e) {
    console.error('[oauth-callback] page subscribe exception:', (e as Error).message);
    return { ok: false, error: (e as Error).message };
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET') return new Response('Method Not Allowed', { status: 405 });
  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const metaError_ = url.searchParams.get('error');
  const deniedScopes = url.searchParams.get('denied_scopes'); // صلاحيات رفضها المستخدم

  // المستخدم ألغى التفويض من نافذة Meta
  if (metaError_) return go({ meta: 'cancelled' });
  if (!code || !state) return go({ meta: 'error', reason: 'missing_params' });

  // إعدادات ناقصة → نُبلغ بوضوح بدل فشل غامض (بلا كشف أي قيمة)
  if (!META_APP_ID || !META_APP_SECRET) {
    console.error('[oauth-callback] config missing ' + JSON.stringify({
      META_APP_ID: META_APP_ID ? 'set' : 'missing',
      META_APP_SECRET: META_APP_SECRET ? 'set' : 'missing',
    }));
    return go({ meta: 'error', reason: 'config' });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  try {
    // 1) التحقق من state: موجود، غير مستخدم، غير منتهٍ — ثم يُستهلك فورًا
    //    الاستهلاك قبل التبديل يضمن أن الـcode لا يُبدَّل إلا مرة واحدة.
    const { data: st } = await admin.from('oauth_states').select('*').eq('state', state).maybeSingle();
    if (!st || st.used_at || new Date(st.expires_at) < new Date()) {
      return go({ meta: 'error', reason: 'invalid_state' });
    }
    const { data: claimed } = await admin.from('oauth_states')
      .update({ used_at: new Date().toISOString() })
      .eq('state', state).is('used_at', null).select('state');
    // سباق بين طلبين بنفس الـstate: الخاسر لا يُبدّل الـcode إطلاقًا
    if (!claimed?.length) return go({ meta: 'error', reason: 'invalid_state' });

    // 2) تبديل الكود برمز قصير (الخادم فقط — App Secret لا يغادر الدالة)
    //    redirect_uri هنا مطابق حرفيًا لِما أُرسل في رابط التفويض (نفس الثابت في meta-oauth-start)
    let userToken: string;
    let expiresAt: string | null = null;
    try {
      const shortTok = await graphGet('token_exchange', '/oauth/access_token', {
        client_id: META_APP_ID, client_secret: META_APP_SECRET, redirect_uri: REDIRECT_URI, code,
      });

      // 3) تحويله لرمز طويل الأمد (~60 يومًا)
      const longTok = await graphGet('long_lived_exchange', '/oauth/access_token', {
        grant_type: 'fb_exchange_token', client_id: META_APP_ID,
        client_secret: META_APP_SECRET, fb_exchange_token: shortTok.access_token,
      });
      userToken = longTok.access_token as string;
      expiresAt = longTok.expires_in
        ? new Date(Date.now() + Number(longTok.expires_in) * 1000).toISOString() : null;
    } catch {
      // سُجّل بالفعل بتفاصيل Meta الآمنة في graphGet
      return go({ meta: 'error', reason: 'exchange_failed' });
    }

    // 4) هوية مستخدم Meta + الصلاحيات الممنوحة فعلًا (نرصد ما رُفض)
    let me: { id: string; name?: string };
    try {
      me = await graphGet('me', '/me', { fields: 'id,name', access_token: userToken });
    } catch (e) {
      return go({ meta: 'error', reason: (e as MetaErr).code === 190 ? 'token_invalid' : 'graph_failed' });
    }

    let grantedScopes: string[] = [];
    try {
      const perms = await graphGet('me_permissions', '/me/permissions', { access_token: userToken });
      grantedScopes = (perms?.data ?? []).filter((p: { status: string }) => p.status === 'granted').map((p: { permission: string }) => p.permission);
    } catch { /* عدم القدرة على قراءة الصلاحيات لا يوقف التدفق */ }

    // 5) الصفحات (ترقيم كامل) + إنستغرام الأعمال المرتبط بكل صفحة
    const pages: Record<string, unknown>[] = [];
    let pagedCalls = 0;
    let next: string | null = `${GRAPH}/me/accounts?${new URLSearchParams({
      fields: 'id,name,access_token,tasks,followers_count,username,instagram_business_account{id,username,name,profile_picture_url}',
      limit: '100', access_token: userToken,
    })}`;
    while (next) {
      let data;
      try {
        data = await graphPage('me_accounts', next);
      } catch (e) {
        if ((e as MetaErr).code === 190) return go({ meta: 'error', reason: 'token_invalid' });
        break; // نكمل بما وصل بدل إسقاط التدفق كله
      }
      for (const p of data?.data ?? []) {
        pages.push({
          id: p.id, name: p.name, access_token: p.access_token,
          tasks: p.tasks ?? [], followers: p.followers_count ?? 0, username: p.username ?? null,
          // رابط صورة عام وثابت لا ينتهي (عكس روابط CDN المؤقتة في picture.url)
          avatar_url: `${GRAPH}/${p.id}/picture?type=square&width=160&height=160`,
          instagram: p.instagram_business_account
            ? {
                id: p.instagram_business_account.id,
                username: p.instagram_business_account.username ?? null,
                name: p.instagram_business_account.name ?? null,
                avatar_url: p.instagram_business_account.profile_picture_url ?? null,
              }
            : null,
        });
      }
      next = data?.paging?.next ?? null;
      pagedCalls++;
    }
    const fromMeAccounts = pages.length;

    // 5b) الصفحات الممنوحة لصفحات بعينها (Login for Business) — لا تظهر في
    //     /me/accounts إطلاقًا. ندمجها مع ما سبق ونمنع التكرار بالمعرّف.
    const seen = new Set(pages.map((p) => String(p.id)));
    for (const gp of await pagesFromGranularScopes(userToken)) {
      if (!seen.has(String(gp.id))) { pages.push(gp); seen.add(String(gp.id)); }
    }

    logStage('pages_discovery', {
      me_accounts_pages: fromMeAccounts,
      me_accounts_pagination_calls: pagedCalls,
      granular_scope_pages: pages.length - fromMeAccounts,
      merged_total: pages.length,
      page_ids_masked: pages.map((p) => maskId(String(p.id))),
      page_names: pages.map((p) => String(p.name ?? '')),
      with_page_token: pages.filter((p) => !!p.access_token).length,
      with_instagram: pages.filter((p) => !!p.instagram).length,
    });

    // 6) الحسابات الإعلانية المتاحة للمستخدم/النشاط — عبر ads_read
    const adAccounts: Record<string, unknown>[] = [];
    if (grantedScopes.includes('ads_read')) {
      let adNext: string | null = `${GRAPH}/me/adaccounts?${new URLSearchParams({
        fields: 'id,account_id,name,account_status,currency,timezone_name', limit: '100', access_token: userToken,
      })}`;
      while (adNext) {
        let data;
        try {
          data = await graphPage('me_adaccounts', adNext);
        } catch { break; }
        for (const a of data?.data ?? []) {
          adAccounts.push({
            id: a.id, name: a.name ?? a.account_id,
            account_status: a.account_status, currency: a.currency ?? null, timezone: a.timezone_name ?? null,
          });
        }
        adNext = data?.paging?.next ?? null;
      }
    }

    // 7) اشتراك كل صفحة في Webhook التطبيق (إلزامي — تفعيل الحقول في اللوحة لا يكفي)
    let subscribedCount = 0;
    for (const p of pages) {
      const r = await subscribePage(String(p.id), String(p.access_token));
      p.webhook_subscribed = r.ok;
      if (r.ok) subscribedCount++;
      else p.webhook_error = r.error;
      await sleep(250); // مراعاة حدود معدل الطلبات
    }

    // 8) حفظ/تحديث الاتصال — الرموز في meta_connections المقفل (service-role فقط)
    const { error: connErr } = await admin.from('meta_connections').upsert({
      workspace_id: st.workspace_id, user_id: st.user_id,
      meta_user_id: me.id, meta_user_name: me.name ?? null,
      user_token: userToken, pages, ad_accounts: adAccounts,
      scopes: grantedScopes.length ? grantedScopes : SCOPES_LIST,
      status: 'active', token_expires_at: expiresAt,
      last_sync_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: 'workspace_id,meta_user_id' });
    if (connErr) { console.error('[oauth-callback] connection upsert:', connErr.code, connErr.message); return go({ meta: 'error', reason: 'db' }); }

    // 9) ربط الأصول بجدول social_accounts (بيانات عرض فقط — بلا رموز)
    //    يعتمد على uq_social_accounts_external كفهرس فريد غير جزئي (انظر الهجرة)
    const tasksToPerms = (tasks: string[]) => ({
      publish: tasks.includes('MANAGE') || tasks.includes('CREATE_CONTENT'),
      readData: true,
      insights: tasks.includes('ANALYZE') || tasks.includes('MANAGE'),
      comments: tasks.includes('MODERATE') || tasks.includes('MANAGE'),
      messages: tasks.includes('MESSAGING') || tasks.includes('MANAGE'),
    });
    let linked = 0;
    const linkErrors: string[] = [];
    const upsertAsset = async (row: Record<string, unknown>, label: string) => {
      if (!row.external_id) return; // بلا معرّف خارجي لا يصح ON CONFLICT
      // إعادة الربط تُحيي أصلًا كان مفصولًا: بدون هذا يبقى deleted_at قديمًا
      // فيُحدَّث الصف بنجاح ويظل مخفيًا عن الواجهة.
      const { error } = await admin.from('social_accounts')
        .upsert({ ...row, deleted_at: null }, { onConflict: 'workspace_id,platform,external_id' });
      if (error) { linkErrors.push(`${label}:${error.code}`); console.error('[oauth-callback] asset upsert:', label, error.code, error.message); }
      else linked++;
    };

    for (const p of pages) {
      await upsertAsset({
        workspace_id: st.workspace_id, platform: 'meta', external_id: String(p.id),
        name: String(p.name ?? 'صفحة'), handle: p.username ? `@${p.username}` : null,
        account_type: 'page', status: 'connected', followers: Number(p.followers) || 0,
        avatar_url: (p.avatar_url as string) ?? null,
        permissions: tasksToPerms((p.tasks as string[]) ?? []),
        last_sync_at: new Date().toISOString(),
      }, 'page');

      const ig = p.instagram as { id: string; username: string | null; name: string | null; avatar_url: string | null } | null;
      if (ig?.id) {
        await upsertAsset({
          workspace_id: st.workspace_id, platform: 'instagram', external_id: String(ig.id),
          name: ig.name || ig.username || 'حساب إنستغرام', handle: ig.username ? `@${ig.username}` : null,
          account_type: 'business', status: 'connected',
          avatar_url: ig.avatar_url ?? null,
          permissions: { publish: grantedScopes.includes('instagram_content_publish'), readData: true, insights: grantedScopes.includes('read_insights'), comments: true, messages: false },
          last_sync_at: new Date().toISOString(),
        }, 'instagram');
      }
    }
    // الحسابات الإعلانية كأصول للعرض/التحليلات
    for (const a of adAccounts) {
      await upsertAsset({
        workspace_id: st.workspace_id, platform: 'meta', external_id: String(a.id),
        name: `إعلانات: ${String(a.name ?? a.id)}`, handle: null,
        account_type: 'ad_account', status: 'connected',
        permissions: { publish: false, readData: true, insights: true, comments: false, messages: false },
        last_sync_at: new Date().toISOString(),
      }, 'adaccount');
    }

    logStage('asset_persist', {
      pages_in: pages.length, ad_accounts_in: adAccounts.length,
      rows_upserted: linked, db_errors: linkErrors,
    });

    // 10) تنبيه + سجل تدقيق — لا يُفشلان الربط بعد نجاح الحفظ
    //     ملاحظة: بانية PostgREST ليست Promise كاملة (لا تملك .catch) — نستخدم await ونفحص error
    const notes: string[] = [`${linked} أصلًا`, `${subscribedCount}/${pages.length} صفحة مشتركة بالـWebhook`, `${adAccounts.length} حسابًا إعلانيًا`];
    if (deniedScopes) notes.push('رفضتَ بعض الصلاحيات — بعض الميزات قد لا تعمل');
    try {
      const { error: notifErr } = await admin.from('notifications').insert({
        workspace_id: st.workspace_id, user_id: st.user_id, type: 'account_connected',
        title: 'تم ربط حساب Meta', body: notes.join(' · '),
      });
      if (notifErr) console.error('[oauth-callback] notification insert:', notifErr.code, notifErr.message);
    } catch (e) { console.error('[oauth-callback] notification exception:', (e as Error).message); }

    try {
      const { error: auditErr } = await admin.from('audit_logs').insert({
        workspace_id: st.workspace_id, user_id: st.user_id,
        action: 'meta_oauth_connected', entity_type: 'meta_connection', entity_id: me.id,
        metadata: { assets: linked, pages: pages.length, webhook_subscribed: subscribedCount, ad_accounts: adAccounts.length, denied: deniedScopes ?? null, link_errors: linkErrors },
      });
      if (auditErr) console.error('[oauth-callback] audit insert:', auditErr.code, auditErr.message);
    } catch (e) { console.error('[oauth-callback] audit exception:', (e as Error).message); }

    return go({
      meta: 'connected',
      assets: String(linked),
      pages: String(pages.length),
      webhook: `${subscribedCount}/${pages.length}`,
      ads: String(adAccounts.length),
    });
  } catch (e) {
    // خطأ غير متوقع خارج تبديل الرمز — لا نُسمّيه exchange_failed حتى لا يُضلّل التشخيص
    console.error('[oauth-callback] unexpected:', (e as Error).name, (e as Error).message);
    return go({ meta: 'error', reason: 'internal' });
  }
});
