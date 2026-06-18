// ── Daily Rollup Edge Function ─────────────────────────────────
// Aggregates raw events → daily_metrics for yesterday
// Deploy: supabase functions deploy daily-rollup
// Schedule: Database → Extensions → pg_cron → run at midnight daily
//   SELECT cron.schedule('daily-rollup', '0 0 * * *', $$
//     SELECT net.http_post(
//       url := 'https://YOUR_PROJECT.supabase.co/functions/v1/daily-rollup',
//       headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
//     );
//   $$);

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req) => {
  const url     = new URL(req.url);
  const target  = url.searchParams.get('date') || yesterdayStr();

  console.log(`Rolling up events for ${target}`);

  // Get all clients
  const { data: clients, error: cErr } = await supabase.from('clients').select('id');
  if (cErr) return new Response(cErr.message, { status: 500 });

  const results = await Promise.all(clients.map(c => rollupClient(c.id, target)));
  const errors  = results.filter(r => r.error);

  if (errors.length) {
    console.error('Rollup errors:', errors);
    return new Response(JSON.stringify({ errors }), { status: 207 });
  }

  return new Response(JSON.stringify({ ok: true, date: target, clients: clients.length }));
});

async function rollupClient(clientId: string, date: string) {
  const start = `${date}T00:00:00Z`;
  const end   = `${date}T23:59:59Z`;

  const { data: events, error } = await supabase
    .from('events')
    .select('event_type, session_id, payload')
    .eq('client_id', clientId)
    .gte('ts', start)
    .lte('ts', end);

  if (error) return { clientId, error: error.message };

  const sessions    = new Set(events.filter(e => e.event_type === 'session_start').map(e => e.session_id)).size;
  const pageviews   = events.filter(e => e.event_type === 'pageview').length;
  const leads       = events.filter(e => e.event_type === 'lead').length;
  const emails      = events.filter(e => e.event_type === 'email_capture').length;
  const addToCarts  = events.filter(e => e.event_type === 'add_to_cart').length;
  const orderEvents = events.filter(e => e.event_type === 'order');
  const orders      = orderEvents.length;
  const revenue     = orderEvents.reduce((s, e) => s + Number(e.payload?.value || 0), 0);

  const { error: upsertErr } = await supabase.from('daily_metrics').upsert({
    client_id: clientId,
    date,
    sessions,
    pageviews,
    leads,
    emails,
    add_to_carts: addToCarts,
    orders,
    revenue,
  }, { onConflict: 'client_id,date' });

  return { clientId, error: upsertErr?.message || null };
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
