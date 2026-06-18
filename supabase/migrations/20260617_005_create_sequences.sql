-- ── Email Sequences ──────────────────────────────────────────────
-- Automated drip campaigns. Agency creates templates, clients customize.

CREATE TABLE IF NOT EXISTS sequences (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  trigger_type  TEXT NOT NULL DEFAULT 'manual' CHECK (trigger_type IN ('new_subscriber', 'new_lead', 'manual')),
  steps         JSONB NOT NULL DEFAULT '[]'::jsonb,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sequences_client_id ON sequences (client_id);

ALTER TABLE sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_all_sequences" ON sequences
  FOR ALL TO authenticated
  USING (true);

CREATE TRIGGER sequences_updated_at
  BEFORE UPDATE ON sequences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Sequence Enrollments ────────────────────────────────────────
-- Tracks which contacts are in which sequences and their progress.

CREATE TABLE IF NOT EXISTS sequence_enrollments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id    UUID NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  sequence_id   UUID NOT NULL REFERENCES sequences(id) ON DELETE CASCADE,
  current_step  INT NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  next_send_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS enrollments_sequence_id ON sequence_enrollments (sequence_id);
CREATE INDEX IF NOT EXISTS enrollments_contact_id ON sequence_enrollments (contact_id);
CREATE INDEX IF NOT EXISTS enrollments_next_send ON sequence_enrollments (next_send_at);

ALTER TABLE sequence_enrollments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_all_enrollments" ON sequence_enrollments
  FOR ALL TO authenticated
  USING (true);

CREATE TRIGGER enrollments_updated_at
  BEFORE UPDATE ON sequence_enrollments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
