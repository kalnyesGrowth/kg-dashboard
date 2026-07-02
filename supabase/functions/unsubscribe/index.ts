// ── unsubscribe Edge Function ──────────────────────────────────
// CAN-SPAM compliant one-click unsubscribe.
// type=contact: marks contact as unsubscribed (stops sequences + broadcasts)
// type=report: disables monthly_report in client notification_prefs
//
// Deploy:
//   supabase functions deploy unsubscribe --project-ref boddsbxlaytcrkpuckyn

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

async function hmacSign(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hmacVerify(secret: string, message: string, token: string): Promise<boolean> {
  const expected = await hmacSign(secret, message);
  if (expected.length !== token.length) return false;
  let match = 0;
  for (let i = 0; i < expected.length; i++) match |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  return match === 0;
}

export async function generateUnsubToken(secret: string, type: string, id: string): Promise<string> {
  return hmacSign(secret, `${type}:${id}`);
}

const PAGE = (title: string, msg: string) => `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f9fafb;color:#111}
.card{background:#fff;padding:40px;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,.1);max-width:420px;text-align:center}</style>
</head><body><div class="card"><h2 style="margin:0 0 12px">${title}</h2><p style="color:#666">${msg}</p></div></body></html>`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  const id = url.searchParams.get('id');
  const token = url.searchParams.get('token');

  if (!type || !id || !token || (type !== 'contact' && type !== 'report')) {
    return new Response(PAGE('Invalid Link', 'This unsubscribe link is not valid.'), {
      status: 400, headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const secret = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  if (!await hmacVerify(secret, `${type}:${id}`, token)) {
    return new Response(PAGE('Invalid Link', 'This unsubscribe link has expired or is not valid.'), {
      status: 403, headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!, secret,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let err: string | null = null;

  if (type === 'contact') {
    const { error } = await admin.from('contacts').update({ unsubscribed: true }).eq('id', id);
    if (error) err = error.message;
  } else {
    const { data } = await admin.from('clients').select('notification_prefs').eq('id', id).single();
    if (!data) { err = 'Not found'; }
    else {
      const prefs = { ...(data.notification_prefs || {}), monthly_report: false };
      const { error } = await admin.from('clients').update({ notification_prefs: prefs }).eq('id', id);
      if (error) err = error.message;
    }
  }

  if (err) {
    console.error(`Unsubscribe ${type} error:`, err);
    return new Response(PAGE('Error', 'Something went wrong. Please try again later.'), {
      status: 500, headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  const msg = type === 'contact'
    ? 'You will no longer receive marketing emails from this business.'
    : 'You will no longer receive monthly report emails. You can re-enable them from your dashboard settings.';

  console.log(`Unsubscribed: type=${type}, id=${id}`);
  return new Response(PAGE('Unsubscribed', msg), {
    status: 200, headers: { ...CORS, 'Content-Type': 'text/html; charset=utf-8' },
  });
});
