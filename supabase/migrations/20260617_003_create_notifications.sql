-- ── Notifications table ──────────────────────────────────────────
-- In-app notifications for both client and agency users.

CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('new_lead', 'ticket_update', 'report_ready', 'review', 'sequence', 'system')),
  title       TEXT NOT NULL,
  body        TEXT,
  read        BOOLEAN NOT NULL DEFAULT false,
  link        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_client_id ON notifications (client_id);
CREATE INDEX IF NOT EXISTS notifications_created_at ON notifications (created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_read ON notifications (read);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_all_notifications" ON notifications
  FOR ALL TO authenticated
  USING (true);
