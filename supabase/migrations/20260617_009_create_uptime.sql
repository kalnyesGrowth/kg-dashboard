-- ── Uptime checks table ──────────────────────────────────────────
-- Stores HTTP health check results for client websites.

CREATE TABLE IF NOT EXISTS uptime_checks (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id      UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  status_code    SMALLINT,
  response_ms    INT,
  checked_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS uptime_client_id ON uptime_checks (client_id);
CREATE INDEX IF NOT EXISTS uptime_checked_at ON uptime_checks (checked_at DESC);

ALTER TABLE uptime_checks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_all_uptime" ON uptime_checks
  FOR ALL TO authenticated
  USING (true);
