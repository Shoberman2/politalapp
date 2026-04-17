-- =============================================================================
-- Migration 002: Add roll_call_stats table + backfill from existing votes
-- =============================================================================
-- Required by the Voting Pattern Analysis feature on politician profile pages.
-- Per-roll-call Yea/Nay breakdown by party, used for the classifier's
-- party-majority signal.
--
-- This script does TWO things:
--   1. Creates the roll_call_stats table (safe to re-run)
--   2. Backfills all historical data from the existing votes + politicians
--      tables in a single query. Does NOT require the ETL pipeline to run.
--
-- Paste the whole file into the Supabase SQL Editor and click Run.
-- Safe to re-run. Takes ~30 seconds depending on vote count.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- STEP 1: Create the table
-- -----------------------------------------------------------------------------

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

ALTER TABLE roll_call_stats ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'roll_call_stats' AND policyname = 'Roll call stats are viewable by everyone'
  ) THEN
    CREATE POLICY "Roll call stats are viewable by everyone"
      ON roll_call_stats FOR SELECT
      USING (true);
  END IF;
END $$;

GRANT SELECT ON roll_call_stats TO anon;
GRANT ALL ON roll_call_stats TO service_role;


-- -----------------------------------------------------------------------------
-- STEP 2: Backfill from existing votes + politicians
-- -----------------------------------------------------------------------------
-- Normalizes party strings (the politicians table may contain 'Democrat',
-- 'Democratic', 'D' — all treated as D). Caucusing independents Sanders
-- (S000033) and King (K000383) are counted as Democrats. Other independents
-- go into the ind bucket.
--
-- Uses ON CONFLICT to be idempotent — re-running updates counts rather than
-- creating duplicates.

WITH normalized_votes AS (
  SELECT
    v.roll_call_id,
    v.position,
    CASE
      WHEN p.party IN ('Democrat', 'Democratic', 'D') THEN 'D'
      WHEN p.id IN ('S000033', 'K000383') THEN 'D'  -- Sanders, King caucus with Dems
      WHEN p.party IN ('Republican', 'R') THEN 'R'
      ELSE 'I'
    END AS eff_party
  FROM votes v
  JOIN politicians p ON v.politician_id = p.id
  WHERE v.roll_call_id IS NOT NULL
)
INSERT INTO roll_call_stats (
  roll_call_id, dem_yea, dem_nay, rep_yea, rep_nay, ind_yea, ind_nay, updated_at
)
SELECT
  roll_call_id,
  COUNT(*) FILTER (WHERE eff_party = 'D' AND position = 'Yea')::INTEGER AS dem_yea,
  COUNT(*) FILTER (WHERE eff_party = 'D' AND position = 'Nay')::INTEGER AS dem_nay,
  COUNT(*) FILTER (WHERE eff_party = 'R' AND position = 'Yea')::INTEGER AS rep_yea,
  COUNT(*) FILTER (WHERE eff_party = 'R' AND position = 'Nay')::INTEGER AS rep_nay,
  COUNT(*) FILTER (WHERE eff_party = 'I' AND position = 'Yea')::INTEGER AS ind_yea,
  COUNT(*) FILTER (WHERE eff_party = 'I' AND position = 'Nay')::INTEGER AS ind_nay,
  NOW()
FROM normalized_votes
GROUP BY roll_call_id
ON CONFLICT (roll_call_id) DO UPDATE SET
  dem_yea = EXCLUDED.dem_yea,
  dem_nay = EXCLUDED.dem_nay,
  rep_yea = EXCLUDED.rep_yea,
  rep_nay = EXCLUDED.rep_nay,
  ind_yea = EXCLUDED.ind_yea,
  ind_nay = EXCLUDED.ind_nay,
  updated_at = NOW();


-- -----------------------------------------------------------------------------
-- STEP 3: Sanity check (read-only, safe to run)
-- -----------------------------------------------------------------------------
-- If the counts look sensible (thousands of dem_votes, thousands of rep_votes,
-- small number of ind_votes), the backfill worked.

SELECT
  COUNT(*)                                      AS roll_call_count,
  SUM(dem_yea + dem_nay)                        AS dem_votes_tallied,
  SUM(rep_yea + rep_nay)                        AS rep_votes_tallied,
  SUM(ind_yea + ind_nay)                        AS ind_votes_tallied,
  MIN(updated_at)                               AS oldest_row,
  MAX(updated_at)                               AS newest_row
FROM roll_call_stats;

-- Optional: what party labels actually exist in your politicians table?
-- Uncomment if the sanity check above shows zero dem/rep votes —
-- the CASE WHEN above may be missing a label.
-- SELECT party, COUNT(*) AS members
-- FROM politicians
-- GROUP BY party
-- ORDER BY members DESC;
