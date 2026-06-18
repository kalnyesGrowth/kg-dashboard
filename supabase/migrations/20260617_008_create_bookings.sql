-- ── Bookings table ───────────────────────────────────────────────
-- Simple appointment booking for client businesses.

CREATE TABLE IF NOT EXISTS bookings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  contact_id  UUID REFERENCES contacts(id) ON DELETE SET NULL,
  date        DATE NOT NULL,
  time        TEXT NOT NULL,
  name        TEXT NOT NULL,
  email       TEXT,
  phone       TEXT,
  status      TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bookings_client_id ON bookings (client_id);
CREATE INDEX IF NOT EXISTS bookings_date ON bookings (date);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_all_bookings" ON bookings
  FOR ALL TO authenticated
  USING (true);

-- Allow anonymous inserts (public booking page)
CREATE POLICY "anon_insert_bookings" ON bookings
  FOR INSERT TO anon
  WITH CHECK (true);
