-- ── KG Dashboard — Supabase Schema (v1) ──────────────────────────
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── clients ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  domain      TEXT NOT NULL UNIQUE,
  color       TEXT NOT NULL DEFAULT '#6366F1',
  initials    TEXT NOT NULL,
  plan        TEXT NOT NULL,
  niche       TEXT NOT NULL CHECK (niche IN ('ecommerce', 'service')),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'inactive')),
  since       DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── events ───────────────────────────────────────────────────────
-- Raw event stream from tracker.js
CREATE TABLE IF NOT EXISTS events (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  session_id  TEXT NOT NULL,
  event_type  TEXT NOT NULL,   -- pageview | session_start | lead | email_capture | add_to_cart | order
  page        TEXT,
  referrer    TEXT,
  ua          TEXT,
  payload     JSONB,           -- event-specific data (order_id, value, email, etc.)
  ts          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS events_client_ts  ON events (client_id, ts DESC);
CREATE INDEX IF NOT EXISTS events_type       ON events (event_type);
CREATE INDEX IF NOT EXISTS events_session    ON events (session_id);

-- ── daily_metrics (materialized rollup) ──────────────────────────
-- Populated by scheduled Supabase edge function (or pg_cron) daily
CREATE TABLE IF NOT EXISTS daily_metrics (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id   UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  sessions    INT NOT NULL DEFAULT 0,
  pageviews   INT NOT NULL DEFAULT 0,
  leads       INT NOT NULL DEFAULT 0,
  emails      INT NOT NULL DEFAULT 0,
  add_to_carts INT NOT NULL DEFAULT 0,
  orders      INT NOT NULL DEFAULT 0,
  revenue     NUMERIC(10,2) NOT NULL DEFAULT 0,
  UNIQUE (client_id, date)
);

CREATE INDEX IF NOT EXISTS daily_client_date ON daily_metrics (client_id, date DESC);

-- ── Helper view: metrics by time frame ───────────────────────────
CREATE OR REPLACE VIEW client_metrics_summary AS
SELECT
  client_id,
  -- Today
  SUM(CASE WHEN date = CURRENT_DATE THEN sessions    ELSE 0 END) AS sessions_today,
  SUM(CASE WHEN date = CURRENT_DATE THEN leads       ELSE 0 END) AS leads_today,
  SUM(CASE WHEN date = CURRENT_DATE THEN emails      ELSE 0 END) AS emails_today,
  SUM(CASE WHEN date = CURRENT_DATE THEN orders      ELSE 0 END) AS orders_today,
  SUM(CASE WHEN date = CURRENT_DATE THEN add_to_carts ELSE 0 END) AS add_to_carts_today,
  SUM(CASE WHEN date = CURRENT_DATE THEN revenue     ELSE 0 END) AS revenue_today,
  -- This week
  SUM(CASE WHEN date >= CURRENT_DATE - 6 THEN sessions    ELSE 0 END) AS sessions_week,
  SUM(CASE WHEN date >= CURRENT_DATE - 6 THEN leads       ELSE 0 END) AS leads_week,
  SUM(CASE WHEN date >= CURRENT_DATE - 6 THEN emails      ELSE 0 END) AS emails_week,
  SUM(CASE WHEN date >= CURRENT_DATE - 6 THEN orders      ELSE 0 END) AS orders_week,
  SUM(CASE WHEN date >= CURRENT_DATE - 6 THEN add_to_carts ELSE 0 END) AS add_to_carts_week,
  SUM(CASE WHEN date >= CURRENT_DATE - 6 THEN revenue     ELSE 0 END) AS revenue_week,
  -- This month
  SUM(CASE WHEN date >= DATE_TRUNC('month', CURRENT_DATE) THEN sessions    ELSE 0 END) AS sessions_month,
  SUM(CASE WHEN date >= DATE_TRUNC('month', CURRENT_DATE) THEN leads       ELSE 0 END) AS leads_month,
  SUM(CASE WHEN date >= DATE_TRUNC('month', CURRENT_DATE) THEN emails      ELSE 0 END) AS emails_month,
  SUM(CASE WHEN date >= DATE_TRUNC('month', CURRENT_DATE) THEN orders      ELSE 0 END) AS orders_month,
  SUM(CASE WHEN date >= DATE_TRUNC('month', CURRENT_DATE) THEN add_to_carts ELSE 0 END) AS add_to_carts_month,
  SUM(CASE WHEN date >= DATE_TRUNC('month', CURRENT_DATE) THEN revenue     ELSE 0 END) AS revenue_month,
  -- All time
  SUM(sessions)     AS sessions_all,
  SUM(leads)        AS leads_all,
  SUM(emails)       AS emails_all,
  SUM(orders)       AS orders_all,
  SUM(add_to_carts) AS add_to_carts_all,
  SUM(revenue)      AS revenue_all
FROM daily_metrics
GROUP BY client_id;

-- ── Row-level security ────────────────────────────────────────────
ALTER TABLE clients      ENABLE ROW LEVEL SECURITY;
ALTER TABLE events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;

-- Agency owner can see everything (authenticated role)
CREATE POLICY "agency_owner_all" ON clients
  FOR ALL TO authenticated USING (true);

CREATE POLICY "agency_owner_all" ON events
  FOR ALL TO authenticated USING (true);

CREATE POLICY "agency_owner_all" ON daily_metrics
  FOR ALL TO authenticated USING (true);

-- Tracker inserts from anon (client websites use anon key)
CREATE POLICY "tracker_insert" ON events
  FOR INSERT TO anon WITH CHECK (true);
