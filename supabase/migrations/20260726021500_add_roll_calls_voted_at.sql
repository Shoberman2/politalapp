-- Give roll_calls its own vote date.
--
-- roll_calls had no date of its own, so anything needing "most recent roll
-- call" fell back to created_at — which is when WE ingested the row, not when
-- the vote happened. That held up only while ingestion ran forward in time.
-- The 2026-07-25 backfill wrote 172 roll calls from earlier in the Congress
-- with fresh created_at values, and the front page's "On the floor" feed
-- immediately began presenting months-old procedural motions as the latest
-- floor activity.
--
-- votes.voted_at already carries the real date. This lifts it onto the parent
-- row so ordering is a plain indexed column read, and backfilling history can
-- never again masquerade as breaking news.

ALTER TABLE roll_calls ADD COLUMN IF NOT EXISTS voted_at DATE;

COMMENT ON COLUMN roll_calls.voted_at IS
  'Day the vote was taken (from votes.voted_at). Order feeds by this, never by created_at, which is ingest time.';

-- Backfill from the votes we already hold. MIN() because every member vote on
-- a roll call shares its date; MIN is stable if a stray row ever disagrees.
UPDATE roll_calls rc
SET voted_at = v.voted_at
FROM (
  SELECT roll_call_id, MIN(voted_at) AS voted_at
  FROM votes
  WHERE roll_call_id IS NOT NULL AND voted_at IS NOT NULL
  GROUP BY roll_call_id
) v
WHERE rc.id = v.roll_call_id
  AND rc.voted_at IS DISTINCT FROM v.voted_at;

-- Roll calls we hold no member votes for keep voted_at NULL. Feeds sort those
-- last rather than guessing a date for them.
CREATE INDEX IF NOT EXISTS idx_roll_calls_voted_at
  ON roll_calls (voted_at DESC NULLS LAST);
