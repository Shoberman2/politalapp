-- =============================================================================
-- Migration 005: Add bill_explanations table for AI-generated explanations
-- =============================================================================
-- Persistent cache for the plain-English bill explanations rendered on
-- BillDetail (and the inline expand on VoteDashboard / VotingHistory).
--
-- Before this migration the explanation was generated client-side on every
-- page view (or cached only in the user's localStorage). The OpenAI key was
-- shipped in the browser bundle via VITE_OPENAI_API_KEY.
--
-- This table backs the `explain-bill` Edge Function, which moves the OpenAI
-- call server-side. Cache key is composite: (bill_key, model, prompt_version)
-- so we can bump prompt_version to invalidate without dropping rows.
--
-- Safe to re-run.
-- =============================================================================


-- -----------------------------------------------------------------------------
-- STEP 1: Create the table
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS bill_explanations (
  -- Composite identity. bill_key is "{congress}-{billType}-{number}" lowercased,
  -- e.g. "119-hr-1234".
  bill_key TEXT NOT NULL,

  -- The model the explanation was generated with. Different models can coexist.
  model TEXT NOT NULL,

  -- Bump this in the Edge Function when the prompt changes. Old rows stay
  -- around but are ignored by lookups.
  prompt_version INT NOT NULL,

  -- The bill title at the time the explanation was generated. Useful for
  -- audit / debug; not part of the cache key.
  bill_title TEXT,

  -- The first paragraph (used for short previews).
  explanation TEXT NOT NULL,

  -- All paragraphs, in order, as JSON array of strings.
  paragraphs JSONB NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  PRIMARY KEY (bill_key, model, prompt_version)
);

-- Lookup index — the function does SELECT ... WHERE bill_key = $1 AND model = $2 AND prompt_version = $3
-- The PRIMARY KEY already covers this; no extra index needed.


-- -----------------------------------------------------------------------------
-- STEP 2: RLS + grants
-- -----------------------------------------------------------------------------
-- Explanations are public data (the bills themselves are public). anon role
-- can SELECT but not INSERT — only the Edge Function (running with
-- service_role) can write.

ALTER TABLE bill_explanations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'bill_explanations' AND policyname = 'Bill explanations are viewable by everyone'
  ) THEN
    CREATE POLICY "Bill explanations are viewable by everyone"
      ON bill_explanations FOR SELECT
      USING (true);
  END IF;
END $$;

GRANT SELECT ON bill_explanations TO anon;
GRANT ALL    ON bill_explanations TO service_role;
