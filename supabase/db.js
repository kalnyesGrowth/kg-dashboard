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

// Defense-in-depth: ensure non-agency callers always provide a clientId.
// RLS is the primary enforcement, this is the application-level guard.
async function assertClientScope(clientId) {
  if (clientId) return;
  const { data } = await supabase.auth.getSession();
  const role = data?.session?.user?.app_metadata?.role;
  if (role && role !== 'agency') {
    throw new Error('clientId is required for non-agency users');
  }
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

// ── Daily series (all metrics per day) ───────────────────────
export async function fetchDailySeries(clientId, days) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data, error } = await supabase
    .from('daily_metrics')
    .select('date, sessions, leads, emails, revenue, orders, add_to_carts, pageviews')
    .eq('client_id', clientId)
    .gte('date', since.toISOString().slice(0, 10))
    .order('date', { ascending: true });
  if (error) throw error;
  return data || [];
}

// ── Daily series by date range (for custom picker) ──────────
export async function fetchDailySeriesByRange(clientId, startDate, endDate) {
  const { data, error } = await supabase
    .from('daily_metrics')
    .select('date, sessions, leads, emails, revenue, orders, add_to_carts, pageviews')
    .eq('client_id', clientId)
    .gte('date', startDate)
    .lte('date', endDate)
    .order('date', { ascending: true });
  if (error) throw error;
  return data || [];
}

// ── Team members (via edge function) ─────────────────────────
export async function fetchTeamMembers() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];
  const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-team-member`, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': SUPABASE_ANON_KEY },
  });
  if (!res.ok) return [];
  const json = await res.json();
  return json.team || [];
}

export async function inviteTeamMember(email, password, name) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const res = await fetch(`${SUPABASE_URL}/functions/v1/invite-team-member`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${session.access_token}`,
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email, password, name }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'Failed to invite');
  return json;
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

