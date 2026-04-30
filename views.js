// ── Views ──────────────────────────────────────────────────────
import { MOCK_CLIENTS, getClient, getAgencySummary, CLIENT_CREDS } from './data.js';
import { checkLogin, clearSession, bottomNavHTML, wireNav, esc } from './utils.js';

// Alias for settings view
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

// Mini SVG sparkline from a revenue series
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
  return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polyline points="${pts}" stroke="${color}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

// Trend % comparing second half vs first half of a series
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
  const up  = pct >= 0;
  const col = up ? 'var(--green)' : 'var(--red)';
  const bg  = up ? 'var(--green-bg)' : 'var(--red-bg)';
  return `<span style="font-size:0.62rem;font-weight:600;color:${col};background:${bg};border-radius:20px;padding:2px 6px;white-space:nowrap">${up ? '↑' : '↓'} ${Math.abs(pct)}%</span>`;
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
    if (wrap) wrap.innerHTML = '<div class="empty-state"><div class="es-icon">📊</div><div class="es-text">No revenue data yet</div></div>';
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
      }]
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
          callbacks: { label: ctx => ' $' + ctx.parsed.y.toLocaleString() }
        }
      },
      scales: { x: { display: false }, y: { display: false, beginAtZero: false } },
      interaction: { mode: 'nearest', axis: 'x', intersect: false },
    }
  });
}

