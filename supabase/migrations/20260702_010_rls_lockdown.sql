-- ================================================================
-- 010_rls_lockdown.sql
-- Replace all USING(true) policies with proper client-scoped RLS.
-- Identity claims read from app_metadata (never user_metadata).
-- ================================================================

-- ── 1. Helper functions in private schema ───────────────────────

CREATE SCHEMA IF NOT EXISTS private;

CREATE OR REPLACE FUNCTION private.jwt_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT coalesce(auth.jwt() -> 'app_metadata' ->> 'role', ''); $$;

CREATE OR REPLACE FUNCTION private.jwt_client_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$ SELECT (auth.jwt() -> 'app_metadata' ->> 'client_id')::uuid; $$;

-- ── 2. Drop every existing permissive policy ────────────────────

DROP POLICY IF EXISTS "agency_all_bookings"    ON public.bookings;
DROP POLICY IF EXISTS "anon_insert_bookings"   ON public.bookings;
DROP POLICY IF EXISTS "agency_owner_all"       ON public.clients;
DROP POLICY IF EXISTS "agency_all_contacts"    ON public.contacts;
DROP POLICY IF EXISTS "agency_owner_all"       ON public.daily_metrics;
DROP POLICY IF EXISTS "Allow tracker inserts"  ON public.events;
DROP POLICY IF EXISTS "agency_owner_all"       ON public.events;
DROP POLICY IF EXISTS "anon_can_insert_events" ON public.events;
DROP POLICY IF EXISTS "agency_all_leads"       ON public.leads;
DROP POLICY IF EXISTS "tracker_insert_leads"   ON public.leads;
DROP POLICY IF EXISTS "agency_all_notifications" ON public.notifications;
DROP POLICY IF EXISTS "push_subs_all"          ON public.push_subscriptions;
DROP POLICY IF EXISTS "agency_all_reviews"     ON public.reviews;
DROP POLICY IF EXISTS "agency_all_enrollments" ON public.sequence_enrollments;
DROP POLICY IF EXISTS "agency_all_sequences"   ON public.sequences;
DROP POLICY IF EXISTS "agency_all_tickets"     ON public.tickets;
DROP POLICY IF EXISTS "agency_all_uptime"      ON public.uptime_checks;

-- ── 3. New policies ─────────────────────────────────────────────

-- ────────────────────────────────────────────────────────────────
-- clients
-- Agency: full CRUD. Client: read own record, update own prefs.
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "agency_all" ON public.clients
  FOR ALL TO authenticated
  USING  (private.jwt_role() = 'agency')
  WITH CHECK (private.jwt_role() = 'agency');

CREATE POLICY "client_select_own" ON public.clients
  FOR SELECT TO authenticated
  USING (id = private.jwt_client_id());

CREATE POLICY "client_update_own" ON public.clients
  FOR UPDATE TO authenticated
  USING (id = private.jwt_client_id())
  WITH CHECK (id = private.jwt_client_id());

-- ────────────────────────────────────────────────────────────────
-- events (tracker writes via anon, dashboard reads via authenticated)
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "agency_all" ON public.events
  FOR ALL TO authenticated
  USING  (private.jwt_role() = 'agency')
  WITH CHECK (private.jwt_role() = 'agency');

CREATE POLICY "client_select_own" ON public.events
  FOR SELECT TO authenticated
  USING (client_id = private.jwt_client_id());

CREATE POLICY "anon_insert" ON public.events
  FOR INSERT TO anon
  WITH CHECK (client_id IS NOT NULL);

-- ────────────────────────────────────────────────────────────────
-- daily_metrics (system-generated, read-only for clients)
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "agency_all" ON public.daily_metrics
  FOR ALL TO authenticated
  USING  (private.jwt_role() = 'agency')
  WITH CHECK (private.jwt_role() = 'agency');

CREATE POLICY "client_select_own" ON public.daily_metrics
  FOR SELECT TO authenticated
  USING (client_id = private.jwt_client_id());

-- ────────────────────────────────────────────────────────────────
-- leads (tracker inserts via anon, clients manage their own)
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "agency_all" ON public.leads
  FOR ALL TO authenticated
  USING  (private.jwt_role() = 'agency')
  WITH CHECK (private.jwt_role() = 'agency');

CREATE POLICY "client_select_own" ON public.leads
  FOR SELECT TO authenticated
  USING (client_id = private.jwt_client_id());

CREATE POLICY "client_update_own" ON public.leads
  FOR UPDATE TO authenticated
  USING (client_id = private.jwt_client_id())
  WITH CHECK (client_id = private.jwt_client_id());

CREATE POLICY "anon_insert" ON public.leads
  FOR INSERT TO anon
  WITH CHECK (client_id IS NOT NULL);

-- ────────────────────────────────────────────────────────────────
-- contacts (clients manage their own contact lists)
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "agency_all" ON public.contacts
  FOR ALL TO authenticated
  USING  (private.jwt_role() = 'agency')
  WITH CHECK (private.jwt_role() = 'agency');

