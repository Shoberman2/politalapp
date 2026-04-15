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


-- =============================================================================
-- 12. ORGANIZATIONS TABLE (B2B API Customers)
-- =============================================================================

CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  stripe_customer_id TEXT,
  subscription_status TEXT DEFAULT 'inactive'
    CHECK (subscription_status IN ('active', 'inactive', 'canceled', 'past_due')),
  subscription_id TEXT,
  plan TEXT DEFAULT 'starter'
    CHECK (plan IN ('starter', 'pro', 'enterprise')),
  monthly_limit INTEGER DEFAULT 10000,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_id);

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'organizations' AND policyname = 'Org owners can read own org'
  ) THEN
    CREATE POLICY "Org owners can read own org"
      ON organizations FOR SELECT
      USING (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'organizations' AND policyname = 'Org owners can update own org'
  ) THEN
    CREATE POLICY "Org owners can update own org"
      ON organizations FOR UPDATE
      USING (auth.uid() = owner_id)
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'organizations' AND policyname = 'Authenticated users can create orgs'
  ) THEN
    CREATE POLICY "Authenticated users can create orgs"
      ON organizations FOR INSERT
      WITH CHECK (auth.uid() = owner_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'organizations' AND policyname = 'Service role full access on organizations'
  ) THEN
    CREATE POLICY "Service role full access on organizations"
      ON organizations FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON organizations TO authenticated;
GRANT ALL ON organizations TO service_role;

DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
CREATE TRIGGER update_organizations_updated_at
  BEFORE UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();


-- =============================================================================
-- 13. API_KEYS TABLE (B2B API Key Management)
-- =============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,        -- SHA-256 of the actual key
  key_prefix TEXT NOT NULL,             -- First 12 chars for display (bw_live_xxxx)
  name TEXT DEFAULT 'Default',          -- User-assigned label
  monthly_count INTEGER DEFAULT 0,
  last_reset_at TIMESTAMPTZ DEFAULT date_trunc('month', NOW()),
  last_used_at TIMESTAMPTZ,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

-- Org owners can manage their own keys (via org ownership)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'api_keys' AND policyname = 'Org owners can read own keys'
  ) THEN
    CREATE POLICY "Org owners can read own keys"
      ON api_keys FOR SELECT
      USING (
        org_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'api_keys' AND policyname = 'Org owners can create keys'
  ) THEN
    CREATE POLICY "Org owners can create keys"
      ON api_keys FOR INSERT
      WITH CHECK (
        org_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'api_keys' AND policyname = 'Org owners can update own keys'
  ) THEN
    CREATE POLICY "Org owners can update own keys"
      ON api_keys FOR UPDATE
      USING (
        org_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid())
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'api_keys' AND policyname = 'Service role full access on api_keys'
  ) THEN
    CREATE POLICY "Service role full access on api_keys"
      ON api_keys FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON api_keys TO authenticated;
GRANT ALL ON api_keys TO service_role;


-- =============================================================================
-- 14. API_USAGE TABLE (Request Audit Log)
-- =============================================================================

CREATE TABLE IF NOT EXISTS api_usage (
  id BIGSERIAL PRIMARY KEY,
  key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT DEFAULT 'GET',
  status_code INTEGER,
  response_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_key_date ON api_usage(key_id, created_at DESC);

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

-- Org owners can read usage for their own keys
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'api_usage' AND policyname = 'Org owners can read own usage'
  ) THEN
    CREATE POLICY "Org owners can read own usage"
      ON api_usage FOR SELECT
      USING (
        key_id IN (
          SELECT ak.id FROM api_keys ak
          JOIN organizations o ON ak.org_id = o.id
          WHERE o.owner_id = auth.uid()
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'api_usage' AND policyname = 'Service role full access on api_usage'
  ) THEN
    CREATE POLICY "Service role full access on api_usage"
      ON api_usage FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;

GRANT SELECT ON api_usage TO authenticated;
GRANT ALL ON api_usage TO service_role;
GRANT USAGE, SELECT ON SEQUENCE api_usage_id_seq TO service_role;


-- =============================================================================
-- 15. AI CONGRESS SIMULATION TABLES
-- =============================================================================

-- AI Congress Sessions — each run produces one session with ~25 bills
CREATE TABLE IF NOT EXISTS ai_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed')),
  error_message TEXT,             -- sanitized only, never raw API errors
  summary TEXT,
  bills_passed INTEGER DEFAULT 0,
  bills_failed INTEGER DEFAULT 0,
  total_bills INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI Bills within a session
CREATE TABLE IF NOT EXISTS ai_bills (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  issue TEXT NOT NULL,
  provisions JSONB DEFAULT '[]',
  estimated_cost TEXT,
  affected_groups TEXT,
  -- House vote
  house_yea INTEGER,
  house_nay INTEGER,
  house_passed BOOLEAN,
  house_arguments_for JSONB DEFAULT '[]',
  house_arguments_against JSONB DEFAULT '[]',
  -- Senate vote
  senate_yea INTEGER,
  senate_nay INTEGER,
  senate_passed BOOLEAN,
  senate_cloture_required BOOLEAN DEFAULT FALSE,
  senate_cloture_votes INTEGER,
  senate_arguments_for JSONB DEFAULT '[]',
  senate_arguments_against JSONB DEFAULT '[]',
  -- Outcome
  passed BOOLEAN DEFAULT FALSE,   -- house_passed AND senate_passed
  surprise_rationale TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_bills_session ON ai_bills(session_id);

ALTER TABLE ai_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_bills ENABLE ROW LEVEL SECURITY;

-- Public read access (this is generated content, not user data)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_sessions' AND policyname = 'AI sessions are viewable by everyone'
  ) THEN
    CREATE POLICY "AI sessions are viewable by everyone"
      ON ai_sessions FOR SELECT
      USING (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'ai_bills' AND policyname = 'AI bills are viewable by everyone'
  ) THEN
    CREATE POLICY "AI bills are viewable by everyone"
      ON ai_bills FOR SELECT
      USING (true);
  END IF;
END $$;

-- Write access: Vercel API route uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS.
-- No INSERT/UPDATE policies needed for the anon key — only the service role writes.
GRANT SELECT ON ai_sessions TO anon;
GRANT SELECT ON ai_bills TO anon;
GRANT ALL ON ai_sessions TO service_role;
GRANT ALL ON ai_bills TO service_role;
