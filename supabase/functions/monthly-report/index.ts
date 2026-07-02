// ── monthly-report Edge Function ────────────────────────────────
// Sends a monthly performance summary email to each active client.
// Triggered by pg_cron on the 1st of each month.
//
// Deploy:
//   supabase functions deploy monthly-report --project-ref boddsbxlaytcrkpuckyn
//
// pg_cron setup (run in SQL editor):
//   SELECT cron.schedule('monthly-report', '0 14 1 * *',
//     $$SELECT net.http_post(
//       url := 'https://boddsbxlaytcrkpuckyn.supabase.co/functions/v1/monthly-report',
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

  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const FUNC_URL = Deno.env.get('SUPABASE_URL')!.replace('.supabase.co', '.supabase.co/functions/v1');

  async function unsubToken(type: string, id: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${type}:${id}`));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  const { data: clients } = await adminClient
    .from('clients')
    .select('id, name, notification_prefs')
    .eq('status', 'active');

  if (!clients?.length) return json({ skipped: 'No active clients' });

  // Previous month range
  const now = new Date();
  const firstOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const firstOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const monthName = firstOfLastMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  let sent = 0;

  for (const client of clients) {
    const prefs = client.notification_prefs || {};
    if (!prefs.monthly_report || !prefs.email) continue;

    // Count metrics for last month
    const since = firstOfLastMonth.toISOString();
    const until = firstOfThisMonth.toISOString();

    const [leads, events, pageviews] = await Promise.all([
      adminClient.from('leads').select('*', { count: 'exact', head: true })
        .eq('client_id', client.id).gte('created_at', since).lt('created_at', until),
      adminClient.from('events').select('*', { count: 'exact', head: true })
        .eq('client_id', client.id).gte('ts', since).lt('ts', until),
      adminClient.from('events').select('*', { count: 'exact', head: true })
        .eq('client_id', client.id).eq('event_type', 'pageview').gte('ts', since).lt('ts', until),
    ]);

    const leadCount = leads.count || 0;
    const pvCount = pageviews.count || 0;
    const eventCount = events.count || 0;

    const unsubUrl = `${FUNC_URL}/unsubscribe?type=report&id=${client.id}&token=${await unsubToken('report', client.id)}`;

    const emailHtml = `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111">
        <div style="background:#1A1A1A;padding:28px 24px;border-radius:12px 12px 0 0">
          <div style="color:#fff;font-size:22px;font-weight:700">Monthly Report</div>
          <div style="color:#999;font-size:14px;margin-top:4px">${client.name} | ${monthName}</div>
        </div>
        <div style="padding:28px 24px;border:1px solid #E5E7EB;border-top:none;border-radius:0 0 12px 12px">
          <div style="display:flex;gap:16px;margin-bottom:24px">
            <div style="flex:1;background:#F0F7FF;padding:20px;border-radius:8px;text-align:center">
              <div style="font-size:32px;font-weight:800;color:#0064E0">${leadCount}</div>
              <div style="font-size:13px;color:#666;margin-top:4px">New Leads</div>
            </div>
            <div style="flex:1;background:#F0FFF4;padding:20px;border-radius:8px;text-align:center">
              <div style="font-size:32px;font-weight:800;color:#059669">${pvCount}</div>
              <div style="font-size:13px;color:#666;margin-top:4px">Page Views</div>
            </div>
            <div style="flex:1;background:#FFF7ED;padding:20px;border-radius:8px;text-align:center">
              <div style="font-size:32px;font-weight:800;color:#EA580C">${eventCount}</div>
              <div style="font-size:13px;color:#666;margin-top:4px">Total Events</div>
            </div>
          </div>

          <h3 style="margin:0 0 12px;font-size:16px">Highlights</h3>
          <ul style="padding-left:20px;color:#333;line-height:1.8;font-size:14px">
            <li>${leadCount > 0 ? `You received <strong>${leadCount} new lead${leadCount > 1 ? 's' : ''}</strong> last month.` : 'No new leads last month. Consider running a promotion.'}</li>
            <li>Your website had <strong>${pvCount.toLocaleString()} page views</strong>.</li>
            <li>Total of <strong>${eventCount.toLocaleString()} tracked events</strong> (visits, form fills, clicks).</li>
          </ul>

          <p style="margin:24px 0 0"><a href="https://project-kday6.vercel.app" style="background:#0064E0;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">View Full Report</a></p>

          <p style="margin-top:24px;font-size:12px;color:#999">You can also download a PDF report from your dashboard.</p>
        </div>
        <div style="margin-top:24px;padding:16px 24px;font-size:11px;color:#999;text-align:center;border-top:1px solid #E5E7EB">
          <p style="margin:0 0 4px">KalnyesGrowth, Stafford, VA 22554</p>
          <p style="margin:0"><a href="${unsubUrl}" style="color:#999">Unsubscribe from monthly reports</a></p>
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
        subject: `Your ${monthName} Report | ${client.name}`,
        html: emailHtml,
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    });

    if (res.ok) {
      sent++;
      await adminClient.from('notifications').insert({
        client_id: client.id,
        type: 'report_ready',
        title: `${monthName} report ready`,
        body: `${leadCount} leads, ${pvCount} page views last month`,
        read: false,
        link: '#reports',
      }).catch(() => {});
    }
  }

  console.log(`Monthly reports: ${sent} emails sent`);
  return json({ sent });
});
