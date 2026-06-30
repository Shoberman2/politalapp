-- Repair production drift in the votes conflict target.
--
-- Migration 003 intended to replace the legacy UNIQUE(politician_id, bill_id,
-- voted_at) constraint with UNIQUE(roll_call_id, politician_id). Production
-- still had the legacy constraint, and repeated procedural votes with NULL
-- bill_id accumulated because NULL values do not collide under the old key.
--
-- Keep the first inserted row for each roll-call/member pair, then enforce the
-- canonical ETL conflict target used by etl/load.ts.

DO $$
DECLARE
  deleted_count bigint;
BEGIN
  WITH ranked_votes AS (
    SELECT
      id,
      row_number() OVER (
        PARTITION BY roll_call_id, politician_id
        ORDER BY id ASC
      ) AS duplicate_rank
    FROM public.votes
    WHERE roll_call_id IS NOT NULL
      AND politician_id IS NOT NULL
  ),
  deleted_votes AS (
    DELETE FROM public.votes v
    USING ranked_votes r
    WHERE v.id = r.id
      AND r.duplicate_rank > 1
    RETURNING 1
  )
  SELECT count(*) INTO deleted_count
  FROM deleted_votes;

  RAISE NOTICE 'Deleted % duplicate vote rows by roll_call_id/politician_id', deleted_count;
END $$;

ALTER TABLE public.votes
  DROP CONSTRAINT IF EXISTS votes_politician_id_bill_id_voted_at_key;

DROP INDEX IF EXISTS public.idx_votes_roll_call_politician;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.votes'::regclass
      AND conname = 'votes_roll_call_politician_unique'
  ) THEN
    ALTER TABLE public.votes
      ADD CONSTRAINT votes_roll_call_politician_unique
      UNIQUE (roll_call_id, politician_id);
  END IF;
END $$;
