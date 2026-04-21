-- =============================================================================
-- Migration 003: SEO pages + lock primitives (Wave 1, Phase 0)
-- =============================================================================
-- Ships the schema foundation for per-vote SEO pages:
--   1. Fix votes unique-constraint collision: drop (politician_id, bill_id, voted_at),
--      promote (roll_call_id, politician_id) to a real UNIQUE CONSTRAINT
--      (Supabase upsert onConflict needs a constraint, not just an index).
--   2. SEO metadata columns on votes and bills.
--   3. policy_area canonicalization table (Congress.gov free-text drifts).
--   4. slug_redirects for manual slug changes (permalinks stay forever).
--   5. etl_leases for real concurrency control instead of boolean flag.
--   6. get_vote_page_data(slug) RPC: one round-trip for the per-vote page.
--   7. try_advisory_lock RPC wrapper so the JS client can call pg_try_advisory_lock.
--
-- Safe to run multiple times. The UNIQUE constraint promotion is the only step
-- that can fail (if duplicate (roll_call_id, politician_id) rows somehow exist),
-- but the existing unique index prevents that.
-- =============================================================================


-- =============================================================================
-- 1. VOTES: fix unique-constraint collision
-- =============================================================================
-- The original schema.sql creates UNIQUE(politician_id, bill_id, voted_at).
-- That silently collapses procedural votes on the same bill on the same day.
-- We want (roll_call_id, politician_id) as the canonical conflict target.

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- Find and drop any unique constraint that references these three columns
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'votes'::regclass
    AND contype = 'u'
    AND pg_get_constraintdef(oid) ILIKE '%politician_id%bill_id%voted_at%';

  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE votes DROP CONSTRAINT %I', constraint_name);
    RAISE NOTICE 'Dropped legacy constraint: %', constraint_name;
  END IF;
END $$;

