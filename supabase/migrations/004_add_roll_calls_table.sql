-- =============================================================================
-- Migration 004: Add roll_calls table for procedural-vote explanations
-- =============================================================================
-- Required by the "Explain Procedural Votes" feature (PR 1, foundation).
--
-- Per-roll-call source of truth for the vote question (e.g. "On Motion to
-- Recommit") and description text. Today the ETL extracts these fields from
-- Congress.gov but throws them away on load — votes table has no question
-- column. This migration creates the canonical table for that data.
--
-- Schema mirrors roll_call_stats pattern (migration 002): TEXT PK keyed by
-- the same {chamber}-{congress}-{session}-{rollNumber} format used in
-- votes.roll_call_id. No FK from votes.roll_call_id (soft join) to keep
-- existing data valid.
--
-- This script does TWO things:
--   1. Creates the roll_calls table (additive, safe to re-run)
--   2. Pre-populates empty rows (id only) for every distinct roll_call_id
--      already in votes. The ETL backfill task (separate job) will fill in
--      question/description by re-fetching from Congress.gov.
--
-- Paste the whole file into the Supabase SQL Editor and click Run.
-- Safe to re-run.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- STEP 1: Create the table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS roll_calls (
  -- Format: {chamber}-{congress}-{session}-{rollNumber}
  -- Example: "house-119-1-247", matches votes.roll_call_id format exactly
  id TEXT PRIMARY KEY,

  -- The bill this roll call relates to. NULL for purely procedural votes that
  -- don't reference a bill (e.g., approve the journal). ON DELETE SET NULL
  -- mirrors votes.bill_id behavior — a roll call can outlive a deleted bill.
  bill_id TEXT REFERENCES bills(id) ON DELETE SET NULL,

  -- The question being voted on. Sourced from Congress.gov <question> tag.
  -- Examples: "On Motion to Recommit", "On Cloture", "On Passage"
  question TEXT,

  -- Description / title of what is being voted on. Often the bill title
  -- or a longer description of the procedural action.
  description TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for the BillDetail procedural-history query: WHERE bill_id = $1
CREATE INDEX IF NOT EXISTS idx_roll_calls_bill_id ON roll_calls(bill_id);


-- -----------------------------------------------------------------------------
-- STEP 2: RLS + grants (mirrors roll_call_stats pattern from migration 002)
-- -----------------------------------------------------------------------------

ALTER TABLE roll_calls ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'roll_calls' AND policyname = 'Roll calls are viewable by everyone'
  ) THEN
    CREATE POLICY "Roll calls are viewable by everyone"
      ON roll_calls FOR SELECT
      USING (true);
  END IF;
END $$;

GRANT SELECT ON roll_calls TO anon;
GRANT ALL ON roll_calls TO service_role;


-- -----------------------------------------------------------------------------
-- STEP 3: Pre-populate empty rows for existing distinct roll_call_ids
-- -----------------------------------------------------------------------------
-- For every roll_call_id already present in votes, insert a roll_calls row
-- with no question/description. The ETL backfill job (re-fetch from
-- Congress.gov) will UPDATE these rows with question and description text.
--
-- Without this step, the UI would JOIN to roll_calls and get nothing for
-- existing votes until the full backfill completes. Pre-populating gives us
-- an immediate JOIN target; the backfill incrementally enriches it.

INSERT INTO roll_calls (id)
SELECT DISTINCT roll_call_id
FROM votes
WHERE roll_call_id IS NOT NULL
ON CONFLICT (id) DO NOTHING;


-- -----------------------------------------------------------------------------
-- STEP 4: Sanity check (read-only)
-- -----------------------------------------------------------------------------
-- Should match the count of distinct roll_call_ids in the votes table.

SELECT
  COUNT(*)                                  AS total_roll_calls,
  COUNT(*) FILTER (WHERE question IS NOT NULL) AS with_question,
  COUNT(*) FILTER (WHERE bill_id IS NOT NULL)  AS with_bill,
  MIN(created_at)                           AS oldest_row,
  MAX(updated_at)                           AS newest_row
FROM roll_calls;
