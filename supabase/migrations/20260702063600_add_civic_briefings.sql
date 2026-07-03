-- =============================================================================
-- Civic Briefings: paid user preferences + Gmail delivery connection
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.civic_briefing_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target TEXT NOT NULL CHECK (char_length(trim(target)) BETWEEN 2 AND 160),
  target_kind TEXT NOT NULL DEFAULT 'candidate'
    CHECK (target_kind IN ('candidate', 'district')),
  frequency TEXT NOT NULL DEFAULT 'weekly'
    CHECK (frequency IN ('daily', 'weekly')),
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  neutral_tone BOOLEAN NOT NULL DEFAULT TRUE,
  source_links BOOLEAN NOT NULL DEFAULT TRUE,
  last_generated_at TIMESTAMPTZ,
  last_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS civic_briefing_preferences_user_target_idx
  ON public.civic_briefing_preferences (user_id, lower(target));

CREATE INDEX IF NOT EXISTS civic_briefing_preferences_due_idx
  ON public.civic_briefing_preferences (email_enabled, frequency, last_sent_at);

CREATE TABLE IF NOT EXISTS public.civic_briefing_gmail_connections (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  gmail_email TEXT CHECK (gmail_email IS NULL OR char_length(gmail_email) <= 320),
  access_token_ciphertext TEXT,
  refresh_token_ciphertext TEXT,
  scope TEXT,
  token_type TEXT,
  expiry_date TIMESTAMPTZ,
  connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.civic_briefing_gmail_states (
  state TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  redirect_to TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS civic_briefing_gmail_states_user_idx
  ON public.civic_briefing_gmail_states (user_id, created_at DESC);

ALTER TABLE public.civic_briefing_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.civic_briefing_gmail_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.civic_briefing_gmail_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own briefing preferences"
  ON public.civic_briefing_preferences;
CREATE POLICY "Users can read own briefing preferences"
  ON public.civic_briefing_preferences
  FOR SELECT
  TO authenticated
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert own briefing preferences"
  ON public.civic_briefing_preferences;
CREATE POLICY "Users can insert own briefing preferences"
  ON public.civic_briefing_preferences
  FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update own briefing preferences"
  ON public.civic_briefing_preferences;
CREATE POLICY "Users can update own briefing preferences"
  ON public.civic_briefing_preferences
  FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete own briefing preferences"
  ON public.civic_briefing_preferences;
CREATE POLICY "Users can delete own briefing preferences"
  ON public.civic_briefing_preferences
  FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- OAuth tokens and one-time OAuth states are intentionally server-only.
-- Service-role API handlers bypass RLS; browser roles receive no table grant.
DROP POLICY IF EXISTS "No public API access"
  ON public.civic_briefing_gmail_connections;
CREATE POLICY "No public API access"
  ON public.civic_briefing_gmail_connections
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

DROP POLICY IF EXISTS "No public API access"
  ON public.civic_briefing_gmail_states;
CREATE POLICY "No public API access"
  ON public.civic_briefing_gmail_states
  FOR ALL
  TO public
  USING (false)
  WITH CHECK (false);

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.civic_briefing_preferences
  TO authenticated;

REVOKE ALL
  ON TABLE public.civic_briefing_gmail_connections,
           public.civic_briefing_gmail_states
  FROM anon, authenticated;

GRANT ALL
  ON TABLE public.civic_briefing_preferences,
           public.civic_briefing_gmail_connections,
           public.civic_briefing_gmail_states
  TO service_role;

DROP TRIGGER IF EXISTS update_civic_briefing_preferences_updated_at
  ON public.civic_briefing_preferences;
CREATE TRIGGER update_civic_briefing_preferences_updated_at
  BEFORE UPDATE ON public.civic_briefing_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_civic_briefing_gmail_connections_updated_at
  ON public.civic_briefing_gmail_connections;
CREATE TRIGGER update_civic_briefing_gmail_connections_updated_at
  BEFORE UPDATE ON public.civic_briefing_gmail_connections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
