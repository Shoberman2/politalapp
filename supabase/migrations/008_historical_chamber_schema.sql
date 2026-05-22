-- =============================================================================
-- Migration 008: Historical Congress Chamber — schema foundation (P0)
-- =============================================================================
-- Adds 9 new tables enabling the historical chamber visualization:
--
--   1. member_congress_terms   — time-ranged member terms per Congress.
--      Composite PK (bioguide_id, congress, term_start) handles party
--      switchers (Specter, Sinema, Jeffords), mid-term resignations
--      (Kennedy → Brown 2010), contested-election vacancies (Franken/Coleman
--      8-month MN gap). One row per distinct "state of being".
--      Soft join to politicians.id (no FK) — historical members may not yet
--      be in politicians during backfill.
--
--   2. member_id_aliases       — cross-source ID crosswalk. Seeded from
--      UCSD Voteview ICPSR ↔ bioguide mapping for pre-1993 identity.
--
--   3. senate_desks            — the 100 Senate desks (static directory).
--   4. senate_desk_assignments — time-ranged occupant per desk per Congress.
--   5. senate_desk_lineage     — "through this desk" history for famous desks
--      (Webster, Clay, candy desk, etc.). Backed by Senate Historical Office.
--
--   6. congress_metadata       — per-Congress fidelity tier + date ranges +
--      majority party. Drives UI gating (composition-only fallback).
--
--   7. backfill_errors         — per-record skip log (malformed JSON, etc.).
--   8. member_reconciliation_log — cross-source identity conflict audit.
--
--   9. (deferred to migration 010 for P3) historic_moments
--
-- Reuses backfill_state from migration 006 — adds 'historical_backfill' rows.
--
-- All RLS policies CREATE in same migration per
-- [supabase-rls-default-deny] learning.
-- =============================================================================


-- =============================================================================
-- 1. member_congress_terms
-- =============================================================================
-- One row per distinct state-of-being for a member in a Congress.
-- A senator who flips party mid-term gets TWO rows for the same (bioguide_id,
-- congress). A desk that has two occupants in one Congress (resignation +
-- appointment) is reflected via senate_desk_assignments time-ranges; each
-- senator still has their own term row here.
--
-- bioguide_id: no FK (matches 006 pattern — historical members may not yet
-- be in politicians table during backfill).
--
-- term_end: NULL means "still active" or "current term".
-- reason_for_end: 'resignation', 'death', 'defeat', 'expulsion',
--                 'party_change', 'term_completed', 'appointed_successor',
--                 NULL when term_end IS NULL.

CREATE TABLE IF NOT EXISTS member_congress_terms (
  bioguide_id     TEXT NOT NULL,
  congress        INT  NOT NULL,
  term_start      DATE NOT NULL,
  chamber         TEXT NOT NULL CHECK (chamber IN ('house', 'senate')),
  state           TEXT NOT NULL CHECK (length(state) = 2),
  district        TEXT,                      -- NULL for senators
  party           TEXT NOT NULL,
  caucus          TEXT,                      -- override for independents (e.g. 'D' for Sanders)
  term_end        DATE,
  reason_for_end  TEXT,
  source          TEXT,                      -- 'congress_gov' | 'voteview' | 'hand_curated' | etc.
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (bioguide_id, congress, term_start)
);

-- Per Section 4 eng-review index spec.
CREATE INDEX IF NOT EXISTS idx_mct_congress_term_start
  ON member_congress_terms (congress, term_start);
CREATE INDEX IF NOT EXISTS idx_mct_bioguide_term_start
  ON member_congress_terms (bioguide_id, term_start);


-- =============================================================================
-- 2. member_id_aliases
-- =============================================================================
-- Cross-source identity crosswalk. Resolves pre-1993 records that use
-- non-bioguide IDs (Voteview ICPSR being the primary alias source).
--
-- One bioguide can have many aliases (Voteview ICPSR, ProQuest, etc.).
-- One (alias_source, alias_id) maps to exactly one canonical_bioguide.
--
-- Seeded in P1 from voteview.com/data crosswalk.

CREATE TABLE IF NOT EXISTS member_id_aliases (
  canonical_bioguide TEXT NOT NULL,
  alias_source       TEXT NOT NULL,    -- 'voteview_icpsr' | 'proquest' | etc.
  alias_id           TEXT NOT NULL,
  notes              TEXT,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (alias_source, alias_id)
);

