// ── Router ─────────────────────────────────────────────────────
import { getSession, clearSession } from './utils.js';
import { loginView, clientsView, clientDetailView, clientSelfView, reportsView, settingsView } from './views.js';

const app = document.getElementById('app');

async function route() {
  const session = await getSession();
  const hash    = location.hash || '';

  if (!session) { loginView(app); return; }

  // Client role always shows their own dashboard regardless of hash
  if (session.role === 'client') {
    clientSelfView(app, session.clientId);
    return;
  }

  // Agency routing
  if (!hash || hash === '#clients') { clientsView(app); return; }

  const clientMatch = hash.match(/^#client\/(.+)$/);
  if (clientMatch) { clientDetailView(app, clientMatch[1]); return; }

  if (hash === '#reports')  { reportsView(app);  return; }
  if (hash === '#settings') { settingsView(app); return; }

  clientsView(app);
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}
