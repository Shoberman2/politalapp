-- =============================================================================
-- Political Vote Tracker - Supabase Database Schema
-- =============================================================================
-- Run this ENTIRE file in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/YOUR_PROJECT/sql
--
-- This creates all tables, indexes, RLS policies, views, and functions.
-- Safe to run multiple times (uses IF NOT EXISTS / OR REPLACE).
-- =============================================================================


-- =============================================================================
-- 1. POLITICIANS TABLE
-- =============================================================================
-- Stores members of Congress. Primary key is the BioGuide ID.

CREATE TABLE IF NOT EXISTS politicians (
  id TEXT PRIMARY KEY,                -- BioGuide ID (e.g., "A000360")
  name TEXT NOT NULL,                 -- Full name
  chamber TEXT NOT NULL               -- 'house' or 'senate'
    CHECK (chamber IN ('house', 'senate')),
  state TEXT NOT NULL                 -- Two-letter state code
    CHECK (length(state) = 2),
  district TEXT,                      -- District number (null for senators)
  party TEXT NOT NULL,                -- Party affiliation
  photo_url TEXT,                     -- URL to official photo
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_politicians_state ON politicians(state);
CREATE INDEX IF NOT EXISTS idx_politicians_chamber ON politicians(chamber);
CREATE INDEX IF NOT EXISTS idx_politicians_state_chamber ON politicians(state, chamber);
CREATE INDEX IF NOT EXISTS idx_politicians_state_district ON politicians(state, district);

ALTER TABLE politicians ENABLE ROW LEVEL SECURITY;

-- Anyone can read politicians
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'politicians' AND policyname = 'Politicians are viewable by everyone'
  ) THEN
    CREATE POLICY "Politicians are viewable by everyone"
      ON politicians FOR SELECT
      USING (true);
  END IF;
END $$;


-- =============================================================================
-- 2. BILLS TABLE
-- =============================================================================
-- Stores legislation. Primary key is congress-type-number (e.g., "118-hr-1234").

CREATE TABLE IF NOT EXISTS bills (
  id TEXT PRIMARY KEY,                -- e.g., "118-hr-1234"
  title TEXT NOT NULL,                -- Bill title
  introduced_at DATE,                 -- Date bill was introduced
  summary TEXT,                       -- AI-generated plain-English summary
  crs_summary TEXT,                   -- Official CRS summary from Congress.gov
  policy_area TEXT,                   -- e.g., "Healthcare", "Defense"
  source_url TEXT NOT NULL,           -- Link to official Congress.gov page
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bills_introduced ON bills(introduced_at DESC);
CREATE INDEX IF NOT EXISTS idx_bills_policy_area ON bills(policy_area);

ALTER TABLE bills ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bills' AND policyname = 'Bills are viewable by everyone'
  ) THEN
    CREATE POLICY "Bills are viewable by everyone"
      ON bills FOR SELECT
      USING (true);
  END IF;
END $$;


-- =============================================================================
-- 3. VOTES TABLE
-- =============================================================================
-- Each row = one politician's vote on one bill. Immutable facts.

CREATE TABLE IF NOT EXISTS votes (
  id BIGSERIAL PRIMARY KEY,
  politician_id TEXT NOT NULL REFERENCES politicians(id) ON DELETE CASCADE,
  bill_id TEXT REFERENCES bills(id) ON DELETE SET NULL,
  roll_call_id TEXT,                  -- Format: "{chamber}-{congress}-{session}-{rollNumber}"
  position TEXT NOT NULL
    CHECK (position IN ('Yea', 'Nay', 'Present', 'Not Voting')),
  voted_at DATE NOT NULL,
  source_url TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(politician_id, bill_id, voted_at)
);

CREATE INDEX IF NOT EXISTS idx_votes_politician ON votes(politician_id);
CREATE INDEX IF NOT EXISTS idx_votes_bill ON votes(bill_id);
CREATE INDEX IF NOT EXISTS idx_votes_date ON votes(voted_at DESC);
CREATE INDEX IF NOT EXISTS idx_votes_politician_date ON votes(politician_id, voted_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_votes_roll_call_politician ON votes(roll_call_id, politician_id);

ALTER TABLE votes ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'votes' AND policyname = 'Votes are viewable by everyone'
  ) THEN
    CREATE POLICY "Votes are viewable by everyone"
      ON votes FOR SELECT
      USING (true);
  END IF;
