// ── check-uptime Edge Function ──────────────────────────────────
// Checks each client's website with an HTTP HEAD request.
// If 2+ consecutive failures, creates a notification alert.
// Triggered by pg_cron every 15 minutes.
//
// Deploy:
//   supabase functions deploy check-uptime --project-ref boddsbxlaytcrkpuckyn
//
// pg_cron setup (run in SQL editor):
//   SELECT cron.schedule('check-uptime', '*/15 * * * *',
//     $$SELECT net.http_post(
//       url := 'https://boddsbxlaytcrkpuckyn.supabase.co/functions/v1/check-uptime',
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

  const { data: clients } = await adminClient
    .from('clients')
    .select('id, name, domain')
    .eq('status', 'active')
    .not('domain', 'is', null);

  if (!clients?.length) return json({ skipped: 'No clients with domains' });

  let checked = 0;
  let down = 0;

  for (const client of clients) {
    if (!client.domain) continue;

    const url = client.domain.startsWith('http') ? client.domain : `https://${client.domain}`;
    let statusCode = 0;
    let responseMs = 0;

    try {
      const start = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(url, { method: 'HEAD', signal: controller.signal, redirect: 'follow' });
      clearTimeout(timeout);
      responseMs = Date.now() - start;
      statusCode = res.status;
    } catch (_) {
      statusCode = 0;
      responseMs = 10000;
    }

    // Store check result
    await adminClient.from('uptime_checks').insert({
      client_id: client.id,
      status_code: statusCode,
      response_ms: responseMs,
    });

    checked++;

    // Check for 2+ consecutive failures
    if (statusCode === 0 || statusCode >= 500) {
      const { data: recent } = await adminClient
        .from('uptime_checks')
        .select('status_code')
        .eq('client_id', client.id)
        .order('checked_at', { ascending: false })
        .limit(2);

      const consecutiveDown = recent?.every(c => c.status_code === 0 || c.status_code >= 500);
      if (consecutiveDown && recent.length >= 2) {
        down++;
        // Create alert notification (avoid duplicates within 1 hour)
        const oneHourAgo = new Date(Date.now() - 3600000).toISOString();
        const { data: existing } = await adminClient
          .from('notifications')
          .select('id')
          .eq('client_id', client.id)
          .eq('type', 'system')
          .ilike('title', '%site is down%')
          .gte('created_at', oneHourAgo)
          .limit(1);

        if (!existing?.length) {
          await adminClient.from('notifications').insert({
            client_id: client.id,
            type: 'system',
            title: `${client.name}'s site is down`,
            body: `${url} returned ${statusCode || 'timeout'} on 2 consecutive checks`,
            read: false,
            link: '#clients',
          });
        }
      }
    }
  }

  // Clean up old checks (keep 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
  await adminClient.from('uptime_checks').delete().lt('checked_at', thirtyDaysAgo);

  console.log(`Uptime: ${checked} checked, ${down} down`);
  return json({ checked, down });
});
