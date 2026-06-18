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

const ALLOWED_EVENTS = new Set([
  'session_start', 'pageview', 'lead', 'email_capture',
  'add_to_cart', 'order',
]);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ipHits: Record<string, { count: number; resetAt: number }> = {};
const RATE_LIMIT = 60;
const RATE_WINDOW = 60 * 1000;

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

function sanitize(val: unknown, max = 500): string | null {
  if (typeof val !== 'string') return null;
  return val.trim().slice(0, max).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('cf-connecting-ip')
    || 'unknown';
  if (isRateLimited(ip)) return json({ error: 'Rate limited' }, 429);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  const clientId  = sanitize(body.client_id, 36);
  const sessionId = sanitize(body.session_id, 36);
  const eventType = sanitize(body.event_type, 30);
  const page      = sanitize(body.page, 2000);
  const referrer  = sanitize(body.referrer, 2000);
  const ua        = sanitize(body.ua, 500);
  const payload   = typeof body.payload === 'object' ? body.payload : null;

  if (!clientId || !UUID_RE.test(clientId)) return json({ error: 'Invalid client_id' }, 400);
  if (!sessionId) return json({ error: 'session_id required' }, 400);
  if (!eventType || !ALLOWED_EVENTS.has(eventType)) return json({ error: 'Invalid event_type' }, 400);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { error } = await admin.from('events').insert({
    client_id: clientId,
    session_id: sessionId,
    event_type: eventType,
    page,
    referrer,
    ua,
    payload,
    ts: new Date().toISOString(),
  });

  if (error) {
    console.error('Event insert failed:', error);
    return json({ error: 'Failed' }, 500);
  }

  return json({ ok: true });
});
