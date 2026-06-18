-- ── Contacts table ───────────────────────────────────────────────
-- Full customer database. Replaces the flat subscriber list.
-- Sources: manual entry, form submission, CSV import, email capture events.

CREATE TABLE IF NOT EXISTS contacts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  name        TEXT,
  email       TEXT,
  phone       TEXT,
  source      TEXT DEFAULT 'manual' CHECK (source IN ('manual', 'form', 'import', 'email_capture')),
  tags        TEXT[] DEFAULT '{}',
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS contacts_client_id ON contacts (client_id);
CREATE INDEX IF NOT EXISTS contacts_email ON contacts (email);
CREATE INDEX IF NOT EXISTS contacts_created_at ON contacts (created_at DESC);

ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_all_contacts" ON contacts
  FOR ALL TO authenticated
  USING (true);

CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
