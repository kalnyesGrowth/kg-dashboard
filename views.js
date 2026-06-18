// ── Views ──────────────────────────────────────────────────────
import { MOCK_CLIENTS, getClient, getAgencySummary, CLIENT_CREDS } from './data.js';
import { checkLogin, clearSession, esc } from './utils.js';
import * as DB from './supabase/db.js';

const CREDS_MAP = CLIENT_CREDS;

const PRESET_COLORS = ['#7C3AED','#0064E0','#0369A1','#0F766E','#059669','#B45309','#BE185D','#DC2626'];

const ZERO_METRICS = {
  revenue:    { today:0, week:0, month:0, all:0 },
  sessions:   { today:0, week:0, month:0, all:0 },
  leads:      { today:0, week:0, month:0, all:0 },
  emails:     { today:0, week:0, month:0, all:0 },
  orders:     { today:0, week:0, month:0, all:0 },
  addToCarts: { today:0, week:0, month:0, all:0 },
};

// Normalize a Supabase client row to the shape views expect
function normalizeClient(c) {
  const auto = String(c.name || '').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return {
    id:           c.id,
    name:         c.name,
    domain:       c.domain || '',
    color:        c.color  || '#0064E0',
    initials:     c.initials || auto,
    plan:         c.plan   || 'Plan',
    niche:        c.niche  || 'service',
    status:       c.status || 'active',
    metrics:      c.metrics      || ZERO_METRICS,
    revenueSeries:c.revenueSeries || { week:[], month:[], all:[] },
    recentOrders: c.recentOrders  || [],
    recentEmails: c.recentEmails  || [],
  };
}

// ── Helpers ────────────────────────────────────────────────────
function fmt(n) {
  if (n >= 1000) return '$' + (n / 1000).toFixed(n % 1000 === 0 ? 0 : 1) + 'k';
  return '$' + n;
}
function num(n) {
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}
function initials(name) {
  return String(name).split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}
function tfLabel(tf) {
  return { today:'Today', week:'This week', month:'This month', all:'All time' }[tf];
}
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
function todayStr() {
  return new Date().toLocaleDateString('en-US', { weekday:'long', month:'long', day:'numeric' });
}

function sparkline(series, color) {
  if (!series || series.length < 2) return '<div style="width:64px;height:24px"></div>';
  const vals = series.map(p => p.revenue);
  const min  = Math.min(...vals), max = Math.max(...vals), rng = max - min || 1;
  const W = 64, H = 24, pad = 2;
  const pts = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * (W - pad * 2);
    const y = pad + (1 - (v - min) / rng) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none">
    <polyline points="${pts}" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

function trendPct(series) {
  if (!series || series.length < 4) return null;
  const half   = Math.floor(series.length / 2);
  const recent = series.slice(-half).reduce((s, p) => s + p.revenue, 0);
  const prev   = series.slice(0, half).reduce((s, p) => s + p.revenue, 0);
  if (prev === 0) return null;
  return Math.round(((recent - prev) / prev) * 100);
}

function trendBadge(pct) {
  if (pct === null) return '';
  const up = pct >= 0;
  return `<span class="${up ? 'trend-up' : 'trend-down'}">${up ? '↑' : '↓'} ${Math.abs(pct)}%</span>`;
}

function eventIcon(type) {
  return { pageview:'👁', session_start:'🔔', lead:'📩', email_capture:'✉️', add_to_cart:'🛒', order:'💰' }[type] || '📡';
}

function timeAgo(ts) {
  const secs = Math.floor((Date.now() - new Date(ts)) / 1000);
  if (secs < 60)   return secs + 's ago';
  if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
  if (secs < 86400)return Math.floor(secs / 3600) + 'h ago';
  return Math.floor(secs / 86400) + 'd ago';
}

function mergeSeries(seriesArrays) {
  const map = {}, order = [];
  for (const series of seriesArrays) {
    for (const pt of series) {
      if (!(pt.date in map)) { map[pt.date] = 0; order.push(pt.date); }
      map[pt.date] += pt.revenue;
    }
  }
  return order.map(date => ({ date, revenue: map[date] }));
}

// ── Charts ─────────────────────────────────────────────────────
const charts = {};
function destroyChart(id) {
  if (id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } return; }
  Object.values(charts).forEach(c => c.destroy());
  Object.keys(charts).forEach(k => delete charts[k]);
}

function renderChart(canvasId, series, color) {
  destroyChart(canvasId);
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  if (!series || !series.length) {
    const wrap = canvas.closest('.chart-wrap');
    if (wrap) wrap.innerHTML = '<div class="empty-state"><div class="es-icon">📊</div><div class="es-text">No data yet</div></div>';
    return;
  }
  charts[canvasId] = new Chart(canvas, {
    type: 'line',
    data: {
      labels: series.map(p => p.date),
      datasets: [{
        data: series.map(p => p.revenue),
        borderColor: color, backgroundColor: color + '15',
        borderWidth: 2, pointRadius: 0, fill: true, tension: 0.4,
      }],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index', intersect: false,
          backgroundColor: '#1A1A1A', titleColor: '#8C9196', bodyColor: '#fff',
          padding: 10, cornerRadius: 6,
          callbacks: { label: ctx => ' $' + ctx.parsed.y.toLocaleString() },
        },
      },
      scales: { x: { display: false }, y: { display: false, beginAtZero: false } },
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
    },
  });
}

// ── Layout ─────────────────────────────────────────────────────
const HAMBURGER = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/></svg>`;
const BACK      = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="12,4 5,10 12,16"/></svg>`;

function buildLayout({ content, active, title = '', backRoute = null, notifCount = 0 }) {
  return `
    <div class="app-layout">
      <div class="drawer-overlay" id="drawer-overlay"></div>
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-logo">
          <div class="sidebar-logo-mark">KG</div>
          <div><div class="sidebar-logo-text">Kalnyesgrowth</div></div>
        </div>
        <nav class="sidebar-nav">
          <div class="nav-section-label">Main</div>
          <button class="nav-link ${active === 'clients'  ? 'active' : ''}" data-nav="clients"><span class="nav-icon">👥</span> Clients</button>
          <button class="nav-link ${active === 'leads'    ? 'active' : ''}" data-nav="leads"><span class="nav-icon">📩</span> Leads <span class="nav-badge" id="leads-badge"></span></button>
          <button class="nav-link ${active === 'contacts' ? 'active' : ''}" data-nav="contacts"><span class="nav-icon">📇</span> Contacts</button>
          <button class="nav-link ${active === 'tickets'  ? 'active' : ''}" data-nav="tickets"><span class="nav-icon">🎫</span> Tickets</button>
          <button class="nav-link ${active === 'sequences' ? 'active' : ''}" data-nav="sequences"><span class="nav-icon">⚡</span> Sequences</button>
          <button class="nav-link ${active === 'reports'  ? 'active' : ''}" data-nav="reports"><span class="nav-icon">📊</span> Reports</button>
          <div class="nav-section-label">Account</div>
          <button class="nav-link ${active === 'settings' ? 'active' : ''}" data-nav="settings"><span class="nav-icon">⚙️</span> Settings</button>
        </nav>
        <div class="sidebar-footer">
          <div class="sidebar-user">
            <div class="sidebar-avatar">KG</div>
            <div class="sidebar-user-name">Kalnyesgrowth</div>
          </div>
          <button class="sidebar-signout" id="sidebar-logout">Sign out</button>
        </div>
      </aside>
      <div class="mobile-header">
        ${backRoute
          ? `<button class="hamburger" id="mobile-back">${BACK}</button>`
          : `<button class="hamburger" id="hamburger">${HAMBURGER}</button>`}
        <div style="flex:1;font-size:0.85rem;font-weight:700;color:rgba(255,255,255,0.9);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:-0.01em">${esc(title)}</div>
        <div class="mobile-actions">
          <button class="mobile-icon-btn" id="mobile-notif" title="Notifications" style="position:relative">🔔<span class="notif-dot" id="mobile-notif-dot" style="display:none"></span></button>
          <button class="mobile-icon-btn" id="mobile-logout" title="Sign out">⏻</button>
        </div>
      </div>
      <main class="main-content">${content}</main>
    </div>`;
}

function wireLayout(appEl, backRoute = null) {
  const sidebar   = document.getElementById('sidebar');
  const overlay   = document.getElementById('drawer-overlay');
  const hamburger = document.getElementById('hamburger');
  const backBtn   = document.getElementById('mobile-back');
  const logout    = () => clearSession().then(() => loginView(appEl));
  const open  = () => { sidebar?.classList.add('open');    overlay?.classList.add('visible'); };
  const close = () => { sidebar?.classList.remove('open'); overlay?.classList.remove('visible'); };
  hamburger?.addEventListener('click', open);
  overlay?.addEventListener('click', close);
  backBtn?.addEventListener('click', () => { location.hash = backRoute; });
  document.querySelectorAll('[data-nav]').forEach(btn =>
    btn.addEventListener('click', () => { close(); location.hash = '#' + btn.dataset.nav; })
  );
  document.getElementById('sidebar-logout')?.addEventListener('click', logout);
  document.getElementById('mobile-logout')?.addEventListener('click', logout);

  // Notification bell
  const notifBtn = document.getElementById('mobile-notif');
  notifBtn?.addEventListener('click', () => toggleNotifDropdown());

  // Load unread notification count
  loadNotifBadges();
}

async function loadNotifBadges() {
  try {
    const count = await DB.countUnreadNotifications();
    const dot = document.getElementById('mobile-notif-dot');
    const badge = document.getElementById('leads-badge');
    if (dot && count > 0) dot.style.display = '';

    const unreadLeads = await DB.countUnreadLeads();
    if (badge && unreadLeads > 0) {
      badge.textContent = unreadLeads;
      badge.style.display = 'inline-block';
    }
  } catch (_) {}
}

async function toggleNotifDropdown() {
  const existing = document.querySelector('.notif-dropdown');
  if (existing) { existing.remove(); return; }

  let notifs = [];
  try { notifs = await DB.fetchNotifications(20); } catch (_) {}

  const dd = document.createElement('div');
  dd.className = 'notif-dropdown';
  dd.innerHTML = `
    <div class="notif-dd-header">
      <div style="font-weight:700;font-size:0.85rem;color:var(--text-primary)">Notifications</div>
      ${notifs.some(n => !n.read) ? `<button class="notif-mark-all" id="notif-mark-all">Mark all read</button>` : ''}
    </div>
    ${notifs.length ? notifs.map(n => `
      <div class="notif-item ${n.read ? '' : 'unread'}" data-id="${esc(n.id)}" data-link="${esc(n.link || '')}">
        <div class="notif-title">${esc(n.title)}</div>
        ${n.body ? `<div class="notif-body">${esc(n.body.length > 80 ? n.body.slice(0, 80) + '...' : n.body)}</div>` : ''}
        <div class="notif-time">${timeAgo(n.created_at)}</div>
      </div>`).join('') : `
      <div class="notif-empty">No notifications yet</div>`}`;

  document.body.appendChild(dd);

  dd.querySelector('#notif-mark-all')?.addEventListener('click', async () => {
    try {
      await DB.markAllNotificationsRead();
      dd.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
      const dot = document.getElementById('mobile-notif-dot');
      if (dot) dot.style.display = 'none';
      dd.querySelector('#notif-mark-all')?.remove();
    } catch (_) {}
  });

  dd.querySelectorAll('.notif-item').forEach(item => {
    item.addEventListener('click', async () => {
      const id = item.dataset.id;
      const link = item.dataset.link;
      if (!item.classList.contains('read-done')) {
        try { await DB.markNotificationRead(id); } catch (_) {}
        item.classList.add('read-done');
        item.classList.remove('unread');
      }
      dd.remove();
      if (link) location.hash = link;
    });
  });

  // Close on outside click
  setTimeout(() => {
    const handler = (e) => {
      if (!dd.contains(e.target) && e.target.id !== 'mobile-notif') {
        dd.remove();
        document.removeEventListener('click', handler);
      }
    };
    document.addEventListener('click', handler);
  }, 50);
}

// ── Push Notifications ────────────────────────────────────────
const VAPID_PUBLIC = 'BP-s26cIqwIHGRixkgal45193ut1JzjjeJjpTUpmsCp8Cc8T_GrHFo1tURNlD-k0VTR3HEd3yh5Zp-C2PNDGusY';

async function initPushNotifications(clientId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
  const perm = Notification.permission;
  if (perm === 'granted') {
    await subscribePush(clientId);
    return;
  }
  if (perm === 'denied') return;
  setTimeout(() => {
    const existing = document.getElementById('push-banner');
    if (existing) return;
    const banner = document.createElement('div');
    banner.id = 'push-banner';
    banner.style.cssText = 'background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:12px;padding:14px 18px;margin:0 0 16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap';
    banner.innerHTML = `
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:1.5rem">🔔</span>
        <div>
          <div style="font-weight:700;font-size:0.88rem;color:#166534">Enable lead notifications</div>
          <div style="font-size:0.78rem;color:#4b5563">Get instant alerts on your phone when a new quote comes in, even when this app is closed.</div>
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button id="push-enable" style="background:#166534;color:#fff;border:none;padding:8px 16px;border-radius:8px;font-weight:700;font-size:0.82rem;cursor:pointer">Turn On</button>
        <button id="push-dismiss" style="background:none;border:1px solid #d1d5db;padding:8px 12px;border-radius:8px;font-size:0.82rem;color:#6b7280;cursor:pointer">Later</button>
      </div>`;
    const page = document.querySelector('.sp-page');
    const header = page?.querySelector('.sp-header');
    if (header && header.nextSibling) {
      header.parentNode.insertBefore(banner, header.nextSibling);
    } else if (page) {
      page.prepend(banner);
    }
    document.getElementById('push-enable')?.addEventListener('click', async () => {
      await subscribePush(clientId);
      banner.remove();
    });
    document.getElementById('push-dismiss')?.addEventListener('click', () => {
      banner.remove();
      sessionStorage.setItem('push-dismissed', '1');
    });
  }, 1500);
}

async function subscribePush(clientId) {
  try {
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') return;
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC)
      });
    }
    const key = sub.toJSON();
    const { supabase } = await import('./supabase/client.js');
    await supabase.from('push_subscriptions').upsert({
      client_id: clientId,
      endpoint: key.endpoint,
      p256dh: key.keys.p256dh,
      auth: key.keys.auth
    }, { onConflict: 'client_id,endpoint' });
  } catch (e) {
    console.error('Push subscription failed:', e);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; ++i) arr[i] = raw.charCodeAt(i);
  return arr;
}

// ── Toast ──────────────────────────────────────────────────────
function showToast(msg, duration = 2400) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => {
    t.classList.add('fade-out');
    setTimeout(() => t.remove(), 350);
  }, duration);
}

// ── Skeleton ───────────────────────────────────────────────────
function skeletonClients() {
  const row = `
    <div style="padding:14px 18px;border-bottom:1px solid var(--divider);display:flex;align-items:center;gap:14px">
      <div class="skel" style="width:38px;height:38px;border-radius:10px;flex-shrink:0"></div>
      <div style="flex:1">
        <div class="skel" style="width:130px;height:12px;margin-bottom:8px"></div>
        <div class="skel" style="width:90px;height:10px"></div>
      </div>
      <div class="skel" style="width:48px;height:18px;border-radius:6px"></div>
    </div>`;
  return `
    <div class="stats-strip" style="margin:16px 24px 0">
      ${[1,2,3,4].map(() => `<div class="stat-cell">
        <div class="skel" style="width:60px;height:10px;margin-bottom:8px"></div>
        <div class="skel" style="width:44px;height:20px"></div>
      </div>`).join('')}
    </div>
    <div class="section">
      <div class="skel" style="width:80px;height:10px;margin-bottom:12px"></div>
      <div class="card">${row.repeat(4)}</div>
    </div>`;
}

// ── Login ──────────────────────────────────────────────────────
export function loginView(app) {
  destroyChart();
  app.innerHTML = `
    <div class="login-page">
      <div class="login-brand">
        <div class="login-brandmark">KG</div>
        <div class="login-brand-name">Kalnyesgrowth</div>
        <div class="login-brand-sub">Agency Dashboard</div>
      </div>
      <form class="login-card" id="li-form" autocomplete="on">
        <h2>Sign in</h2>
        <div class="form-group">
          <label>Email address</label>
          <input id="li-email" type="email" name="email" placeholder="you@example.com" autocomplete="email" inputmode="email" />
        </div>
        <div class="form-group">
          <label>Password</label>
          <div style="position:relative">
            <input id="li-pass" type="password" name="password" placeholder="••••••••" autocomplete="current-password" style="padding-right:44px" />
            <button type="button" id="li-eye" aria-label="Show password"
              style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text-secondary);font-size:1.1rem;padding:4px">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </div>
        <label style="display:flex;align-items:center;gap:8px;margin:-4px 0 8px;cursor:pointer;font-size:0.82rem;color:var(--text-secondary)">
          <input type="checkbox" id="li-remember" style="width:16px;height:16px;accent-color:#0064E0;cursor:pointer" />
          Remember me
        </label>
        <button type="submit" class="btn-primary" id="li-btn">Sign in</button>
        <div class="login-err" id="li-err"></div>
      </form>
    </div>`;

  const btn = document.getElementById('li-btn');
  const err = document.getElementById('li-err');
  const form = document.getElementById('li-form');
  const remember = document.getElementById('li-remember');

  const saved = localStorage.getItem('kg-remember');
  if (saved) {
    try {
      const s = JSON.parse(saved);
      document.getElementById('li-email').value = s.email || '';
      document.getElementById('li-pass').value = s.pass || '';
      remember.checked = true;
    } catch (_) {}
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email    = document.getElementById('li-email').value.trim();
    const password = document.getElementById('li-pass').value;
    err.textContent = '';
    btn.disabled = true; btn.textContent = 'Signing in…';
    if (!email || !password) {
      err.textContent = 'Please enter your email and password.';
      btn.disabled = false; btn.textContent = 'Sign in'; return;
    }
    const session = await checkLogin(email, password);
    btn.disabled = false; btn.textContent = 'Sign in';
    if (session) {
      if (remember.checked) {
        localStorage.setItem('kg-remember', JSON.stringify({ email, pass: password }));
      } else {
        localStorage.removeItem('kg-remember');
      }
      if (session.role === 'agency') { location.hash = '#clients'; }
      else { window.dispatchEvent(new HashChangeEvent('hashchange')); }
    } else {
      err.textContent = 'Incorrect email or password.';
      document.getElementById('li-pass').value = '';
    }
  });

  document.getElementById('li-eye').addEventListener('click', () => {
    const p = document.getElementById('li-pass');
    const isHidden = p.type === 'password';
    p.type = isHidden ? 'text' : 'password';
    document.getElementById('li-eye').innerHTML = isHidden
      ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
      : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  });
}

