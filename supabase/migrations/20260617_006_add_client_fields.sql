-- ── Add new fields to clients table ──────────────────────────────
-- Google Place ID for review management, booking settings, etc.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS google_place_id TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS booking_url TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS availability JSONB DEFAULT '{}'::jsonb;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS notification_prefs JSONB DEFAULT '{"new_lead": true, "daily_summary": true, "weekly_report": true}'::jsonb;
