// ── run-sequences Edge Function ─────────────────────────────────
// Processes pending sequence steps. Checks all active enrollments
// where next_send_at <= now(), sends the email, advances the step.
// Triggered by pg_cron every hour.
//
// Deploy:
//   supabase functions deploy run-sequences --project-ref boddsbxlaytcrkpuckyn
//
// pg_cron setup (run in SQL editor):
//   SELECT cron.schedule('run-sequences', '0 * * * *',
//     $$SELECT net.http_post(
//       url := 'https://boddsbxlaytcrkpuckyn.supabase.co/functions/v1/run-sequences',
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

function personalize(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] || '');
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

  async function unsubToken(id: string): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', enc.encode(SERVICE_KEY), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`contact:${id}`));
    return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  // Find all active enrollments with next_send_at in the past
  const now = new Date().toISOString();
  const { data: due, error: fetchErr } = await adminClient
    .from('sequence_enrollments')
    .select('*, contacts(id, name, email, client_id), sequences(id, name, steps, client_id, status)')
    .eq('status', 'active')
    .lte('next_send_at', now)
    .limit(50);

  if (fetchErr) {
    console.error('Fetch error:', fetchErr);
    return json({ error: 'Failed to fetch enrollments' }, 500);
  }

  if (!due?.length) return json({ processed: 0 });

  let sent = 0;
  let completed = 0;

  for (const enrollment of due) {
    const seq = enrollment.sequences;
    const contact = enrollment.contacts;

    if (!seq || !contact || seq.status !== 'active') continue;
    if (contact.unsubscribed) {
      await adminClient.from('sequence_enrollments')
        .update({ status: 'cancelled' })
        .eq('id', enrollment.id);
      continue;
    }

    const steps = Array.isArray(seq.steps) ? seq.steps : [];
    const stepIdx = enrollment.current_step;

    if (stepIdx >= steps.length) {
      await adminClient.from('sequence_enrollments')
        .update({ status: 'completed' })
        .eq('id', enrollment.id);
      completed++;
      continue;
    }

    const step = steps[stepIdx];
    if (!step || !contact.email) continue;

    // Get client info for personalization
    const { data: client } = await adminClient
      .from('clients')
      .select('name')
      .eq('id', contact.client_id)
      .single();

    const vars: Record<string, string> = {
      first_name: (contact.name || '').split(' ')[0] || 'there',
      business_name: client?.name || '',
      name: contact.name || '',
    };

    const subject = personalize(step.subject, vars);
    const bodyText = personalize(step.body, vars);
    const htmlBody = bodyText
      .split('\n')
      .map((line: string) => `<p style="margin:0 0 12px">${line.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`)
      .join('');

    const unsubUrl = `${FUNC_URL}/unsubscribe?type=contact&id=${contact.id}&token=${await unsubToken(contact.id)}`;
    const footer = `<div style="margin-top:24px;padding:16px 0;font-size:11px;color:#999;text-align:center;border-top:1px solid #E5E7EB">
      <p style="margin:0 0 4px">KalnyesGrowth, Stafford, VA 22554</p>
      <p style="margin:0"><a href="${unsubUrl}" style="color:#999">Unsubscribe</a></p>
    </div>`;

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${client?.name || 'Kalnyesgrowth'} <noreply@kalnyesgrowth.com>`,
        to: [contact.email],
        subject,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111">${htmlBody}${footer}</div>`,
        headers: {
          'List-Unsubscribe': `<${unsubUrl}>`,
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
        },
      }),
    });

    if (res.ok) {
      sent++;
      const nextStep = stepIdx + 1;
      const isLast = nextStep >= steps.length;

      if (isLast) {
        await adminClient.from('sequence_enrollments')
          .update({ current_step: nextStep, status: 'completed', next_send_at: null })
          .eq('id', enrollment.id);
        completed++;
      } else {
        const nextDelay = steps[nextStep]?.delay_hours || 24;
        const nextSend = new Date(Date.now() + nextDelay * 3600000).toISOString();
        await adminClient.from('sequence_enrollments')
          .update({ current_step: nextStep, next_send_at: nextSend })
          .eq('id', enrollment.id);
      }
    } else {
      console.error(`Email send failed for enrollment ${enrollment.id}:`, await res.text());
    }
  }

  console.log(`Sequences processed: ${sent} emails sent, ${completed} completed`);
  return json({ processed: due.length, sent, completed });
});
