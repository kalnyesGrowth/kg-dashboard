// ── Shared utilities ───────────────────────────────────────────
import { AGENCY_CREDS, CLIENT_CREDS } from './data.js';

// ── Supabase availability check ────────────────────────────────
// Returns true once supabase/client.js has real credentials
let _sb = null;
async function getSB() {
  if (_sb) return _sb;
  try {
    const mod = await import('./supabase/client.js');
    if (mod.SUPABASE_URL && !mod.SUPABASE_URL.startsWith('YOUR_')) {
      _sb = mod.supabase;
    }
  } catch (_) {}
  return _sb;
}

// ── Auth ───────────────────────────────────────────────────────
export async function checkLogin(email, password) {
  const sb = await getSB();

  if (sb) {
    // ── Real Supabase auth ──────────────────────────────────────
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error || !data.session) return null;
    const meta = data.user.user_metadata || {};
    const role = meta.role || 'agency';
    return { role, clientId: meta.client_id || null };
  }

  // ── Fallback: hardcoded mock auth (remove once Supabase is live) ──
  if (email === AGENCY_CREDS.email && password === AGENCY_CREDS.password) {
    setSession({ role: 'agency' });
    return { role: 'agency' };
  }
  for (const [clientId, creds] of Object.entries(CLIENT_CREDS)) {
    if (email === creds.email && password === creds.password) {
      setSession({ role: 'client', clientId });
      return { role: 'client', clientId };
    }
  }
  return null;
}

export async function getSession() {
  const sb = await getSB();
  if (sb) {
    const { data } = await sb.auth.getSession();
    if (!data.session) return null;
    const meta = data.session.user.user_metadata || {};
    return { role: meta.role || 'agency', clientId: meta.client_id || null };
  }
  // Fallback
  try { return JSON.parse(sessionStorage.getItem('kg_session') || 'null'); } catch { return null; }
}

export function setSession(data) { sessionStorage.setItem('kg_session', JSON.stringify(data)); }

export async function clearSession() {
  const sb = await getSB();
  if (sb) await sb.auth.signOut();
  sessionStorage.removeItem('kg_session');
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

// ── Bottom nav ─────────────────────────────────────────────────
export function bottomNavHTML(active) {
  return `
    <nav class="bottom-nav">
      <button class="nav-item${active==='clients'?' active':''}" data-nav="clients">
        <span>👥</span><span>Clients</span>
      </button>
      <button class="nav-item${active==='reports'?' active':''}" data-nav="reports">
        <span>📊</span><span>Reports</span>
      </button>
      <button class="nav-item${active==='settings'?' active':''}" data-nav="settings">
        <span>⚙️</span><span>Settings</span>
      </button>
    </nav>`;
}

export function wireNav() {
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => { location.hash = '#' + btn.dataset.nav; });
  });
}
