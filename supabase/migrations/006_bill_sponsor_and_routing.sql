-- =============================================================================
-- Migration 006: Bill Sponsor + Legislative-Path Routing
-- =============================================================================
-- Adds sponsor metadata to bills, persists committee routings + cosponsors,
-- adds AI-narrative cache, committee-survival stats, an operational sentinel
-- table for long-running backfills, and anonymous feature_metrics counters.
--
-- Ordering inside this file:
--   1. ALTER bills (additive nullable columns)
--   2. CREATE TABLE for all 7 new tables
--   3. Indexes
--   4. RLS enable + idempotent policy blocks
--
-- Safe to run multiple times — all statements use IF NOT EXISTS / DO $$ guards.
--
-- pg_trgm extension is intentionally NOT enabled in v1 (per outside-voice D21).
-- v1 autocomplete uses the politicians table directly; no fuzzy search on
-- bills.sponsor_name yet. When that use case ships, enable pg_trgm + add the
-- GIN index in a follow-up migration.
-- =============================================================================


-- =============================================================================
-- 1. bills: sponsor columns + legislative_stage
-- =============================================================================
-- No FK on sponsor_bioguide_id — bills may reference members not yet in our
-- politicians table (cold-start during backfill). Soft join via lookup.

ALTER TABLE bills ADD COLUMN IF NOT EXISTS sponsor_bioguide_id TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS sponsor_name TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS sponsor_party TEXT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS sponsor_state TEXT;

-- legislative_stage enum-as-text. Populated by shared/legislativeStage.ts
-- in both the daily ETL and the backfill script (single source of truth).
ALTER TABLE bills ADD COLUMN IF NOT EXISTS legislative_stage TEXT;


-- =============================================================================
-- 2. bill_committee_routings
-- =============================================================================
-- One row per (bill, committee, subcommittee) referral. Primary committee
-- is NOT stored as a column — derived at query time via DISTINCT ON to avoid
-- drift from re-referrals or backdated corrections (eng-review D4).

