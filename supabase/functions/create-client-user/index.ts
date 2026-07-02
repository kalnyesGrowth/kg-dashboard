// ── create-client-user Edge Function ───────────────────────────
// Creates a Supabase Auth user for a new client with role metadata.
// Must be called with the agency owner's JWT — rejects all other callers.
//
// Deploy:
//   supabase functions deploy create-client-user --project-ref boddsbxlaytcrkpuckyn
//
// Request body: { email: string, password: string, clientId: string }
// Response:     { userId: string, email: string }  |  { error: string }

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
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  // ── 1. Verify caller is an authenticated agency user ──────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const callerToken = authHeader.replace(/^Bearer\s+/i, '');
  if (!callerToken) {
    return json({ error: 'Missing Authorization header' }, 401);
  }

  // Admin client uses the service role key (auto-injected by Supabase)
  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );

  // Validate the caller's token and check role
  const { data: { user: caller }, error: authErr } = await adminClient.auth.getUser(callerToken);
  if (authErr || !caller) {
    return json({ error: 'Unauthorized — invalid token' }, 401);
  }
  if (caller.app_metadata?.role !== 'agency') {
    return json({ error: 'Forbidden — agency role required' }, 403);
  }

  // ── 2. Parse and validate body ────────────────────────────────
  let body: { email?: string; password?: string; clientId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const { email, password, clientId } = body;
  if (!email || !password || !clientId) {
    return json({ error: 'email, password, and clientId are all required' }, 400);
  }
  if (password.length < 8) {
    return json({ error: 'Password must be at least 8 characters' }, 400);
  }

  // ── 3. Confirm the clientId exists in our clients table ───────
  const { data: clientRow, error: clientErr } = await adminClient
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .single();

  if (clientErr || !clientRow) {
    return json({ error: 'Client not found' }, 404);
  }

  // ── 4. Create the auth user ───────────────────────────────────
  const { data, error: createErr } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: {
      role:      'client',
      client_id: clientId,
    },
    user_metadata: {
      name:      clientRow.name,
    },
  });

  if (createErr) {
    // Surface Supabase errors (e.g. "User already registered")
    return json({ error: createErr.message }, 400);
  }

  console.log(`Created client user ${data.user.id} for client ${clientId}`);
  return json({ userId: data.user.id, email: data.user.email });
});
