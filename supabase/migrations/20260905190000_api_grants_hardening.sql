-- Harden the B2B API tables that 20260905170000 first created in production.
--
-- Before: authenticated users had table-wide INSERT and UPDATE on
-- organizations and api_keys, and an owner-scoped UPDATE policy. Any signed-in
-- user could therefore write plan = 'enterprise', subscription_status =
-- 'active', monthly_limit = 0 on their own organization (or insert one that
-- way) and the API would honor it as an unlimited paid plan. Nothing in the
-- client needs those columns: ApiKeyManager inserts an organization with only
-- name and owner_id, and only ever sets api_keys.active = false. Plan changes
-- go through the service role (Stripe webhook, api/keys/free.js).
--
-- After: column-level INSERT on organizations (name, owner_id), no client
-- UPDATE on organizations at all, and api_keys writes limited to the columns
-- the client actually uses. Also: owners cascade on auth user deletion, and
-- the redundant single-column index on api_keys.key_hash (already UNIQUE) is
-- dropped. Idempotent.

REVOKE INSERT, UPDATE ON organizations FROM authenticated;
GRANT INSERT (name, owner_id) ON organizations TO authenticated;
DROP POLICY IF EXISTS "Org owners can update own org" ON organizations;

REVOKE INSERT, UPDATE ON api_keys FROM authenticated;
GRANT INSERT (org_id, key_hash, key_prefix, name) ON api_keys TO authenticated;
GRANT UPDATE (active, name) ON api_keys TO authenticated;

-- Deleting an auth user must not fail on the organization they own.
ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_owner_id_fkey;
ALTER TABLE organizations
  ADD CONSTRAINT organizations_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- key_hash is UNIQUE, which already carries a btree index.
DROP INDEX IF EXISTS idx_api_keys_hash;