END $$;


-- =============================================================================
-- 4. BILL ARTICLES TABLE
-- =============================================================================
-- News articles related to bills.

CREATE TABLE IF NOT EXISTS bill_articles (
  id BIGSERIAL PRIMARY KEY,
  bill_id TEXT NOT NULL REFERENCES bills(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  publisher TEXT,
  headline TEXT,
  published_at DATE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(bill_id, url)
);

CREATE INDEX IF NOT EXISTS idx_bill_articles_bill ON bill_articles(bill_id);

ALTER TABLE bill_articles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'bill_articles' AND policyname = 'Bill articles are viewable by everyone'
  ) THEN
    CREATE POLICY "Bill articles are viewable by everyone"
      ON bill_articles FOR SELECT
      USING (true);
  END IF;
END $$;


-- =============================================================================
-- 5. MEMBER_STATS TABLE
-- =============================================================================
-- Pre-computed per-member voting statistics, generated by the ETL.

CREATE TABLE IF NOT EXISTS member_stats (
  politician_id TEXT NOT NULL REFERENCES politicians(id) ON DELETE CASCADE,
  congress INTEGER NOT NULL,
  total_votes INTEGER DEFAULT 0,
  yea_count INTEGER DEFAULT 0,
  nay_count INTEGER DEFAULT 0,
  present_count INTEGER DEFAULT 0,
  not_voting_count INTEGER DEFAULT 0,
  party_loyalty_pct INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (politician_id, congress)
);

ALTER TABLE member_stats ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'member_stats' AND policyname = 'Member stats are viewable by everyone'
  ) THEN
    CREATE POLICY "Member stats are viewable by everyone"
      ON member_stats FOR SELECT
      USING (true);
  END IF;
END $$;


-- =============================================================================
-- 6. ETL_METADATA TABLE
-- =============================================================================
-- Tracks ETL run state (last successful run, etc.)

CREATE TABLE IF NOT EXISTS etl_metadata (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE etl_metadata ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'etl_metadata' AND policyname = 'ETL metadata is viewable by everyone'
  ) THEN
    CREATE POLICY "ETL metadata is viewable by everyone"
      ON etl_metadata FOR SELECT
      USING (true);
  END IF;
END $$;


-- =============================================================================
-- 7. HELPER FUNCTIONS & TRIGGERS
-- =============================================================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_politicians_updated_at ON politicians;
CREATE TRIGGER update_politicians_updated_at
  BEFORE UPDATE ON politicians
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bills_updated_at ON bills;
CREATE TRIGGER update_bills_updated_at
  BEFORE UPDATE ON bills
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- =============================================================================
-- 8. VIEWS
-- =============================================================================

-- Recent votes with politician and bill info
CREATE OR REPLACE VIEW recent_votes_with_details AS
SELECT
  v.id,
  v.position,
  v.voted_at,
  v.roll_call_id,
  v.source_url AS vote_source_url,
  p.id AS politician_id,
  p.name AS politician_name,
  p.chamber,
  p.state,
  p.district,
  p.party,
  p.photo_url,
  b.id AS bill_id,
  b.title AS bill_title,
  b.summary AS bill_summary,
  b.crs_summary AS bill_crs_summary,
  b.policy_area AS bill_policy_area,
  b.source_url AS bill_source_url
FROM votes v
JOIN politicians p ON v.politician_id = p.id
LEFT JOIN bills b ON v.bill_id = b.id
ORDER BY v.voted_at DESC;

-- Vote summary by politician
CREATE OR REPLACE VIEW politician_vote_summary AS
SELECT
  p.id,
  p.name,
  p.chamber,
  p.state,
  p.district,
  p.party,
  COUNT(*) FILTER (WHERE v.position = 'Yea') AS yea_count,
  COUNT(*) FILTER (WHERE v.position = 'Nay') AS nay_count,
  COUNT(*) FILTER (WHERE v.position = 'Present') AS present_count,
  COUNT(*) FILTER (WHERE v.position = 'Not Voting') AS not_voting_count,
  COUNT(*) AS total_votes
FROM politicians p
LEFT JOIN votes v ON p.id = v.politician_id
GROUP BY p.id, p.name, p.chamber, p.state, p.district, p.party;


