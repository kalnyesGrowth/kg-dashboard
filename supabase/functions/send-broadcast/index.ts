// ── send-broadcast Edge Function ────────────────────────────────
// Sends a broadcast email to a list of recipients via Resend.
// Caller must be authenticated (agency or client role).
//
// Deploy:
//   supabase functions deploy send-broadcast --project-ref boddsbxlaytcrkpuckyn
//
// Required secret:
//   supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxx --project-ref boddsbxlaytcrkpuckyn
//
// Request body: { clientId, clientName, recipients: string[], subject, body }
// Response:     { sent: number }  |  { error: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  // ── 1. Verify caller is authenticated ────────────────────────
  const callerToken = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!callerToken) return json({ error: 'Missing Authorization header' }, 401);

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  const { data: { user }, error: authErr } = await adminClient.auth.getUser(callerToken);
  if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

  const role     = user.user_metadata?.role;
  const clientId = user.user_metadata?.client_id;

  // ── 2. Parse body ─────────────────────────────────────────────
  let body: { clientId?: string; clientName?: string; recipients?: string[]; subject?: string; body?: string };
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const { clientId: reqClientId, clientName, recipients, subject, body: msgBody } = body;

  if (!reqClientId || !recipients?.length || !subject || !msgBody) {
    return json({ error: 'clientId, recipients, subject, and body are required' }, 400);
  }

  // Clients can only send to their own list
  if (role === 'client' && clientId !== reqClientId) {
    return json({ error: 'Forbidden' }, 403);
  }

  // ── 3. Send via Resend ────────────────────────────────────────
  const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
  if (!RESEND_KEY) return json({ error: 'Email service not configured' }, 503);

  const fromName  = clientName || 'Kalnyesgrowth';
  const fromEmail = 'noreply@kalnyesgrowth.com'; // must be a verified Resend domain

  // Resend supports up to 50 recipients per call — batch if needed
  const BATCH = 50;
  let sent = 0;

  for (let i = 0; i < recipients.length; i += BATCH) {
    const batch = recipients.slice(i, i + BATCH);
    const htmlBody = msgBody
      .split('\n')
      .map(line => `<p style="margin:0 0 12px">${line.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`)
      .join('');

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        from:    `${fromName} <${fromEmail}>`,
        to:      batch,
        subject,
        html:    `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111">${htmlBody}</div>`,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return json({ error: err.message || 'Resend API error' }, 502);
    }
    sent += batch.length;
  }

  console.log(`Broadcast sent: ${sent} emails for client ${reqClientId}`);
  return json({ sent });
});
