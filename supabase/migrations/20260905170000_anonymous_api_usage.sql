-- Anonymous API access and free keys.
--
-- Production never had the B2B API tables from supabase/schema.sql
-- (organizations, api_keys, api_usage), so this migration creates them when
-- missing, then applies the anonymous-usage changes for databases that
-- already had them:
--   * api_usage.key_id becomes nullable and gains ip_hash (salted SHA-256 of
--     the caller IP) so unauthenticated requests are still counted.
--   * organizations.plan allows 'free' (self-serve, no Stripe), limited per
--     minute in api/_lib/auth.js rather than per month.
-- Everything here is idempotent.

-- ---------------------------------------------------------------------------
-- 1. organizations
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  stripe_customer_id TEXT,
  subscription_status TEXT DEFAULT 'inactive'
    CHECK (subscription_status IN ('active', 'inactive', 'canceled', 'past_due')),
  subscription_id TEXT,
  plan TEXT DEFAULT 'starter'
    CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  monthly_limit INTEGER DEFAULT 10000,
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_organizations_owner ON organizations(owner_id);
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'organizations' AND policyname = 'Org owners can read own org') THEN
    CREATE POLICY "Org owners can read own org" ON organizations FOR SELECT USING (auth.uid() = owner_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'organizations' AND policyname = 'Org owners can update own org') THEN
    CREATE POLICY "Org owners can update own org" ON organizations FOR UPDATE USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'organizations' AND policyname = 'Authenticated users can create orgs') THEN
    CREATE POLICY "Authenticated users can create orgs" ON organizations FOR INSERT WITH CHECK (auth.uid() = owner_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'organizations' AND policyname = 'Service role full access on organizations') THEN
    CREATE POLICY "Service role full access on organizations" ON organizations FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON organizations TO authenticated;
GRANT ALL ON organizations TO service_role;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    DROP TRIGGER IF EXISTS update_organizations_updated_at ON organizations;
    CREATE TRIGGER update_organizations_updated_at
      BEFORE UPDATE ON organizations
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- Existing databases: widen the plan check to include 'free'.
DO $$
DECLARE c RECORD;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'organizations'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%plan%'
  LOOP
    EXECUTE format('ALTER TABLE organizations DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_plan_check
  CHECK (plan IN ('free', 'starter', 'pro', 'enterprise'));

-- ---------------------------------------------------------------------------
-- 2. api_keys
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  name TEXT DEFAULT 'Default',
  monthly_count INTEGER DEFAULT 0,
  last_reset_at TIMESTAMPTZ DEFAULT date_trunc('month', NOW()),
  last_used_at TIMESTAMPTZ,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_api_keys_org ON api_keys(org_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'api_keys' AND policyname = 'Org owners can read own keys') THEN
    CREATE POLICY "Org owners can read own keys" ON api_keys FOR SELECT
      USING (org_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'api_keys' AND policyname = 'Org owners can create keys') THEN
    CREATE POLICY "Org owners can create keys" ON api_keys FOR INSERT
      WITH CHECK (org_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'api_keys' AND policyname = 'Org owners can update own keys') THEN
    CREATE POLICY "Org owners can update own keys" ON api_keys FOR UPDATE
      USING (org_id IN (SELECT id FROM organizations WHERE owner_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'api_keys' AND policyname = 'Service role full access on api_keys') THEN
    CREATE POLICY "Service role full access on api_keys" ON api_keys FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE ON api_keys TO authenticated;
GRANT ALL ON api_keys TO service_role;

-- ---------------------------------------------------------------------------
-- 3. api_usage (key_id nullable, ip_hash for anonymous requests)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_usage (
  id BIGSERIAL PRIMARY KEY,
  key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
  ip_hash TEXT,
  endpoint TEXT NOT NULL,
  method TEXT DEFAULT 'GET',
  status_code INTEGER,
  response_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE api_usage ALTER COLUMN key_id DROP NOT NULL;
ALTER TABLE api_usage ADD COLUMN IF NOT EXISTS ip_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_api_usage_key_date ON api_usage(key_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_usage_ip_hash_date
  ON api_usage (ip_hash, created_at DESC)
  WHERE ip_hash IS NOT NULL;

COMMENT ON COLUMN api_usage.ip_hash IS 'SHA-256 of salt:ip, first 32 hex chars; set only for anonymous requests';

ALTER TABLE api_usage ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'api_usage' AND policyname = 'Org owners can read own usage') THEN
    CREATE POLICY "Org owners can read own usage" ON api_usage FOR SELECT
      USING (key_id IN (
        SELECT ak.id FROM api_keys ak
        JOIN organizations o ON ak.org_id = o.id
        WHERE o.owner_id = auth.uid()
      ));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'api_usage' AND policyname = 'Service role full access on api_usage') THEN
    CREATE POLICY "Service role full access on api_usage" ON api_usage FOR ALL USING (auth.role() = 'service_role');
  END IF;
END $$;

GRANT SELECT ON api_usage TO authenticated;
GRANT ALL ON api_usage TO service_role;
GRANT USAGE, SELECT ON SEQUENCE api_usage_id_seq TO service_role;
