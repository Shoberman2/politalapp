-- One organization per owner. Both the client (ApiKeyManager) and the free
-- plan route look up "the" organization for a user; without this, two
-- concurrent first requests could create two. The table was created today
-- and holds no duplicates, so the index applies cleanly.
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_owner_unique ON organizations(owner_id);