CREATE POLICY "client_all_own" ON public.contacts
  FOR ALL TO authenticated
  USING (client_id = private.jwt_client_id())
  WITH CHECK (client_id = private.jwt_client_id());

-- ────────────────────────────────────────────────────────────────
-- notifications (clients read and mark-read their own)
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "agency_all" ON public.notifications
  FOR ALL TO authenticated
  USING  (private.jwt_role() = 'agency')
  WITH CHECK (private.jwt_role() = 'agency');

CREATE POLICY "client_select_own" ON public.notifications
  FOR SELECT TO authenticated
  USING (client_id = private.jwt_client_id());

CREATE POLICY "client_update_own" ON public.notifications
  FOR UPDATE TO authenticated
  USING (client_id = private.jwt_client_id())
  WITH CHECK (client_id = private.jwt_client_id());

-- ────────────────────────────────────────────────────────────────
-- tickets (clients create and view their own)
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "agency_all" ON public.tickets
  FOR ALL TO authenticated
  USING  (private.jwt_role() = 'agency')
  WITH CHECK (private.jwt_role() = 'agency');

CREATE POLICY "client_select_own" ON public.tickets
  FOR SELECT TO authenticated
  USING (client_id = private.jwt_client_id());

CREATE POLICY "client_insert_own" ON public.tickets
  FOR INSERT TO authenticated
  WITH CHECK (client_id = private.jwt_client_id());

CREATE POLICY "client_update_own" ON public.tickets
  FOR UPDATE TO authenticated
  USING (client_id = private.jwt_client_id())
  WITH CHECK (client_id = private.jwt_client_id());

-- ────────────────────────────────────────────────────────────────
-- sequences (clients view their own, agency manages all)
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "agency_all" ON public.sequences
  FOR ALL TO authenticated
  USING  (private.jwt_role() = 'agency')
  WITH CHECK (private.jwt_role() = 'agency');

CREATE POLICY "client_select_own" ON public.sequences
  FOR SELECT TO authenticated
  USING (client_id = private.jwt_client_id());

-- ────────────────────────────────────────────────────────────────
-- sequence_enrollments (no client_id column, scope via sequences)
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "agency_all" ON public.sequence_enrollments
  FOR ALL TO authenticated
  USING  (private.jwt_role() = 'agency')
  WITH CHECK (private.jwt_role() = 'agency');

CREATE POLICY "client_select_own" ON public.sequence_enrollments
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.sequences s
    WHERE s.id = sequence_enrollments.sequence_id
      AND s.client_id = private.jwt_client_id()
  ));

-- ────────────────────────────────────────────────────────────────
-- reviews (system-fetched, read-only for clients)
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "agency_all" ON public.reviews
  FOR ALL TO authenticated
  USING  (private.jwt_role() = 'agency')
  WITH CHECK (private.jwt_role() = 'agency');

CREATE POLICY "client_select_own" ON public.reviews
  FOR SELECT TO authenticated
  USING (client_id = private.jwt_client_id());

-- ────────────────────────────────────────────────────────────────
-- bookings (anon inserts from widget, clients manage their own)
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "agency_all" ON public.bookings
  FOR ALL TO authenticated
  USING  (private.jwt_role() = 'agency')
  WITH CHECK (private.jwt_role() = 'agency');

CREATE POLICY "client_select_own" ON public.bookings
  FOR SELECT TO authenticated
  USING (client_id = private.jwt_client_id());

CREATE POLICY "client_update_own" ON public.bookings
  FOR UPDATE TO authenticated
  USING (client_id = private.jwt_client_id())
  WITH CHECK (client_id = private.jwt_client_id());

CREATE POLICY "anon_insert" ON public.bookings
  FOR INSERT TO anon
  WITH CHECK (client_id IS NOT NULL);

-- ────────────────────────────────────────────────────────────────
-- uptime_checks (system-generated, read-only for clients)
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "agency_all" ON public.uptime_checks
  FOR ALL TO authenticated
  USING  (private.jwt_role() = 'agency')
  WITH CHECK (private.jwt_role() = 'agency');

CREATE POLICY "client_select_own" ON public.uptime_checks
  FOR SELECT TO authenticated
  USING (client_id = private.jwt_client_id());

-- ────────────────────────────────────────────────────────────────
-- push_subscriptions (users manage their own push endpoints)
-- ────────────────────────────────────────────────────────────────
CREATE POLICY "agency_all" ON public.push_subscriptions
  FOR ALL TO authenticated
  USING  (private.jwt_role() = 'agency')
  WITH CHECK (private.jwt_role() = 'agency');

CREATE POLICY "client_select_own" ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (client_id = private.jwt_client_id());

CREATE POLICY "client_insert_own" ON public.push_subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (client_id = private.jwt_client_id());

CREATE POLICY "client_delete_own" ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (client_id = private.jwt_client_id());
