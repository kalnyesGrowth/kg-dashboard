// ── Router ─────────────────────────────────────────────────────
import { getSession, clearSession } from './utils.js';
import {
  loginView, clientsView, clientDetailView, clientSelfView,
  reportsView, settingsView,
  leadsView, leadDetailView,
  contactsView, contactDetailView,
  ticketsView,
  sequencesView, sequenceDetailView,
} from './views.js';

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

  if (hash === '#leads') { leadsView(app); return; }

  const leadMatch = hash.match(/^#lead\/(.+)$/);
  if (leadMatch) { leadDetailView(app, leadMatch[1]); return; }

  if (hash === '#contacts') { contactsView(app); return; }

  const contactMatch = hash.match(/^#contact\/(.+)$/);
  if (contactMatch) { contactDetailView(app, contactMatch[1]); return; }

  if (hash === '#tickets')    { ticketsView(app);    return; }
  if (hash === '#sequences')  { sequencesView(app);  return; }

  const seqMatch = hash.match(/^#sequence\/(.+)$/);
  if (seqMatch) { sequenceDetailView(app, seqMatch[1]); return; }

  if (hash === '#reports')  { reportsView(app);  return; }
  if (hash === '#settings') { settingsView(app); return; }

  clientsView(app);
}

window.addEventListener('hashchange', route);
window.addEventListener('DOMContentLoaded', route);

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data?.type === 'cha-ching') {
      import('./views.js').then(m => { if (m.playChaChing) m.playChaChing(); });
    }
  });
}

if (new URLSearchParams(location.search).get('cha-ching')) {
  window.addEventListener('load', () => {
    import('./views.js').then(m => { if (m.playChaChing) m.playChaChing(); });
    history.replaceState(null, '', location.pathname + location.hash);
  });
}

// ── Pull-to-refresh ───────────────────────────────────────────
(function() {
  let startY = 0, pulling = false, dist = 0;
  const threshold = 80;

  const indicator = document.createElement('div');
  indicator.className = 'ptr-indicator';
  indicator.innerHTML = '<div class="ptr-spinner"></div>';
  document.body.appendChild(indicator);

  document.addEventListener('touchstart', function(e) {
    if (window.scrollY > 5) return;
    startY = e.touches[0].pageY;
    pulling = true;
    dist = 0;
  }, { passive: true });

  document.addEventListener('touchmove', function(e) {
    if (!pulling) return;
    dist = Math.max(0, e.touches[0].pageY - startY);
    if (dist > 0 && window.scrollY <= 0) {
      var pct = Math.min(dist / threshold, 1);
      var yOffset = Math.min(dist * 0.4, 50);
      indicator.classList.add('pulling');
      indicator.classList.remove('refreshing');
      indicator.style.transform = 'translateX(-50%) translateY(' + (yOffset - 20) + 'px)';
      indicator.querySelector('.ptr-spinner').style.transform = 'rotate(' + (pct * 360) + 'deg)';
    }
  }, { passive: true });

  document.addEventListener('touchend', function() {
    if (!pulling) return;
    pulling = false;
    if (dist >= threshold && window.scrollY <= 0) {
      indicator.classList.remove('pulling');
      indicator.classList.add('refreshing');
      indicator.style.transform = '';
      setTimeout(function() { location.reload(); }, 600);
    } else {
      indicator.classList.remove('pulling');
      indicator.style.transform = '';
    }
    dist = 0;
  }, { passive: true });
})();
