// ── capture-lead Edge Function ──────────────────────────────────
// Receives form submission data from tracker.js and inserts into
// the leads table. No auth required (called from client websites).
// Rate limited: max 10 submissions per IP per hour.
//
// Deploy:
//   supabase functions deploy capture-lead --project-ref boddsbxlaytcrkpuckyn
//
// Request body: { client_id, name, email, phone, message, source_url }
// Response:     { ok: true }  |  { error: string }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// In-memory rate limit (resets when function cold-starts, good enough for free tier)
const ipHits: Record<string, { count: number; resetAt: number }> = {};
const RATE_LIMIT = 10;
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = ipHits[ip];
  if (!entry || now > entry.resetAt) {
    ipHits[ip] = { count: 1, resetAt: now + RATE_WINDOW };
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

function sanitize(val: unknown): string | null {
  if (typeof val !== 'string') return null;
  return val.trim().slice(0, 1000).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try { return await handlePost(req); } catch (e) {
    console.error('capture-lead crashed:', e);
    return json({ error: 'Internal error: ' + (e?.message || String(e)) }, 500);
  }
});

async function handlePost(req: Request) {

  // Rate limit by IP
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('cf-connecting-ip')
    || 'unknown';
  if (isRateLimited(ip)) return json({ error: 'Rate limit exceeded' }, 429);

  // Parse body
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const clientId  = sanitize(body.client_id);
  const name      = sanitize(body.name);
  const email     = sanitize(body.email);
  const phone     = sanitize(body.phone);
  const message   = sanitize(body.message);
  const sourceUrl = sanitize(body.source_url);

  if (!clientId) return json({ error: 'client_id is required' }, 400);
  if (!email && !phone && !name) return json({ error: 'At least name, email, or phone is required' }, 400);

  // Validate UUID format for client_id
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(clientId)) return json({ error: 'Invalid client_id' }, 400);

  // Insert into leads table using service role (bypasses RLS)
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Verify client exists
  const { data: client, error: clientErr } = await adminClient
    .from('clients')
    .select('id, name, notification_prefs')
    .eq('id', clientId)
    .single();

  if (clientErr || !client) return json({ error: 'Unknown client' }, 404);

  // Insert lead
  const { error: insertErr } = await adminClient
    .from('leads')
    .insert({
      client_id:  clientId,
      name:       name,
      email:      email,
      phone:      phone,
      message:    message,
      source_url: sourceUrl,
      stage:      'new',
      read:       false,
      notes:      [],
    });

  if (insertErr) {
    console.error('Lead insert failed:', insertErr);
    return json({ error: 'Failed to save lead' }, 500);
  }

  // Create in-app notification
  const leadLabel = name || email || phone || 'Someone';
  const { error: notifErr } = await adminClient.from('notifications').insert({
    client_id: clientId,
    type: 'new_lead',
    title: 'New lead: ' + leadLabel,
    body: message ? message.slice(0, 120) : 'New form submission from your website',
    read: false,
    link: '#leads',
  });
  if (notifErr) console.error('Notification insert failed:', notifErr);

  // Fire email notification asynchronously (don't block response)
  const RESEND_KEY = Deno.env.get('RESEND_API_KEY');
  const notifEmail = client.notification_prefs?.email;
  if (RESEND_KEY && notifEmail) {
    fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Kalnyesgrowth <noreply@kalnyesgrowth.com>',
        to: [notifEmail],
        subject: `New lead from your website: ${leadLabel}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#111">
          <h2 style="margin:0 0 16px">New Lead</h2>
          ${name ? `<p><strong>Name:</strong> ${name}</p>` : ''}
          ${email ? `<p><strong>Email:</strong> ${email}</p>` : ''}
          ${phone ? `<p><strong>Phone:</strong> ${phone}</p>` : ''}
          ${message ? `<p><strong>Message:</strong> ${message}</p>` : ''}
          ${sourceUrl ? `<p style="font-size:12px;color:#666">From: ${sourceUrl}</p>` : ''}
          <p style="margin-top:24px"><a href="https://project-kday6.vercel.app/#leads" style="background:#0064E0;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600">View in Dashboard</a></p>
        </div>`,
      }),
    }).catch(() => {});
  }

  console.log(`Lead captured for client ${client.name} (${clientId}): ${email || phone || name}`);
  return json({ ok: true });
}