// ── Login ──────────────────────────────────────────────────────
export function loginView(app) {
  destroyChart();
  app.innerHTML = `
    <div class="login-page">
      <div class="login-logo">Kalnyesgrowth</div>
      <div class="login-sub">Agency Dashboard</div>
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
  const s = getAgencySummary();
  const totalSessions = MOCK_CLIENTS.reduce((acc, c) => acc + c.metrics.sessions.month, 0);
  const totalLeads    = MOCK_CLIENTS.reduce((acc, c) => acc + c.metrics.leads.month + c.metrics.emails.month, 0);

  app.innerHTML = `
    <div class="page">
      <div class="topbar">
        <div style="flex:1"><div class="topbar-title">KG Dashboard</div></div>
        <button class="logout-btn" id="logout-btn" title="Sign out">⏻</button>
      </div>

      <div class="greeting-bar">
        <div>
          <div class="greeting-text">${esc(greeting())}, Kalnyesgrowth 👋</div>
          <div class="greeting-date">${esc(todayStr())}</div>
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

      <div class="section" style="padding-top:16px">
        <div class="section-title">Your clients</div>
        <div class="client-list">
          ${MOCK_CLIENTS.map(c => {
            const hasRev  = c.metrics.revenue.month > 0;
            const val     = hasRev ? fmt(c.metrics.revenue.month) : num(c.metrics.leads.month + c.metrics.emails.month);
            const lbl     = hasRev ? 'rev / mo' : 'leads / mo';
            const series  = c.revenueSeries.month;
            const pct     = trendPct(series);
            const spark   = hasRev ? sparkline(series, c.color) : '';
            return `
            <div class="client-row" data-id="${esc(c.id)}">
              <div class="client-avatar" style="background:${esc(c.color)}">${esc(c.initials)}</div>
              <div class="client-info">
                <div class="client-name">${esc(c.name)}</div>
                <div class="client-meta"><span class="status-dot"></span>${esc(c.domain)}</div>
                <div style="margin-top:3px">${trendBadge(pct)}</div>
              </div>
              ${hasRev ? `<div style="flex-shrink:0;padding:0 6px">${spark}</div>` : ''}
              <div class="client-right">
                <div class="cr-val">${esc(val)}</div>
                <div class="cr-label">${esc(lbl)}</div>
              </div>
              <div class="row-arrow">›</div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <div class="section-spacer"></div>
    </div>
    ${bottomNavHTML('clients')}`;

  document.querySelectorAll('.client-row').forEach(row =>
    row.addEventListener('click', () => location.hash = '#client/' + row.dataset.id)
  );
  document.getElementById('logout-btn').addEventListener('click', () => {
    clearSession().then(() => loginView(app));
  });
  wireNav();
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
    const m      = client.metrics;
    const isEcom = client.niche === 'ecommerce';
    const series = client.revenueSeries[tf === 'today' ? 'week' : tf] || [];
    const hasRev = m.revenue[tf] > 0;
    const convBase = isEcom ? m.orders[tf] : m.leads[tf];
    const conv = m.sessions[tf] > 0 && convBase > 0
      ? ((convBase / m.sessions[tf]) * 100).toFixed(1) + '%' : '—';

    app.innerHTML = `
      <div class="page">
        <div class="topbar">
          ${isAgency ? `<button class="topbar-back" id="back-btn">‹</button>` : ''}
          <div style="flex:1">
            <div class="topbar-title">${esc(client.name)}</div>
            <div class="topbar-sub">${esc(client.domain)}</div>
          </div>
          ${!isAgency ? `<button class="logout-btn" id="logout-btn">⏻</button>` : ''}
        </div>

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
            <button class="tf-btn${tf===t?' active':''}" data-tf="${t}">
              ${t === 'today' ? 'Today' : t === 'week' ? 'Week' : t === 'month' ? 'Month' : 'All'}
            </button>`).join('')}
        </div>

        ${series.length > 0 || hasRev ? `
        <div class="section" style="padding-top:12px">
          <div class="chart-card">
            <div class="chart-top">
              <div>
                <div class="chart-label">Revenue</div>
                <div class="chart-amount">${esc(fmt(m.revenue[tf]))}</div>
              </div>
              <div class="chart-period">${esc(tfLabel(tf))}</div>
            </div>
            <div class="chart-wrap"><canvas id="rev-chart"></canvas></div>
          </div>
        </div>` : ''}

        <div class="section" style="padding-top:12px">
          <div class="section-title">Performance · ${esc(tfLabel(tf))}</div>
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
        <div class="section" style="padding-top:12px">
          <div class="section-title">Recent orders</div>
          <div class="table-card">
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
        <div class="section" style="padding-top:12px">
          <div class="section-title">Email captures</div>
          <div class="table-card">
            ${client.recentEmails.map(e => `
              <div class="table-row">
                <div class="email-ico">✉️</div>
                <div class="row-main">
                  <div class="row-name">${esc(e.email)}</div>
                  <div class="row-sub">${esc(e.source)} · ${esc(e.date)}</div>
                </div>
              </div>`).join('')}
          </div>
        </div>` : ''}

        <div class="section-spacer"></div>
      </div>
      ${isAgency ? bottomNavHTML('clients') : ''}`;

    if (isAgency) {
      document.getElementById('back-btn').addEventListener('click', () => location.hash = '#clients');
      wireNav();
    } else {
      document.getElementById('logout-btn').addEventListener('click', () => {
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

    // Aggregate combined revenue series across ecommerce clients
    const ecomClients = MOCK_CLIENTS.filter(c => c.niche === 'ecommerce' && c.revenueSeries[tfKey]?.length);
    let combinedSeries = [];
    if (ecomClients.length) {
      const base = ecomClients[0].revenueSeries[tfKey];
      combinedSeries = base.map((pt, i) => ({
        date: pt.date,
        revenue: ecomClients.reduce((s, c) => s + (c.revenueSeries[tfKey][i]?.revenue || 0), 0),
      }));
    }

    const totalRev     = MOCK_CLIENTS.reduce((s, c) => s + c.metrics.revenue[tf], 0);
    const totalSess    = MOCK_CLIENTS.reduce((s, c) => s + c.metrics.sessions[tf], 0);
    const totalLeads   = MOCK_CLIENTS.reduce((s, c) => s + c.metrics.leads[tf] + c.metrics.emails[tf], 0);
    const totalOrders  = MOCK_CLIENTS.reduce((s, c) => s + c.metrics.orders[tf], 0);

    app.innerHTML = `
      <div class="page">
        <div class="topbar">
          <div style="flex:1"><div class="topbar-title">Reports</div></div>
          <button class="logout-btn" id="logout-btn">⏻</button>
        </div>

        <div class="tf-row">
          ${['today','week','month','all'].map(t => `
            <button class="tf-btn${tf===t?' active':''}" data-tf="${t}">
              ${t==='today'?'Today':t==='week'?'Week':t==='month'?'Month':'All'}
            </button>`).join('')}
        </div>

        <!-- Combined revenue chart -->
        <div class="section" style="padding-top:12px">
          <div class="chart-card">
            <div class="chart-top">
              <div>
                <div class="chart-label">Total Revenue</div>
                <div class="chart-amount">${esc(fmt(totalRev))}</div>
              </div>
              <div class="chart-period">${esc(tfLabel(tf))}</div>
            </div>
            <div class="chart-wrap"><canvas id="report-chart"></canvas></div>
          </div>
        </div>

        <!-- Summary stats -->
        <div class="section" style="padding-top:12px">
          <div class="section-title">All clients · ${esc(tfLabel(tf))}</div>
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

        <!-- Per-client breakdown -->
        <div class="section" style="padding-top:12px">
          <div class="section-title">Client breakdown</div>
          <div class="table-card">
            ${MOCK_CLIENTS.map(c => {
              const rev   = c.metrics.revenue[tf];
              const leads = c.metrics.leads[tf] + c.metrics.emails[tf];
              const sess  = c.metrics.sessions[tf];
              const pct   = trendPct(c.revenueSeries.month);
              return `
              <div class="table-row" style="cursor:pointer" data-id="${esc(c.id)}">
                <div class="client-avatar" style="background:${esc(c.color)};width:32px;height:32px;border-radius:6px;font-size:0.65rem">${esc(c.initials)}</div>
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

        <div class="section-spacer"></div>
      </div>
      ${bottomNavHTML('reports')}`;

    document.querySelectorAll('.tf-btn').forEach(btn =>
      btn.addEventListener('click', () => { tf = btn.dataset.tf; draw(); })
    );
    document.querySelectorAll('[data-id]').forEach(row =>
      row.addEventListener('click', () => location.hash = '#client/' + row.dataset.id)
    );
    document.getElementById('logout-btn').addEventListener('click', () => {
      clearSession().then(() => loginView(app));
    });
    wireNav();

    requestAnimationFrame(() => {
      if (combinedSeries.length) renderChart('report-chart', combinedSeries, '#008060');
      else {
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
  const { CLIENT_CREDS, AGENCY_CREDS } = window.__kg_creds || {};

  app.innerHTML = `
    <div class="page">
      <div class="topbar">
        <div style="flex:1"><div class="topbar-title">Settings</div></div>
        <button class="logout-btn" id="logout-btn">⏻</button>
      </div>

      <!-- Agency account -->
      <div class="section" style="padding-top:16px">
        <div class="section-title">Agency account</div>
        <div class="table-card">
          <div class="table-row">
            <div class="row-main">
              <div class="row-name">Kalnyesgrowth</div>
              <div class="row-sub">Agency owner</div>
            </div>
            <div class="row-right" style="font-size:0.72rem;color:var(--green);font-weight:600">Active</div>
          </div>
          <div class="table-row">
            <div class="row-main">
              <div class="row-name">admin@kalnyesgrowth.com</div>
              <div class="row-sub">Login email</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Client logins -->
      <div class="section" style="padding-top:12px">
        <div class="section-title">Client login credentials</div>
        <div class="table-card">
          ${MOCK_CLIENTS.map(c => `
            <div class="table-row">
              <div class="client-avatar" style="background:${esc(c.color)};width:32px;height:32px;border-radius:6px;font-size:0.65rem;flex-shrink:0">${esc(c.initials)}</div>
              <div class="row-main">
                <div class="row-name">${esc(c.name)}</div>
                <div class="row-sub cred-email" data-id="${esc(c.id)}" style="cursor:pointer;color:var(--blue)">Tap to reveal login</div>
              </div>
            </div>`).join('')}
        </div>
      </div>

      <!-- Plan info -->
      <div class="section" style="padding-top:12px">
        <div class="section-title">Plan</div>
        <div class="table-card">
          <div class="table-row">
            <div class="row-main">
              <div class="row-name">Agency Dashboard v1</div>
              <div class="row-sub">Mock data · Supabase coming in v2</div>
            </div>
            <div style="font-size:0.7rem;color:var(--text-xsoft);flex-shrink:0">v1.0</div>
          </div>
          <div class="table-row">
            <div class="row-main">
              <div class="row-name">5 active clients</div>
              <div class="row-sub">$200/mo per client when billing goes live</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Sign out -->
      <div class="section" style="padding-top:12px">
        <div class="table-card">
          <div class="table-row" id="signout-row" style="cursor:pointer">
            <div class="row-main">
              <div class="row-name" style="color:var(--red)">Sign out</div>
            </div>
          </div>
        </div>
      </div>

      <div class="section-spacer"></div>
    </div>
    ${bottomNavHTML('settings')}`;

  // Reveal credentials on tap
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

  document.getElementById('logout-btn').addEventListener('click', () => { clearSession().then(() => loginView(app)); });
  document.getElementById('signout-row').addEventListener('click', () => { clearSession().then(() => loginView(app)); });
  wireNav();
}
