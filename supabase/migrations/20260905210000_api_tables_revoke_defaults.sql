-- Supabase's default privileges granted ALL on the new B2B API tables to
-- anon and authenticated when 20260905170000 created them; RLS was the only
-- thing standing in the way. Remove what the client never needs so the
-- grants match the intent stated in 20260905190000: anon has nothing, and
-- authenticated has SELECT plus the column-level INSERT/UPDATE granted there.
REVOKE ALL ON organizations, api_keys, api_usage FROM anon;
REVOKE DELETE, TRUNCATE, REFERENCES, TRIGGER ON organizations, api_keys, api_usage FROM authenticated;
REVOKE INSERT, UPDATE ON api_usage FROM authenticated;
