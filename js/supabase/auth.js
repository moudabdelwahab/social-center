'use strict';
/* auth.js — مصادقة Supabase: دخول/تسجيل/استعادة/خروج + حارس الجلسة */
const Auth = {
  async session() {
    if (!sb) return null;
    const { data } = await sb.auth.getSession();
    return data?.session || null;
  },

  /* حارس الصفحات المحمية: لا جلسة ← تحويل لتسجيل الدخول */
  async requireAuth() {
    const s = await this.session();
    if (!s) { location.replace('login.html'); throw new Error('unauthenticated'); }
    return s;
  },

  async signIn(email, password) {
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { console.error('[SCC:auth]', error); throw new Error(mapDbError(error)); }
    return data;
  },

  /* التسجيل: Trigger في قاعدة البيانات ينشئ Profile + Workspace + عضوية Owner تلقائيًا */
  async signUp({ name, email, password, workspaceName }) {
    const { data, error } = await sb.auth.signUp({
      email, password,
      options: { data: { full_name: name, workspace_name: workspaceName } }
    });
    if (error) { console.error('[SCC:auth]', error); throw new Error(mapDbError(error)); }
    return data; // data.session قد تكون null إذا كان تأكيد البريد مفعّلًا
  },

  async sendReset(email) {
    const redirectTo = new URL('reset-password.html', location.href).href;
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo });
    if (error) { console.error('[SCC:auth]', error); throw new Error(mapDbError(error)); }
  },

  async updatePassword(newPassword) {
    const { error } = await sb.auth.updateUser({ password: newPassword });
    if (error) { console.error('[SCC:auth]', error); throw new Error(mapDbError(error)); }
  },

  async signOut() {
    try { await sb.auth.signOut(); } catch {}
    localStorage.removeItem('scc_ui_v3'); // تفضيلات واجهة فقط — لا بيانات أعمال في LocalStorage
    location.replace('login.html');
  }
};
