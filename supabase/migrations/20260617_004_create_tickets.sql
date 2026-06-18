-- ── Tickets (Website Change Requests) ────────────────────────────
-- Clients submit change requests. Agency manages them.

CREATE TABLE IF NOT EXISTS tickets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  category      TEXT NOT NULL CHECK (category IN ('hours', 'menu_services', 'photos', 'content', 'bug', 'other')),
  description   TEXT NOT NULL,
  image_url     TEXT,
  status        TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_progress', 'done')),
  agency_notes  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS tickets_client_id ON tickets (client_id);
CREATE INDEX IF NOT EXISTS tickets_status ON tickets (status);
CREATE INDEX IF NOT EXISTS tickets_created_at ON tickets (created_at DESC);

ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_all_tickets" ON tickets
  FOR ALL TO authenticated
  USING (true);
