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

  const role     = user.app_metadata?.role;
  const clientId = user.app_metadata?.client_id;

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

  // Look up contacts by email to get IDs (for unsubscribe links) and filter unsubscribed
  const { data: contacts } = await adminClient.from('contacts')
    .select('id, email, unsubscribed')
    .eq('client_id', reqClientId)
    .in('email', recipients);

  const contactMap = new Map<string, { id: string; unsubscribed: boolean }>();
  for (const c of contacts || []) {
    contactMap.set(c.email, { id: c.id, unsubscribed: c.unsubscribed });
  }

  const fromName  = clientName || 'Kalnyesgrowth';
  const fromEmail = 'noreply@kalnyesgrowth.com';

  const htmlBody = msgBody
    .split('\n')
    .map(line => `<p style="margin:0 0 12px">${line.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</p>`)
    .join('');

  let sent = 0;
  let skipped = 0;

  for (const email of recipients) {
    const contact = contactMap.get(email);
    if (contact?.unsubscribed) { skipped++; continue; }

    let footer = `<div style="margin-top:24px;padding:16px 0;font-size:11px;color:#999;text-align:center;border-top:1px solid #E5E7EB">
      <p style="margin:0 0 4px">KalnyesGrowth, Stafford, VA 22554</p>`;

    let unsubUrl = '';
    if (contact) {
      unsubUrl = `${FUNC_URL}/unsubscribe?type=contact&id=${contact.id}&token=${await unsubToken(contact.id)}`;
      footer += `<p style="margin:0"><a href="${unsubUrl}" style="color:#999">Unsubscribe</a></p>`;
    }
    footer += '</div>';

    const emailPayload: Record<string, unknown> = {
      from: `${fromName} <${fromEmail}>`,
      to: [email],
      subject,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111">${htmlBody}${footer}</div>`,
    };
    if (unsubUrl) {
      emailPayload.headers = {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      };
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    if (res.ok) {
      sent++;
    } else {
      console.error(`Broadcast email failed for ${email}:`, await res.text());
    }
  }

  console.log(`Broadcast sent: ${sent} emails, ${skipped} skipped (unsubscribed) for client ${reqClientId}`);
  return json({ sent, skipped });
});
