-- ── Reviews table ────────────────────────────────────────────────
-- Caches Google reviews for client businesses.

CREATE TABLE IF NOT EXISTS reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  platform    TEXT NOT NULL DEFAULT 'google' CHECK (platform IN ('google', 'facebook', 'yelp')),
  author      TEXT,
  rating      SMALLINT CHECK (rating BETWEEN 1 AND 5),
  text        TEXT,
  review_date TIMESTAMPTZ,
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS reviews_client_id ON reviews (client_id);
CREATE INDEX IF NOT EXISTS reviews_rating ON reviews (rating);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agency_all_reviews" ON reviews
  FOR ALL TO authenticated
  USING (true);
