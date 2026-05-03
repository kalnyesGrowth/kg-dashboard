// ── Database queries ───────────────────────────────────────────
import { supabase, SUPABASE_URL, SUPABASE_ANON_KEY } from './client.js';

// ── Auth ───────────────────────────────────────────────────────
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getAuthSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getAuthUser() {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

// ── Clients ────────────────────────────────────────────────────
export async function fetchClients() {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('status', 'active')
    .order('since', { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchClient(clientId) {
  const { data, error } = await supabase
    .from('clients')
    .select('*')
    .eq('id', clientId)
    .single();
  if (error) throw error;
  return data;
}

// ── Metrics summary (from view) ────────────────────────────────
export async function fetchMetricsSummary(clientId) {
  const { data, error } = await supabase
    .from('client_metrics_summary')
    .select('*')
    .eq('client_id', clientId)
    .single();
  if (error) throw error;

  // Reshape into the same structure the UI expects: metric[tf]
  const r = data;
  return {
    revenue:    { today: r.revenue_today,      week: r.revenue_week,      month: r.revenue_month,      all: r.revenue_all      },
    sessions:   { today: r.sessions_today,     week: r.sessions_week,     month: r.sessions_month,     all: r.sessions_all     },
    leads:      { today: r.leads_today,        week: r.leads_week,        month: r.leads_month,        all: r.leads_all        },
    emails:     { today: r.emails_today,       week: r.emails_week,       month: r.emails_month,       all: r.emails_all       },
    orders:     { today: r.orders_today,       week: r.orders_week,       month: r.orders_month,       all: r.orders_all       },
    addToCarts: { today: r.add_to_carts_today, week: r.add_to_carts_week, month: r.add_to_carts_month, all: r.add_to_carts_all },
  };
}

// ── Revenue series for charts ──────────────────────────────────
export async function fetchRevenueSeries(clientId, days) {
  const since = new Date();
  since.setDate(since.getDate() - days);

  const { data, error } = await supabase
    .from('daily_metrics')
    .select('date, revenue')
    .eq('client_id', clientId)
    .gte('date', since.toISOString().slice(0, 10))
    .order('date', { ascending: true });
  if (error) throw error;

  return data.map(row => ({
    date:    new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    revenue: Number(row.revenue),
  }));
}

// ── Recent orders ──────────────────────────────────────────────
export async function fetchRecentOrders(clientId, limit = 5) {
  const { data, error } = await supabase
    .from('events')
    .select('id, payload, ts')
    .eq('client_id', clientId)
    .eq('event_type', 'order')
    .order('ts', { ascending: false })
    .limit(limit);
  if (error) throw error;

  return data.map((row, i) => ({
    id:       '#' + String(1000 + i).padStart(4, '0'),
    customer: row.payload?.customer_name || 'Customer',
    email:    row.payload?.email || '',
    amount:   row.payload?.value || 0,
    status:   row.payload?.status || 'confirmed',
    date:     new Date(row.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
  }));
}

// ── Recent email captures ──────────────────────────────────────
export async function fetchRecentEmails(clientId, limit = 5) {
  const { data, error } = await supabase
    .from('events')
    .select('id, payload, ts')
    .eq('client_id', clientId)
    .eq('event_type', 'email_capture')
    .order('ts', { ascending: false })
    .limit(limit);
  if (error) throw error;

  return data.map(row => ({
    email:  row.payload?.email || '—',
    source: row.payload?.source || 'Unknown',
    date:   new Date(row.ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }),
  }));
}

// ── Live event feed (last N raw events) ───────────────────────
export async function fetchRecentEvents(clientId, limit = 25) {
  const { data, error } = await supabase
    .from('events')
    .select('event_type, page, payload, ts')
    .eq('client_id', clientId)
    .order('ts', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// ── Today's live metrics direct from events table ──────────────
// Used when daily_metrics hasn't rolled up yet (same day activity)
export async function fetchLiveTodayMetrics(clientId) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { data: events, error } = await supabase
    .from('events')
    .select('event_type, session_id, payload')
    .eq('client_id', clientId)
    .gte('ts', startOfDay.toISOString());
  if (error) throw error;

  const rows        = events || [];
  const sessions    = new Set(rows.filter(e => e.event_type === 'session_start').map(e => e.session_id)).size;
  const leads       = rows.filter(e => e.event_type === 'lead').length;
  const emails      = rows.filter(e => e.event_type === 'email_capture').length;
  const addToCarts  = rows.filter(e => e.event_type === 'add_to_cart').length;
  const orderRows   = rows.filter(e => e.event_type === 'order');
  return {
    sessions,
    leads,
    emails,
    addToCarts,
    orders:  orderRows.length,
    revenue: orderRows.reduce((s, e) => s + Number(e.payload?.value || 0), 0),
  };
}

// ── Agency summary (all clients) ───────────────────────────────
export async function fetchAgencySummary() {
  const { data, error } = await supabase
    .from('client_metrics_summary')
    .select('revenue_month, orders_month, leads_month, emails_month, sessions_month');
  if (error) throw error;

  return {
    totalRevenueMonth: data.reduce((s, r) => s + Number(r.revenue_month), 0),
    totalOrdersMonth:  data.reduce((s, r) => s + Number(r.orders_month), 0),
    totalLeadsMonth:   data.reduce((s, r) => s + Number(r.leads_month) + Number(r.emails_month), 0),
    totalSessionsMonth:data.reduce((s, r) => s + Number(r.sessions_month), 0),
  };
}

// ── Clients list with metrics (one-shot for the overview) ──────
export async function fetchClientsWithMetrics() {
  const [{ data: clients, error: ce }, { data: mets }] = await Promise.all([
    supabase.from('clients').select('*').eq('status', 'active').order('name'),
    supabase.from('client_metrics_summary').select('*'),
  ]);
  if (ce) throw ce;
  const mm = Object.fromEntries((mets || []).map(m => [m.client_id, m]));
  const n  = (obj, k) => Number(obj?.[k] || 0);
  return (clients || []).map(c => {
    const m = mm[c.id] || {};
    return {
      id: c.id, name: c.name, domain: c.domain,
      color: c.color || '#0064E0', initials: c.initials,
      plan: c.plan, niche: c.niche, status: c.status,
      metrics: {
        revenue:    { today: n(m,'revenue_today'),       week: n(m,'revenue_week'),       month: n(m,'revenue_month'),       all: n(m,'revenue_all')       },
        sessions:   { today: n(m,'sessions_today'),      week: n(m,'sessions_week'),       month: n(m,'sessions_month'),      all: n(m,'sessions_all')      },
        leads:      { today: n(m,'leads_today'),         week: n(m,'leads_week'),          month: n(m,'leads_month'),         all: n(m,'leads_all')         },
        emails:     { today: n(m,'emails_today'),        week: n(m,'emails_week'),         month: n(m,'emails_month'),        all: n(m,'emails_all')        },
        orders:     { today: n(m,'orders_today'),        week: n(m,'orders_week'),         month: n(m,'orders_month'),        all: n(m,'orders_all')        },
        addToCarts: { today: n(m,'add_to_carts_today'),  week: n(m,'add_to_carts_week'),   month: n(m,'add_to_carts_month'),  all: n(m,'add_to_carts_all')  },
      },
      revenueSeries: { week: [], month: [], all: [] },
      recentOrders:  [],
      recentEmails:  [],
    };
  });
}

// ── Add a new client ───────────────────────────────────────────
export async function addClient({ name, domain, color, initials, plan, niche }) {
  const { data, error } = await supabase
    .from('clients')
    .insert([{ name, domain, color, initials, plan, niche }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Create client user via edge function ───────────────────────
export async function createClientUser(email, password, clientId) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/create-client-user`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey':        SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password, clientId }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to create login');
  return json; // { userId, email }
}

// ── All subscribers (deduplicated email captures) ──────────────
export async function fetchAllSubscribers(clientId) {
  const { data, error } = await supabase
    .from('events')
    .select('payload, ts')
    .eq('client_id', clientId)
    .eq('event_type', 'email_capture')
    .order('ts', { ascending: false });
  if (error) throw error;

  const seen = new Set();
  return (data || []).filter(row => {
    const email = row.payload?.email;
    if (!email || seen.has(email)) return false;
    seen.add(email);
    return true;
  }).map(row => ({
    email:  row.payload?.email,
    source: row.payload?.source || 'website',
    date:   new Date(row.ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
  }));
}

// ── Send broadcast email via edge function ─────────────────────
export async function sendBroadcast({ clientId, clientName, recipients, subject, body }) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');

  const res = await fetch(`${SUPABASE_URL}/functions/v1/send-broadcast`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey':        SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ clientId, clientName, recipients, subject, body }),
  });

  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to send email');
  return json;
}

// ── Delete a client (rollback on partial failure) ──────────────
export async function deleteClient(clientId) {
  const { error } = await supabase.from('clients').delete().eq('id', clientId);
  if (error) throw error;
}