-- Promote (roll_call_id, politician_id) to a real UNIQUE CONSTRAINT.
-- onConflict in Supabase upsert requires a constraint, not just a unique index.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'votes'::regclass
      AND conname = 'votes_roll_call_politician_unique'
  ) THEN
    -- Drop the existing unique index first (we're replacing it with a constraint)
    DROP INDEX IF EXISTS idx_votes_roll_call_politician;
    ALTER TABLE votes
      ADD CONSTRAINT votes_roll_call_politician_unique
      UNIQUE (roll_call_id, politician_id);
  END IF;
END $$;


-- =============================================================================
-- 2. VOTES: SEO metadata columns
-- =============================================================================

ALTER TABLE votes ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS meta_description TEXT;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS og_image_key TEXT;
ALTER TABLE votes ADD COLUMN IF NOT EXISTS slug_locked_at TIMESTAMPTZ;

-- Partial unique index: only enforce uniqueness for non-null slugs.
CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_slug
  ON votes(slug)
  WHERE slug IS NOT NULL;


-- =============================================================================
-- 3. BILLS: SEO metadata columns
-- =============================================================================

ALTER TABLE bills ADD COLUMN IF NOT EXISTS canonical_summary TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS seo_title TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS canonical_policy_area TEXT;

CREATE INDEX IF NOT EXISTS idx_bills_canonical_policy
  ON bills(canonical_policy_area)
  WHERE canonical_policy_area IS NOT NULL;


-- =============================================================================
-- 4. POLICY AREA CANONICALIZATION
-- =============================================================================
-- Congress.gov policy_area is free text that drifts ("Health" to "Healthcare").
-- This table maps raw values to stable canonical values + URL slugs.

CREATE TABLE IF NOT EXISTS policy_area_canonicalization (
  raw_value TEXT PRIMARY KEY,
  canonical_value TEXT NOT NULL,
  slug TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_policy_canon_slug
  ON policy_area_canonicalization(slug);

ALTER TABLE policy_area_canonicalization ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'policy_area_canonicalization'
      AND policyname = 'Policy canonicalization viewable by everyone'
  ) THEN
    CREATE POLICY "Policy canonicalization viewable by everyone"
      ON policy_area_canonicalization FOR SELECT
      USING (true);
  END IF;
END $$;

GRANT SELECT ON policy_area_canonicalization TO anon;
GRANT ALL ON policy_area_canonicalization TO service_role;


-- =============================================================================
-- 5. SLUG REDIRECTS
-- =============================================================================
-- For manual slug renames after publication. Permalinks stay stable.
-- 301 the old slug to the new one.

CREATE TABLE IF NOT EXISTS slug_redirects (
  old_slug TEXT PRIMARY KEY,
  new_slug TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slug_redirects_new
  ON slug_redirects(new_slug);

ALTER TABLE slug_redirects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'slug_redirects'
      AND policyname = 'Slug redirects viewable by everyone'
  ) THEN
    CREATE POLICY "Slug redirects viewable by everyone"
      ON slug_redirects FOR SELECT
      USING (true);
  END IF;
END $$;

GRANT SELECT ON slug_redirects TO anon;
GRANT ALL ON slug_redirects TO service_role;


-- =============================================================================
-- 6. ETL LEASES
-- =============================================================================
-- Concurrency control for ETL runs. Auto-expires so a crashed process doesn't
-- hold the lease forever. Used alongside pg_try_advisory_lock for hard safety.

CREATE TABLE IF NOT EXISTS etl_leases (
  lease_key TEXT PRIMARY KEY,
  holder TEXT NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_etl_leases_expires
  ON etl_leases(expires_at);

ALTER TABLE etl_leases ENABLE ROW LEVEL SECURITY;

-- No public read — leases are operational metadata
GRANT ALL ON etl_leases TO service_role;


-- =============================================================================
-- 7. RPC: try_advisory_lock
-- =============================================================================
-- Wraps pg_try_advisory_lock so the JS client can call it without raw SQL.
-- Returns TRUE if the lock was acquired, FALSE if another session holds it.

CREATE OR REPLACE FUNCTION try_advisory_lock(p_key BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN pg_try_advisory_lock(p_key);
END;
$$;

REVOKE ALL ON FUNCTION try_advisory_lock(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION try_advisory_lock(BIGINT) TO service_role;

-- Release companion
CREATE OR REPLACE FUNCTION release_advisory_lock(p_key BIGINT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN pg_advisory_unlock(p_key);
END;
$$;

REVOKE ALL ON FUNCTION release_advisory_lock(BIGINT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION release_advisory_lock(BIGINT) TO service_role;


-- =============================================================================
-- 8. RPC: get_vote_page_data(slug)
-- =============================================================================
-- One round-trip for the per-vote SEO page. Returns the vote, the bill (if any),
-- the politician, and whichever derived signals already exist
-- (roll_call_stats, voting_patterns, donations) as LEFT JOINs.
--
-- Returns NULL JSONB if slug not found.

CREATE OR REPLACE FUNCTION get_vote_page_data(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_vote votes%ROWTYPE;
  v_bill bills%ROWTYPE;
  v_politician politicians%ROWTYPE;
  result JSONB;
BEGIN
  -- Resolve slug (handle redirects transparently)
  SELECT * INTO v_vote
  FROM votes
  WHERE slug = p_slug
  LIMIT 1;

  -- Redirect check: if slug doesn't exist, try slug_redirects
  IF NOT FOUND THEN
    SELECT v.* INTO v_vote
    FROM slug_redirects sr
    JOIN votes v ON v.slug = sr.new_slug
    WHERE sr.old_slug = p_slug
    LIMIT 1;
  END IF;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Bill is optional (procedural votes have no bill)
  IF v_vote.bill_id IS NOT NULL THEN
    SELECT * INTO v_bill FROM bills WHERE id = v_vote.bill_id;
  END IF;

  SELECT * INTO v_politician FROM politicians WHERE id = v_vote.politician_id;

  result := jsonb_build_object(
    'vote', to_jsonb(v_vote),
    'bill', CASE WHEN v_vote.bill_id IS NOT NULL THEN to_jsonb(v_bill) ELSE NULL END,
    'politician', to_jsonb(v_politician)
  );

  -- Attach roll_call_stats if the table exists and has a row
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'roll_call_stats') THEN
    result := result || jsonb_build_object(
      'roll_call_stats',
      (SELECT to_jsonb(rcs) FROM roll_call_stats rcs WHERE rcs.roll_call_id = v_vote.roll_call_id LIMIT 1)
    );
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION get_vote_page_data(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_vote_page_data(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_vote_page_data(TEXT) TO service_role;


-- =============================================================================
-- 9. Resolve slug (thin helper for 301 handling)
-- =============================================================================

CREATE OR REPLACE FUNCTION resolve_slug(p_slug TEXT)
RETURNS TABLE (
  resolved_slug TEXT,
  redirected BOOLEAN
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM votes WHERE slug = p_slug) THEN
    RETURN QUERY SELECT p_slug, FALSE;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT sr.new_slug, TRUE
  FROM slug_redirects sr
  WHERE sr.old_slug = p_slug
  LIMIT 1;
END;
$$;

REVOKE ALL ON FUNCTION resolve_slug(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_slug(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION resolve_slug(TEXT) TO service_role;
