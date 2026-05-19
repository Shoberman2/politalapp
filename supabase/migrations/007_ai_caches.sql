-- =============================================================================
-- Migration 007: server-side caches for narrate-votes + explain-state-bill
-- =============================================================================
-- Both Edge Functions previously ran the OpenAI call on every invocation. This
-- migration adds shared caches keyed on the canonical inputs so identical
-- requests across users hit the cache.
--
-- narration_cache: vote-narration batches keyed by a SHA-256 of the canonical
--   items array. Many users viewing the same politician at the same moment
--   send the same items list (deterministic ranking), so the cache key is
--   shared across users.
--
-- state_bill_explanations: per-bill explanations keyed by LegiScan bill_id.
-- =============================================================================


-- 1. narration_cache
-- =============================================================================
CREATE TABLE IF NOT EXISTS narration_cache (
  cache_key TEXT NOT NULL,            -- SHA-256 hex of canonical(items)
  model TEXT NOT NULL,
  prompt_version INT NOT NULL,
  narrations JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (cache_key, model, prompt_version)
);

ALTER TABLE narration_cache ENABLE ROW LEVEL SECURITY;
GRANT ALL ON narration_cache TO service_role;
-- No anon GRANT — the Edge Function reads/writes with the service role.


-- 2. state_bill_explanations
-- =============================================================================
CREATE TABLE IF NOT EXISTS state_bill_explanations (
  bill_id TEXT NOT NULL,              -- LegiScan bill_id (globally unique)
  state TEXT,
  bill_title TEXT,
  model TEXT NOT NULL,
  prompt_version INT NOT NULL,
  paragraphs JSONB NOT NULL,
  generated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (bill_id, model, prompt_version)
);

ALTER TABLE state_bill_explanations ENABLE ROW LEVEL SECURITY;
GRANT ALL ON state_bill_explanations TO service_role;
