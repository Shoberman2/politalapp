-- =============================================================================
-- Migration 009: politicians ↔ member_congress_terms hybrid SOT sync trigger
-- =============================================================================
-- Implements the Q2 decision from /plan-eng-review.
--
-- Hybrid source-of-truth pattern:
--   - politicians keeps current-snapshot fields (party, state, district)
--     denormalized so existing single-Congress queries keep working unchanged.
--   - member_congress_terms holds the full historical record including the
--     current term.
--   - This trigger keeps politicians.party/state/district in sync with the
--     MOST-RECENT (highest congress, then latest term_start) row in
--     member_congress_terms whenever terms are INSERTed or UPDATEd.
--
-- CRITICAL INVARIANT: after this trigger fires, politicians always reflects
-- the most-recent term for any member who has terms in member_congress_terms.
-- Verified by the regression test test/services/membersTermsSyncTrigger.test.ts.
--
-- For members who DO NOT have any rows in member_congress_terms (e.g. members
-- who haven't been backfilled yet), politicians.party/state/district keep
-- their existing values. The trigger is purely additive — never deletes or
-- nullifies politicians data.
--
-- Idempotent: replacing the function + trigger is a no-op if rerun.
-- =============================================================================


-- =============================================================================
-- Function: sync_politician_from_terms()
-- =============================================================================
-- Fires on INSERT or UPDATE of member_congress_terms.
-- Picks the MOST-RECENT term for NEW.bioguide_id (highest congress, then
-- latest term_start as tiebreaker) and writes party/state/district to
-- the politicians row with that bioguide_id (if such a row exists).
--
-- Uses LATERAL subquery so the ORDER BY ... LIMIT 1 is evaluated once per
-- INSERT/UPDATE rather than per politician row.

CREATE OR REPLACE FUNCTION sync_politician_from_terms()
RETURNS TRIGGER AS $$
DECLARE
  most_recent_party    TEXT;
  most_recent_state    TEXT;
  most_recent_district TEXT;
  most_recent_chamber  TEXT;
BEGIN
  -- Resolve the most-recent term for this bioguide_id.
  -- Tie-break: highest congress, then latest term_start.
  SELECT party, state, district, chamber
    INTO most_recent_party, most_recent_state, most_recent_district, most_recent_chamber
  FROM member_congress_terms
  WHERE bioguide_id = NEW.bioguide_id
  ORDER BY congress DESC, term_start DESC
  LIMIT 1;

  -- Only update politicians if we resolved a most-recent term AND the
  -- politicians row already exists. Don't create politicians rows from this
  -- trigger — that's the ETL's job.
  IF most_recent_party IS NOT NULL THEN
    UPDATE politicians
    SET
      party      = most_recent_party,
      state      = most_recent_state,
      district   = most_recent_district,
      chamber    = most_recent_chamber,
      updated_at = NOW()
    WHERE id = NEW.bioguide_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =============================================================================
-- Trigger: sync_politician_on_term_change
-- =============================================================================
-- Fires AFTER INSERT or UPDATE (one row at a time — sufficient for the
-- daily ETL and the long-running backfill, both of which insert
-- one-row-per-statement via the Supabase JS client).

DROP TRIGGER IF EXISTS sync_politician_on_term_change ON member_congress_terms;

CREATE TRIGGER sync_politician_on_term_change
AFTER INSERT OR UPDATE OF party, state, district, chamber, congress, term_start
ON member_congress_terms
FOR EACH ROW
EXECUTE FUNCTION sync_politician_from_terms();


-- =============================================================================
-- Backfill: one-time sync of existing politicians into member_congress_terms
-- =============================================================================
-- Seeds member_congress_terms with one row per current politician using their
-- existing party/state/district/chamber, treating them as a 119th-Congress
-- term starting on the congress start date.
--
-- After this seed, the trigger keeps politicians in sync.
-- After P1 backfill lands real historical terms, this seed row's term_end
-- gets populated by the backfill ETL when the member appears in an earlier
-- Congress.
--
-- Safe to re-run via ON CONFLICT.

INSERT INTO member_congress_terms (
  bioguide_id,
  congress,
  term_start,
  chamber,
  state,
  district,
  party,
  source
)
SELECT
  p.id,
  119,                       -- current Congress as of 2025-01-03
  '2025-01-03'::DATE,        -- 119th Congress start date
  p.chamber,
  p.state,
  p.district,
  p.party,
  'p0_seed_from_politicians'
FROM politicians p
ON CONFLICT (bioguide_id, congress, term_start) DO NOTHING;
