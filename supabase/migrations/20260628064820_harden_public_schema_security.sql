-- =============================================================================
-- Migration: Harden public schema security
-- =============================================================================
-- Supabase advisor cleanup:
--   - Remove accidental broad anon/authenticated grants from existing objects.
--   - Opt out of broad default grants for future public objects.
--   - Add explicit deny policies for service-role-only tables so RLS intent is
--     visible to the linter and to future maintainers.
--   - Convert public views to security_invoker on PG15+.
--   - Pin function search_path and remove direct public EXECUTE on trigger-only
--     functions.
-- =============================================================================

-- Future objects should be opt-in for the Data API. Existing public-read tables
-- still get explicit SELECT grants below.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE USAGE, SELECT ON SEQUENCES FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Existing objects inherited very broad grants from older Supabase defaults.
-- Start from no anon/auth access, then grant only the access model the app uses.
REVOKE ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

GRANT SELECT ON TABLE
  public.ai_bills,
  public.ai_sessions,
  public.bill_articles,
  public.bill_committee_routings,
  public.bill_cosponsors,
  public.bill_explanations,
  public.bill_path_explanations,
  public.bills,
  public.committee_survival_stats,
  public.congress_metadata,
  public.etl_metadata,
  public.member_congress_terms,
  public.member_id_aliases,
  public.member_stats,
  public.politician_vote_summary,
  public.politicians,
  public.recent_votes_with_details,
  public.roll_call_stats,
  public.roll_calls,
  public.senate_desk_assignments,
  public.senate_desk_lineage,
  public.senate_desks,
  public.votes
TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.user_favorites TO authenticated;
GRANT INSERT ON TABLE public.vote_alert_subscribers TO anon, authenticated;

GRANT USAGE ON SEQUENCE public.user_favorites_id_seq TO authenticated;
GRANT USAGE ON SEQUENCE public.vote_alert_subscribers_id_seq TO anon, authenticated;

GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Public views should obey the RLS policies of their underlying tables.
ALTER VIEW public.politician_vote_summary SET (security_invoker = true);
ALTER VIEW public.recent_votes_with_details SET (security_invoker = true);

-- Service-role writes bypass RLS; these broad public policies are unnecessary
-- and were correctly flagged as overly permissive.
DROP POLICY IF EXISTS "Service write etl_metadata" ON public.etl_metadata;
DROP POLICY IF EXISTS "Service write member_stats" ON public.member_stats;

-- Keep anonymous vote-alert signup open, but make the policy data-dependent so
-- it is not an unconditional INSERT bypass.
DROP POLICY IF EXISTS "anon can subscribe" ON public.vote_alert_subscribers;
CREATE POLICY "anon can subscribe"
  ON public.vote_alert_subscribers
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    email IS NOT NULL
    AND char_length(email) BETWEEN 3 AND 320
    AND position('@' IN email) > 1
    AND (source IS NULL OR char_length(source) <= 100)
  );

-- Service-role-only tables: no browser/API access. The service_role bypasses
-- RLS for ETL, Edge Functions, and serverless jobs using the service key.
DROP POLICY IF EXISTS "No public API access" ON public.backfill_errors;
CREATE POLICY "No public API access"
  ON public.backfill_errors
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "No public API access" ON public.backfill_state;
CREATE POLICY "No public API access"
  ON public.backfill_state
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "No public API access" ON public.feature_metrics;
CREATE POLICY "No public API access"
  ON public.feature_metrics
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "No public API access" ON public.member_reconciliation_log;
CREATE POLICY "No public API access"
  ON public.member_reconciliation_log
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "No public API access" ON public.narration_cache;
CREATE POLICY "No public API access"
  ON public.narration_cache
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "No public API access" ON public.state_bill_explanations;
CREATE POLICY "No public API access"
  ON public.state_bill_explanations
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "No public API access" ON public.unknown_committee_codes;
CREATE POLICY "No public API access"
  ON public.unknown_committee_codes
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

-- Remove duplicated public-read policies where later migrations added aliases.
DROP POLICY IF EXISTS "Public read bills" ON public.bills;
DROP POLICY IF EXISTS "Public read politicians" ON public.politicians;
DROP POLICY IF EXISTS "Public read votes" ON public.votes;

-- User-owned tables: scope policies to authenticated users and use initplans
-- for auth.uid() so policies are not re-evaluated per row.
DROP POLICY IF EXISTS "Service role full access on profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

ALTER POLICY "Users can read own profile"
  ON public.profiles
  TO authenticated
  USING ((select auth.uid()) = id);

ALTER POLICY "Users can insert own profile"
  ON public.profiles
  TO authenticated
  WITH CHECK ((select auth.uid()) = id);

ALTER POLICY "Users can update own profile"
  ON public.profiles
  TO authenticated
  USING ((select auth.uid()) = id)
  WITH CHECK ((select auth.uid()) = id);

ALTER POLICY "Users can view own favorites"
  ON public.user_favorites
  TO authenticated
  USING ((select auth.uid()) = user_id);

ALTER POLICY "Users can insert own favorites"
  ON public.user_favorites
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users can delete own favorites"
  ON public.user_favorites
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Advisor cleanup for mutable search_path.
ALTER FUNCTION public.get_politician_votes(text, integer)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.get_representatives(text, text)
  SET search_path = public, pg_temp;

ALTER FUNCTION public.handle_new_user()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.sync_politician_from_terms()
  SET search_path = public, pg_temp;

ALTER FUNCTION public.update_updated_at_column()
  SET search_path = public, pg_temp;

-- Trigger-only helpers must not be callable through public RPC endpoints.
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_politician_from_terms() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_updated_at_column() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.handle_new_user() TO service_role;
GRANT EXECUTE ON FUNCTION public.sync_politician_from_terms() TO service_role;
GRANT EXECUTE ON FUNCTION public.update_updated_at_column() TO service_role;

-- Public read RPCs remain callable, but not through PUBLIC's implicit grant.
REVOKE EXECUTE ON FUNCTION public.get_politician_votes(text, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_representatives(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_politician_votes(text, integer) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_representatives(text, text) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
