// ── Views ──────────────────────────────────────────────────────
import { MOCK_CLIENTS, getClient, getAgencySummary, CLIENT_CREDS } from './data.js';
import { checkLogin, clearSession, esc } from './utils.js';

const CREDS_MAP = CLIENT_CREDS;

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
  return { today: 'Today', week: 'This week', month: 'This month', all: 'All time' }[tf];
}
function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
function todayStr() {
  return new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

// Sparkline from revenue series
function sparkline(series, color) {
  if (!series || series.length < 2) return '<div style="width:64px;height:24px"></div>';
  const vals = series.map(p => p.revenue);
  const min  = Math.min(...vals);
  const max  = Math.max(...vals);
  const rng  = max - min || 1;
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

// Trend % comparing second half vs first half
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

// ── Chart ──────────────────────────────────────────────────────
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
        borderColor: color,
        backgroundColor: color + '15',
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        tension: 0.4,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: 'index', intersect: false,
          backgroundColor: '#1A1A1A',
          titleColor: '#8C9196',
          bodyColor: '#fff',
          padding: 10,
          cornerRadius: 6,
          callbacks: { label: ctx => ' $' + ctx.parsed.y.toLocaleString() },
        },
      },
      scales: { x: { display: false }, y: { display: false, beginAtZero: false } },
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
    },
  });
}

// ── Layout builder ─────────────────────────────────────────────
const HAMBURGER = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><line x1="3" y1="5" x2="17" y2="5"/><line x1="3" y1="10" x2="17" y2="10"/><line x1="3" y1="15" x2="17" y2="15"/></svg>`;
const BACK_ARROW = `<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="12,4 5,10 12,16"/></svg>`;

function buildLayout({ content, active, title = '', backRoute = null }) {
  const leftBtn = backRoute
    ? `<button class="hamburger" id="mobile-back">${BACK_ARROW}</button>`
    : `<button class="hamburger" id="hamburger">${HAMBURGER}</button>`;

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
          <button class="nav-link ${active === 'clients'  ? 'active' : ''}" data-nav="clients">
            <span class="nav-icon">👥</span> Clients
          </button>
          <button class="nav-link ${active === 'reports'  ? 'active' : ''}" data-nav="reports">
            <span class="nav-icon">📊</span> Reports
          </button>
          <div class="nav-section-label">Account</div>
          <button class="nav-link ${active === 'settings' ? 'active' : ''}" data-nav="settings">
            <span class="nav-icon">⚙️</span> Settings
          </button>
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
        ${leftBtn}
        <div style="flex:1;font-size:0.85rem;font-weight:700;color:rgba(255,255,255,0.9);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;letter-spacing:-0.01em">
          ${esc(title)}
        </div>
        <div class="mobile-actions">
          <button class="mobile-icon-btn" id="mobile-logout" title="Sign out">⏻</button>
        </div>
      </div>

      <main class="main-content">
        ${content}
      </main>
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
          <input id="li-email" type="email" placeholder="you@example.com"
                 autocomplete="email" inputmode="email" />
        </div>
        <div class="form-group">
          <label>Password</label>
          <input id="li-pass" type="password" placeholder="••••••••"
                 autocomplete="current-password" />
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
    btn.disabled = true;
    btn.textContent = 'Signing in…';
    if (!email || !password) {
      err.textContent = 'Please enter your email and password.';
      btn.disabled = false; btn.textContent = 'Sign in';
      return;
    }
    const session = await checkLogin(email, password);
    btn.disabled = false; btn.textContent = 'Sign in';
    if (session) {
      if (session.role === 'agency') {
        location.hash = '#clients';
      } else {
        window.dispatchEvent(new HashChangeEvent('hashchange'));
      }
    } else {
      err.textContent = 'Incorrect email or password.';
      document.getElementById('li-pass').value = '';
    }
  });

  ['li-email', 'li-pass'].forEach(id => {
    document.getElementById(id).addEventListener('keydown', e => {
      if (e.key === 'Enter') btn.click();
    });
  });
}

// ── Agency: Clients overview ───────────────────────────────────
export function clientsView(app) {
  destroyChart();
  const s             = getAgencySummary();
  const totalSessions = MOCK_CLIENTS.reduce((acc, c) => acc + c.metrics.sessions.month, 0);
  const totalLeads    = MOCK_CLIENTS.reduce((acc, c) => acc + c.metrics.leads.month + c.metrics.emails.month, 0);

  app.innerHTML = buildLayout({
    active: 'clients',
    title:  'Clients',
    content: `
      <div class="page-topbar">
        <div>
          <div class="page-topbar-title">${esc(greeting())}, Kalnyesgrowth</div>
          <div class="greeting-date" style="margin-top:2px">${esc(todayStr())}</div>
        </div>
      </div>

      <div class="stats-strip">
        <div class="stat-cell">
          <div class="stat-label">Revenue / mo</div>
          <div class="stat-value green">${esc(fmt(s.totalRevenueMonth))}</div>
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
          <div class="stat-value">${s.activeClients}</div>
        </div>
      </div>

      <div class="section">
        <div class="section-label">Your clients</div>
        <div class="card">
          <div class="client-list">
            ${MOCK_CLIENTS.map(c => {
              const hasRev = c.metrics.revenue.month > 0;
              const val    = hasRev ? fmt(c.metrics.revenue.month) : num(c.metrics.leads.month + c.metrics.emails.month);
              const lbl    = hasRev ? 'rev / mo' : 'leads / mo';
              const series = c.revenueSeries.month;
              const pct    = trendPct(series);
              const spark  = hasRev ? sparkline(series, c.color) : '';
              return `
              <div class="client-row" data-id="${esc(c.id)}">
                <div class="client-avatar" style="background:${esc(c.color)}">${esc(c.initials)}</div>
                <div class="client-info">
                  <div class="client-name">${esc(c.name)}</div>
                  <div class="client-meta"><span class="status-dot"></span>${esc(c.domain)}</div>
                  <div style="margin-top:3px">${trendBadge(pct)}</div>
                </div>
                ${hasRev ? `<div style="flex-shrink:0;padding:0 4px">${spark}</div>` : ''}
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
      <div class="page-spacer"></div>
    `,
  });

  wireLayout(app);
  document.querySelectorAll('.client-row').forEach(row =>
    row.addEventListener('click', () => location.hash = '#client/' + row.dataset.id)
  );
}