-- =============================================================================
-- 9. RPC FUNCTIONS
-- =============================================================================

-- Get representatives for a state + optional district
CREATE OR REPLACE FUNCTION get_representatives(
  p_state TEXT,
  p_district TEXT DEFAULT NULL
)
RETURNS TABLE (
  id TEXT,
  name TEXT,
  chamber TEXT,
  state TEXT,
  district TEXT,
  party TEXT,
  photo_url TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pol.id,
    pol.name,
    pol.chamber,
    pol.state,
    pol.district,
    pol.party,
    pol.photo_url
  FROM politicians pol
  WHERE pol.state = UPPER(p_state)
    AND (
      pol.chamber = 'senate'
      OR (pol.chamber = 'house' AND pol.district = p_district)
      OR p_district IS NULL
    )
  ORDER BY pol.chamber DESC, pol.name;
END;
$$ LANGUAGE plpgsql;

-- Get recent votes for a politician
CREATE OR REPLACE FUNCTION get_politician_votes(
  p_politician_id TEXT,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  vote_id BIGINT,
  vote_position TEXT,
  voted_at DATE,
  roll_call_id TEXT,
  vote_source_url TEXT,
  bill_id TEXT,
  bill_title TEXT,
  bill_summary TEXT,
  bill_crs_summary TEXT,
  bill_policy_area TEXT,
  bill_source_url TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.id AS vote_id,
    v.position AS vote_position,
    v.voted_at,
    v.roll_call_id,
    v.source_url AS vote_source_url,
    b.id AS bill_id,
    b.title AS bill_title,
    b.summary AS bill_summary,
    b.crs_summary AS bill_crs_summary,
    b.policy_area AS bill_policy_area,
    b.source_url AS bill_source_url
  FROM votes v
  LEFT JOIN bills b ON v.bill_id = b.id
  WHERE v.politician_id = p_politician_id
  ORDER BY v.voted_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;


-- =============================================================================
-- 10. GRANT PERMISSIONS
-- =============================================================================

-- Public read access (anon role = unauthenticated frontend users)
GRANT SELECT ON politicians TO anon;
GRANT SELECT ON bills TO anon;
GRANT SELECT ON votes TO anon;
GRANT SELECT ON bill_articles TO anon;
GRANT SELECT ON member_stats TO anon;
GRANT SELECT ON etl_metadata TO anon;
GRANT SELECT ON recent_votes_with_details TO anon;
GRANT SELECT ON politician_vote_summary TO anon;
GRANT EXECUTE ON FUNCTION get_representatives(TEXT, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_politician_votes(TEXT, INT) TO anon;

-- ETL / service role gets full access to data tables
GRANT ALL ON politicians TO service_role;
GRANT ALL ON bills TO service_role;
GRANT ALL ON votes TO service_role;
GRANT ALL ON bill_articles TO service_role;
GRANT ALL ON member_stats TO service_role;
GRANT ALL ON etl_metadata TO service_role;
GRANT USAGE, SELECT ON SEQUENCE votes_id_seq TO service_role;
GRANT USAGE, SELECT ON SEQUENCE bill_articles_id_seq TO service_role;


-- =============================================================================
-- 11. PROFILES TABLE (Auth + Stripe Subscriptions)
-- =============================================================================

CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  stripe_customer_id TEXT,
  subscription_status TEXT DEFAULT 'inactive', -- 'active', 'inactive', 'canceled', 'past_due'
  subscription_id TEXT,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can read own profile'
  ) THEN
    CREATE POLICY "Users can read own profile"
      ON profiles FOR SELECT
      USING (auth.uid() = id);
  END IF;
END $$;

-- Users can update their own profile
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Users can update own profile'
  ) THEN
    CREATE POLICY "Users can update own profile"
      ON profiles FOR UPDATE
      USING (auth.uid() = id)
      WITH CHECK (auth.uid() = id);
  END IF;
END $$;

-- Service role full access (for webhooks)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'profiles' AND policyname = 'Service role full access on profiles'
  ) THEN
    CREATE POLICY "Service role full access on profiles"
      ON profiles FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;

GRANT SELECT ON profiles TO authenticated;
GRANT ALL ON profiles TO service_role;

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