// ── Clients overview ───────────────────────────────────────────
const AGENCY_CLIENT_ID = '992d9253-6123-4d51-91b9-007efd8ad03c';

export async function clientsView(app) {
  destroyChart();
  app.innerHTML = buildLayout({ active:'clients', title:'Clients', content: skeletonClients() });
  wireLayout(app);

  let allClients = MOCK_CLIENTS;
  let summary = getAgencySummary();
  let agencyEmails = [];
  try {
    const [sbClients, sbSum] = await Promise.all([DB.fetchClientsWithMetrics(), DB.fetchAgencySummary()]);
    if (sbClients.length > 0) { allClients = sbClients; summary = sbSum; }
    agencyEmails = await DB.fetchAllSubscribers(AGENCY_CLIENT_ID).catch(() => []);
  } catch (_) {}

  const agency  = allClients.find(c => c.id === AGENCY_CLIENT_ID);
  const clients = allClients.filter(c => c.id !== AGENCY_CLIENT_ID);

  const mc = document.querySelector('.main-content');
  if (!mc) return;

  const totalSessions = clients.reduce((acc, c) => acc + c.metrics.sessions.month, 0);
  const totalLeads    = clients.reduce((acc, c) => acc + c.metrics.leads.month + c.metrics.emails.month, 0);

  const am = agency?.metrics || { sessions:{today:0,week:0,month:0,all:0}, leads:{today:0,week:0,month:0,all:0}, emails:{today:0,week:0,month:0,all:0}, revenue:{today:0,week:0,month:0,all:0} };

  mc.innerHTML = `
    <div class="page-topbar">
      <div>
        <div class="page-topbar-title">${esc(greeting())}, Kalnyesgrowth</div>
        <div class="greeting-date" style="margin-top:2px">${esc(todayStr())}</div>
      </div>
    </div>

    <div class="stats-strip">
      <div class="stat-cell">
        <div class="stat-label">Revenue / mo</div>
        <div class="stat-value green">${esc(fmt(summary.totalRevenueMonth))}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">Sessions</div>
        <div class="stat-value">${esc(num(totalSessions))}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">Leads</div>
        <div class="stat-value blue">${esc(num(totalLeads))}</div>
      </div>
      <div class="stat-cell">
        <div class="stat-label">Clients</div>
        <div class="stat-value">${clients.length}</div>
      </div>
    </div>

    <div class="section">
      <div class="section-label">Your website &middot; kalnyesgrowth.com</div>
      <div class="card" style="padding:20px">
        <div class="ag-site-grid">
          <div class="ag-site-stats">
            <div class="ag-site-stat">
              <div class="ag-site-num">${num(am.sessions.month)}</div>
              <div class="ag-site-lbl">Visitors this month</div>
            </div>
            <div class="ag-site-stat">
              <div class="ag-site-num">${num(am.sessions.week)}</div>
              <div class="ag-site-lbl">This week</div>
            </div>
            <div class="ag-site-stat">
              <div class="ag-site-num">${num(am.leads.month)}</div>
              <div class="ag-site-lbl">Leads</div>
            </div>
            <div class="ag-site-stat">
              <div class="ag-site-num">${num(am.sessions.today)}</div>
              <div class="ag-site-lbl">Today</div>
            </div>
          </div>
          <div class="ag-site-emails">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
              <div style="font-size:0.82rem;font-weight:600;color:var(--text-primary)">Captured Emails (${agencyEmails.length})</div>
            </div>
            ${agencyEmails.length ? `
            <div class="ag-email-list">
              ${agencyEmails.slice(0, 6).map(s => `
              <div class="ag-email-row">
                <div class="ag-email-addr">${esc(s.email)}</div>
                <div class="ag-email-date">${esc(s.date || s.source || '')}</div>
              </div>`).join('')}
              ${agencyEmails.length > 6 ? `<div style="font-size:0.75rem;color:var(--text-secondary);text-align:center;padding:6px 0">+${agencyEmails.length - 6} more</div>` : ''}
            </div>` : `
            <div style="text-align:center;padding:20px 0;color:var(--text-secondary);font-size:0.82rem">No emails captured yet</div>`}
          </div>
        </div>
        <div style="margin-top:14px">
          <a href="#client/${AGENCY_CLIENT_ID}" class="btn-pill-outline" style="font-size:0.75rem;padding:7px 16px;text-decoration:none">View full analytics</a>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="section-label">Your clients</div>
      <div class="card">
        <div class="client-list">
          ${clients.map(c => {
            const hasRev = c.metrics.revenue.month > 0;
            const val    = hasRev ? fmt(c.metrics.revenue.month) : num(c.metrics.leads.month + c.metrics.emails.month);
            const lbl    = hasRev ? 'rev / mo' : 'leads / mo';
            const series = c.revenueSeries.month;
            const pct    = trendPct(series);
            const spark  = hasRev && series.length > 1 ? sparkline(series, c.color) : '';
            return `
            <div class="client-row" data-id="${esc(c.id)}">
              <div class="client-avatar" style="background:${esc(c.color)}">${esc(c.initials)}</div>
              <div class="client-info">
                <div class="client-name">${esc(c.name)}</div>
                <div class="client-meta"><span class="status-dot"></span>${esc(c.domain)}</div>
                <div style="margin-top:3px">${trendBadge(pct)}</div>
              </div>
              ${spark ? `<div style="flex-shrink:0;padding:0 4px">${spark}</div>` : ''}
              <div class="client-right">
                <div class="cr-val">${esc(val)}</div>
                <div class="cr-label">${esc(lbl)}</div>
              </div>
              <div class="row-arrow">›</div>
            </div>`;
          }).join('')}
        </div>
      </div>
    </div>
    <div class="page-spacer"></div>`;

  mc.querySelectorAll('.client-row').forEach(row =>
    row.addEventListener('click', () => location.hash = '#client/' + row.dataset.id)
  );
}

// ── Agency: Client detail ──────────────────────────────────────
export async function clientDetailView(app, clientId) {
  let client = getClient(clientId);
  if (!client) {
    // Supabase UUID client — fetch it
    try {
      const sbClient = await DB.fetchClient(clientId);
      if (sbClient) client = normalizeClient(sbClient);
    } catch (_) {}
  }
  if (!client) { location.hash = '#clients'; return; }
  renderDetail(app, client, true);
}

// ── Cash register "cha-ching" notification sound (LOUD) ───────
let _chachingCtx = null;
function playChaChing() {
  try {
    const ctx = _chachingCtx || (_chachingCtx = new (window.AudioContext || window.webkitAudioContext)());
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(1.0, now);
    master.connect(ctx.destination);
    function tone(freq, start, dur, gain, type) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, now + start);
      g.gain.setValueAtTime(gain, now + start);
      g.gain.exponentialRampToValueAtTime(0.001, now + start + dur);
      osc.connect(g).connect(master);
      osc.start(now + start);
      osc.stop(now + start + dur);
    }
    tone(1200, 0, 0.12, 0.8, 'square');
    tone(1600, 0.06, 0.12, 0.8, 'square');
    tone(2400, 0.12, 0.2, 0.7, 'sine');
    tone(3200, 0.18, 0.3, 0.6, 'sine');
    tone(1200, 0.45, 0.12, 0.8, 'square');
    tone(1600, 0.51, 0.12, 0.8, 'square');
    tone(2400, 0.57, 0.2, 0.7, 'sine');
    tone(3200, 0.63, 0.3, 0.6, 'sine');
    const noise = ctx.createBufferSource();
    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.08, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.3;
    noise.buffer = buf;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.5, now);
    ng.gain.exponentialRampToValueAtTime(0.001, now + 0.08);
    noise.connect(ng).connect(master);
    noise.start(now);
  } catch (_) {}
}

// ── Client: Self view ──────────────────────────────────────────
export async function clientSelfView(app, clientId) {
  let client = getClient(clientId);
  if (!client) {
    try {
      const sbClient = await DB.fetchClient(clientId);
      if (sbClient) client = normalizeClient(sbClient);
    } catch (_) {}
  }
  if (!client) { clearSession().then(() => loginView(app)); return; }

  renderClientDashboard(app, client, null, loginView);

  // Real-time listener: play cha-ching on new lead/order
  const { supabase } = await import('./supabase/client.js');
  const channel = supabase.channel('leads-' + client.id)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'leads',
      filter: 'client_id=eq.' + client.id,
    }, (payload) => {
      playChaChing();
      const name = payload.new?.name || payload.new?.email || 'New customer';
      showToast('New order from ' + name);
    })
    .subscribe();

  initPushNotifications(client.id);

  (async () => {
    try {
      const [metrics, todayLive, s7, s30, s90, leadData, reviewData, recentEvents, team] = await Promise.all([
        DB.fetchMetricsSummary(client.id),
        DB.fetchLiveTodayMetrics(client.id),
        DB.fetchDailySeries(client.id, 7),
        DB.fetchDailySeries(client.id, 30),
        DB.fetchDailySeries(client.id, 90),
        DB.fetchLeads(client.id).catch(() => []),
        DB.fetchReviews(client.id).catch(() => []),
        DB.fetchRecentEvents(client.id, 20),
        DB.fetchTeamMembers().catch(() => []),
      ]);
      if (!document.getElementById('sp-root')) return;
      const patchedMetrics = { ...metrics };
      for (const key of ['revenue','sessions','leads','emails','orders','addToCarts']) {
        patchedMetrics[key] = { ...metrics[key], today: todayLive[key] ?? metrics[key].today };
      }
      renderClientDashboard(app, client, {
        metrics: patchedMetrics,
        series: { 7: s7, 30: s30, 90: s90 },
        leads: leadData || [],
        reviews: reviewData || [],
        recentEvents,
        team,
      }, loginView);
    } catch (_) {}
  })();
}

