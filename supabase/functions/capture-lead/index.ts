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

  // Send Web Push notifications to all subscribed devices
  sendPushNotifications(adminClient, clientId, leadLabel, message).catch(e =>
    console.error('Push notification error:', e)
  );

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

// ── Web Push ─────────────────────────────────────────────────────
async function sendPushNotifications(
  adminClient: ReturnType<typeof createClient>,
  clientId: string,
  leadLabel: string,
  message: string | null,
) {
  const { data: subs } = await adminClient
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('client_id', clientId);

  if (!subs || subs.length === 0) return;

  const vapidPublic = Deno.env.get('VAPID_PUBLIC_KEY');
  const vapidPrivate = Deno.env.get('VAPID_PRIVATE_KEY');
  if (!vapidPublic || !vapidPrivate) {
    console.error('VAPID keys not configured');
    return;
  }

  const payload = JSON.stringify({
    title: 'New Lead: ' + leadLabel,
    body: message ? message.slice(0, 100) : 'New quote request from your website',
    url: '/#leads',
  });

  for (const sub of subs) {
    try {
      await sendWebPush(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        vapidPublic,
        vapidPrivate,
      );
    } catch (e) {
      console.error('Push to', sub.endpoint.slice(0, 60), 'failed:', e);
      if ((e as any)?.status === 410 || (e as any)?.status === 404) {
        await adminClient.from('push_subscriptions')
          .delete().eq('endpoint', sub.endpoint).eq('client_id', clientId);
      }
    }
  }
}

async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
  vapidPublicKey: string,
  vapidPrivateKey: string,
) {
  const url = new URL(subscription.endpoint);
  const audience = `${url.protocol}//${url.host}`;

  const pubBytes = b64decode(vapidPublicKey);
  const privBytes = b64decode(vapidPrivateKey);
  const x = b64encode(pubBytes.slice(1, 33));
  const y = b64encode(pubBytes.slice(33, 65));
  const d = b64encode(privBytes);

  const signingKey = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x, y, d },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );

  const header = b64str(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const now = Math.floor(Date.now() / 1000);
  const claims = b64str(JSON.stringify({ aud: audience, exp: now + 43200, sub: 'mailto:info@kalnyesgrowth.com' }));
  const unsigned = `${header}.${claims}`;

  const sig = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, signingKey, new TextEncoder().encode(unsigned),
  ));
  const jwt = `${unsigned}.${b64encode(sig)}`;

  const encrypted = await encryptPayload(payload, b64decode(subscription.keys.p256dh), b64decode(subscription.keys.auth));

  const resp = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `vapid t=${jwt}, k=${vapidPublicKey}`,
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      'TTL': '86400',
      'Urgency': 'high',
    },
    body: encrypted,
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    const err: any = new Error(`Push failed: ${resp.status} ${body}`);
    err.status = resp.status;
    throw err;
  }
}

async function encryptPayload(payload: string, clientPub: Uint8Array, clientAuth: Uint8Array): Promise<Uint8Array> {
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const localKP = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const clientKey = await crypto.subtle.importKey('raw', clientPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);

  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: clientKey }, localKP.privateKey, 256));
  const localPub = new Uint8Array(await crypto.subtle.exportKey('raw', localKP.publicKey));

  const authInfo = concat(new TextEncoder().encode('WebPush: info\0'), clientPub, localPub);
  const ikm = await hkdf(clientAuth, shared, authInfo, 32);

  const cek = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, new TextEncoder().encode('Content-Encoding: nonce\0'), 12);

  const plain = new TextEncoder().encode(payload);
  const padded = new Uint8Array(plain.length + 1);
  padded.set(plain);
  padded[plain.length] = 2;

  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096);
  return concat(salt, rs, new Uint8Array([65]), localPub, ct);
}

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, len: number): Promise<Uint8Array> {
  const k1 = await crypto.subtle.importKey('raw', salt.length ? salt : new Uint8Array(32), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const prk = new Uint8Array(await crypto.subtle.sign('HMAC', k1, ikm));
  const k2 = await crypto.subtle.importKey('raw', prk, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const okm = new Uint8Array(await crypto.subtle.sign('HMAC', k2, concat(info, new Uint8Array([1]))));
  return okm.slice(0, len);
}

function concat(...a: Uint8Array[]): Uint8Array {
  const r = new Uint8Array(a.reduce((s, v) => s + v.length, 0));
  let o = 0;
  for (const v of a) { r.set(v, o); o += v.length; }
  return r;
}

function b64str(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64encode(bytes: Uint8Array): string {
  let b = '';
  for (const v of bytes) b += String.fromCharCode(v);
  return btoa(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64decode(str: string): Uint8Array {
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - s.length % 4) % 4;
  const bin = atob(s + '='.repeat(pad));
  const r = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) r[i] = bin.charCodeAt(i);
  return r;
}