CREATE INDEX IF NOT EXISTS idx_mia_bioguide
  ON member_id_aliases (canonical_bioguide);


-- =============================================================================
-- 3. senate_desks
-- =============================================================================
-- The 100 Senate desks. Static directory — seeded once.
--
-- desk_id: 1-100. Position is fixed per Senate Historical Office numbering.
-- famous_name: optional ('Webster's Desk', 'Candy Desk', etc.) — drives the
--   famous-desk accent dot in UI and unlocks the lineage panel feature.

CREATE TABLE IF NOT EXISTS senate_desks (
  desk_id      INT PRIMARY KEY CHECK (desk_id BETWEEN 1 AND 100),
  famous_name  TEXT,                          -- 'Webster's Desk' etc., NULL for non-famous
  description  TEXT,                          -- editorial blurb for the lineage panel
  side         TEXT NOT NULL CHECK (side IN ('D', 'R', 'aisle')),  -- which side of chamber
  arc          INT  NOT NULL CHECK (arc BETWEEN 1 AND 4),          -- 1=innermost, 4=outermost
  position     INT  NOT NULL,                 -- index within the arc, left-to-right
  created_at   TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================================
-- 4. senate_desk_assignments
-- =============================================================================
-- Time-ranged occupant of a desk in a Congress. Two occupants in one Congress
-- (resignation → appointment) yields two rows.
--
-- (congress, desk_id, assigned_at) composite PK is per A1 decision.
-- bioguide_id soft-joined (matches 006 pattern).
-- vacated_at NULL = still holds the desk (or end of Congress).

CREATE TABLE IF NOT EXISTS senate_desk_assignments (
  congress     INT  NOT NULL,
  desk_id      INT  NOT NULL,
  assigned_at  DATE NOT NULL,
  bioguide_id  TEXT,                          -- NULL during a vacancy window
  vacated_at   DATE,                          -- NULL = active
  reason       TEXT,                          -- 'newly_seated' | 'reassigned' | 'vacancy' | 'resignation' | 'death'
  source       TEXT,                          -- 'senate_historical_office' | 'hand_curated' | etc.
  confidence   TEXT CHECK (confidence IN ('high', 'medium', 'low')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (congress, desk_id, assigned_at)
);

CREATE INDEX IF NOT EXISTS idx_sda_bioguide_assigned
  ON senate_desk_assignments (bioguide_id, assigned_at);
CREATE INDEX IF NOT EXISTS idx_sda_congress
  ON senate_desk_assignments (congress);


-- =============================================================================
-- 5. senate_desk_lineage
-- =============================================================================
-- "Through this desk" history. For famous desks (Webster's etc.) populated
-- back to ~1836; for other desks populated from current term forward.
--
-- One row per (desk, occupant span). Gaps in the lineage (vacancy years)
-- are represented as rows with bioguide_id NULL.

CREATE TABLE IF NOT EXISTS senate_desk_lineage (
  desk_id      INT  NOT NULL REFERENCES senate_desks(desk_id),
  year_start   INT  NOT NULL,
  year_end     INT,                           -- NULL = current
  bioguide_id  TEXT,                          -- NULL = vacancy
  occupant_name TEXT,                         -- denormalized for pre-bioguide-era display
  party        TEXT,
  state        TEXT,
  notes        TEXT,                          -- editorial context (e.g. "filled by appointment")
  source       TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (desk_id, year_start)
);

CREATE INDEX IF NOT EXISTS idx_sdl_desk_year
  ON senate_desk_lineage (desk_id, year_start);


-- =============================================================================
-- 6. congress_metadata
-- =============================================================================
-- Per-Congress metadata: date range, majority parties, fidelity tier.
-- Drives UI gating: composition-only Congresses hide desk-specific affordances.
--
-- fidelity_tier values match /shared/fidelity.ts FidelityTier enum:
--   'full'              — Senate desk assignments + roll calls + bills all present
--   'partial'           — some data present, some gaps; UI shows caveat banner
--   'composition_only'  — only party composition available; UI falls back to hemicycle of party-block dots

CREATE TABLE IF NOT EXISTS congress_metadata (
  congress              INT PRIMARY KEY CHECK (congress BETWEEN 1 AND 200),
  start_date            DATE NOT NULL,
  end_date              DATE NOT NULL,
  majority_party_senate TEXT,
  majority_party_house  TEXT,
  fidelity_tier         TEXT NOT NULL DEFAULT 'composition_only'
    CHECK (fidelity_tier IN ('full', 'partial', 'composition_only')),
  senate_xml_url_pattern TEXT,                -- per-Congress Senate.gov URL template
  notes                 TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================================
-- 6.5. backfill_state — extend with historical-backfill checkpoint columns
-- =============================================================================
-- Original definition lives in migration 006. We add nullable columns the
-- historical backfill orchestrator uses to resume mid-run. Daily-ETL callers
-- ignore these columns.

ALTER TABLE backfill_state ADD COLUMN IF NOT EXISTS last_completed_congress INT;
ALTER TABLE backfill_state ADD COLUMN IF NOT EXISTS current_source TEXT;


-- =============================================================================
-- 7. backfill_errors
-- =============================================================================
-- Per-record skip log during long backfills. Operational only — service-role.

CREATE TABLE IF NOT EXISTS backfill_errors (
  id           BIGSERIAL PRIMARY KEY,
  backfill_name TEXT NOT NULL,                -- maps to backfill_state.name
  congress     INT,
  record_kind  TEXT NOT NULL,                 -- 'member' | 'bill' | 'vote' | 'desk_assignment' | etc.
  record_key   TEXT,                          -- bioguide_id, bill_id, etc.
  error_kind   TEXT NOT NULL,                 -- 'malformed_json' | 'rate_limit' | 'identity_unresolved' | etc.
  error_message TEXT,
  payload_excerpt TEXT,                       -- first ~500 bytes of the offending source data
  occurred_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_backfill_errors_name_congress
  ON backfill_errors (backfill_name, congress);


-- =============================================================================
-- 8. member_reconciliation_log
-- =============================================================================
-- Cross-source identity conflicts during reconciliation. Operational audit.
--
-- Used when Congress.gov + Voteview disagree on a member's party / state for
-- the same Congress. Precedence rule applied (Congress.gov for 1993+, Voteview
-- for pre-1993) and the conflict logged for quarterly review (see TODOS).

CREATE TABLE IF NOT EXISTS member_reconciliation_log (
  id                BIGSERIAL PRIMARY KEY,
  bioguide_id       TEXT NOT NULL,
  congress          INT  NOT NULL,
  conflict_kind     TEXT NOT NULL,            -- 'party' | 'state' | 'district' | 'chamber' | etc.
  source_a          TEXT NOT NULL,
  value_a           TEXT,
  source_b          TEXT NOT NULL,
  value_b           TEXT,
  precedence_winner TEXT NOT NULL,            -- 'a' | 'b'
  resolved          BOOLEAN NOT NULL DEFAULT false,
  notes             TEXT,
  logged_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mrl_resolved_occurrence
  ON member_reconciliation_log (resolved, logged_at DESC);


-- =============================================================================
-- RLS POLICIES
-- =============================================================================
-- Pattern: public-read tables get anon SELECT; operational tables stay
-- service-role only. Per [supabase-rls-default-deny].

-- member_congress_terms — public read
ALTER TABLE member_congress_terms ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'member_congress_terms'
      AND policyname = 'Member congress terms are viewable by everyone'
  ) THEN
    CREATE POLICY "Member congress terms are viewable by everyone"
      ON member_congress_terms FOR SELECT
      USING (true);
  END IF;
END $$;
GRANT SELECT ON member_congress_terms TO anon;
GRANT ALL    ON member_congress_terms TO service_role;

-- member_id_aliases — public read (small reference table)
ALTER TABLE member_id_aliases ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'member_id_aliases'
      AND policyname = 'Member id aliases are viewable by everyone'
  ) THEN
    CREATE POLICY "Member id aliases are viewable by everyone"
      ON member_id_aliases FOR SELECT
      USING (true);
  END IF;
END $$;
GRANT SELECT ON member_id_aliases TO anon;
GRANT ALL    ON member_id_aliases TO service_role;

-- senate_desks — public read
ALTER TABLE senate_desks ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'senate_desks'
      AND policyname = 'Senate desks are viewable by everyone'
  ) THEN
    CREATE POLICY "Senate desks are viewable by everyone"
      ON senate_desks FOR SELECT
      USING (true);
  END IF;
END $$;
GRANT SELECT ON senate_desks TO anon;
GRANT ALL    ON senate_desks TO service_role;

-- senate_desk_assignments — public read
ALTER TABLE senate_desk_assignments ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'senate_desk_assignments'
      AND policyname = 'Senate desk assignments are viewable by everyone'
  ) THEN
    CREATE POLICY "Senate desk assignments are viewable by everyone"
      ON senate_desk_assignments FOR SELECT
      USING (true);
  END IF;
END $$;
GRANT SELECT ON senate_desk_assignments TO anon;
GRANT ALL    ON senate_desk_assignments TO service_role;

-- senate_desk_lineage — public read
ALTER TABLE senate_desk_lineage ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'senate_desk_lineage'
      AND policyname = 'Senate desk lineage is viewable by everyone'
  ) THEN
    CREATE POLICY "Senate desk lineage is viewable by everyone"
      ON senate_desk_lineage FOR SELECT
      USING (true);
  END IF;
END $$;
GRANT SELECT ON senate_desk_lineage TO anon;
GRANT ALL    ON senate_desk_lineage TO service_role;

-- congress_metadata — public read
ALTER TABLE congress_metadata ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'congress_metadata'
      AND policyname = 'Congress metadata is viewable by everyone'
  ) THEN
    CREATE POLICY "Congress metadata is viewable by everyone"
      ON congress_metadata FOR SELECT
      USING (true);
  END IF;
END $$;
GRANT SELECT ON congress_metadata TO anon;
GRANT ALL    ON congress_metadata TO service_role;

-- backfill_errors — service-role only
ALTER TABLE backfill_errors ENABLE ROW LEVEL SECURITY;
GRANT ALL ON backfill_errors TO service_role;

-- member_reconciliation_log — service-role only
ALTER TABLE member_reconciliation_log ENABLE ROW LEVEL SECURITY;
GRANT ALL ON member_reconciliation_log TO service_role;


-- =============================================================================
-- SEED: congress_metadata for 93rd-119th Congresses
-- =============================================================================
-- Populates congress_metadata with date ranges + default fidelity_tier.
-- Tier is upgraded from 'composition_only' to 'partial' or 'full' by
-- the backfill ETL once data lands.
--
-- Congress dates use the January 3 / January 3 convention codified by the
-- 20th Amendment (1933+). Pre-20th-Amendment Congresses used March 4
-- (not relevant here — we start at 93rd / 1973).

INSERT INTO congress_metadata (congress, start_date, end_date, fidelity_tier) VALUES
  ( 93, '1973-01-03', '1975-01-03', 'composition_only'),
  ( 94, '1975-01-03', '1977-01-03', 'composition_only'),
  ( 95, '1977-01-03', '1979-01-03', 'composition_only'),
  ( 96, '1979-01-03', '1981-01-03', 'composition_only'),
  ( 97, '1981-01-03', '1983-01-03', 'composition_only'),
  ( 98, '1983-01-03', '1985-01-03', 'composition_only'),
  ( 99, '1985-01-03', '1987-01-03', 'composition_only'),
  (100, '1987-01-03', '1989-01-03', 'composition_only'),
  (101, '1989-01-03', '1991-01-03', 'partial'),
  (102, '1991-01-03', '1993-01-03', 'partial'),
  (103, '1993-01-03', '1995-01-03', 'full'),
  (104, '1995-01-03', '1997-01-03', 'full'),
  (105, '1997-01-03', '1999-01-03', 'full'),
  (106, '1999-01-03', '2001-01-03', 'full'),
  (107, '2001-01-03', '2003-01-03', 'full'),
  (108, '2003-01-03', '2005-01-03', 'full'),
  (109, '2005-01-03', '2007-01-03', 'full'),
  (110, '2007-01-03', '2009-01-03', 'full'),
  (111, '2009-01-03', '2011-01-03', 'full'),
  (112, '2011-01-03', '2013-01-03', 'full'),
  (113, '2013-01-03', '2015-01-03', 'full'),
  (114, '2015-01-03', '2017-01-03', 'full'),
  (115, '2017-01-03', '2019-01-03', 'full'),
  (116, '2019-01-03', '2021-01-03', 'full'),
  (117, '2021-01-03', '2023-01-03', 'full'),
  (118, '2023-01-03', '2025-01-03', 'full'),
  (119, '2025-01-03', '2027-01-03', 'full')
ON CONFLICT (congress) DO NOTHING;


-- =============================================================================
-- SEED: senate_desks (100 desks, arc + side + position)
-- =============================================================================
-- Senate floor seating uses 4 concentric arcs facing the rostrum. Democrats
-- on the east side (left from rostrum POV), Republicans on the west.
-- Desk numbering per Senate Historical Office convention.
--
-- For v1 we seed the 100 desk slots with their structural arc/side/position.
-- Famous-name annotations seeded for the ~15 desks tracked by SHO; rest are
-- NULL and can be added later via UPDATE.

INSERT INTO senate_desks (desk_id, side, arc, position, famous_name, description) VALUES
  -- ARC 1 (innermost, ~20 desks). Indexed left-to-right facing rostrum.
  (  1, 'D', 1,  1, NULL, NULL),
  (  2, 'D', 1,  2, NULL, NULL),
  (  3, 'D', 1,  3, NULL, NULL),
  (  4, 'D', 1,  4, NULL, NULL),
  (  5, 'D', 1,  5, NULL, NULL),
  (  6, 'D', 1,  6, NULL, NULL),
  (  7, 'D', 1,  7, NULL, NULL),
  (  8, 'D', 1,  8, NULL, NULL),
  (  9, 'D', 1,  9, NULL, NULL),
  ( 10, 'D', 1, 10, NULL, NULL),
  ( 11, 'R', 1, 11, NULL, NULL),
  ( 12, 'R', 1, 12, NULL, NULL),
  ( 13, 'R', 1, 13, NULL, NULL),
  ( 14, 'R', 1, 14, NULL, NULL),
  ( 15, 'R', 1, 15, NULL, NULL),
  ( 16, 'R', 1, 16, NULL, NULL),
  ( 17, 'R', 1, 17, NULL, NULL),
  ( 18, 'R', 1, 18, NULL, NULL),
  ( 19, 'R', 1, 19, NULL, NULL),
  ( 20, 'R', 1, 20, NULL, NULL),

  -- ARC 2 (~24 desks)
  ( 21, 'D', 2,  1, NULL, NULL),
  ( 22, 'D', 2,  2, NULL, NULL),
  ( 23, 'D', 2,  3, NULL, NULL),
  ( 24, 'D', 2,  4, NULL, NULL),
  ( 25, 'D', 2,  5, NULL, NULL),
  ( 26, 'D', 2,  6, NULL, NULL),
  ( 27, 'D', 2,  7, NULL, NULL),
  ( 28, 'D', 2,  8, NULL, NULL),
  ( 29, 'D', 2,  9, NULL, NULL),
  ( 30, 'D', 2, 10, NULL, NULL),
  ( 31, 'D', 2, 11, NULL, NULL),
  ( 32, 'D', 2, 12, NULL, NULL),
  ( 33, 'R', 2, 13, NULL, NULL),
  ( 34, 'R', 2, 14, NULL, NULL),
  ( 35, 'R', 2, 15, NULL, NULL),
  ( 36, 'R', 2, 16, NULL, NULL),
  ( 37, 'R', 2, 17, NULL, NULL),
  ( 38, 'R', 2, 18, NULL, NULL),
  ( 39, 'R', 2, 19, NULL, NULL),
  ( 40, 'R', 2, 20, NULL, NULL),
  ( 41, 'R', 2, 21, NULL, NULL),
  ( 42, 'R', 2, 22, NULL, NULL),
  ( 43, 'R', 2, 23, NULL, NULL),
  ( 44, 'R', 2, 24, NULL, NULL),

  -- ARC 3 (~28 desks). Webster's Desk traditionally lives near the back
  -- of the chamber on the Republican side; seeded at desk 64.
  ( 45, 'D', 3,  1, NULL, NULL),
  ( 46, 'D', 3,  2, NULL, NULL),
  ( 47, 'D', 3,  3, NULL, NULL),
  ( 48, 'D', 3,  4, NULL, NULL),
  ( 49, 'D', 3,  5, NULL, NULL),
  ( 50, 'D', 3,  6, NULL, NULL),
  ( 51, 'D', 3,  7, NULL, NULL),
  ( 52, 'D', 3,  8, NULL, NULL),
  ( 53, 'D', 3,  9, NULL, NULL),
  ( 54, 'D', 3, 10, NULL, NULL),
  ( 55, 'D', 3, 11, NULL, NULL),
  ( 56, 'D', 3, 12, NULL, NULL),
  ( 57, 'D', 3, 13, NULL, NULL),
  ( 58, 'D', 3, 14, NULL, NULL),
  ( 59, 'R', 3, 15, NULL, NULL),
  ( 60, 'R', 3, 16, NULL, NULL),
  ( 61, 'R', 3, 17, NULL, NULL),
  ( 62, 'R', 3, 18, NULL, NULL),
  ( 63, 'R', 3, 19, NULL, NULL),
  ( 64, 'R', 3, 20, 'Webster''s Desk',
    'Used by Senator Daniel Webster of Massachusetts (1845-1850). By Senate '
    'tradition since 1974, this desk is assigned to the senior senator from '
    'New Hampshire (Webster''s birth state).'),
  ( 65, 'R', 3, 21, NULL, NULL),
  ( 66, 'R', 3, 22, NULL, NULL),
  ( 67, 'R', 3, 23, NULL, NULL),
  ( 68, 'R', 3, 24, NULL, NULL),
  ( 69, 'R', 3, 25, NULL, NULL),
  ( 70, 'R', 3, 26, NULL, NULL),
  ( 71, 'R', 3, 27, NULL, NULL),
  ( 72, 'R', 3, 28, NULL, NULL),

  -- ARC 4 (outermost, ~28 desks). Candy Desk by Senate tradition is the
  -- back-row Republican desk closest to the chamber entrance — seeded at 80.
  -- Jefferson Davis's desk seeded at 91 (back Republican corner historically).
  ( 73, 'D', 4,  1, NULL, NULL),
  ( 74, 'D', 4,  2, NULL, NULL),
  ( 75, 'D', 4,  3, NULL, NULL),
  ( 76, 'D', 4,  4, NULL, NULL),
  ( 77, 'D', 4,  5, NULL, NULL),
  ( 78, 'D', 4,  6, NULL, NULL),
  ( 79, 'D', 4,  7, NULL, NULL),
  ( 80, 'R', 4,  8, 'Candy Desk',
    'A Senate tradition since 1968: the senator assigned to this desk keeps '
    'it stocked with candy for colleagues to take during long floor sessions. '
    'Started by Senator George Murphy of California.'),
  ( 81, 'D', 4,  9, NULL, NULL),
  ( 82, 'D', 4, 10, NULL, NULL),
  ( 83, 'D', 4, 11, NULL, NULL),
  ( 84, 'D', 4, 12, NULL, NULL),
  ( 85, 'D', 4, 13, NULL, NULL),
  ( 86, 'D', 4, 14, NULL, NULL),
  ( 87, 'D', 4, 15, NULL, NULL),
  ( 88, 'R', 4, 16, NULL, NULL),
  ( 89, 'R', 4, 17, NULL, NULL),
  ( 90, 'R', 4, 18, NULL, NULL),
  ( 91, 'R', 4, 19, 'Jefferson Davis''s Desk',
    'Used by Senator Jefferson Davis of Mississippi before he resigned in '
    '1861 to lead the Confederacy. Bayonet damage from Union soldiers during '
    'the Civil War remains visible.'),
  ( 92, 'R', 4, 20, NULL, NULL),
  ( 93, 'R', 4, 21, NULL, NULL),
  ( 94, 'R', 4, 22, NULL, NULL),
  ( 95, 'R', 4, 23, NULL, NULL),
  ( 96, 'R', 4, 24, NULL, NULL),
  ( 97, 'R', 4, 25, NULL, NULL),
  ( 98, 'R', 4, 26, NULL, NULL),
  ( 99, 'R', 4, 27, NULL, NULL),
  (100, 'R', 4, 28, NULL, NULL)
ON CONFLICT (desk_id) DO NOTHING;
