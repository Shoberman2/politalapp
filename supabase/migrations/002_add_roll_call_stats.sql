-- =============================================================================
-- Migration: Add roll_call_stats table
-- =============================================================================
-- Per-roll-call vote breakdown by party. Populated by the ETL pipeline
-- (etl/computeStats.ts). Required by the Voting Pattern Analysis feature on
-- politician profile pages for party-majority direction in the predictability
-- classifier.
--
-- Safe to run multiple times (uses IF NOT EXISTS).
-- Run this in your Supabase SQL Editor, then trigger the ETL (workflow_dispatch
-- in the etl-daily.yml GitHub Action) to backfill rows for existing roll calls.
-- =============================================================================


CREATE TABLE IF NOT EXISTS roll_call_stats (
  roll_call_id TEXT PRIMARY KEY,
  dem_yea INTEGER DEFAULT 0,
  dem_nay INTEGER DEFAULT 0,
  rep_yea INTEGER DEFAULT 0,
  rep_nay INTEGER DEFAULT 0,
  ind_yea INTEGER DEFAULT 0,
  ind_nay INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Fast lookup by roll_call_id is the PK default.
-- No additional indexes needed for the feature's current access pattern.

ALTER TABLE roll_call_stats ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'roll_call_stats' AND policyname = 'Roll call stats are viewable by everyone'
  ) THEN
    CREATE POLICY "Roll call stats are viewable by everyone"
      ON roll_call_stats FOR SELECT
      USING (true);
  END IF;
END $$;

GRANT SELECT ON roll_call_stats TO anon;
GRANT ALL ON roll_call_stats TO service_role;