// ── Agency: Client detail ──────────────────────────────────────
export function clientDetailView(app, clientId) {
  const client = getClient(clientId);
  if (!client) { location.hash = '#clients'; return; }
  renderDetail(app, client, true);
}

// ── Client: Self view ──────────────────────────────────────────
export function clientSelfView(app, clientId) {
  const client = getClient(clientId);
  if (!client) { clearSession().then(() => loginView(app)); return; }
  renderDetail(app, client, false);
}

// ── Shared detail renderer ─────────────────────────────────────
function renderDetail(app, client, isAgency) {
  let tf = 'month';

  function draw() {
    destroyChart();
    const m        = client.metrics;
    const isEcom   = client.niche === 'ecommerce';
    const series   = client.revenueSeries[tf === 'today' ? 'week' : tf] || [];
    const hasRev   = m.revenue[tf] > 0;
    const convBase = isEcom ? m.orders[tf] : m.leads[tf];
    const conv     = m.sessions[tf] > 0 && convBase > 0
      ? ((convBase / m.sessions[tf]) * 100).toFixed(1) + '%' : '—';

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

      ${client.recentOrders.length ? `
      <div class="section">
        <div class="section-label">Recent orders</div>
        <div class="card">
          ${client.recentOrders.map(o => `
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

      ${client.recentEmails.length ? `
      <div class="section">
        <div class="section-label">Email captures</div>
        <div class="card">
          ${client.recentEmails.map(e => `
            <div class="table-row">
              <div style="font-size:1.1rem;flex-shrink:0">✉️</div>
              <div class="row-main">
                <div class="row-name">${esc(e.email)}</div>
                <div class="row-sub">${esc(e.source)} · ${esc(e.date)}</div>
              </div>
            </div>`).join('')}
        </div>
      </div>` : ''}

      <div class="page-spacer"></div>
    `;

    if (isAgency) {
      app.innerHTML = buildLayout({
        active:    'clients',
        title:     client.name,
        backRoute: '#clients',
        content:   innerContent,
      });
      wireLayout(app, '#clients');
    } else {
      // Client self-view — fixed top bar, no sidebar
      app.innerHTML = `
        <div style="min-height:100dvh;background:var(--soft-gray)">
          <div style="height:56px;background:var(--sidebar-bg);display:flex;align-items:center;padding:0 12px;gap:10px;position:fixed;top:0;left:0;right:0;z-index:200">
            <div class="sidebar-avatar">${esc(client.initials)}</div>
            <div style="flex:1;font-size:0.85rem;font-weight:700;color:rgba(255,255,255,0.9);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
              ${esc(client.name)}
            </div>
            <button class="mobile-icon-btn" id="cl-logout" title="Sign out">⏻</button>
          </div>
          <div style="padding-top:56px">${innerContent}</div>
        </div>`;
      document.getElementById('cl-logout').addEventListener('click', () => {
        clearSession().then(() => loginView(app));
      });
    }

    document.querySelectorAll('.tf-btn').forEach(btn =>
      btn.addEventListener('click', () => { tf = btn.dataset.tf; draw(); })
    );

    requestAnimationFrame(() => {
      const s = client.revenueSeries[tf === 'today' ? 'week' : tf];
      if (s) renderChart('rev-chart', s, client.color);
    });
  }

  draw();
}

// ── Reports View ───────────────────────────────────────────────
export function reportsView(app) {
  destroyChart();
  let tf = 'month';

  function draw() {
    destroyChart();
    const tfKey = tf === 'today' ? 'week' : tf;

    const ecomClients = MOCK_CLIENTS.filter(c => c.niche === 'ecommerce' && c.revenueSeries[tfKey]?.length);
    let combinedSeries = [];
    if (ecomClients.length) {
      const base = ecomClients[0].revenueSeries[tfKey];
      combinedSeries = base.map((pt, i) => ({
        date:    pt.date,
        revenue: ecomClients.reduce((s, c) => s + (c.revenueSeries[tfKey][i]?.revenue || 0), 0),
      }));
    }

    const totalRev    = MOCK_CLIENTS.reduce((s, c) => s + c.metrics.revenue[tf], 0);
    const totalSess   = MOCK_CLIENTS.reduce((s, c) => s + c.metrics.sessions[tf], 0);
    const totalLeads  = MOCK_CLIENTS.reduce((s, c) => s + c.metrics.leads[tf] + c.metrics.emails[tf], 0);
    const totalOrders = MOCK_CLIENTS.reduce((s, c) => s + c.metrics.orders[tf], 0);

    app.innerHTML = buildLayout({
      active: 'reports',
      title:  'Reports',
      content: `
        <div class="page-topbar">
          <div class="page-topbar-title">Reports</div>
        </div>

        <div class="tf-row" style="padding-top:16px">
          ${['today','week','month','all'].map(t => `
            <button class="tf-btn${tf === t ? ' active' : ''}" data-tf="${t}">
              ${t === 'today' ? 'Today' : t === 'week' ? 'Week' : t === 'month' ? 'Month' : 'All'}
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
            <div class="metric-card featured">
              <div class="m-label">💰 Revenue</div>
              <div class="m-value">${esc(fmt(totalRev))}</div>
            </div>
            <div class="metric-card">
              <div class="m-label">👁 Sessions</div>
              <div class="m-value">${esc(num(totalSess))}</div>
            </div>
            <div class="metric-card">
              <div class="m-label">🛒 Orders</div>
              <div class="m-value">${esc(num(totalOrders))}</div>
            </div>
            <div class="metric-card">
              <div class="m-label">🎯 Leads</div>
              <div class="m-value">${esc(num(totalLeads))}</div>
            </div>
          </div>
        </div>

        <div class="section">
          <div class="section-label">Client breakdown</div>
          <div class="card">
            ${MOCK_CLIENTS.map(c => {
              const rev   = c.metrics.revenue[tf];
              const leads = c.metrics.leads[tf] + c.metrics.emails[tf];
              const sess  = c.metrics.sessions[tf];
              const pct   = trendPct(c.revenueSeries.month);
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
      `,
    });

    wireLayout(app);

    document.querySelectorAll('.tf-btn').forEach(btn =>
      btn.addEventListener('click', () => { tf = btn.dataset.tf; draw(); })
    );
    document.querySelectorAll('[data-id]').forEach(row =>
      row.addEventListener('click', () => location.hash = '#client/' + row.dataset.id)
    );

    requestAnimationFrame(() => {
      if (combinedSeries.length) {
        renderChart('report-chart', combinedSeries, '#0064E0');
      } else {
        const wrap = document.querySelector('.chart-wrap');
        if (wrap) wrap.innerHTML = '<div class="empty-state"><div class="es-icon">📊</div><div class="es-text">No revenue data for this period</div></div>';
      }
    });
  }

  draw();
}

// ── Settings View ──────────────────────────────────────────────
export function settingsView(app) {
  destroyChart();

  app.innerHTML = buildLayout({
    active: 'settings',
    title:  'Settings',
    content: `
      <div class="page-topbar">
        <div class="page-topbar-title">Settings</div>
      </div>

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
        <div class="section-label">Client login credentials</div>
        <div class="card">
          ${MOCK_CLIENTS.map(c => `
            <div class="table-row">
              <div class="client-avatar" style="background:${esc(c.color)};width:32px;height:32px;border-radius:8px;font-size:0.65rem;flex-shrink:0">${esc(c.initials)}</div>
              <div class="row-main">
                <div class="row-name">${esc(c.name)}</div>
                <div class="row-sub cred-email" data-id="${esc(c.id)}" style="cursor:pointer;color:var(--blue)">Tap to reveal login</div>
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
              <div class="row-sub">5 clients · live Supabase tracking</div>
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
        <div class="section-label">Tracker snippet</div>
        <div class="card">
          <div class="table-row">
            <div class="row-main">
              <div class="row-name" style="font-family:monospace;font-size:0.7rem;word-break:break-all;color:var(--text-secondary);line-height:1.5">
                &lt;script src="https://project-kday6.vercel.app/tracker/tracker.js" data-client="CLIENT_ID"&gt;&lt;/script&gt;
              </div>
              <div class="row-sub" style="margin-top:4px">Embed on every client site to track events</div>
            </div>
          </div>
        </div>
      </div>

      <div class="section">
        <div class="card">
          <div class="table-row" id="signout-row" style="cursor:pointer">
            <div class="row-name" style="color:var(--red)">Sign out</div>
          </div>
        </div>
      </div>

      <div class="page-spacer"></div>
    `,
  });

  wireLayout(app);

  document.querySelectorAll('.cred-email').forEach(el => {
    el.addEventListener('click', () => {
      const id    = el.dataset.id;
      const creds = CREDS_MAP[id];
      if (!creds) return;
      if (el.dataset.revealed) {
        el.textContent = 'Tap to reveal login';
        delete el.dataset.revealed;
      } else {
        el.textContent = creds.email + ' · ' + creds.password;
        el.dataset.revealed = '1';
      }
    });
  });

  document.getElementById('signout-row').addEventListener('click', () => {
    clearSession().then(() => loginView(app));
  });
}