// ── Client Self Dashboard (Shopify-style) ─────────────────────
function renderClientDashboard(app, client, liveData, loginViewFn) {
  const metrics      = liveData?.metrics     || client.metrics;
  const seriesData   = liveData?.series      || {};
  const recentEvents = liveData?.recentEvents || [];
  const leads        = liveData?.leads       || [];
  const reviews      = liveData?.reviews     || [];
  const team         = liveData?.team        || [];
  const m            = metrics;

  const s30 = seriesData[30] || [];

  function spSparkline(series, key) {
    const vals = series.map(d => Number(d[key] || 0));
    if (vals.length < 2) return '';
    const mn = Math.min(...vals), mx = Math.max(...vals), rng = mx - mn || 1;
    const W = 80, H = 28;
    const pts = vals.map((v, i) => {
      const x = (i / (vals.length - 1)) * W;
      const y = 2 + (1 - (v - mn) / rng) * (H - 4);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none"><polyline points="${pts}" stroke="#0064E0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  }

  function calcTrend(series, key) {
    if (!series || series.length < 4) return null;
    const half = Math.floor(series.length / 2);
    const recent = series.slice(-half).reduce((s, d) => s + Number(d[key] || 0), 0);
    const prev = series.slice(0, half).reduce((s, d) => s + Number(d[key] || 0), 0);
    if (prev === 0) return recent > 0 ? 100 : null;
    return Math.round(((recent - prev) / prev) * 100);
  }

  function trendHtml(pct) {
    if (pct === null) return '';
    const cls = pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat';
    const arrow = pct > 0 ? '↑' : pct < 0 ? '↓' : '';
    return `<span class="sp-trend ${cls}">${arrow}${Math.abs(pct)}%</span>`;
  }

  function statTotal(series, key) {
    return (series || []).reduce((s, d) => s + Number(d[key] || 0), 0);
  }

  const sessionsTrend = calcTrend(s30, 'sessions');
  const ordersTrend = calcTrend(s30, 'orders');
  const emailsTrend = calcTrend(s30, 'emails');
  const leadsTrend = calcTrend(s30, 'leads');

  const avgRating = reviews.length ? (reviews.reduce((a, r) => a + (r.rating || 0), 0) / reviews.length) : 0;

  const rangeLabels = {
    1: 'Today', 2: 'Yesterday', 7: 'Last 7 days', 30: 'Last 30 days',
    90: 'Last 90 days', 365: 'Last 12 months', custom: 'Custom',
  };

  const dashContent = `
    <div class="sp-page">
      <div class="sp-header">
        <h1 class="sp-title">Overview</h1>
        <div class="sp-date-dropdown">
          <button class="sp-date-trigger" id="sp-date-trigger">
            <span id="sp-date-label">Last 30 days</span>
            <svg class="sp-caret" viewBox="0 0 20 20" fill="none"><path d="M6 8l4 4 4-4" stroke="#5c5f62" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
          <div class="sp-date-popover" id="sp-date-popover">
            <button class="sp-date-opt" data-range="1">Today</button>
            <button class="sp-date-opt" data-range="2">Yesterday</button>
            <div class="sp-date-divider"></div>
            <button class="sp-date-opt" data-range="7">Last 7 days</button>
            <button class="sp-date-opt selected" data-range="30">Last 30 days</button>
            <button class="sp-date-opt" data-range="90">Last 90 days</button>
            <button class="sp-date-opt" data-range="365">Last 12 months</button>
            <div class="sp-date-divider"></div>
            <button class="sp-date-opt" data-range="custom">Custom</button>
            <div class="sp-date-custom-fields" id="sp-custom-fields">
              <div><label>Start date</label><input type="date" id="sp-date-start" /></div>
              <div><label>End date</label><input type="date" id="sp-date-end" /></div>
              <button class="sp-date-apply" id="sp-date-apply">Apply</button>
            </div>
          </div>
        </div>
      </div>

      <div class="sp-stats">
        <div class="sp-stat">
          <div class="sp-stat-title">Online sessions</div>
          <div class="sp-stat-row">
            <span class="sp-stat-num">${statTotal(s30, 'sessions').toLocaleString()}</span>
            ${trendHtml(sessionsTrend)}
          </div>
          <div class="sp-sparkline-wrap">${spSparkline(s30, 'sessions')}</div>
        </div>
        <div class="sp-stat">
          <div class="sp-stat-title">Total orders</div>
          <div class="sp-stat-row">
            <span class="sp-stat-num">${statTotal(s30, 'orders').toLocaleString()}</span>
            ${trendHtml(ordersTrend)}
          </div>
          <div class="sp-sparkline-wrap">${spSparkline(s30, 'orders')}</div>
        </div>
        <div class="sp-stat">
          <div class="sp-stat-title">Emails collected</div>
          <div class="sp-stat-row">
            <span class="sp-stat-num">${statTotal(s30, 'emails').toLocaleString()}</span>
            ${trendHtml(emailsTrend)}
          </div>
          <div class="sp-sparkline-wrap">${spSparkline(s30, 'emails')}</div>
        </div>
        <div class="sp-stat">
          <div class="sp-stat-title">Total leads</div>
          <div class="sp-stat-row">
            <span class="sp-stat-num">${statTotal(s30, 'leads').toLocaleString()}</span>
            ${trendHtml(leadsTrend)}
          </div>
          <div class="sp-sparkline-wrap">${spSparkline(s30, 'leads')}</div>
        </div>
      </div>

      <div class="sp-card">
        <div class="sp-card-header">
          <div>
            <div class="sp-card-title">Sessions over time</div>
            <div class="sp-card-num" id="sp-chart-total">${statTotal(s30, 'sessions').toLocaleString()} ${trendHtml(sessionsTrend)}</div>
          </div>
        </div>
        <div class="sp-chart-area">
          <canvas id="sp-chart"></canvas>
        </div>
      </div>

      <div class="sp-grid">
        <div class="sp-card">
          <div class="sp-card-header"><div class="sp-card-title">Recent leads</div></div>
          ${leads.length ? leads.slice(0, 6).map(l => `
          <div class="sp-lead-row">
            <div class="sp-lead-ava">${esc((l.name || 'L')[0].toUpperCase())}</div>
            <div class="sp-lead-info">
              <div class="sp-lead-name">${esc(l.name || 'Unknown')}</div>
              <div class="sp-lead-sub">${esc(l.email || l.phone || '')}</div>
            </div>
            <span class="sp-lead-badge">${esc(l.stage || 'new')}</span>
          </div>`).join('') : `
          <div class="sp-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
            <p>Leads from your website will appear here</p>
          </div>`}
        </div>

        <div class="sp-card">
          <div class="sp-card-header"><div class="sp-card-title">Google reviews</div></div>
          ${reviews.length ? `
          <div class="sp-review-summary">
            <div class="sp-review-big">${avgRating.toFixed(1)}</div>
            <div>
              <div class="sp-review-meta-stars">${'★'.repeat(Math.round(avgRating))}${'☆'.repeat(5 - Math.round(avgRating))}</div>
              <div class="sp-review-meta">${reviews.length} review${reviews.length > 1 ? 's' : ''}</div>
            </div>
          </div>
          ${reviews.slice(0, 3).map(r => `
          <div class="sp-review">
            <div class="sp-review-top">
              <div class="sp-review-ava">${esc((r.author || 'A')[0])}</div>
              <div>
                <div class="sp-review-name">${esc(r.author || 'Anonymous')}</div>
                <div class="sp-review-stars">${'★'.repeat(r.rating || 0)} ${r.review_date ? new Date(r.review_date).toLocaleDateString('en-US', {month:'short', day:'numeric'}) : ''}</div>
              </div>
            </div>
            <p class="sp-review-text">${esc((r.text || '').slice(0, 140))}${(r.text || '').length > 140 ? '...' : ''}</p>
          </div>`).join('')}` : `
          <div class="sp-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            <p>Reviews will sync here automatically</p>
          </div>`}
        </div>
      </div>

      <div class="sp-grid">
        <div class="sp-card">
          <div class="sp-card-header"><div class="sp-card-title">Activity</div></div>
          ${recentEvents.length ? recentEvents.slice(0, 6).map(e => `
          <div class="sp-activity-row">
            <div class="sp-activity-dot"></div>
            <div style="flex:1;min-width:0">
              <div class="sp-activity-type">${esc(e.event_type.replace(/_/g, ' '))}</div>
              ${e.page ? `<div class="sp-activity-page">${esc(e.page)}</div>` : ''}
            </div>
            <span class="sp-activity-time">${timeAgo(e.ts)}</span>
          </div>`).join('') : `
          <div class="sp-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            <p>Website activity will appear here</p>
          </div>`}
        </div>

        <div class="sp-card">
          <div class="sp-card-header">
            <div class="sp-card-title">Team (${team.length})</div>
            <button class="sp-range-btn" id="sp-invite-btn" style="font-size:12px;padding:4px 10px">+ Invite</button>
          </div>
          ${team.length ? team.map(t => `
          <div class="sp-team-row">
            <div class="sp-team-ava">${esc((t.name || t.email || 'U')[0].toUpperCase())}</div>
            <div class="sp-team-info">
              <div class="sp-team-name">${esc(t.name || t.email.split('@')[0])}</div>
              <div class="sp-team-email">${esc(t.email)}</div>
            </div>
          </div>`).join('') : `
          <div class="sp-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>
            <p>Invite team members to share this dashboard</p>
          </div>`}
          <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
            <a class="sp-action-btn" href="https://${esc(client.domain || '')}" target="_blank" rel="noopener" style="flex:1;justify-content:center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              View site
            </a>
            <button class="sp-action-btn" id="sp-request-btn" style="flex:1;justify-content:center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>
              Request change
            </button>
          </div>
        </div>
      </div>
    </div>`;

  app.innerHTML = `
    <div class="app-layout">
      <div class="drawer-overlay" id="drawer-overlay"></div>
      <aside class="sidebar" id="sidebar">
        <div class="sidebar-logo">
          <div class="sidebar-logo-mark">KG</div>
          <div><div class="sidebar-logo-text">Kalnyesgrowth</div></div>
        </div>
        <nav class="sidebar-nav">
          <button class="nav-link active" data-nav="dashboard"><span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg></span> Home</button>
          <button class="nav-link" data-nav="orders"><span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="10" y1="3" x2="10" y2="9"/></svg></span> Orders</button>
          <button class="nav-link" data-nav="reviews"><span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span> Reviews</button>
          <button class="nav-link" data-nav="tickets"><span class="nav-icon"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg></span> Requests</button>
        </nav>
        <div class="sidebar-footer">
          <div class="sidebar-user">
            <div class="sidebar-avatar">${esc(client.initials)}</div>
            <div class="sidebar-user-name">${esc(client.name)}</div>
          </div>
          <button class="sidebar-signout" id="sp-logout">Sign out</button>
        </div>
      </aside>
      <div class="mobile-header">
        <button class="hamburger" id="hamburger">${HAMBURGER}</button>
        <div style="flex:1;font-size:0.85rem;font-weight:700;color:rgba(255,255,255,0.9);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:-0.01em">${esc(client.name)}</div>
        <div class="mobile-actions">
          <button class="mobile-icon-btn" id="mobile-logout" title="Sign out">&#x23FB;</button>
        </div>
      </div>
      <main class="main-content">
        <div id="sp-root">${dashContent}</div>
      </main>
    </div>`;

  // Wire sidebar
  const sidebar = document.getElementById('sidebar');
  const overlay = document.getElementById('drawer-overlay');
  const openSb  = () => { sidebar?.classList.add('open'); overlay?.classList.add('visible'); };
  const closeSb = () => { sidebar?.classList.remove('open'); overlay?.classList.remove('visible'); };
  document.getElementById('hamburger')?.addEventListener('click', openSb);
  overlay?.addEventListener('click', closeSb);

  function setActiveNav(name) {
    document.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
    document.querySelector(`[data-nav="${name}"]`)?.classList.add('active');
  }

  function showOrders() {
    const root = document.getElementById('sp-root');
    if (!root) return;
    setActiveNav('orders');

    root.innerHTML = `
      <div class="sp-page">
        <div class="sp-header">
          <h1 class="sp-title">Orders</h1>
          <div style="font-size:13px;color:#6d7175">${leads.length} submission${leads.length !== 1 ? 's' : ''}</div>
        </div>
        ${leads.length ? `
        <div class="sp-card" style="padding:0;overflow:hidden">
          <table class="sp-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Phone</th>
                <th>Source</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${leads.map(l => `
              <tr class="sp-table-row" data-lead-id="${esc(l.id)}">
                <td class="sp-table-name">${esc(l.name || 'Unknown')}</td>
                <td>${esc(l.email || '')}</td>
                <td>${esc(l.phone || '')}</td>
                <td class="sp-table-source">${esc((l.source_url || '').replace(/https?:\/\//, '').replace(/\/$/, '') || '')}</td>
                <td class="sp-table-date">${l.created_at ? new Date(l.created_at).toLocaleDateString('en-US', {month:'short', day:'numeric', year:'numeric'}) : ''}</td>
                <td><span class="sp-lead-badge">${esc(l.stage || 'new')}</span></td>
              </tr>`).join('')}
            </tbody>
          </table>
        </div>
        ` : `
        <div class="sp-card">
          <div class="sp-empty">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="20" height="18" rx="2"/><line x1="2" y1="9" x2="22" y2="9"/><line x1="10" y1="3" x2="10" y2="9"/></svg>
            <p>Customer submissions from your website will appear here</p>
          </div>
        </div>`}
      </div>`;

    root.querySelectorAll('.sp-table-row').forEach(row => {
      row.addEventListener('click', () => {
        const lid = row.dataset.leadId;
        const lead = leads.find(l => l.id === lid);
        if (!lead) return;
        showOrderDetail(lead);
      });
    });
  }

  function showOrderDetail(lead) {
    const root = document.getElementById('sp-root');
    if (!root) return;
    setActiveNav('orders');

    const fields = [
      { label: 'Name', value: lead.name },
      { label: 'Email', value: lead.email },
      { label: 'Phone', value: lead.phone },
      { label: 'Source page', value: lead.source_url },
      { label: 'Message', value: lead.message },
      { label: 'Status', value: lead.stage },
      { label: 'Submitted', value: lead.created_at ? new Date(lead.created_at).toLocaleString('en-US', { month:'long', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit' }) : '' },
    ].filter(f => f.value);

    const notes = Array.isArray(lead.notes) ? lead.notes : [];

    root.innerHTML = `
      <div class="sp-page">
        <div class="sp-header">
          <div style="display:flex;align-items:center;gap:12px">
            <button class="sp-range-btn" id="sp-back-orders">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              Back
            </button>
            <h1 class="sp-title">${esc(lead.name || 'Submission')}</h1>
          </div>
          <span class="sp-lead-badge">${esc(lead.stage || 'new')}</span>
        </div>

        <div class="sp-card">
          <div class="sp-card-header"><div class="sp-card-title">Customer information</div></div>
          ${fields.map(f => `
          <div class="sp-detail-row">
            <div class="sp-detail-label">${esc(f.label)}</div>
            <div class="sp-detail-value">${f.label === 'Email' && f.value ? `<a href="mailto:${esc(f.value)}" style="color:#0064E0;text-decoration:none">${esc(f.value)}</a>` : f.label === 'Phone' && f.value ? `<a href="tel:${esc(f.value)}" style="color:#0064E0;text-decoration:none">${esc(f.value)}</a>` : esc(f.value)}</div>
          </div>`).join('')}
        </div>

        ${notes.length ? `
        <div class="sp-card" style="margin-top:16px">
          <div class="sp-card-header"><div class="sp-card-title">Notes</div></div>
          ${notes.map(n => `
          <div class="sp-detail-row">
            <div class="sp-detail-label">${new Date(n.ts).toLocaleDateString('en-US', {month:'short', day:'numeric'})}</div>
            <div class="sp-detail-value">${esc(n.text)}</div>
          </div>`).join('')}
        </div>` : ''}
      </div>`;

    root.querySelector('#sp-back-orders')?.addEventListener('click', showOrders);
  }

  function showDashboard() {
    const root = document.getElementById('sp-root');
    if (!root) return;
    setActiveNav('dashboard');
    root.innerHTML = dashContent;
    wireDateDropdown();
    requestAnimationFrame(() => drawChart(currentRange));
    document.getElementById('sp-invite-btn')?.addEventListener('click', wireInviteModal);
    document.getElementById('sp-request-btn')?.addEventListener('click', () => showTicketModal(client));
  }

  document.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', () => {
    closeSb();
    const nav = btn.dataset.nav;
    if (nav === 'dashboard') showDashboard();
    else if (nav === 'orders') showOrders();
    else if (nav === 'reviews') window.open('https://business.google.com', '_blank');
    else if (nav === 'tickets') showTicketModal(client);
  }));

  document.getElementById('sp-logout')?.addEventListener('click', () => clearSession().then(() => loginViewFn(app)));
  document.getElementById('mobile-logout')?.addEventListener('click', () => clearSession().then(() => loginViewFn(app)));
  document.getElementById('sp-request-btn')?.addEventListener('click', () => showTicketModal(client));

  function wireInviteModal() {
    const modal = document.createElement('div');
    modal.className = 'sp-modal-overlay';
    modal.innerHTML = `
      <div class="sp-modal">
        <h3>Invite team member</h3>
        <div class="sp-field"><label>Name</label><input type="text" id="sp-inv-name" placeholder="John Smith" /></div>
        <div class="sp-field"><label>Email</label><input type="email" id="sp-inv-email" placeholder="john@business.com" /></div>
        <div class="sp-field"><label>Password</label><input type="password" id="sp-inv-pass" placeholder="Min 8 characters" /></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">
          <button class="sp-range-btn" id="sp-inv-cancel">Cancel</button>
          <button class="sp-range-btn active" id="sp-inv-submit">Send invite</button>
        </div>
        <div id="sp-inv-err" style="color:#c8281e;font-size:12px;margin-top:8px"></div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#sp-inv-cancel').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
    modal.querySelector('#sp-inv-submit').addEventListener('click', async () => {
      const email = document.getElementById('sp-inv-email').value.trim();
      const password = document.getElementById('sp-inv-pass').value;
      const name = document.getElementById('sp-inv-name').value.trim();
      const errEl = document.getElementById('sp-inv-err');
      if (!email || !password) { errEl.textContent = 'Email and password are required'; return; }
      if (password.length < 8) { errEl.textContent = 'Password must be at least 8 characters'; return; }
      const btn = modal.querySelector('#sp-inv-submit');
      btn.disabled = true; btn.textContent = 'Sending...';
      try {
        await DB.inviteTeamMember(email, password, name);
        modal.remove();
        clientSelfView(app, client.id);
      } catch (err) {
        errEl.textContent = err.message || 'Failed to invite';
        btn.disabled = false; btn.textContent = 'Send invite';
      }
    });
  }
  document.getElementById('sp-invite-btn')?.addEventListener('click', wireInviteModal);

  // Chart with time range switching
  const allSeries = seriesData;
  let currentRange = 30;

  function drawChart(rangeKey) {
    currentRange = rangeKey;
    const canvas = document.getElementById('sp-chart');
    if (!canvas) return;
    const existing = Chart.getChart(canvas);
    if (existing) existing.destroy();
    const series = allSeries[rangeKey] || [];
    if (!series.length) return;

    const labels = series.map(d => {
      const dt = new Date(d.date + 'T00:00:00');
      return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    });
    const values = series.map(d => Number(d.sessions || 0));
    const total = values.reduce((s, v) => s + v, 0);
    const trend = calcTrend(series, 'sessions');

    const totalEl = document.getElementById('sp-chart-total');
    if (totalEl) totalEl.innerHTML = total.toLocaleString() + ' ' + trendHtml(trend);

    // Also update stat cards
    const statEls = document.querySelectorAll('.sp-stat');
    if (statEls.length >= 4) {
      const keys = ['sessions', 'orders', 'emails', 'leads'];
      keys.forEach((key, i) => {
        const el = statEls[i];
        if (!el) return;
        const t = statTotal(series, key);
        const tr = calcTrend(series, key);
        el.querySelector('.sp-stat-num').textContent = t.toLocaleString();
        const trendEl = el.querySelector('.sp-trend');
        if (trendEl) trendEl.outerHTML = trendHtml(tr);
        else {
          const row = el.querySelector('.sp-stat-row');
          if (row && tr !== null) row.insertAdjacentHTML('beforeend', trendHtml(tr));
        }
        el.querySelector('.sp-sparkline-wrap').innerHTML = spSparkline(series, key);
      });
    }

    new Chart(canvas, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          data: values,
          borderColor: '#0064E0',
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: '#0064E0',
          tension: 0.3,
          fill: false,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: '#202223',
            titleColor: '#fff',
            bodyColor: '#fff',
            padding: 10,
            cornerRadius: 8,
            titleFont: { size: 12, weight: '400' },
            bodyFont: { size: 13, weight: '600' },
            displayColors: false,
            callbacks: { label: ctx => ctx.parsed.y.toLocaleString() + ' visitors' }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: { maxTicksLimit: 8, font: { size: 12 }, color: '#8c9196', padding: 8 },
          },
          y: {
            beginAtZero: true,
            grid: { color: '#f0f0f0', lineWidth: 1 },
            border: { display: false },
            ticks: {
              font: { size: 12 }, color: '#8c9196', padding: 8,
              callback: function(val) { return val >= 1000 ? (val / 1000).toFixed(val % 1000 === 0 ? 0 : 1) + 'K' : val; },
            },
          }
        },
        interaction: { mode: 'index', intersect: false },
      }
    });
  }

  // Date range dropdown wiring
  function wireDateDropdown() {
    const trigger = document.getElementById('sp-date-trigger');
    const popover = document.getElementById('sp-date-popover');
    const label = document.getElementById('sp-date-label');
    const customFields = document.getElementById('sp-custom-fields');
    if (!trigger || !popover) return;

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      popover.classList.toggle('open');
    });
    document.addEventListener('click', (e) => {
      if (!popover.contains(e.target) && e.target !== trigger) popover.classList.remove('open');
    });

    popover.querySelectorAll('.sp-date-opt').forEach(opt => {
      opt.addEventListener('click', async () => {
        const range = opt.dataset.range;
        popover.querySelectorAll('.sp-date-opt').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');

        if (range === 'custom') {
          customFields.classList.add('open');
          return;
        }
        customFields.classList.remove('open');

        const days = parseInt(range);
        label.textContent = rangeLabels[days] || ('Last ' + days + ' days');

        if (allSeries[days]) {
          drawChart(days);
        } else {
          label.textContent = rangeLabels[days] + '...';
          try {
            allSeries[days] = await DB.fetchDailySeries(client.id, days);
          } catch (_) { allSeries[days] = []; }
          label.textContent = rangeLabels[days];
          drawChart(days);
        }
        popover.classList.remove('open');
      });
    });

    document.getElementById('sp-date-apply')?.addEventListener('click', async () => {
      const startVal = document.getElementById('sp-date-start')?.value;
      const endVal = document.getElementById('sp-date-end')?.value;
      if (!startVal || !endVal) return;
      if (startVal > endVal) return;

      const key = 'custom_' + startVal + '_' + endVal;
      label.textContent = startVal + ' to ' + endVal;
      popover.querySelectorAll('.sp-date-opt').forEach(o => o.classList.remove('selected'));
      popover.querySelector('[data-range="custom"]')?.classList.add('selected');

      try {
        allSeries[key] = await DB.fetchDailySeriesByRange(client.id, startVal, endVal);
      } catch (_) { allSeries[key] = []; }
      drawChart(key);
      popover.classList.remove('open');
      customFields.classList.remove('open');
    });
  }
  wireDateDropdown();

  requestAnimationFrame(() => drawChart(30));
}

// ── Shared detail renderer ─────────────────────────────────────
function renderDetail(app, client, isAgency) {
  let tf   = 'month';
  let live = null; // { metrics, revenueSeries, recentOrders, recentEmails, recentEvents, subscribers }

  function draw() {
    const metrics      = live?.metrics       || client.metrics;
    const revSer       = live?.revenueSeries  || client.revenueSeries;
    const orders       = live?.recentOrders   || client.recentOrders;
    const emails       = live?.recentEmails   || client.recentEmails;
    const recentEvents = live?.recentEvents   || [];
    const subscribers  = live?.subscribers    || [];

    destroyChart();
    const m      = metrics;
    const isEcom = client.niche === 'ecommerce';
    const series = revSer[tf === 'today' ? 'week' : tf] || [];
    const hasRev = m.revenue[tf] > 0;
    const convBase = isEcom ? m.orders[tf] : m.leads[tf];
    const conv = m.sessions[tf] > 0 && convBase > 0
      ? ((convBase / m.sessions[tf]) * 100).toFixed(1) + '%' : '—';

    const trackerSnippet = `&lt;script src="https://project-kday6.vercel.app/tracker/tracker.js" data-client="${esc(client.id)}"&gt;&lt;/script&gt;`;

    const innerContent = `
      <div class="client-header-strip">
        <div class="chs-avatar" style="background:${esc(client.color)}">${esc(client.initials)}</div>
        <div>
          <div class="chs-name">${esc(client.name)}</div>
          <div class="chs-domain">${esc(client.domain)}</div>
        </div>
        <div class="chs-plan">${esc(client.plan)}</div>
      </div>

      <div class="tf-row">
        ${['today','week','month','all'].map(t => `
          <button class="tf-btn${tf === t ? ' active' : ''}" data-tf="${t}">
            ${t === 'today' ? 'Today' : t === 'week' ? 'Week' : t === 'month' ? 'Month' : 'All'}
          </button>`).join('')}
      </div>

      ${series.length > 0 || hasRev ? `
      <div class="section">
        <div class="card">
          <div class="chart-card-inner">
            <div class="chart-top">
              <div>
                <div class="chart-eyebrow">Revenue</div>
                <div class="chart-amount">${esc(fmt(m.revenue[tf]))}</div>
              </div>
              <div class="chart-period">${esc(tfLabel(tf))}</div>
            </div>
            <div class="chart-wrap"><canvas id="rev-chart"></canvas></div>
          </div>
        </div>
      </div>` : ''}

      <div class="section">
        <div class="section-label">Performance · ${esc(tfLabel(tf))}</div>
        <div class="metrics-grid">
          <div class="metric-card${hasRev ? ' featured' : ''}">
            <div class="m-label">💰 Revenue</div>
            <div class="m-value">${esc(fmt(m.revenue[tf]))}</div>
          </div>
          <div class="metric-card">
            <div class="m-label">👁 Sessions</div>
            <div class="m-value">${esc(num(m.sessions[tf]))}</div>
          </div>
          <div class="metric-card">
            <div class="m-label">${isEcom ? '🛒 Orders' : '📩 Leads'}</div>
            <div class="m-value">${isEcom ? esc(num(m.orders[tf])) : esc(num(m.leads[tf]))}</div>
          </div>
          <div class="metric-card">
            <div class="m-label">📧 Emails</div>
            <div class="m-value">${esc(num(m.emails[tf]))}</div>
          </div>
          ${isEcom ? `
          <div class="metric-card">
            <div class="m-label">🛍️ Add to cart</div>
            <div class="m-value">${esc(num(m.addToCarts[tf]))}</div>
          </div>` : `
          <div class="metric-card">
            <div class="m-label">🎯 Total leads</div>
            <div class="m-value">${esc(num(m.leads[tf] + m.emails[tf]))}</div>
          </div>`}
          <div class="metric-card">
            <div class="m-label">📈 Conv. rate</div>
            <div class="m-value">${esc(conv)}</div>
          </div>
        </div>
      </div>

      ${orders.length ? `
      <div class="section">
        <div class="section-label">Recent orders</div>
        <div class="card">
          ${orders.map(o => `
            <div class="table-row">
              <div class="row-ava">${esc(initials(o.customer))}</div>
              <div class="row-main">
                <div class="row-name">${esc(o.customer)}</div>
                <div class="row-sub">${esc(o.id)} · ${esc(o.date)}</div>
              </div>
              <div class="row-right">
                <div class="row-amount">$${esc(String(o.amount))}</div>
                <span class="badge ${esc(o.status)}">${esc(o.status)}</span>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}

      <div class="section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div class="section-label" style="margin-bottom:0">Subscribers <span id="sub-count" style="color:var(--text-secondary);font-weight:400">(${subscribers.length})</span></div>
          ${subscribers.length ? `<button id="compose-btn" class="btn-pill" style="font-size:0.72rem;padding:7px 14px">✉️ Send email</button>` : ''}
        </div>
        ${subscribers.length ? `
        <input id="sub-search" type="search" placeholder="Search subscribers…"
          style="width:100%;box-sizing:border-box;padding:9px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:0.82rem;font-family:inherit;color:var(--text-primary);background:var(--soft-gray);outline:none;margin-bottom:8px" />
        <div class="card" style="max-height:320px;overflow-y:auto" id="sub-list">
          ${subscribers.map(s => `
          <div class="table-row sub-row">
            <div style="font-size:1rem;flex-shrink:0">✉️</div>
            <div class="row-main">
              <div class="row-name sub-email">${esc(s.email)}</div>
              <div class="row-sub">${esc(s.source)} · ${esc(s.date)}</div>
            </div>
          </div>`).join('')}
        </div>` : `
        <div class="card">
          <div class="empty-state" style="padding:32px 20px">
            <div class="es-icon">✉️</div>
            <div class="es-text">No subscribers yet — emails captured on the site will appear here</div>
          </div>
        </div>`}
      </div>

      <div class="section">
        <div class="section-label">Live activity</div>
        <div class="card">
          ${recentEvents.length ? recentEvents.map(e => {
            const label = e.event_type.replace(/_/g, ' ');
            const page  = e.page ? (e.page.length > 32 ? e.page.slice(0, 32) + '…' : e.page) : '';
            return `
            <div class="table-row">
              <div style="font-size:1rem;flex-shrink:0;width:24px;text-align:center">${eventIcon(e.event_type)}</div>
              <div class="row-main">
                <div class="row-name" style="text-transform:capitalize">${esc(label)}</div>
                ${page ? `<div class="row-sub">${esc(page)}</div>` : ''}
              </div>
              <div style="font-size:0.68rem;color:var(--text-secondary);flex-shrink:0;white-space:nowrap">${timeAgo(e.ts)}</div>
            </div>`;
          }).join('') : `
          <div class="empty-state" style="padding:32px 20px">
            <div class="es-icon">📡</div>
            <div class="es-text">No events yet — install the tracker snippet below</div>
          </div>`}
        </div>
      </div>

      <div class="section">
        <div class="section-label">Tracker snippet</div>
        <div class="card">
          <div class="table-row" style="flex-direction:column;align-items:flex-start;gap:10px">
            <div style="font-family:monospace;font-size:0.68rem;color:var(--text-secondary);word-break:break-all;line-height:1.6;width:100%">
              ${trackerSnippet}
            </div>
            <button class="btn-pill-outline" id="copy-tracker" style="font-size:0.72rem;padding:6px 16px">Copy snippet</button>
          </div>
        </div>
      </div>

      <div class="page-spacer"></div>`;

    // Update DOM — sidebar persists on re-renders
    if (isAgency) {
      if (!document.getElementById('sidebar')) {
        app.innerHTML = buildLayout({ active:'clients', title:client.name, backRoute:'#clients', content:innerContent });
        wireLayout(app, '#clients');
      } else {
        document.querySelector('.main-content').innerHTML = innerContent;
      }
    } else {
      app.innerHTML = `
        <div style="min-height:100dvh;background:var(--soft-gray)">
          <div style="height:56px;background:var(--sidebar-bg);display:flex;align-items:center;padding:0 12px;gap:10px;position:fixed;top:0;left:0;right:0;z-index:200">
            <div class="sidebar-avatar">${esc(client.initials)}</div>
            <div style="flex:1;font-size:0.85rem;font-weight:700;color:rgba(255,255,255,0.9);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(client.name)}</div>
            <button class="mobile-icon-btn" id="cl-logout" title="Sign out">⏻</button>
          </div>
          <div style="padding-top:56px">${innerContent}</div>
        </div>`;
      document.getElementById('cl-logout').addEventListener('click', () => clearSession().then(() => loginView(app)));
    }

    document.querySelectorAll('.tf-btn').forEach(btn =>
      btn.addEventListener('click', () => { tf = btn.dataset.tf; draw(); })
    );

    // Subscriber search
    document.getElementById('sub-search')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.sub-row').forEach(row => {
        const email = row.querySelector('.sub-email')?.textContent.toLowerCase() || '';
        row.style.display = email.includes(q) ? '' : 'none';
      });
    });

    // Compose button
    document.getElementById('compose-btn')?.addEventListener('click', () => {
      const subs = live?.subscribers || [];
      showComposeModal(app, client, subs);
    });

    document.getElementById('copy-tracker')?.addEventListener('click', () => {
      const snippet = `<script src="https://project-kday6.vercel.app/tracker/tracker.js" data-client="${client.id}"></script>`;
      navigator.clipboard?.writeText(snippet).then(() => {
        const btn = document.getElementById('copy-tracker');
        if (btn) { btn.textContent = 'Copied!'; setTimeout(() => { if (btn) btn.textContent = 'Copy snippet'; }, 2000); }
      });
    });

    requestAnimationFrame(() => {
      const s = revSer[tf === 'today' ? 'week' : tf];
      if (s && s.length) renderChart('rev-chart', s, client.color);
    });
  }

  // Initial render (mock or normalized data)
  draw();

  // Fetch live Supabase data in background
  (async () => {
    try {
      const [metrics, todayLive, sw, sm, sa, liveOrders, liveEmails, recentEvents, allSubs] = await Promise.all([
        DB.fetchMetricsSummary(client.id),
        DB.fetchLiveTodayMetrics(client.id),
        DB.fetchRevenueSeries(client.id, 7),
        DB.fetchRevenueSeries(client.id, 30),
        DB.fetchRevenueSeries(client.id, 90),
        DB.fetchRecentOrders(client.id),
        DB.fetchRecentEmails(client.id),
        DB.fetchRecentEvents(client.id, 25),
        DB.fetchAllSubscribers(client.id),
      ]);
      if (!document.querySelector('.client-header-strip')) return;
      // Overlay today's numbers with live-computed values (bypass daily rollup lag)
      const patchedMetrics = { ...metrics };
      for (const key of ['revenue','sessions','leads','emails','orders','addToCarts']) {
        patchedMetrics[key] = { ...metrics[key], today: todayLive[key] ?? metrics[key].today };
      }
      live = {
        metrics:      patchedMetrics,
        revenueSeries:{ week:sw, month:sm, all:sa },
        recentOrders: liveOrders,
        recentEmails: liveEmails,
        recentEvents,
        subscribers:  allSubs,
      };
      draw();
    } catch (_) {}
  })();
}

// ── Reports ────────────────────────────────────────────────────
export async function reportsView(app) {
  destroyChart();
  let tf = 'month';

  app.innerHTML = buildLayout({
    active: 'reports', title: 'Reports',
    content: `
      <div class="page-topbar"><div class="page-topbar-title">Reports</div></div>
      <div class="section"><div class="skel" style="height:200px;border-radius:var(--radius-lg)"></div></div>
      <div class="section"><div class="skel" style="height:100px;border-radius:var(--radius-lg)"></div></div>
      <div class="section"><div class="skel" style="height:180px;border-radius:var(--radius-lg)"></div></div>
    `,
  });
  wireLayout(app);

  let clients;
  try {
    clients = await DB.fetchClientsWithMetrics();
  } catch (_) {
    clients = MOCK_CLIENTS;
  }

  function buildContent() {
    const tfKey       = tf === 'today' ? 'week' : tf;
    const days        = { week: 7, month: 30, all: 365 }[tfKey] || 30;
    const totalRev    = clients.reduce((s, c) => s + c.metrics.revenue[tf],    0);
    const totalSess   = clients.reduce((s, c) => s + c.metrics.sessions[tf],   0);
    const totalLeads  = clients.reduce((s, c) => s + c.metrics.leads[tf] + c.metrics.emails[tf], 0);
    const totalOrders = clients.reduce((s, c) => s + c.metrics.orders[tf],     0);
    return { days, html: `
      <div class="page-topbar">
        <div class="page-topbar-title">Reports</div>
        <button class="btn-pill" id="download-pdf" style="font-size:0.72rem;padding:7px 14px">Download PDF</button>
      </div>

      <div class="tf-row" style="padding-top:16px">
        ${['today','week','month','all'].map(t => `
          <button class="tf-btn${tf === t ? ' active' : ''}" data-tf="${t}">
            ${t==='today'?'Today':t==='week'?'Week':t==='month'?'Month':'All'}
          </button>`).join('')}
      </div>

      <div class="section">
        <div class="card">
          <div class="chart-card-inner">
            <div class="chart-top">
              <div>
                <div class="chart-eyebrow">Total Revenue</div>
                <div class="chart-amount">${esc(fmt(totalRev))}</div>
              </div>
              <div class="chart-period">${esc(tfLabel(tf))}</div>
            </div>
            <div class="chart-wrap"><canvas id="report-chart"></canvas></div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-label">All clients · ${esc(tfLabel(tf))}</div>
        <div class="metrics-grid">
          <div class="metric-card featured"><div class="m-label">💰 Revenue</div><div class="m-value">${esc(fmt(totalRev))}</div></div>
          <div class="metric-card"><div class="m-label">👁 Sessions</div><div class="m-value">${esc(num(totalSess))}</div></div>
          <div class="metric-card"><div class="m-label">🛒 Orders</div><div class="m-value">${esc(num(totalOrders))}</div></div>
          <div class="metric-card"><div class="m-label">🎯 Leads</div><div class="m-value">${esc(num(totalLeads))}</div></div>
        </div>
      </div>

      <div class="section">
        <div class="section-label">Client breakdown</div>
        <div class="card">
          ${clients.map(c => {
            const rev   = c.metrics.revenue[tf];
            const leads = c.metrics.leads[tf] + c.metrics.emails[tf];
            const sess  = c.metrics.sessions[tf];
            const pct   = trendPct(c.revenueSeries?.month || []);
            return `
            <div class="table-row" style="cursor:pointer" data-id="${esc(c.id)}">
              <div class="client-avatar" style="background:${esc(c.color)};width:32px;height:32px;border-radius:8px;font-size:0.65rem">${esc(c.initials)}</div>
              <div class="row-main">
                <div class="row-name">${esc(c.name)}</div>
                <div class="row-sub">${esc(num(sess))} sessions · ${esc(num(leads))} leads</div>
              </div>
              <div class="row-right">
                <div class="row-amount">${rev > 0 ? esc(fmt(rev)) : '—'}</div>
                <div style="margin-top:2px">${trendBadge(pct)}</div>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="page-spacer"></div>
    `};
  }

  async function draw() {
    destroyChart();
    const { days, html } = buildContent();
    const mainEl = document.querySelector('.main-content');
    if (mainEl) {
      mainEl.innerHTML = html;
    } else {
      app.innerHTML = buildLayout({ active: 'reports', title: 'Reports', content: html });
      wireLayout(app);
    }

    document.querySelectorAll('.tf-btn').forEach(btn =>
      btn.addEventListener('click', () => { tf = btn.dataset.tf; draw(); })
    );
    document.querySelectorAll('[data-id]').forEach(row =>
      row.addEventListener('click', () => location.hash = '#client/' + row.dataset.id)
    );

    // PDF download
    document.getElementById('download-pdf')?.addEventListener('click', () => {
      generateReportPDF(clients, tf);
    });

    // Fetch and render revenue chart in background
    try {
      const ecom = clients.filter(c => c.niche === 'ecommerce');
      if (ecom.length) {
        const seriesArrays = await Promise.all(ecom.map(c => DB.fetchRevenueSeries(c.id, days)));
        const combined = mergeSeries(seriesArrays);
        if (combined.length) { renderChart('report-chart', combined, '#0064E0'); return; }
      }
    } catch (_) {}
    const wrap = document.querySelector('.chart-wrap');
    if (wrap) wrap.innerHTML = '<div class="empty-state"><div class="es-icon">📊</div><div class="es-text">No revenue data for this period</div></div>';
  }

  await draw();
}

// ── Settings ───────────────────────────────────────────────────
export async function settingsView(app) {
  destroyChart();

  app.innerHTML = buildLayout({
    active: 'settings', title: 'Settings',
    content: `
      <div class="page-topbar"><div class="page-topbar-title">Settings</div></div>
      <div class="section"><div class="skel" style="height:100px;border-radius:var(--radius-lg)"></div></div>
      <div class="section"><div class="skel" style="height:200px;border-radius:var(--radius-lg)"></div></div>
    `,
  });
  wireLayout(app);

  let clients, isReal = true;
  try {
    const sbClients = await DB.fetchClients();
    if (sbClients.length > 0) {
      clients = sbClients;
    } else {
      clients = MOCK_CLIENTS;
      isReal  = false;
    }
  } catch (_) {
    clients = MOCK_CLIENTS;
    isReal  = false;
  }

  function clientRows() {
    return clients.map(c => {
      const creds = isReal ? null : CREDS_MAP[c.id];
      const email = creds ? creds.email : (c.login_email || '');
      const pw    = creds ? creds.password : '';
      return `
        <div class="table-row">
          <div class="client-avatar" style="background:${esc(c.color)};width:32px;height:32px;border-radius:8px;font-size:0.65rem;flex-shrink:0">${esc(c.initials)}</div>
          <div class="row-main">
            <div class="row-name">${esc(c.name)}</div>
            ${email || creds
              ? `<div class="cred-reveal" data-email="${esc(email)}" data-pw="${esc(pw)}"
                   style="cursor:pointer;color:var(--blue);font-size:0.75rem">Tap to reveal login</div>`
              : `<div style="font-size:0.75rem;color:var(--text-secondary)">${esc(c.domain || '—')}</div>`}
          </div>
          <button class="del-client-btn" data-id="${esc(c.id)}" data-name="${esc(c.name)}"
            style="background:none;border:none;color:#E02020;font-size:0.9rem;cursor:pointer;padding:8px;opacity:0.65;flex-shrink:0;-webkit-tap-highlight-color:transparent"
            title="Delete">✕</button>
        </div>`;
    }).join('');
  }

  const main = document.querySelector('.main-content');
  main.innerHTML = `
    <div class="page-topbar"><div class="page-topbar-title">Settings</div></div>

    <div class="section">
      <div class="section-label">Agency account</div>
      <div class="card">
        <div class="table-row">
          <div class="row-main">
            <div class="row-name">Kalnyesgrowth</div>
            <div class="row-sub">Agency owner</div>
          </div>
          <div style="font-size:0.72rem;color:var(--green-light);font-weight:600;flex-shrink:0">Active</div>
        </div>
        <div class="table-row">
          <div class="row-main">
            <div class="row-name">admin@kalnyesgrowth.com</div>
            <div class="row-sub">Login email</div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <div class="section-label" style="margin-bottom:0">Clients <span id="client-count" style="font-weight:400;color:var(--text-secondary)">(${clients.length})</span></div>
        <button class="btn-pill" id="add-client-btn" style="font-size:0.72rem;padding:7px 16px">+ Add client</button>
      </div>
      <div class="card" id="clients-list">${clientRows()}</div>
    </div>

    <div class="section">
      <div class="section-label">Tracker setup</div>
      <div style="font-size:0.78rem;color:var(--text-secondary);margin-bottom:10px;line-height:1.5">
        Paste each client's snippet into their website — just before <code style="font-family:monospace;background:var(--soft-gray);padding:1px 5px;border-radius:4px">&lt;/body&gt;</code>.
      </div>
      <div class="card" id="tracker-list">
        ${clients.map(c => `
        <div style="padding:14px 0;border-bottom:1px solid var(--border)">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
            <div class="client-avatar" style="background:${esc(c.color)};width:28px;height:28px;border-radius:7px;font-size:0.6rem;flex-shrink:0">${esc(c.initials)}</div>
            <div style="font-size:0.85rem;font-weight:600;color:var(--text-primary)">${esc(c.name)}</div>
            <div style="font-size:0.72rem;color:var(--text-secondary);margin-left:auto">${esc(c.domain || '')}</div>
          </div>
          <div style="position:relative">
            <pre id="snippet-${esc(c.id)}" style="margin:0;background:var(--soft-gray);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;font-size:0.68rem;font-family:monospace;color:var(--text-primary);white-space:pre-wrap;word-break:break-all;line-height:1.5;padding-right:72px">&lt;script src="https://project-kday6.vercel.app/tracker/tracker.js"
  data-client="${esc(c.id)}"&gt;&lt;/script&gt;</pre>
            <button class="copy-snippet-btn" data-client-id="${esc(c.id)}"
              style="position:absolute;top:8px;right:8px;background:var(--blue);color:#fff;border:none;border-radius:6px;padding:4px 10px;font-size:0.68rem;font-weight:600;cursor:pointer;white-space:nowrap">
              Copy
            </button>
          </div>
        </div>`).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-label">Plan</div>
      <div class="card">
        <div class="table-row">
          <div class="row-main">
            <div class="row-name">Agency Dashboard v1</div>
            <div class="row-sub">${clients.length} client${clients.length !== 1 ? 's' : ''} · live Supabase tracking</div>
          </div>
          <div style="font-size:0.7rem;color:var(--text-secondary);flex-shrink:0">v1.0</div>
        </div>
        <div class="table-row">
          <div class="row-main">
            <div class="row-name">$200 / mo per client</div>
            <div class="row-sub">Billing via Stripe — coming soon</div>
          </div>
        </div>
      </div>
    </div>

    <div class="section">
      <div class="card">
        <div class="table-row" id="signout-row" style="cursor:pointer">
          <div class="row-name" style="color:#E02020">Sign out</div>
        </div>
      </div>
    </div>
    <div class="page-spacer"></div>
  `;

  // Event delegation handles both reveal and delete, survives innerHTML re-renders
  document.getElementById('clients-list').addEventListener('click', async e => {
    const reveal = e.target.closest('.cred-reveal');
    if (reveal) {
      if (reveal.dataset.revealed) {
        reveal.textContent = 'Tap to reveal login';
        delete reveal.dataset.revealed;
      } else {
        const email = reveal.dataset.email;
        const pw    = reveal.dataset.pw;
        reveal.textContent = pw ? `${email} · ${pw}` : (email || 'Login not stored');
        reveal.dataset.revealed = '1';
      }
      return;
    }

    const del = e.target.closest('.del-client-btn');
    if (del) {
      const name = del.dataset.name;
      const id   = del.dataset.id;
      if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
      del.disabled = true;
      try {
        await DB.deleteClient(id);
        clients = clients.filter(c => c.id !== id);
        document.getElementById('clients-list').innerHTML = clientRows();
        document.getElementById('client-count').textContent = `(${clients.length})`;
        showToast(`${name} deleted`);
      } catch (err) {
        showToast('Delete failed: ' + (err.message || 'Unknown error'));
        del.disabled = false;
      }
    }
  });

  document.getElementById('tracker-list').addEventListener('click', e => {
    const btn = e.target.closest('.copy-snippet-btn');
    if (!btn) return;
    const id  = btn.dataset.clientId;
    const pre = document.getElementById('snippet-' + id);
    if (!pre) return;
    navigator.clipboard.writeText(pre.textContent.trim()).then(() => {
      btn.textContent = 'Copied!';
      btn.style.background = 'var(--green-light)';
      setTimeout(() => { btn.textContent = 'Copy'; btn.style.background = 'var(--blue)'; }, 2000);
    }).catch(() => {
      const sel = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(pre);
      sel.removeAllRanges();
      sel.addRange(range);
    });
  });

  document.getElementById('add-client-btn').addEventListener('click', () => showAddClientModal(app));
  document.getElementById('signout-row').addEventListener('click', () => clearSession().then(() => loginView(app)));
}

// ── Add Client Modal ───────────────────────────────────────────
const SELECT_STYLE = 'width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:0.88rem;font-family:inherit;color:var(--text-primary);background:var(--soft-gray);outline:none;-webkit-appearance:none';

function genPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function showAddClientModal(app) {
  let selectedColor = PRESET_COLORS[0];

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" id="add-modal">
      <div class="modal-header">
        <div class="modal-title">Add new client</div>
        <button class="modal-close" id="modal-close-btn">✕</button>
      </div>
      <div class="modal-body">

        <div class="form-group">
          <label>Business name</label>
          <input id="nc-name" type="text" placeholder="Maria's Beauty Salon" />
        </div>
        <div class="form-group">
          <label>Domain</label>
          <input id="nc-domain" type="text" placeholder="clientsite.com" inputmode="url" />
        </div>
        <div class="form-group">
          <label>Niche</label>
          <select id="nc-niche" style="${SELECT_STYLE}">
            <option value="service">Service business</option>
            <option value="ecommerce">E-commerce</option>
          </select>
        </div>
        <div class="form-group">
          <label>Plan</label>
          <select id="nc-plan" style="${SELECT_STYLE}">
            <option>Presencia Pro</option>
            <option>Máquina de Clientes</option>
            <option>Sistema Completo</option>
          </select>
        </div>
        <div class="form-group">
          <label>Brand color</label>
          <div class="color-swatches" id="color-swatches">
            ${PRESET_COLORS.map((c, i) => `
              <button type="button" class="color-swatch${i === 0 ? ' selected' : ''}"
                data-color="${c}" style="background:${c}" aria-label="${c}"></button>
            `).join('')}
          </div>
        </div>

        <div style="margin:18px 0 12px;padding-top:16px;border-top:1px solid var(--divider)">
          <div style="font-size:0.72rem;font-weight:700;letter-spacing:0.05em;text-transform:uppercase;color:var(--text-secondary);margin-bottom:12px">
            Client login credentials
          </div>
          <div class="form-group">
            <label>Login email</label>
            <input id="nc-email" type="email" placeholder="client@theirbusiness.com"
                   autocomplete="off" inputmode="email" />
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label>Password</label>
            <div style="display:flex;gap:8px">
              <input id="nc-pass" type="text" placeholder="min. 8 characters"
                     autocomplete="new-password" style="flex:1" />
              <button type="button" id="gen-pass"
                style="flex-shrink:0;padding:0 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:0.75rem;font-weight:600;color:var(--blue);background:var(--blue-bg);cursor:pointer;white-space:nowrap;-webkit-tap-highlight-color:transparent">
                Generate
              </button>
            </div>
          </div>
        </div>

        <div class="modal-err" id="modal-err"></div>
      </div>
      <div class="modal-footer">
        <button class="btn-pill" id="modal-submit" style="flex:1">Add client</button>
        <button class="btn-pill-outline" id="modal-cancel">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(backdrop);

  const close = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  document.getElementById('modal-close-btn').addEventListener('click', close);
  document.getElementById('modal-cancel').addEventListener('click', close);

  document.getElementById('gen-pass').addEventListener('click', () => {
    const pw = genPassword();
    document.getElementById('nc-pass').value = pw;
    document.getElementById('nc-pass').type = 'text';
  });

  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      selectedColor = sw.dataset.color;
    });
  });

  document.getElementById('modal-submit').addEventListener('click', async () => {
    const nameEl    = document.getElementById('nc-name');
    const domainEl  = document.getElementById('nc-domain');
    const nicheEl   = document.getElementById('nc-niche');
    const planEl    = document.getElementById('nc-plan');
    const emailEl   = document.getElementById('nc-email');
    const passEl    = document.getElementById('nc-pass');
    const errEl     = document.getElementById('modal-err');
    const submitBtn = document.getElementById('modal-submit');

    const name     = nameEl.value.trim();
    const domain   = domainEl.value.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
    const niche    = nicheEl.value;
    const plan     = planEl.value;
    const email    = emailEl.value.trim();
    const password = passEl.value.trim();

    errEl.textContent = '';
    if (!name)     { errEl.textContent = 'Business name is required.';   nameEl.focus();   return; }
    if (!domain)   { errEl.textContent = 'Domain is required.';          domainEl.focus(); return; }
    if (!email)    { errEl.textContent = 'Login email is required.';     emailEl.focus();  return; }
    if (!password) { errEl.textContent = 'Password is required.';        passEl.focus();   return; }
    if (password.length < 8) { errEl.textContent = 'Password must be at least 8 characters.'; passEl.focus(); return; }

    const autoInitials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();

    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving…';

    let newClient = null;
    try {
      // Step 1 — create client record
      newClient = await DB.addClient({ name, domain, color: selectedColor, initials: autoInitials, plan, niche });

      // Step 2 — create login via edge function
      submitBtn.textContent = 'Creating login…';
      await DB.createClientUser(email, password, newClient.id);

      close();
      showToast('Client added ✓');
      location.hash = '#clients';

    } catch (e) {
      // If client row was created but login failed, roll back the client row
      if (newClient) {
        try { await DB.deleteClient(newClient.id); } catch (_) {}
      }
      errEl.textContent = e.message || 'Something went wrong. Please try again.';
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add client';
    }
  });
}

// ── Leads View (Agency) ───────────────────────────────────────
export async function leadsView(app) {
  destroyChart();
  app.innerHTML = buildLayout({
    active: 'leads', title: 'Leads',
    content: `
      <div class="page-topbar"><div class="page-topbar-title">Leads</div></div>
      <div class="section"><div class="skel" style="height:60px;border-radius:var(--radius-lg)"></div></div>
      <div class="section"><div class="skel" style="height:300px;border-radius:var(--radius-lg)"></div></div>
    `,
  });
  wireLayout(app);

  let leads = [], clients = [];
  try {
    [leads, clients] = await Promise.all([
      DB.fetchLeads(null),
      DB.fetchClients(),
    ]);
  } catch (_) {}

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));
  let stageFilter = 'all';
  let clientFilter = 'all';

  function draw() {
    const filtered = leads.filter(l => {
      if (stageFilter !== 'all' && l.stage !== stageFilter) return false;
      if (clientFilter !== 'all' && l.client_id !== clientFilter) return false;
      return true;
    });

    const stageCounts = { new: 0, contacted: 0, quoted: 0, won: 0, lost: 0 };
    leads.forEach(l => { if (stageCounts[l.stage] !== undefined) stageCounts[l.stage]++; });

    const mc = document.querySelector('.main-content');
    if (!mc) return;

    mc.innerHTML = `
      <div class="page-topbar">
        <div class="page-topbar-title">Leads</div>
      </div>

      <div class="section">
        <div class="pipeline-bar">
          <button class="pipe-pill ${stageFilter === 'all' ? 'active' : ''}" data-stage="all">All ${leads.length}</button>
          <button class="pipe-pill new ${stageFilter === 'new' ? 'active' : ''}" data-stage="new">New ${stageCounts.new}</button>
          <button class="pipe-pill contacted ${stageFilter === 'contacted' ? 'active' : ''}" data-stage="contacted">Contacted ${stageCounts.contacted}</button>
          <button class="pipe-pill quoted ${stageFilter === 'quoted' ? 'active' : ''}" data-stage="quoted">Quoted ${stageCounts.quoted}</button>
          <button class="pipe-pill won ${stageFilter === 'won' ? 'active' : ''}" data-stage="won">Won ${stageCounts.won}</button>
          <button class="pipe-pill lost ${stageFilter === 'lost' ? 'active' : ''}" data-stage="lost">Lost ${stageCounts.lost}</button>
        </div>
      </div>

      <div class="section" style="padding-top:8px">
        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap">
          <select id="leads-client-filter" class="filter-select">
            <option value="all">All Clients</option>
            ${clients.map(c => `<option value="${esc(c.id)}" ${clientFilter === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="section" style="padding-top:0">
        ${filtered.length ? `
        <div class="card">
          ${filtered.map(l => {
            const cl = clientMap[l.client_id];
            const clColor = cl?.color || '#666';
            const clInitials = cl?.initials || '??';
            const isUnread = !l.read;
            return `
            <div class="lead-row ${isUnread ? 'unread' : ''}" data-id="${esc(l.id)}">
              <div class="client-avatar" style="background:${esc(clColor)};width:32px;height:32px;border-radius:8px;font-size:0.6rem">${esc(clInitials)}</div>
              <div class="row-main">
                <div class="row-name">${esc(l.name || l.email || 'Unknown')}</div>
                <div class="row-sub">${esc(l.email || '')}${l.phone ? ' | ' + esc(l.phone) : ''}</div>
                ${l.message ? `<div class="lead-msg-preview">${esc(l.message.length > 80 ? l.message.slice(0, 80) + '...' : l.message)}</div>` : ''}
                <div class="row-sub">${cl ? esc(cl.name) : ''} | ${timeAgo(l.created_at)}</div>
              </div>
              <div style="flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:4px">
                <span class="stage-badge stage-${esc(l.stage)}">${esc(l.stage)}</span>
              </div>
            </div>`;
          }).join('')}
        </div>` : `
        <div class="card">
          <div class="empty-state" style="padding:40px 20px">
            <div class="es-icon">📩</div>
            <div class="es-text">No leads yet. Leads will appear here when someone fills out a form on a client's website.</div>
          </div>
        </div>`}
      </div>
      <div class="page-spacer"></div>`;

    mc.querySelectorAll('.pipe-pill').forEach(btn =>
      btn.addEventListener('click', () => { stageFilter = btn.dataset.stage; draw(); })
    );
    mc.querySelector('#leads-client-filter')?.addEventListener('change', e => {
      clientFilter = e.target.value;
      draw();
    });
    mc.querySelectorAll('.lead-row').forEach(row =>
      row.addEventListener('click', () => location.hash = '#lead/' + row.dataset.id)
    );
  }

  draw();

  // Update badge
  try {
    const unread = await DB.countUnreadLeads();
    const badge = document.getElementById('leads-badge');
    if (badge && unread > 0) {
      badge.textContent = unread;
      badge.style.display = '';
    }
  } catch (_) {}
}

// ── Lead Detail View ──────────────────────────────────────────
export async function leadDetailView(app, leadId) {
  destroyChart();
  app.innerHTML = buildLayout({
    active: 'leads', title: 'Lead Detail', backRoute: '#leads',
    content: `
      <div class="section"><div class="skel" style="height:200px;border-radius:var(--radius-lg)"></div></div>
    `,
  });
  wireLayout(app, '#leads');

  let lead, client;
  try {
    lead = await DB.fetchLead(leadId);
    if (lead) client = await DB.fetchClient(lead.client_id);
  } catch (_) {}

  if (!lead) { location.hash = '#leads'; return; }

  // Mark as read
  if (!lead.read) {
    try { await DB.updateLead(leadId, { read: true }); lead.read = true; } catch (_) {}
  }

  function draw() {
    const notes = Array.isArray(lead.notes) ? lead.notes : [];
    const mc = document.querySelector('.main-content');
    if (!mc) return;

    mc.innerHTML = `
      <div class="page-topbar" style="padding-bottom:12px">
        <div class="page-topbar-title">${esc(lead.name || lead.email || 'Lead')}</div>
      </div>

      <div class="section">
        <div class="card" style="padding:18px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px">
            ${client ? `<div class="client-avatar" style="background:${esc(client.color)};width:36px;height:36px;border-radius:9px;font-size:0.65rem">${esc(client.initials)}</div>` : ''}
            <div>
              <div style="font-size:0.92rem;font-weight:700;color:var(--text-primary)">${esc(lead.name || 'Unknown')}</div>
              ${client ? `<div style="font-size:0.72rem;color:var(--text-secondary)">${esc(client.name)}</div>` : ''}
            </div>
          </div>
          <div class="lead-detail-grid">
            ${lead.email ? `<div class="ld-field"><div class="ld-label">Email</div><div class="ld-value"><a href="mailto:${esc(lead.email)}">${esc(lead.email)}</a> <button class="copy-btn" data-copy="${esc(lead.email)}">Copy</button></div></div>` : ''}
            ${lead.phone ? `<div class="ld-field"><div class="ld-label">Phone</div><div class="ld-value"><a href="tel:${esc(lead.phone)}">${esc(lead.phone)}</a> <button class="copy-btn" data-copy="${esc(lead.phone)}">Copy</button></div></div>` : ''}
            ${lead.source_url ? `<div class="ld-field"><div class="ld-label">Source</div><div class="ld-value">${esc(lead.source_url)}</div></div>` : ''}
            <div class="ld-field"><div class="ld-label">Submitted</div><div class="ld-value">${new Date(lead.created_at).toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div></div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="section-label">Stage</div>
        <div class="stage-selector">
          ${['new', 'contacted', 'quoted', 'won', 'lost'].map(s =>
            `<button class="stage-btn stage-${s} ${lead.stage === s ? 'active' : ''}" data-stage="${s}">${s.charAt(0).toUpperCase() + s.slice(1)}</button>`
          ).join('')}
        </div>
      </div>

      ${lead.message ? `
      <div class="section">
        <div class="section-label">Message</div>
        <div class="card" style="padding:16px;border-left:3px solid var(--blue)">
          <div style="font-size:0.85rem;color:var(--text-primary);line-height:1.6;white-space:pre-wrap">${esc(lead.message)}</div>
        </div>
      </div>` : ''}

      <div class="section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div class="section-label" style="margin-bottom:0">Notes</div>
          <button class="btn-pill" id="add-note-btn" style="font-size:0.72rem;padding:7px 14px">+ Add Note</button>
        </div>
        <div id="note-form-area"></div>
        ${notes.length ? `
        <div class="card">
          ${notes.map(n => `
          <div class="table-row" style="flex-direction:column;align-items:flex-start;gap:4px">
            <div style="font-size:0.65rem;color:var(--text-secondary)">${new Date(n.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
            <div style="font-size:0.82rem;color:var(--text-primary);line-height:1.5">${esc(n.text)}</div>
          </div>`).join('')}
        </div>` : `
        <div class="card">
          <div class="empty-state" style="padding:24px 16px">
            <div class="es-text">No notes yet</div>
          </div>
        </div>`}
      </div>

      <div class="section">
        <div class="section-label">Actions</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${lead.email ? `<a href="mailto:${esc(lead.email)}" class="btn-pill" style="font-size:0.78rem;text-decoration:none">Send Email</a>` : ''}
          <button class="btn-pill-outline" id="add-to-contacts" style="font-size:0.78rem">Add to Contacts</button>
          <button class="btn-pill-outline" id="delete-lead" style="font-size:0.78rem;color:var(--red);border-color:var(--red)">Delete</button>
        </div>
      </div>
      <div class="page-spacer"></div>`;

    // Wire stage buttons
    mc.querySelectorAll('.stage-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const newStage = btn.dataset.stage;
        if (newStage === lead.stage) return;
        try {
          const notes = Array.isArray(lead.notes) ? [...lead.notes] : [];
          notes.unshift({ text: 'Stage changed from ' + lead.stage + ' to ' + newStage, ts: new Date().toISOString() });
          await DB.updateLead(leadId, { stage: newStage, notes });
          lead.stage = newStage;
          lead.notes = notes;
          draw();
          showToast('Stage updated');
        } catch (e) { showToast('Failed: ' + (e.message || 'Unknown error')); }
      });
    });

    // Copy buttons
    mc.querySelectorAll('.copy-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        navigator.clipboard?.writeText(btn.dataset.copy).then(() => {
          btn.textContent = 'Copied!';
          setTimeout(() => { btn.textContent = 'Copy'; }, 1500);
        });
      });
    });

    // Add note
    document.getElementById('add-note-btn')?.addEventListener('click', () => {
      const area = document.getElementById('note-form-area');
      if (!area || area.querySelector('textarea')) return;
      area.innerHTML = `
        <div class="card" style="padding:14px;margin-bottom:10px">
          <textarea id="note-input" rows="3" placeholder="Add a note..." style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:16px;font-family:inherit;color:var(--text-primary);background:var(--soft-gray);outline:none;resize:vertical"></textarea>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn-pill" id="save-note" style="font-size:0.72rem;padding:7px 14px">Save</button>
            <button class="btn-pill-outline" id="cancel-note" style="font-size:0.72rem;padding:7px 14px">Cancel</button>
          </div>
        </div>`;
      document.getElementById('note-input')?.focus();
      document.getElementById('cancel-note')?.addEventListener('click', () => { area.innerHTML = ''; });
      document.getElementById('save-note')?.addEventListener('click', async () => {
        const text = document.getElementById('note-input')?.value?.trim();
        if (!text) return;
        try {
          const updated = await DB.addLeadNote(leadId, text);
          lead.notes = updated.notes;
          draw();
          showToast('Note added');
        } catch (e) { showToast('Failed: ' + (e.message || 'Unknown error')); }
      });
    });

    // Add to contacts
    document.getElementById('add-to-contacts')?.addEventListener('click', async () => {
      try {
        await DB.addContact({
          client_id: lead.client_id,
          name: lead.name,
          email: lead.email,
          phone: lead.phone,
          source: 'form',
          tags: [],
        });
        showToast('Added to contacts');
      } catch (e) { showToast('Failed: ' + (e.message || 'Already exists?')); }
    });

    // Delete lead
    document.getElementById('delete-lead')?.addEventListener('click', async () => {
      if (!confirm('Delete this lead? This cannot be undone.')) return;
      try {
        await DB.deleteLead(leadId);
        showToast('Lead deleted');
        location.hash = '#leads';
      } catch (e) { showToast('Failed: ' + (e.message || 'Unknown error')); }
    });
  }

  draw();
}

// ── Contacts View (Agency) ────────────────────────────────────
export async function contactsView(app) {
  destroyChart();
  app.innerHTML = buildLayout({
    active: 'contacts', title: 'Contacts',
    content: `
      <div class="page-topbar"><div class="page-topbar-title">Contacts</div></div>
      <div class="section"><div class="skel" style="height:300px;border-radius:var(--radius-lg)"></div></div>
    `,
  });
  wireLayout(app);

  let contacts = [], clients = [];
  try {
    [contacts, clients] = await Promise.all([
      DB.fetchContacts(null),
      DB.fetchClients(),
    ]);
  } catch (_) {}

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));
  let searchQuery = '';
  let tagFilter = 'all';
  let clientFilter = 'all';

  const allTags = [...new Set(contacts.flatMap(c => c.tags || []))].sort();

  function draw() {
    const filtered = contacts.filter(c => {
      if (clientFilter !== 'all' && c.client_id !== clientFilter) return false;
      if (tagFilter !== 'all' && !(c.tags || []).includes(tagFilter)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const hay = [c.name, c.email, c.phone, ...(c.tags || [])].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const mc = document.querySelector('.main-content');
    if (!mc) return;

    mc.innerHTML = `
      <div class="page-topbar">
        <div>
          <div class="page-topbar-title">Contacts (${contacts.length})</div>
        </div>
        <div style="display:flex;gap:8px">
          <button class="btn-pill" id="add-contact-btn" style="font-size:0.72rem;padding:7px 14px">+ Add</button>
          <button class="btn-pill-outline" id="import-csv-btn" style="font-size:0.72rem;padding:7px 14px">Import CSV</button>
        </div>
      </div>

      <div class="section" style="padding-top:12px">
        <input id="contacts-search" type="search" placeholder="Search by name, email, phone, tag..." value="${esc(searchQuery)}"
          style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:0.82rem;font-family:inherit;color:var(--text-primary);background:var(--white);outline:none;margin-bottom:10px" />
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">
          <select id="contacts-client-filter" class="filter-select">
            <option value="all">All Clients</option>
            ${clients.map(c => `<option value="${esc(c.id)}" ${clientFilter === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}
          </select>
          ${allTags.length ? `
          <select id="contacts-tag-filter" class="filter-select">
            <option value="all">All Tags</option>
            ${allTags.map(t => `<option value="${esc(t)}" ${tagFilter === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}
          </select>` : ''}
        </div>
      </div>

      <div class="section" style="padding-top:0">
        ${filtered.length ? `
        <div class="card">
          ${filtered.map(c => {
            const cl = clientMap[c.client_id];
            const ini = c.name ? c.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '??';
            return `
            <div class="contact-row" data-id="${esc(c.id)}" style="cursor:pointer">
              <div class="row-ava" style="background:${cl?.color || '#666'};color:#fff;border:none">${esc(ini)}</div>
              <div class="row-main">
                <div class="row-name">${esc(c.name || c.email || 'Unknown')}</div>
                <div class="row-sub">${esc(c.email || '')}${c.phone ? ' | ' + esc(c.phone) : ''}</div>
                ${(c.tags || []).length ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px">${c.tags.map(t => `<span class="tag-pill">${esc(t)}</span>`).join('')}</div>` : ''}
              </div>
              <div style="font-size:0.68rem;color:var(--text-secondary);flex-shrink:0">${new Date(c.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
            </div>`;
          }).join('')}
        </div>` : `
        <div class="card">
          <div class="empty-state" style="padding:40px 20px">
            <div class="es-icon">📇</div>
            <div class="es-text">${searchQuery || tagFilter !== 'all' ? 'No contacts match your search' : 'No contacts yet. Add contacts manually or import a CSV.'}</div>
          </div>
        </div>`}
      </div>
      <div class="page-spacer"></div>`;

    mc.querySelector('#contacts-search')?.addEventListener('input', e => {
      searchQuery = e.target.value;
      draw();
    });
    mc.querySelector('#contacts-client-filter')?.addEventListener('change', e => {
      clientFilter = e.target.value;
      draw();
    });
    mc.querySelector('#contacts-tag-filter')?.addEventListener('change', e => {
      tagFilter = e.target.value;
      draw();
    });
    mc.querySelectorAll('.contact-row').forEach(row =>
      row.addEventListener('click', () => location.hash = '#contact/' + row.dataset.id)
    );

    document.getElementById('add-contact-btn')?.addEventListener('click', () => showAddContactModal(clients, contacts, draw));
    document.getElementById('import-csv-btn')?.addEventListener('click', () => showCsvImportModal(clients, contacts, draw));
  }

  draw();
}

// ── Contact Detail View ───────────────────────────────────────
export async function contactDetailView(app, contactId) {
  destroyChart();
  app.innerHTML = buildLayout({
    active: 'contacts', title: 'Contact', backRoute: '#contacts',
    content: `<div class="section"><div class="skel" style="height:200px;border-radius:var(--radius-lg)"></div></div>`,
  });
  wireLayout(app, '#contacts');

  let contact, client;
  try {
    contact = await DB.fetchContact(contactId);
    if (contact) client = await DB.fetchClient(contact.client_id);
  } catch (_) {}

  if (!contact) { location.hash = '#contacts'; return; }

  const mc = document.querySelector('.main-content');
  if (!mc) return;

  const ini = contact.name ? contact.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() : '??';

  mc.innerHTML = `
    <div class="page-topbar" style="padding-bottom:12px">
      <div class="page-topbar-title">${esc(contact.name || contact.email || 'Contact')}</div>
    </div>

    <div class="section">
      <div class="card" style="padding:18px">
        <div style="display:flex;align-items:center;gap:14px;margin-bottom:14px">
          <div class="row-ava" style="width:48px;height:48px;font-size:0.85rem;background:${client?.color || '#666'};color:#fff;border:none">${esc(ini)}</div>
          <div style="flex:1">
            <div style="font-size:1rem;font-weight:700;color:var(--text-primary)">${esc(contact.name || 'Unknown')}</div>
            ${client ? `<div style="font-size:0.72rem;color:var(--text-secondary)">${esc(client.name)}</div>` : ''}
          </div>
          <button class="btn-pill-outline" id="edit-contact-btn" style="font-size:0.72rem;padding:7px 14px">Edit</button>
        </div>
        <div class="lead-detail-grid">
          ${contact.email ? `<div class="ld-field"><div class="ld-label">Email</div><div class="ld-value"><a href="mailto:${esc(contact.email)}">${esc(contact.email)}</a></div></div>` : ''}
          ${contact.phone ? `<div class="ld-field"><div class="ld-label">Phone</div><div class="ld-value"><a href="tel:${esc(contact.phone)}">${esc(contact.phone)}</a></div></div>` : ''}
          <div class="ld-field"><div class="ld-label">Source</div><div class="ld-value">${esc(contact.source || 'manual')}</div></div>
          <div class="ld-field"><div class="ld-label">Added</div><div class="ld-value">${new Date(contact.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div></div>
        </div>
        ${(contact.tags || []).length ? `
        <div style="margin-top:14px;display:flex;gap:6px;flex-wrap:wrap">
          ${contact.tags.map(t => `<span class="tag-pill">${esc(t)}</span>`).join('')}
        </div>` : ''}
      </div>
    </div>

    ${contact.notes ? `
    <div class="section">
      <div class="section-label">Notes</div>
      <div class="card" style="padding:16px">
        <div style="font-size:0.82rem;color:var(--text-primary);line-height:1.6;white-space:pre-wrap">${esc(contact.notes)}</div>
      </div>
    </div>` : ''}

    <div class="section">
      <div class="section-label">Actions</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        ${contact.email ? `<a href="mailto:${esc(contact.email)}" class="btn-pill" style="font-size:0.78rem;text-decoration:none">Send Email</a>` : ''}
        <button class="btn-pill-outline" id="delete-contact" style="font-size:0.78rem;color:var(--red);border-color:var(--red)">Delete</button>
      </div>
    </div>
    <div class="page-spacer"></div>`;

  document.getElementById('delete-contact')?.addEventListener('click', async () => {
    if (!confirm('Delete this contact?')) return;
    try {
      await DB.deleteContact(contactId);
      showToast('Contact deleted');
      location.hash = '#contacts';
    } catch (e) { showToast('Failed: ' + (e.message || 'Unknown error')); }
  });
}

// ── Add Contact Modal ─────────────────────────────────────────
function showAddContactModal(clients, contactsList, refreshFn) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" id="add-contact-modal">
      <div class="modal-header">
        <div class="modal-title">Add contact</div>
        <button class="modal-close" id="ac-close">x</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Client</label>
          <select id="ac-client" style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:16px;font-family:inherit;color:var(--text-primary);background:var(--soft-gray);outline:none">
            ${clients.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group"><label>Name</label><input id="ac-name" type="text" placeholder="Jane Doe" /></div>
        <div class="form-group"><label>Email</label><input id="ac-email" type="email" placeholder="jane@email.com" /></div>
        <div class="form-group"><label>Phone</label><input id="ac-phone" type="tel" placeholder="(540) 555-0123" /></div>
        <div class="form-group"><label>Tags (comma-separated)</label><input id="ac-tags" type="text" placeholder="VIP, Wedding" /></div>
        <div class="modal-err" id="ac-err"></div>
      </div>
      <div class="modal-footer">
        <button class="btn-pill" id="ac-submit" style="flex:1">Add Contact</button>
        <button class="btn-pill-outline" id="ac-cancel">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  document.getElementById('ac-close')?.addEventListener('click', close);
  document.getElementById('ac-cancel')?.addEventListener('click', close);

  document.getElementById('ac-submit')?.addEventListener('click', async () => {
    const clientId = document.getElementById('ac-client').value;
    const name = document.getElementById('ac-name').value.trim();
    const email = document.getElementById('ac-email').value.trim();
    const phone = document.getElementById('ac-phone').value.trim();
    const tagsStr = document.getElementById('ac-tags').value.trim();
    const errEl = document.getElementById('ac-err');
    const btn = document.getElementById('ac-submit');

    if (!email && !phone) { errEl.textContent = 'Email or phone is required.'; return; }

    const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
    btn.disabled = true;
    btn.textContent = 'Saving...';

    try {
      const newContact = await DB.addContact({ client_id: clientId, name, email, phone, tags, source: 'manual' });
      contactsList.unshift(newContact);
      close();
      showToast('Contact added');
      refreshFn();
    } catch (e) {
      errEl.textContent = e.message || 'Failed to add contact.';
      btn.disabled = false;
      btn.textContent = 'Add Contact';
    }
  });
}

// ── CSV Import Modal ──────────────────────────────────────────
function showCsvImportModal(clients, contactsList, refreshFn) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" id="csv-modal">
      <div class="modal-header">
        <div class="modal-title">Import CSV</div>
        <button class="modal-close" id="csv-close">x</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Client</label>
          <select id="csv-client" style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:16px;font-family:inherit;color:var(--text-primary);background:var(--soft-gray);outline:none">
            ${clients.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>CSV file (with headers: name, email, phone)</label>
          <input id="csv-file" type="file" accept=".csv" style="font-size:16px" />
        </div>
        <div id="csv-preview"></div>
        <div class="modal-err" id="csv-err"></div>
      </div>
      <div class="modal-footer">
        <button class="btn-pill" id="csv-import" style="flex:1" disabled>Import</button>
        <button class="btn-pill-outline" id="csv-cancel">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  document.getElementById('csv-close')?.addEventListener('click', close);
  document.getElementById('csv-cancel')?.addEventListener('click', close);

  let parsedRows = [];

  document.getElementById('csv-file')?.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const lines = ev.target.result.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) { document.getElementById('csv-err').textContent = 'CSV must have a header row and at least one data row.'; return; }
      const headers = lines[0].toLowerCase().split(',').map(h => h.trim().replace(/"/g, ''));
      const emailIdx = headers.findIndex(h => h.includes('email'));
      const nameIdx = headers.findIndex(h => h.includes('name'));
      const phoneIdx = headers.findIndex(h => h.includes('phone'));
      if (emailIdx === -1) { document.getElementById('csv-err').textContent = 'CSV must have an "email" column.'; return; }

      parsedRows = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));
        return {
          email: cols[emailIdx] || '',
          name: nameIdx >= 0 ? cols[nameIdx] || '' : '',
          phone: phoneIdx >= 0 ? cols[phoneIdx] || '' : '',
        };
      }).filter(r => r.email);

      const preview = document.getElementById('csv-preview');
      preview.innerHTML = `
        <div style="font-size:0.78rem;color:var(--text-primary);margin:10px 0">
          <strong>${parsedRows.length} contacts</strong> found. Preview:
        </div>
        <div class="card" style="max-height:160px;overflow-y:auto">
          ${parsedRows.slice(0, 5).map(r => `
          <div class="table-row">
            <div class="row-main">
              <div class="row-name">${esc(r.name || r.email)}</div>
              <div class="row-sub">${esc(r.email)}${r.phone ? ' | ' + esc(r.phone) : ''}</div>
            </div>
          </div>`).join('')}
          ${parsedRows.length > 5 ? `<div style="padding:8px 18px;font-size:0.72rem;color:var(--text-secondary)">...and ${parsedRows.length - 5} more</div>` : ''}
        </div>`;
      document.getElementById('csv-import').disabled = false;
    };
    reader.readAsText(file);
  });

  document.getElementById('csv-import')?.addEventListener('click', async () => {
    if (!parsedRows.length) return;
    const clientId = document.getElementById('csv-client').value;
    const btn = document.getElementById('csv-import');
    btn.disabled = true;
    btn.textContent = 'Importing...';

    try {
      const toInsert = parsedRows.map(r => ({
        client_id: clientId,
        name: r.name,
        email: r.email,
        phone: r.phone,
        source: 'import',
        tags: [],
      }));
      const inserted = await DB.bulkInsertContacts(toInsert);
      contactsList.unshift(...inserted);
      close();
      showToast(`Imported ${inserted.length} contacts`);
      refreshFn();
    } catch (e) {
      document.getElementById('csv-err').textContent = e.message || 'Import failed.';
      btn.disabled = false;
      btn.textContent = 'Import';
    }
  });
}

// ── Tickets View (Agency) ─────────────────────────────────────
export async function ticketsView(app) {
  destroyChart();
  app.innerHTML = buildLayout({
    active: 'tickets', title: 'Tickets',
    content: `
      <div class="page-topbar"><div class="page-topbar-title">Tickets</div></div>
      <div class="section"><div class="skel" style="height:300px;border-radius:var(--radius-lg)"></div></div>
    `,
  });
  wireLayout(app);

  let tickets = [], clients = [];
  try {
    [tickets, clients] = await Promise.all([
      DB.fetchTickets(null),
      DB.fetchClients(),
    ]);
  } catch (_) {}

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));
  let statusFilter = 'all';

  function draw() {
    const filtered = statusFilter === 'all' ? tickets : tickets.filter(t => t.status === statusFilter);
    const openCount = tickets.filter(t => t.status !== 'done').length;

    const mc = document.querySelector('.main-content');
    if (!mc) return;

    mc.innerHTML = `
      <div class="page-topbar">
        <div class="page-topbar-title">Tickets (${openCount} open)</div>
      </div>

      <div class="section" style="padding-top:12px">
        <div class="pipeline-bar">
          <button class="pipe-pill ${statusFilter === 'all' ? 'active' : ''}" data-status="all">All ${tickets.length}</button>
          <button class="pipe-pill new ${statusFilter === 'new' ? 'active' : ''}" data-status="new">New ${tickets.filter(t => t.status === 'new').length}</button>
          <button class="pipe-pill contacted ${statusFilter === 'in_progress' ? 'active' : ''}" data-status="in_progress">In Progress ${tickets.filter(t => t.status === 'in_progress').length}</button>
          <button class="pipe-pill won ${statusFilter === 'done' ? 'active' : ''}" data-status="done">Done ${tickets.filter(t => t.status === 'done').length}</button>
        </div>
      </div>

      <div class="section" style="padding-top:0">
        ${filtered.length ? `
        <div class="card">
          ${filtered.map(t => {
            const cl = clientMap[t.client_id];
            const catLabel = { hours: 'Hours', menu_services: 'Menu/Services', photos: 'Photos', content: 'Content', bug: 'Bug/Error', other: 'Other' }[t.category] || t.category;
            return `
            <div class="table-row" style="flex-wrap:wrap;gap:8px">
              <div class="client-avatar" style="background:${cl?.color || '#666'};width:32px;height:32px;border-radius:8px;font-size:0.6rem">${esc(cl?.initials || '??')}</div>
              <div class="row-main">
                <div class="row-name">${esc(t.description.length > 60 ? t.description.slice(0, 60) + '...' : t.description)}</div>
                <div class="row-sub">${esc(catLabel)} | ${cl ? esc(cl.name) : ''} | ${new Date(t.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</div>
              </div>
              <div style="display:flex;gap:6px;flex-shrink:0;align-items:center">
                <span class="stage-badge stage-${t.status === 'in_progress' ? 'contacted' : t.status === 'done' ? 'won' : 'new'}">${t.status === 'in_progress' ? 'In Progress' : t.status === 'done' ? 'Done' : 'New'}</span>
                ${t.status === 'new' ? `<button class="btn-pill" data-action="start" data-id="${esc(t.id)}" style="font-size:0.65rem;padding:5px 10px">Start</button>` : ''}
                ${t.status !== 'done' ? `<button class="btn-pill" data-action="done" data-id="${esc(t.id)}" style="font-size:0.65rem;padding:5px 10px;background:var(--green)">Done</button>` : ''}
              </div>
            </div>`;
          }).join('')}
        </div>` : `
        <div class="card">
          <div class="empty-state" style="padding:40px 20px">
            <div class="es-icon">🎫</div>
            <div class="es-text">No tickets yet. Clients can submit website change requests from their dashboard.</div>
          </div>
        </div>`}
      </div>
      <div class="page-spacer"></div>`;

    mc.querySelectorAll('.pipe-pill').forEach(btn =>
      btn.addEventListener('click', () => { statusFilter = btn.dataset.status; draw(); })
    );

    mc.querySelectorAll('[data-action]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const action = btn.dataset.action;
        const newStatus = action === 'start' ? 'in_progress' : 'done';
        const updates = { status: newStatus };
        if (newStatus === 'done') updates.completed_at = new Date().toISOString();
        try {
          await DB.updateTicket(id, updates);
          const idx = tickets.findIndex(t => t.id === id);
          if (idx >= 0) { tickets[idx].status = newStatus; if (updates.completed_at) tickets[idx].completed_at = updates.completed_at; }
          draw();
          showToast('Ticket updated');
        } catch (e) { showToast('Failed: ' + (e.message || 'Unknown error')); }
      });
    });
  }

  draw();
}

// ── Sequences View (Agency) ────────────────────────────────────
const SEQUENCE_TEMPLATES = [
  {
    name: 'Welcome Sequence',
    trigger_type: 'new_subscriber',
    steps: [
      { delay_hours: 0, subject: 'Welcome to {{business_name}}!', body: 'Hi {{first_name}},\n\nThanks for subscribing! We\'re glad to have you.\n\nHere\'s what you can expect from us:\n- Exclusive offers and promotions\n- Updates on new products/services\n- Tips and helpful content\n\nStay tuned!\n\nBest,\n{{business_name}}' },
      { delay_hours: 72, subject: 'Here\'s what we offer', body: 'Hi {{first_name}},\n\nWe wanted to share a quick overview of our services:\n\n[Your key services/products here]\n\nHave questions? Just reply to this email.\n\nBest,\n{{business_name}}' },
      { delay_hours: 168, subject: 'A special offer just for you', body: 'Hi {{first_name}},\n\nAs a thank you for being a subscriber, here\'s a special offer:\n\n[Your offer here]\n\nThis offer is available for a limited time.\n\nBest,\n{{business_name}}' },
    ],
  },
  {
    name: 'Lead Follow-Up',
    trigger_type: 'new_lead',
    steps: [
      { delay_hours: 0, subject: 'Thanks for reaching out!', body: 'Hi {{first_name}},\n\nThanks for contacting us! We received your inquiry and will get back to you shortly.\n\nIn the meantime, feel free to check out our website for more information.\n\nBest,\n{{business_name}}' },
      { delay_hours: 48, subject: 'Just checking in', body: 'Hi {{first_name}},\n\nWe wanted to follow up on your recent inquiry. Do you have any questions we can help with?\n\nWe\'d love to help you find exactly what you need.\n\nBest,\n{{business_name}}' },
      { delay_hours: 120, subject: 'Still interested?', body: 'Hi {{first_name}},\n\nWe noticed you reached out recently. We want to make sure we didn\'t miss anything.\n\nIf you\'re still interested, we\'d love to connect. Just reply to this email or give us a call.\n\nBest,\n{{business_name}}' },
    ],
  },
  {
    name: 'Review Request',
    trigger_type: 'manual',
    steps: [
      { delay_hours: 24, subject: 'Thanks for visiting {{business_name}}!', body: 'Hi {{first_name}},\n\nThanks for your recent visit! We hope you had a great experience.\n\nWe\'d love to hear your feedback.\n\nBest,\n{{business_name}}' },
      { delay_hours: 72, subject: 'Would you leave us a review?', body: 'Hi {{first_name}},\n\nYour opinion matters to us! If you enjoyed your experience, we\'d really appreciate a quick review.\n\n[Google Review Link]\n\nIt only takes a minute and helps us serve you better.\n\nThank you!\n{{business_name}}' },
    ],
  },
];

export async function sequencesView(app) {
  destroyChart();
  app.innerHTML = buildLayout({
    active: 'sequences', title: 'Sequences',
    content: `
      <div class="page-topbar"><div class="page-topbar-title">Sequences</div></div>
      <div class="section"><div class="skel" style="height:300px;border-radius:var(--radius-lg)"></div></div>
    `,
  });
  wireLayout(app);

  let sequences = [], clients = [];
  try {
    [sequences, clients] = await Promise.all([
      DB.fetchSequences(null),
      DB.fetchClients(),
    ]);
  } catch (_) {}

  const clientMap = Object.fromEntries(clients.map(c => [c.id, c]));

  function draw() {
    const mc = document.querySelector('.main-content');
    if (!mc) return;

    const active = sequences.filter(s => s.status === 'active');
    const drafts = sequences.filter(s => s.status === 'draft');
    const paused = sequences.filter(s => s.status === 'paused');

    mc.innerHTML = `
      <div class="page-topbar">
        <div class="page-topbar-title">Sequences (${sequences.length})</div>
        <div style="display:flex;gap:8px">
          <button class="btn-pill" id="create-seq-btn" style="font-size:0.72rem;padding:7px 14px">+ Create</button>
          <button class="btn-pill-outline" id="template-seq-btn" style="font-size:0.72rem;padding:7px 14px">Templates</button>
        </div>
      </div>

      ${active.length ? `
      <div class="section">
        <div class="section-label">Active</div>
        <div class="card">
          ${active.map(s => seqRow(s, clientMap)).join('')}
        </div>
      </div>` : ''}

      ${drafts.length ? `
      <div class="section">
        <div class="section-label">Drafts</div>
        <div class="card">
          ${drafts.map(s => seqRow(s, clientMap)).join('')}
        </div>
      </div>` : ''}

      ${paused.length ? `
      <div class="section">
        <div class="section-label">Paused</div>
        <div class="card">
          ${paused.map(s => seqRow(s, clientMap)).join('')}
        </div>
      </div>` : ''}

      ${!sequences.length ? `
      <div class="section">
        <div class="card">
          <div class="empty-state" style="padding:40px 20px">
            <div class="es-icon">⚡</div>
            <div class="es-text">No sequences yet. Create one or start from a template.</div>
          </div>
        </div>
      </div>` : ''}
      <div class="page-spacer"></div>`;

    mc.querySelectorAll('.seq-row').forEach(row =>
      row.addEventListener('click', () => location.hash = '#sequence/' + row.dataset.id)
    );
    document.getElementById('create-seq-btn')?.addEventListener('click', () => showCreateSeqModal(clients, sequences, draw));
    document.getElementById('template-seq-btn')?.addEventListener('click', () => showTemplateModal(clients, sequences, draw));
  }

  draw();
}

function seqRow(s, clientMap) {
  const cl = clientMap[s.client_id];
  const steps = Array.isArray(s.steps) ? s.steps : [];
  const triggerLabel = { new_subscriber: 'On Subscribe', new_lead: 'On New Lead', manual: 'Manual' }[s.trigger_type] || s.trigger_type;
  const statusClass = { active: 'won', draft: 'new', paused: 'contacted' }[s.status] || 'new';
  return `
    <div class="seq-row table-row" data-id="${esc(s.id)}" style="cursor:pointer">
      <div class="row-main">
        <div class="row-name">${esc(s.name)}</div>
        <div class="row-sub">${esc(triggerLabel)} | ${steps.length} step${steps.length !== 1 ? 's' : ''} | ${cl ? esc(cl.name) : 'Unknown'}</div>
      </div>
      <span class="stage-badge stage-${statusClass}">${esc(s.status)}</span>
    </div>`;
}

// ── Sequence Detail View ──────────────────────────────────────
export async function sequenceDetailView(app, seqId) {
  destroyChart();
  app.innerHTML = buildLayout({
    active: 'sequences', title: 'Sequence', backRoute: '#sequences',
    content: `<div class="section"><div class="skel" style="height:200px;border-radius:var(--radius-lg)"></div></div>`,
  });
  wireLayout(app, '#sequences');

  let seq, client, enrollments = [];
  try {
    seq = await DB.fetchSequence(seqId);
    if (seq) {
      [client, enrollments] = await Promise.all([
        DB.fetchClient(seq.client_id),
        DB.fetchEnrollments(seqId),
      ]);
    }
  } catch (_) {}

  if (!seq) { location.hash = '#sequences'; return; }

  function draw() {
    const steps = Array.isArray(seq.steps) ? seq.steps : [];
    const mc = document.querySelector('.main-content');
    if (!mc) return;

    const triggerLabel = { new_subscriber: 'On Subscribe', new_lead: 'On New Lead', manual: 'Manual' }[seq.trigger_type] || seq.trigger_type;

    mc.innerHTML = `
      <div class="page-topbar" style="padding-bottom:12px">
        <div class="page-topbar-title">${esc(seq.name)}</div>
      </div>

      <div class="section">
        <div class="card" style="padding:18px">
          <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;flex-wrap:wrap">
            <span class="stage-badge stage-${seq.status === 'active' ? 'won' : seq.status === 'paused' ? 'contacted' : 'new'}">${esc(seq.status)}</span>
            <div style="font-size:0.72rem;color:var(--text-secondary)">${esc(triggerLabel)}</div>
            ${client ? `<div style="font-size:0.72rem;color:var(--text-secondary)">| ${esc(client.name)}</div>` : ''}
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${seq.status === 'draft' ? `<button class="btn-pill" id="activate-seq" style="font-size:0.72rem;padding:7px 14px">Activate</button>` : ''}
            ${seq.status === 'active' ? `<button class="btn-pill-outline" id="pause-seq" style="font-size:0.72rem;padding:7px 14px">Pause</button>` : ''}
            ${seq.status === 'paused' ? `<button class="btn-pill" id="resume-seq" style="font-size:0.72rem;padding:7px 14px">Resume</button>` : ''}
            <button class="btn-pill-outline" id="delete-seq" style="font-size:0.72rem;padding:7px 14px;color:var(--red);border-color:var(--red)">Delete</button>
          </div>
        </div>
      </div>

      <div class="section">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
          <div class="section-label" style="margin-bottom:0">Steps (${steps.length})</div>
          <button class="btn-pill" id="add-step-btn" style="font-size:0.72rem;padding:7px 14px">+ Add Step</button>
        </div>
        ${steps.length ? `
        <div class="card">
          ${steps.map((step, i) => `
          <div class="table-row" style="flex-direction:column;align-items:flex-start;gap:6px">
            <div style="display:flex;align-items:center;gap:8px;width:100%">
              <div style="width:24px;height:24px;border-radius:50%;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.65rem;font-weight:700;flex-shrink:0">${i + 1}</div>
              <div style="flex:1">
                <div class="row-name">${esc(step.subject)}</div>
                <div class="row-sub">${step.delay_hours === 0 ? 'Immediately' : step.delay_hours < 24 ? step.delay_hours + 'h delay' : Math.floor(step.delay_hours / 24) + ' day' + (Math.floor(step.delay_hours / 24) !== 1 ? 's' : '') + ' delay'}</div>
              </div>
              <button class="copy-btn remove-step-btn" data-step="${i}" style="color:var(--red)">Remove</button>
            </div>
            <div style="font-size:0.72rem;color:var(--text-secondary);line-height:1.5;padding-left:32px;white-space:pre-wrap">${esc(step.body.length > 120 ? step.body.slice(0, 120) + '...' : step.body)}</div>
          </div>`).join('')}
        </div>` : `
        <div class="card">
          <div class="empty-state" style="padding:24px 16px"><div class="es-text">No steps yet. Add a step to start building your sequence.</div></div>
        </div>`}
      </div>

      <div class="section">
        <div class="section-label">Enrollments (${enrollments.length})</div>
        ${enrollments.length ? `
        <div class="card">
          ${enrollments.map(e => `
          <div class="table-row">
            <div class="row-main">
              <div class="row-name">${esc(e.contacts?.name || e.contacts?.email || 'Contact')}</div>
              <div class="row-sub">Step ${e.current_step + 1}/${steps.length} | ${esc(e.status)}</div>
            </div>
            ${e.status === 'active' ? `<button class="copy-btn cancel-enrollment" data-id="${esc(e.id)}" style="color:var(--red)">Cancel</button>` : `<span class="stage-badge stage-${e.status === 'completed' ? 'won' : 'lost'}">${esc(e.status)}</span>`}
          </div>`).join('')}
        </div>` : `
        <div class="card">
          <div class="empty-state" style="padding:24px 16px"><div class="es-text">No contacts enrolled yet</div></div>
        </div>`}
      </div>
      <div class="page-spacer"></div>`;

    // Wire status buttons
    document.getElementById('activate-seq')?.addEventListener('click', async () => {
      try { await DB.updateSequence(seqId, { status: 'active' }); seq.status = 'active'; draw(); showToast('Sequence activated'); } catch (e) { showToast('Failed'); }
    });
    document.getElementById('pause-seq')?.addEventListener('click', async () => {
      try { await DB.updateSequence(seqId, { status: 'paused' }); seq.status = 'paused'; draw(); showToast('Sequence paused'); } catch (e) { showToast('Failed'); }
    });
    document.getElementById('resume-seq')?.addEventListener('click', async () => {
      try { await DB.updateSequence(seqId, { status: 'active' }); seq.status = 'active'; draw(); showToast('Sequence resumed'); } catch (e) { showToast('Failed'); }
    });
    document.getElementById('delete-seq')?.addEventListener('click', async () => {
      if (!confirm('Delete this sequence?')) return;
      try { await DB.deleteSequence(seqId); showToast('Deleted'); location.hash = '#sequences'; } catch (e) { showToast('Failed'); }
    });

    // Remove step
    mc.querySelectorAll('.remove-step-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.step);
        const newSteps = [...steps];
        newSteps.splice(idx, 1);
        try { await DB.updateSequence(seqId, { steps: newSteps }); seq.steps = newSteps; draw(); showToast('Step removed'); } catch (e) { showToast('Failed'); }
      });
    });

    // Cancel enrollment
    mc.querySelectorAll('.cancel-enrollment').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        try { await DB.updateEnrollment(btn.dataset.id, { status: 'cancelled' }); const idx = enrollments.findIndex(en => en.id === btn.dataset.id); if (idx >= 0) enrollments[idx].status = 'cancelled'; draw(); showToast('Enrollment cancelled'); } catch (e) { showToast('Failed'); }
      });
    });

    // Add step
    document.getElementById('add-step-btn')?.addEventListener('click', () => {
      showAddStepModal(seqId, seq, draw);
    });
  }

  draw();
}

function showAddStepModal(seqId, seq, refreshFn) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">Add Step</div>
        <button class="modal-close" id="step-close">x</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Delay (hours after previous step)</label>
          <input id="step-delay" type="number" min="0" value="24" />
        </div>
        <div class="form-group">
          <label>Subject line</label>
          <input id="step-subject" type="text" placeholder="Email subject..." />
        </div>
        <div class="form-group">
          <label>Email body (use {{first_name}}, {{business_name}} for personalization)</label>
          <textarea id="step-body" rows="6" placeholder="Email content..." style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:16px;font-family:inherit;color:var(--text-primary);background:var(--soft-gray);outline:none;resize:vertical"></textarea>
        </div>
        <div class="modal-err" id="step-err"></div>
      </div>
      <div class="modal-footer">
        <button class="btn-pill" id="step-save" style="flex:1">Add Step</button>
        <button class="btn-pill-outline" id="step-cancel">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  document.getElementById('step-close')?.addEventListener('click', close);
  document.getElementById('step-cancel')?.addEventListener('click', close);

  document.getElementById('step-save')?.addEventListener('click', async () => {
    const delay = parseInt(document.getElementById('step-delay').value) || 0;
    const subject = document.getElementById('step-subject').value.trim();
    const body = document.getElementById('step-body').value.trim();
    if (!subject || !body) { document.getElementById('step-err').textContent = 'Subject and body are required.'; return; }

    const steps = Array.isArray(seq.steps) ? [...seq.steps] : [];
    steps.push({ delay_hours: delay, subject, body });

    try {
      await DB.updateSequence(seqId, { steps });
      seq.steps = steps;
      close();
      refreshFn();
      showToast('Step added');
    } catch (e) {
      document.getElementById('step-err').textContent = e.message || 'Failed';
    }
  });
}

function showCreateSeqModal(clients, sequencesList, refreshFn) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">Create Sequence</div>
        <button class="modal-close" id="cseq-close">x</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Client</label>
          <select id="cseq-client" style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:16px;font-family:inherit;color:var(--text-primary);background:var(--soft-gray);outline:none">
            ${clients.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Name</label>
          <input id="cseq-name" type="text" placeholder="Welcome Sequence" />
        </div>
        <div class="form-group">
          <label>Trigger</label>
          <select id="cseq-trigger" style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:16px;font-family:inherit;color:var(--text-primary);background:var(--soft-gray);outline:none">
            <option value="manual">Manual enrollment</option>
            <option value="new_subscriber">On new subscriber</option>
            <option value="new_lead">On new lead</option>
          </select>
        </div>
        <div class="modal-err" id="cseq-err"></div>
      </div>
      <div class="modal-footer">
        <button class="btn-pill" id="cseq-save" style="flex:1">Create</button>
        <button class="btn-pill-outline" id="cseq-cancel">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  document.getElementById('cseq-close')?.addEventListener('click', close);
  document.getElementById('cseq-cancel')?.addEventListener('click', close);

  document.getElementById('cseq-save')?.addEventListener('click', async () => {
    const name = document.getElementById('cseq-name').value.trim();
    if (!name) { document.getElementById('cseq-err').textContent = 'Name is required.'; return; }

    try {
      const newSeq = await DB.addSequence({
        client_id: document.getElementById('cseq-client').value,
        name,
        trigger_type: document.getElementById('cseq-trigger').value,
        steps: [],
        status: 'draft',
      });
      sequencesList.unshift(newSeq);
      close();
      showToast('Sequence created');
      location.hash = '#sequence/' + newSeq.id;
    } catch (e) {
      document.getElementById('cseq-err').textContent = e.message || 'Failed';
    }
  });
}

function showTemplateModal(clients, sequencesList, refreshFn) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">Start from Template</div>
        <button class="modal-close" id="tpl-close">x</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Client</label>
          <select id="tpl-client" style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:16px;font-family:inherit;color:var(--text-primary);background:var(--soft-gray);outline:none">
            ${clients.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label>Template</label>
          ${SEQUENCE_TEMPLATES.map((t, i) => `
          <div class="template-option" data-idx="${i}" style="padding:12px;border:1.5px solid var(--border);border-radius:var(--radius-sm);margin-bottom:8px;cursor:pointer;transition:all 0.12s">
            <div style="font-weight:600;font-size:0.82rem;color:var(--text-primary)">${esc(t.name)}</div>
            <div style="font-size:0.7rem;color:var(--text-secondary);margin-top:2px">${t.steps.length} steps | Trigger: ${esc(t.trigger_type.replace('_', ' '))}</div>
          </div>`).join('')}
        </div>
        <div class="modal-err" id="tpl-err"></div>
      </div>
    </div>`;

  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  document.getElementById('tpl-close')?.addEventListener('click', close);

  backdrop.querySelectorAll('.template-option').forEach(opt => {
    opt.addEventListener('click', async () => {
      const idx = parseInt(opt.dataset.idx);
      const tpl = SEQUENCE_TEMPLATES[idx];
      const clientId = document.getElementById('tpl-client').value;

      try {
        const newSeq = await DB.addSequence({
          client_id: clientId,
          name: tpl.name,
          trigger_type: tpl.trigger_type,
          steps: tpl.steps,
          status: 'draft',
        });
        sequencesList.unshift(newSeq);
        close();
        showToast('Template applied');
        location.hash = '#sequence/' + newSeq.id;
      } catch (e) {
        document.getElementById('tpl-err').textContent = e.message || 'Failed';
      }
    });
  });
}

// ── Ticket submission modal (client-facing) ───────────────────
function showTicketModal(client) {
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal">
      <div class="modal-header">
        <div class="modal-title">Request a Change</div>
        <button class="modal-close" id="tk-close">x</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>Category</label>
          <select id="tk-category" style="width:100%;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:16px;font-family:inherit;color:var(--text-primary);background:var(--soft-gray);outline:none">
            <option value="hours">Update Hours</option>
            <option value="menu_services">Update Menu / Services</option>
            <option value="photos">Update Photos</option>
            <option value="content">Update Content / Text</option>
            <option value="bug">Report a Bug / Error</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div class="form-group">
          <label>What do you need changed?</label>
          <textarea id="tk-description" rows="4" placeholder="Describe what you'd like us to change..." style="width:100%;box-sizing:border-box;padding:10px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:16px;font-family:inherit;color:var(--text-primary);background:var(--soft-gray);outline:none;resize:vertical"></textarea>
        </div>
        <div class="modal-err" id="tk-err"></div>
      </div>
      <div class="modal-footer">
        <button class="btn-pill" id="tk-submit" style="flex:1">Submit Request</button>
        <button class="btn-pill-outline" id="tk-cancel">Cancel</button>
      </div>
    </div>`;

  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  document.getElementById('tk-close')?.addEventListener('click', close);
  document.getElementById('tk-cancel')?.addEventListener('click', close);

  document.getElementById('tk-submit')?.addEventListener('click', async () => {
    const description = document.getElementById('tk-description').value.trim();
    if (!description) { document.getElementById('tk-err').textContent = 'Please describe what you need changed.'; return; }

    const btn = document.getElementById('tk-submit');
    btn.disabled = true;
    btn.textContent = 'Submitting...';

    try {
      await DB.addTicket({
        client_id: client.id,
        category: document.getElementById('tk-category').value,
        description,
        status: 'new',
      });
      close();
      showToast('Request submitted! We\'ll get on it soon.');
    } catch (e) {
      document.getElementById('tk-err').textContent = e.message || 'Failed to submit.';
      btn.disabled = false;
      btn.textContent = 'Submit Request';
    }
  });
}

// ── Compose & send broadcast email ────────────────────────────
function showComposeModal(app, client, subscribers) {
  const count = subscribers.length;
  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.innerHTML = `
    <div class="modal" id="compose-modal">
      <div class="modal-header">
        <div class="modal-title">Send email</div>
        <button class="modal-close" id="compose-close">✕</button>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>To</label>
          <div style="background:var(--soft-gray);padding:10px 12px;border-radius:var(--radius-sm);font-size:0.8rem;color:var(--text-secondary);border:1px solid var(--border)">
            All ${count} subscriber${count !== 1 ? 's' : ''} of ${esc(client.name)}
          </div>
        </div>
        <div class="form-group">
          <label>Subject</label>
          <input id="ce-subject" type="text" placeholder="e.g. Special offer just for you 🎉" />
        </div>
        <div class="form-group">
          <label>Message</label>
          <textarea id="ce-body" rows="8" placeholder="Write your message here…"
            style="width:100%;box-sizing:border-box;padding:10px 14px;border:1px solid var(--border);border-radius:var(--radius-sm);font-size:0.88rem;font-family:inherit;color:var(--text-primary);background:var(--soft-gray);outline:none;resize:vertical"></textarea>
        </div>
        <div id="ce-err" style="color:#E02020;font-size:0.78rem;margin-bottom:8px;min-height:18px;text-align:center"></div>
        <div class="modal-footer">
          <button class="btn-pill-outline" id="ce-cancel">Cancel</button>
          <button class="btn-pill" id="ce-send" style="flex:2">Send to ${count} subscriber${count !== 1 ? 's' : ''}</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.addEventListener('click', e => { if (e.target === backdrop) close(); });
  document.getElementById('compose-close').addEventListener('click', close);
  document.getElementById('ce-cancel').addEventListener('click', close);

  document.getElementById('ce-send').addEventListener('click', async () => {
    const subject = document.getElementById('ce-subject').value.trim();
    const body    = document.getElementById('ce-body').value.trim();
    const errEl   = document.getElementById('ce-err');
    const sendBtn = document.getElementById('ce-send');
    errEl.textContent = '';

    if (!subject) { errEl.textContent = 'Please enter a subject line.'; return; }
    if (!body)    { errEl.textContent = 'Please write a message.'; return; }

    sendBtn.disabled = true;
    sendBtn.textContent = 'Sending…';

    try {
      await DB.sendBroadcast({
        clientId:   client.id,
        clientName: client.name,
        recipients: subscribers.map(s => s.email),
        subject,
        body,
      });
      close();
      showToast(`Email sent to ${count} subscriber${count !== 1 ? 's' : ''} ✓`);
    } catch (e) {
      errEl.textContent = e.message || 'Failed to send. Please try again.';
      sendBtn.disabled = false;
      sendBtn.textContent = `Send to ${count} subscriber${count !== 1 ? 's' : ''}`;
    }
  });
}

// ── PDF Report Generation ─────────────────────────────────────
function generateReportPDF(clients, tf) {
  if (typeof window.jspdf === 'undefined') {
    showToast('PDF library not loaded');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  const W = 210;
  let y = 20;

  const period = { today: 'Today', week: 'This Week', month: 'This Month', all: 'All Time' }[tf] || tf;
  const dateStr = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Header
  doc.setFillColor(26, 26, 26);
  doc.rect(0, 0, W, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('Kalnyesgrowth', 20, 18);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text('Agency Performance Report', 20, 26);
  doc.text(period + ' | ' + dateStr, 20, 33);
  y = 52;

  // Summary stats
  doc.setTextColor(30, 30, 30);
  const totalRev = clients.reduce((s, c) => s + c.metrics.revenue[tf], 0);
  const totalSess = clients.reduce((s, c) => s + c.metrics.sessions[tf], 0);
  const totalLeads = clients.reduce((s, c) => s + c.metrics.leads[tf] + c.metrics.emails[tf], 0);
  const totalOrders = clients.reduce((s, c) => s + c.metrics.orders[tf], 0);

  doc.setFillColor(240, 247, 255);
  doc.roundedRect(15, y, W - 30, 28, 3, 3, 'F');

  const stats = [
    { label: 'Revenue', value: fmt(totalRev) },
    { label: 'Sessions', value: num(totalSess) },
    { label: 'Leads', value: num(totalLeads) },
    { label: 'Orders', value: num(totalOrders) },
  ];

  const colW = (W - 30) / 4;
  stats.forEach((st, i) => {
    const cx = 15 + i * colW + colW / 2;
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 100, 224);
    doc.text(st.value, cx, y + 12, { align: 'center' });
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(st.label, cx, y + 20, { align: 'center' });
  });

  y += 38;

  // Client breakdown table
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 30, 30);
  doc.text('Client Breakdown', 15, y);
  y += 8;

  // Table header
  doc.setFillColor(245, 245, 245);
  doc.rect(15, y, W - 30, 8, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(80, 80, 80);
  doc.text('Client', 18, y + 5.5);
  doc.text('Revenue', 85, y + 5.5);
  doc.text('Sessions', 115, y + 5.5);
  doc.text('Leads', 145, y + 5.5);
  doc.text('Orders', 170, y + 5.5);
  y += 10;

  doc.setFont('helvetica', 'normal');
  doc.setTextColor(30, 30, 30);
  doc.setFontSize(8);

  clients.forEach((c, i) => {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    const rev = c.metrics.revenue[tf];
    const leads = c.metrics.leads[tf] + c.metrics.emails[tf];
    const sess = c.metrics.sessions[tf];
    const orders = c.metrics.orders[tf];

    if (i % 2 === 0) {
      doc.setFillColor(250, 250, 250);
      doc.rect(15, y - 4, W - 30, 8, 'F');
    }

    doc.setTextColor(30, 30, 30);
    doc.text(c.name.length > 30 ? c.name.slice(0, 30) + '...' : c.name, 18, y);
    doc.text(fmt(rev), 85, y);
    doc.text(num(sess), 115, y);
    doc.text(num(leads), 145, y);
    doc.text(num(orders), 170, y);
    y += 8;
  });

  // Chart image (if available)
  const chartCanvas = document.getElementById('report-chart');
  if (chartCanvas) {
    try {
      if (y > 200) { doc.addPage(); y = 20; }
      y += 8;
      doc.setFontSize(12);
      doc.setFont('helvetica', 'bold');
      doc.text('Revenue Trend', 15, y);
      y += 6;
      const imgData = chartCanvas.toDataURL('image/png');
      doc.addImage(imgData, 'PNG', 15, y, W - 30, 60);
      y += 68;
    } catch (_) {}
  }

  // Footer
  if (y > 260) { doc.addPage(); y = 20; }
  y = 280;
  doc.setDrawColor(200, 200, 200);
  doc.line(15, y, W - 15, y);
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(150, 150, 150);
  doc.text('Generated by Kalnyesgrowth Agency Dashboard | ' + dateStr, W / 2, y + 5, { align: 'center' });

  doc.save('KG-Report-' + period.replace(/\s/g, '-') + '-' + dateStr.replace(/[,\s]+/g, '-') + '.pdf');
  showToast('PDF downloaded');
}