CREATE TABLE IF NOT EXISTS bill_committee_routings (
  bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  committee_code TEXT NOT NULL,
  committee_name TEXT,
  subcommittee_code TEXT,
  subcommittee_name TEXT,
  chamber TEXT,
  referred_at DATE,
  activity_type TEXT,            -- referred_to | reported_by | discharged_from | committee_consideration | markup
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Composite uniqueness over (bill, committee, subcommittee). subcommittee_code is
-- nullable (most referrals have no subcommittee), so this index uses NULLS NOT
-- DISTINCT (PG15+) — NULL is treated as equal to NULL for dedup, matching what
-- a PRIMARY KEY with COALESCE(subcommittee_code, '') would have meant.
CREATE UNIQUE INDEX IF NOT EXISTS bill_committee_routings_unique
  ON bill_committee_routings (bill_id, committee_code, subcommittee_code) NULLS NOT DISTINCT;


-- =============================================================================
-- 3. bill_cosponsors
-- =============================================================================
-- One row per (bill, cosponsoring member). bioguide_id has no FK — see
-- sponsor_bioguide_id note above.

CREATE TABLE IF NOT EXISTS bill_cosponsors (
  bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  bioguide_id TEXT NOT NULL,
  cosponsored_at DATE,
  withdrawn_at DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (bill_id, bioguide_id)
);


-- =============================================================================
-- 4. committee_survival_stats
-- =============================================================================
-- Per-primary-committee survival rate per Congress.
-- methodology_version in PK so we can rev the math without overwriting prior
-- stats. Confidence floor (N >= 30) enforced at compute time, not in schema.

CREATE TABLE IF NOT EXISTS committee_survival_stats (
  committee_code TEXT NOT NULL,
  congress INT NOT NULL,
  bills_referred_as_primary INT NOT NULL DEFAULT 0,
  bills_advanced INT NOT NULL DEFAULT 0,
  survival_pct NUMERIC(5, 2),
  methodology_version TEXT NOT NULL,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (committee_code, congress, methodology_version)
);


-- =============================================================================
-- 5. bill_path_explanations
-- =============================================================================
-- Per-bill AI-narrated "where this bill goes" 2-3 sentence narrative.
-- Compound PK (bill_id, prompt_version) so prompt rev writes a NEW row;
-- old rows stay for audit (outside-voice D17).

CREATE TABLE IF NOT EXISTS bill_path_explanations (
  bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  narrative TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (bill_id, prompt_version)
);


-- =============================================================================
-- 6. unknown_committee_codes
-- =============================================================================
-- Operational log for committee codes missing from the static glossary.
-- Written by ETL only (eng-review D7). Surfaces within 24h.

CREATE TABLE IF NOT EXISTS unknown_committee_codes (
  committee_code TEXT NOT NULL,
  subcommittee_code TEXT,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  occurrence_count INT NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS unknown_committee_codes_unique
  ON unknown_committee_codes (committee_code, subcommittee_code) NULLS NOT DISTINCT;


-- =============================================================================
-- 7. backfill_state
-- =============================================================================
-- Sentinel for long-running backfills (outside-voice D18). The weekly
-- computeCommitteeSurvival cron checks this before running.

CREATE TABLE IF NOT EXISTS backfill_state (
  name TEXT PRIMARY KEY,
  status TEXT NOT NULL,                 -- 'running' | 'complete' | 'failed'
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================================
-- 8. feature_metrics
-- =============================================================================
-- Anonymous daily engagement counters. No per-user tracking, ever.
-- Written by the Edge Function (cold_start, cache_hit) AND the Vercel
-- serverless api/metrics/inc.js (engagement events from frontend, with
-- Origin check + per-IP rate limit). No anon SELECT — operational data.

CREATE TABLE IF NOT EXISTS feature_metrics (
  metric_name TEXT NOT NULL,
  day DATE NOT NULL,
  value INT NOT NULL DEFAULT 0,
  PRIMARY KEY (metric_name, day)
);


-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_bills_sponsor ON bills(sponsor_bioguide_id);

CREATE INDEX IF NOT EXISTS idx_bill_routings_bill_id ON bill_committee_routings(bill_id);
CREATE INDEX IF NOT EXISTS idx_bill_routings_committee ON bill_committee_routings(committee_code);
-- Supports DISTINCT ON (bill_id) ORDER BY bill_id, referred_at, committee_code
-- without a sort — used by computeCommitteeSurvival's primary-committee derivation.
CREATE INDEX IF NOT EXISTS idx_bill_routings_referred
  ON bill_committee_routings(bill_id, referred_at, committee_code);

-- Composite per eng-review D11: enables index-only scan on the join from
-- bills → bill_cosponsors. No heap fetch for bill_id.
CREATE INDEX IF NOT EXISTS idx_bill_cosponsors_bioguide
  ON bill_cosponsors(bioguide_id, bill_id);


-- =============================================================================
-- RLS POLICIES (per outside-voice D14)
-- =============================================================================
-- Pattern mirrors existing bills + bill_explanations.
-- Read-public tables get anon SELECT; operational tables (unknown_committee_codes,
-- feature_metrics, backfill_state) deny anon entirely.

-- bill_committee_routings — public read
ALTER TABLE bill_committee_routings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bill_committee_routings'
      AND policyname = 'Bill committee routings are viewable by everyone'
  ) THEN
    CREATE POLICY "Bill committee routings are viewable by everyone"
      ON bill_committee_routings FOR SELECT
      USING (true);
  END IF;
END $$;
GRANT SELECT ON bill_committee_routings TO anon;
GRANT ALL    ON bill_committee_routings TO service_role;

-- bill_cosponsors — public read
ALTER TABLE bill_cosponsors ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bill_cosponsors'
      AND policyname = 'Bill cosponsors are viewable by everyone'
  ) THEN
    CREATE POLICY "Bill cosponsors are viewable by everyone"
      ON bill_cosponsors FOR SELECT
      USING (true);
  END IF;
END $$;
GRANT SELECT ON bill_cosponsors TO anon;
GRANT ALL    ON bill_cosponsors TO service_role;

-- committee_survival_stats — public read
ALTER TABLE committee_survival_stats ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'committee_survival_stats'
      AND policyname = 'Committee survival stats are viewable by everyone'
  ) THEN
    CREATE POLICY "Committee survival stats are viewable by everyone"
      ON committee_survival_stats FOR SELECT
      USING (true);
  END IF;
END $$;
GRANT SELECT ON committee_survival_stats TO anon;
GRANT ALL    ON committee_survival_stats TO service_role;

-- bill_path_explanations — public read
ALTER TABLE bill_path_explanations ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bill_path_explanations'
      AND policyname = 'Bill path explanations are viewable by everyone'
  ) THEN
    CREATE POLICY "Bill path explanations are viewable by everyone"
      ON bill_path_explanations FOR SELECT
      USING (true);
  END IF;
END $$;
GRANT SELECT ON bill_path_explanations TO anon;
GRANT ALL    ON bill_path_explanations TO service_role;

-- unknown_committee_codes — service-role only (no anon SELECT)
ALTER TABLE unknown_committee_codes ENABLE ROW LEVEL SECURITY;
GRANT ALL ON unknown_committee_codes TO service_role;

-- feature_metrics — service-role only
ALTER TABLE feature_metrics ENABLE ROW LEVEL SECURITY;
GRANT ALL ON feature_metrics TO service_role;

-- backfill_state — service-role only
ALTER TABLE backfill_state ENABLE ROW LEVEL SECURITY;
GRANT ALL ON backfill_state TO service_role;
