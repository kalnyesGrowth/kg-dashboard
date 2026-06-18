// ── invite-team-member Edge Function ──────────────────────────
// Allows client users to invite team members (share dashboard).
// GET  = list team members for the caller's client_id
// POST = create a new auth user with the same client_id
//
// Deploy:
//   supabase functions deploy invite-team-member --project-ref boddsbxlaytcrkpuckyn

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.replace(/^Bearer\s+/i, '');
  if (!token) return json({ error: 'Missing Authorization header' }, 401);

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  const { data: { user: caller }, error: authErr } = await admin.auth.getUser(token);
  if (authErr || !caller) return json({ error: 'Invalid token' }, 401);

  const clientId = caller.user_metadata?.client_id;
  const callerRole = caller.user_metadata?.role;

  // Agency users can also use this if they pass a clientId in query/body
  if (!clientId && callerRole !== 'agency') {
    return json({ error: 'No client association found' }, 403);
  }

  // ── GET: list team members ──────────────────────────────────
  if (req.method === 'GET') {
    const targetClientId = clientId || new URL(req.url).searchParams.get('clientId');
    if (!targetClientId) return json({ error: 'clientId required' }, 400);

    const { data: { users }, error: listErr } = await admin.auth.admin.listUsers({ perPage: 200 });
    if (listErr) return json({ error: listErr.message }, 500);

    const team = (users || [])
      .filter(u => u.user_metadata?.client_id === targetClientId)
      .map(u => ({
        id: u.id,
        email: u.email,
        name: u.user_metadata?.name || '',
        created: u.created_at,
      }));

    return json({ team });
  }

  // ── POST: invite a new team member ──────────────────────────
  if (req.method === 'POST') {
    let body: { email?: string; password?: string; name?: string; clientId?: string };
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON' }, 400);
    }

    const targetClientId = clientId || body.clientId;
    if (!targetClientId) return json({ error: 'clientId required' }, 400);

    const { email, password, name } = body;
    if (!email || !password) return json({ error: 'email and password required' }, 400);
    if (password.length < 8) return json({ error: 'Password must be at least 8 characters' }, 400);

    const { data: clientRow } = await admin
      .from('clients')
      .select('name')
      .eq('id', targetClientId)
      .single();

    const { data, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        role: 'client',
        client_id: targetClientId,
        name: name || email.split('@')[0],
      },
    });

    if (createErr) return json({ error: createErr.message }, 400);

    console.log(`Team member ${data.user.id} invited to client ${targetClientId}`);
    return json({ userId: data.user.id, email: data.user.email });
  }

  return json({ error: 'Method not allowed' }, 405);
});
