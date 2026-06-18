// ── fetch-google-reviews Edge Function ──────────────────────────
// Fetches Google reviews for clients with a google_place_id set.
// Uses Google Places API (free tier: 0-$200/mo credit covers this).
// Run daily via pg_cron.
//
// Deploy:
//   supabase functions deploy fetch-google-reviews --project-ref boddsbxlaytcrkpuckyn
//
// Required secret:
//   supabase secrets set GOOGLE_PLACES_API_KEY=AIza... --project-ref boddsbxlaytcrkpuckyn
//
// pg_cron setup (run in SQL editor):
//   SELECT cron.schedule('fetch-reviews', '0 6 * * *',
//     $$SELECT net.http_post(
//       url := 'https://boddsbxlaytcrkpuckyn.supabase.co/functions/v1/fetch-google-reviews',
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

  const GOOGLE_KEY = Deno.env.get('GOOGLE_PLACES_API_KEY');
  if (!GOOGLE_KEY) return json({ error: 'Google Places API key not configured' }, 503);

  const adminClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  // Get clients with Google Place IDs
  const { data: clients, error: cErr } = await adminClient
    .from('clients')
    .select('id, name, google_place_id')
    .not('google_place_id', 'is', null)
    .eq('status', 'active');

  if (cErr || !clients?.length) return json({ skipped: 'No clients with Place IDs' });

  let totalFetched = 0;

  for (const client of clients) {
    if (!client.google_place_id) continue;

    try {
      const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(client.google_place_id)}&fields=reviews,rating,user_ratings_total&key=${GOOGLE_KEY}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.status !== 'OK' || !data.result?.reviews) continue;

      const reviews = data.result.reviews.map((r: any) => ({
        client_id: client.id,
        platform: 'google',
        author: r.author_name || 'Anonymous',
        rating: r.rating,
        text: r.text || '',
        review_date: new Date(r.time * 1000).toISOString(),
      }));

      // Upsert: delete old reviews for this client, insert fresh ones
      await adminClient.from('reviews').delete().eq('client_id', client.id).eq('platform', 'google');
      const { error: insertErr } = await adminClient.from('reviews').insert(reviews);

      if (!insertErr) totalFetched += reviews.length;
    } catch (e) {
      console.error(`Failed to fetch reviews for ${client.name}:`, e);
    }
  }

  console.log(`Fetched ${totalFetched} reviews for ${clients.length} clients`);
  return json({ fetched: totalFetched, clients: clients.length });
});
