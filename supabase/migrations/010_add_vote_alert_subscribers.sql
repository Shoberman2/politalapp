-- =============================================================================
-- Migration 010: vote-alert email subscribers
-- Backs the landing page "Get the key votes in your inbox" signup form.
-- Public (anon) visitors can INSERT their email but cannot read the list back,
-- so the table can't be harvested. Duplicate emails are rejected by the UNIQUE
-- constraint; the client treats that as a successful (idempotent) signup.
-- =============================================================================

CREATE TABLE IF NOT EXISTS vote_alert_subscribers (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email       TEXT NOT NULL UNIQUE,
  source      TEXT,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE vote_alert_subscribers ENABLE ROW LEVEL SECURITY;

-- INSERT-only for the public roles; no SELECT/UPDATE/DELETE policy means reads
-- are denied under RLS. (Service role bypasses RLS for admin/export.)
DROP POLICY IF EXISTS "anon can subscribe" ON vote_alert_subscribers;
CREATE POLICY "anon can subscribe"
  ON vote_alert_subscribers
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

GRANT INSERT ON vote_alert_subscribers TO anon, authenticated;
