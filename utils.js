// ── Shared utilities ───────────────────────────────────────────
import { supabase } from './supabase/client.js';

// ── Auth ───────────────────────────────────────────────────────
export async function checkLogin(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.session) return null;
  const appMeta = data.user.app_metadata || {};
  const role = appMeta.role || 'agency';
  return { role, clientId: appMeta.client_id || null };
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  const appMeta = data.session.user.app_metadata || {};
  return { role: appMeta.role || 'agency', clientId: appMeta.client_id || null };
}

export async function clearSession() {
  await supabase.auth.signOut();
}

// ── XSS escape ─────────────────────────────────────────────────
export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
