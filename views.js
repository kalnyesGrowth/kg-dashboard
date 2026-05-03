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

function buildLayout({ content, active, title = '', backRoute = null }) {
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
      <div class="login-card">
        <h2>Sign in</h2>
        <div class="form-group">
          <label>Email address</label>
          <input id="li-email" type="email" placeholder="you@example.com" autocomplete="email" inputmode="email" />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input id="li-pass" type="password" placeholder="••••••••" autocomplete="current-password" />
        </div>
        <button class="btn-primary" id="li-btn">Sign in</button>
        <div class="login-err" id="li-err"></div>
      </div>
    </div>`;

  const btn = document.getElementById('li-btn');
  const err = document.getElementById('li-err');

  btn.addEventListener('click', async () => {
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
      if (session.role === 'agency') { location.hash = '#clients'; }
      else { window.dispatchEvent(new HashChangeEvent('hashchange')); }
    } else {
      err.textContent = 'Incorrect email or password.';
      document.getElementById('li-pass').value = '';
    }
  });

  ['li-email', 'li-pass'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => { if (e.key === 'Enter') btn.click(); });
  });
}

// ── Clients overview ───────────────────────────────────────────
export async function clientsView(app) {
  destroyChart();
  app.innerHTML = buildLayout({ active:'clients', title:'Clients', content: skeletonClients() });
  wireLayout(app);

  let clients = MOCK_CLIENTS;
  let summary = getAgencySummary();
  try {
    const [sbClients, sbSum] = await Promise.all([DB.fetchClientsWithMetrics(), DB.fetchAgencySummary()]);
    if (sbClients.length > 0) { clients = sbClients; summary = sbSum; }
  } catch (_) {}

  const mc = document.querySelector('.main-content');
  if (!mc) return;

  const totalSessions = clients.reduce((acc, c) => acc + c.metrics.sessions.month, 0);
  const totalLeads    = clients.reduce((acc, c) => acc + c.metrics.leads.month + c.metrics.emails.month, 0);

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
        <div class="stat-value">${summary.activeClients ?? clients.length}</div>
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
  renderDetail(app, client, false);
}

// ── Shared detail renderer ─────────────────────────────────────
function renderDetail(app, client, isAgency) {
  let tf   = 'month';
  let live = null; // { metrics, revenueSeries, recentOrders, recentEmails, recentEvents }

  function draw() {
    const metrics  = live?.metrics       || client.metrics;
    const revSer   = live?.revenueSeries  || client.revenueSeries;
    const orders       = live?.recentOrders   || client.recentOrders;
    const emails       = live?.recentEmails   || client.recentEmails;
    const recentEvents = live?.recentEvents   || [];

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

      ${emails.length ? `
      <div class="section">
        <div class="section-label">Email captures</div>
        <div class="card">
          ${emails.map(e => `
            <div class="table-row">
              <div style="font-size:1.1rem;flex-shrink:0">✉️</div>
              <div class="row-main">
                <div class="row-name">${esc(e.email)}</div>
                <div class="row-sub">${esc(e.source)} · ${esc(e.date)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}

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
      const [metrics, todayLive, sw, sm, sa, liveOrders, liveEmails, recentEvents] = await Promise.all([
        DB.fetchMetricsSummary(client.id),
        DB.fetchLiveTodayMetrics(client.id),
        DB.fetchRevenueSeries(client.id, 7),
        DB.fetchRevenueSeries(client.id, 30),
        DB.fetchRevenueSeries(client.id, 90),
        DB.fetchRecentOrders(client.id),
        DB.fetchRecentEmails(client.id),
        DB.fetchRecentEvents(client.id, 25),
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
      <div class="page-topbar"><div class="page-topbar-title">Reports</div></div>

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
