// ── daily-digest Edge Function ──────────────────────────────────
// Sends a daily summary email to each client who had activity.
// Triggered by pg_cron daily at 8am ET.
//
// Deploy:
//   supabase functions deploy daily-digest --project-ref boddsbxlaytcrkpuckyn
//
// pg_cron setup (run in SQL editor):
//   SELECT cron.schedule('daily-digest', '0 12 * * *',
//     $$SELECT net.http_post(
//       url := 'https://boddsbxlaytcrkpuckyn.supabase.co/functions/v1/daily-digest',
//       headers := jsonb_build_object('Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')),
//       body := '{}'::jsonb
//     )$$
//   );

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_KEY) return json({ error: 'Email not configured' }, 503);

  // Get all active clients with notification prefs
  const { data: clients, error: cErr } = await adminClient
    .from('clients')
    .select('id, name, notification_prefs')
    .eq('status', 'active');

  if (cErr || !clients?.length) return json({ skipped: 'No active clients' });

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  yesterday.setHours(0, 0, 0, 0);
  const since = yesterday.toISOString();

  let emailsSent = 0;

  for (const client of clients) {
    const prefs = client.notification_prefs || {};
    if (!prefs.daily_summary || !prefs.email) continue;

    // Count new leads since yesterday
    const { count: leadCount } = await adminClient
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .gte('created_at', since);

    // Count new events since yesterday
    const { count: eventCount } = await adminClient
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .gte('ts', since);

    // Count pageviews
    const { count: pvCount } = await adminClient
      .from('events')
      .select('*', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .eq('event_type', 'pageview')
      .gte('ts', since);

    // Skip if zero activity
    if ((leadCount || 0) === 0 && (eventCount || 0) === 0) continue;

    const html = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111">
        <div style="background:#1A1A1A;padding:24px 20px;border-radius:12px 12px 0 0">
          <div style="color:#fff;font-size:20px;font-weight:700">Daily Summary</div>
          <div style="color:#999;font-size:13px;margin-top:4px">${client.name} | ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
        </div>
        <div style="padding:24px 20px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 12px 12px">
          <div style="display:flex;gap:16px;margin-bottom:20px">
            <div style="flex:1;background:#F0F7FF;padding:16px;border-radius:8px;text-align:center">
              <div style="font-size:28px;font-weight:800;color:#0064E0">${leadCount || 0}</div>
              <div style="font-size:12px;color:#666;margin-top:4px">New Leads</div>
            </div>
            <div style="flex:1;background:#F0FFF4;padding:16px;border-radius:8px;text-align:center">
              <div style="font-size:28px;font-weight:800;color:#059669">${pvCount || 0}</div>
              <div style="font-size:12px;color:#666;margin-top:4px">Page Views</div>
            </div>
          </div>
          ${(leadCount || 0) > 0 ? `<p style="margin:0 0 16px;color:#333">You received <strong>${leadCount} new lead${(leadCount || 0) > 1 ? 's' : ''}</strong> yesterday. Log in to view details and follow up.</p>` : ''}
          <p style="margin:20px 0 0"><a href="https://project-kday6.vercel.app" style="background:#0064E0;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Open Dashboard</a></p>
        </div>
      </div>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Kalnyesgrowth <noreply@kalnyesgrowth.com>',
        to: [prefs.email],
        subject: `Daily Summary: ${leadCount || 0} new leads, ${pvCount || 0} views`,
        html,
      }),
    });

    if (res.ok) {
      emailsSent++;
      // Create in-app notification
      await adminClient.from('notifications').insert({
        client_id: client.id,
        type: 'system',
        title: 'Daily summary sent',
        body: `${leadCount || 0} leads, ${pvCount || 0} page views yesterday`,
        read: false,
        link: '#reports',
      }).catch(() => {});
    }
  }

  console.log(`Daily digest: ${emailsSent} emails sent`);
  return json({ sent: emailsSent });
});
