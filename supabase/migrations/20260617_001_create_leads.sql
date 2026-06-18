-- ── Leads table ──────────────────────────────────────────────────
-- Every form submission from client websites lands here.
-- Tracker.js captures form fields and POSTs to capture-lead edge function.

CREATE TABLE IF NOT EXISTS leads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name        TEXT,
  email       TEXT,
  phone       TEXT,
  message     TEXT,
  source_url  TEXT,
  stage       TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new', 'contacted', 'quoted', 'won', 'lost')),
  notes       JSONB DEFAULT '[]'::jsonb,
  read        BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS leads_client_id ON leads (client_id);
CREATE INDEX IF NOT EXISTS leads_created_at ON leads (created_at DESC);
CREATE INDEX IF NOT EXISTS leads_stage ON leads (stage);
CREATE INDEX IF NOT EXISTS leads_email ON leads (email);

ALTER TABLE leads ENABLE ROW LEVEL SECURITY;

-- Agency sees all leads
CREATE POLICY "agency_all_leads" ON leads
  FOR ALL TO authenticated
  USING (true);

-- Anon can insert (tracker/edge function inserts)
CREATE POLICY "tracker_insert_leads" ON leads
  FOR INSERT TO anon
  WITH CHECK (true);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