// ── Leads ─────────────────────────────────────────────────────
export async function fetchLeads(clientId, filters = {}) {
  await assertClientScope(clientId);
  let query = supabase
    .from('leads')
    .select('*')
    .order('created_at', { ascending: false });

  if (clientId) query = query.eq('client_id', clientId);
  if (filters.stage && filters.stage !== 'all') query = query.eq('stage', filters.stage);
  if (filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function fetchLead(leadId) {
  const { data, error } = await supabase
    .from('leads')
    .select('*')
    .eq('id', leadId)
    .single();
  if (error) throw error;
  return data;
}

export async function updateLead(leadId, updates) {
  const { data, error } = await supabase
    .from('leads')
    .update(updates)
    .eq('id', leadId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function addLeadNote(leadId, noteText) {
  const lead = await fetchLead(leadId);
  const notes = Array.isArray(lead.notes) ? lead.notes : [];
  notes.unshift({ text: noteText, ts: new Date().toISOString() });
  return updateLead(leadId, { notes });
}

export async function countUnreadLeads(clientId) {
  await assertClientScope(clientId);
  let query = supabase
    .from('leads')
    .select('id', { count: 'exact', head: true })
    .eq('read', false);
  if (clientId) query = query.eq('client_id', clientId);
  const { count, error } = await query;
  if (error) return 0;
  return count || 0;
}

export async function deleteLead(leadId) {
  const { error } = await supabase.from('leads').delete().eq('id', leadId);
  if (error) throw error;
}

// ── Contacts ──────────────────────────────────────────────────
export async function fetchContacts(clientId, filters = {}) {
  await assertClientScope(clientId);
  let query = supabase
    .from('contacts')
    .select('*')
    .order('created_at', { ascending: false });

  if (clientId) query = query.eq('client_id', clientId);
  if (filters.tag) query = query.contains('tags', [filters.tag]);
  if (filters.limit) query = query.limit(filters.limit);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function fetchContact(contactId) {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .single();
  if (error) throw error;
  return data;
}

export async function addContact(contact) {
  const { data, error } = await supabase
    .from('contacts')
    .insert([contact])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateContact(contactId, updates) {
  const { data, error } = await supabase
    .from('contacts')
    .update(updates)
    .eq('id', contactId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteContact(contactId) {
  const { error } = await supabase.from('contacts').delete().eq('id', contactId);
  if (error) throw error;
}

export async function bulkInsertContacts(contacts) {
  const { data, error } = await supabase
    .from('contacts')
    .insert(contacts)
    .select();
  if (error) throw error;
  return data || [];
}

// ── Notifications ─────────────────────────────────────────────
export async function fetchNotifications(clientId, limit = 20) {
  await assertClientScope(clientId);
  let query = supabase
    .from('notifications')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (clientId) query = query.eq('client_id', clientId);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function countUnreadNotifications(clientId) {
  await assertClientScope(clientId);
  let query = supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('read', false);
  if (clientId) query = query.eq('client_id', clientId);
  const { count, error } = await query;
  if (error) return 0;
  return count || 0;
}

export async function markNotificationRead(notifId) {
  const { error } = await supabase
    .from('notifications')
    .update({ read: true })
    .eq('id', notifId);
  if (error) throw error;
}

export async function markAllNotificationsRead(clientId) {
  await assertClientScope(clientId);
  let query = supabase
    .from('notifications')
    .update({ read: true })
    .eq('read', false);
  if (clientId) query = query.eq('client_id', clientId);
  const { error } = await query;
  if (error) throw error;
}

// ── Tickets ───────────────────────────────────────────────────
export async function fetchTickets(clientId, filters = {}) {
  await assertClientScope(clientId);
  let query = supabase
    .from('tickets')
    .select('*')
    .order('created_at', { ascending: false });

  if (clientId) query = query.eq('client_id', clientId);
  if (filters.status && filters.status !== 'all') query = query.eq('status', filters.status);

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function addTicket(ticket) {
  const { data, error } = await supabase
    .from('tickets')
    .insert([ticket])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateTicket(ticketId, updates) {
  const { data, error } = await supabase
    .from('tickets')
    .update(updates)
    .eq('id', ticketId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ── Sequences ─────────────────────────────────────────────────
export async function fetchSequences(clientId) {
  await assertClientScope(clientId);
  let query = supabase.from('sequences').select('*').order('created_at', { ascending: false });
  if (clientId) query = query.eq('client_id', clientId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function fetchSequence(seqId) {
  const { data, error } = await supabase.from('sequences').select('*').eq('id', seqId).single();
  if (error) throw error;
  return data;
}

export async function addSequence(seq) {
  const { data, error } = await supabase.from('sequences').insert([seq]).select().single();
  if (error) throw error;
  return data;
}

export async function updateSequence(seqId, updates) {
  const { data, error } = await supabase.from('sequences').update(updates).eq('id', seqId).select().single();
  if (error) throw error;
  return data;
}

export async function deleteSequence(seqId) {
  const { error } = await supabase.from('sequences').delete().eq('id', seqId);
  if (error) throw error;
}

export async function fetchEnrollments(sequenceId) {
  const { data, error } = await supabase
    .from('sequence_enrollments')
    .select('*, contacts(name, email)')
    .eq('sequence_id', sequenceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function enrollContact(contactId, sequenceId, nextSendAt) {
  const { data, error } = await supabase
    .from('sequence_enrollments')
    .insert([{ contact_id: contactId, sequence_id: sequenceId, current_step: 0, status: 'active', next_send_at: nextSendAt }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateEnrollment(enrollmentId, updates) {
  const { data, error } = await supabase.from('sequence_enrollments').update(updates).eq('id', enrollmentId).select().single();
  if (error) throw error;
  return data;
}

// ── Reviews ───────────────────────────────────────────────────
export async function fetchReviews(clientId) {
  await assertClientScope(clientId);
  let query = supabase.from('reviews').select('*').order('review_date', { ascending: false });
  if (clientId) query = query.eq('client_id', clientId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function fetchReviewStats(clientId) {
  const { data, error } = await supabase
    .from('reviews')
    .select('rating')
    .eq('client_id', clientId);
  if (error) throw error;
  if (!data?.length) return { avg: 0, count: 0, distribution: {} };
  const sum = data.reduce((s, r) => s + r.rating, 0);
  const dist = {};
  data.forEach(r => { dist[r.rating] = (dist[r.rating] || 0) + 1; });
  return { avg: +(sum / data.length).toFixed(1), count: data.length, distribution: dist };
}

// ── Bookings ──────────────────────────────────────────────────
export async function fetchBookings(clientId) {
  await assertClientScope(clientId);
  let query = supabase.from('bookings').select('*').order('date', { ascending: true });
  if (clientId) query = query.eq('client_id', clientId);
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function addBooking(booking) {
  const { data, error } = await supabase.from('bookings').insert([booking]).select().single();
  if (error) throw error;
  return data;
}

export async function updateBooking(bookingId, updates) {
  const { data, error } = await supabase.from('bookings').update(updates).eq('id', bookingId).select().single();
  if (error) throw error;
  return data;
}
