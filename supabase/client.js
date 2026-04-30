// ── Supabase client ────────────────────────────────────────────
// Replace these two values with your project's URL and anon key
// Settings → API in your Supabase dashboard

export const SUPABASE_URL = 'https://boddsbxlaytcrkpuckyn.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJvZGRzYnhsYXl0Y3JrcHVja3luIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1MTY1MjMsImV4cCI6MjA5MzA5MjUyM30.0pz_P4IMtlE6b7edZa-G82P9-PyNYecm1uMbhZiURYo';

// supabase-js is loaded via CDN in index.html
export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  }
});
