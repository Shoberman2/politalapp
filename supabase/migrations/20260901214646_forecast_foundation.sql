-- =============================================================================
-- Congressional vote forecasting: fail-closed data foundation (A0)
-- =============================================================================
-- This migration intentionally does not create predictions or public forecast
-- APIs. It establishes the append-only parser/provenance records and the one
-- atomic path by which a historical roll call can become training-eligible.

ALTER TABLE public.roll_calls
  ADD COLUMN IF NOT EXISTS member_votes_complete_at TIMESTAMPTZ;

COMMENT ON COLUMN public.roll_calls.member_votes_complete_at IS
  'Set only by persist_historical_roll_call after attribution, identity, and source-tally checks pass in the same transaction.';

ALTER TABLE public.backfill_state
  ADD COLUMN IF NOT EXISTS checkpoint JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_member_congress_terms_effective_member
  ON public.member_congress_terms (bioguide_id, chamber, term_start, term_end);

CREATE TABLE public.bill_event_target_parses (
  event_id UUID NOT NULL REFERENCES public.bill_events(id) ON DELETE RESTRICT,
  parser_version TEXT NOT NULL CHECK (btrim(parser_version) <> ''),
  raw_target_text TEXT,
  normalized_target_text TEXT,
  forecast_target TEXT NOT NULL CHECK (
    forecast_target IN (
      'final_passage', 'suspend_and_pass', 'cloture',
      'motion_to_proceed', 'other_procedural', 'unknown'
    )
  ),
  threshold_rule TEXT,
  parse_confidence NUMERIC NOT NULL CHECK (parse_confidence BETWEEN 0 AND 1),
  unsupported_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, parser_version)
);

CREATE TABLE public.roll_call_target_parses (
  roll_call_id TEXT NOT NULL REFERENCES public.roll_calls(id) ON DELETE RESTRICT,
  parser_version TEXT NOT NULL CHECK (btrim(parser_version) <> ''),
  raw_target_text TEXT,
  normalized_target_text TEXT,
  forecast_target TEXT NOT NULL CHECK (
    forecast_target IN (
      'final_passage', 'suspend_and_pass', 'cloture',
      'motion_to_proceed', 'other_procedural', 'unknown'
    )
  ),
  threshold_rule TEXT,
  parse_confidence NUMERIC NOT NULL CHECK (parse_confidence BETWEEN 0 AND 1),
  unsupported_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (roll_call_id, parser_version)
);

CREATE INDEX idx_roll_call_target_parses_target
  ON public.roll_call_target_parses (forecast_target, parser_version);

CREATE TABLE public.forecast_feature_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_event_id UUID REFERENCES public.bill_events(id) ON DELETE RESTRICT,
  roll_call_id TEXT REFERENCES public.roll_calls(id) ON DELETE RESTRICT,
  feature_schema_version TEXT NOT NULL CHECK (btrim(feature_schema_version) <> ''),
  feature_cutoff_at TIMESTAMPTZ NOT NULL,
  cutoff_quality TEXT NOT NULL CHECK (
    cutoff_quality IN ('official_schedule', 'synthetic_conservative')
  ),
  canonical_event_features JSONB NOT NULL,
  event_source_revisions JSONB NOT NULL,
  event_sha256 TEXT NOT NULL CHECK (event_sha256 ~ '^[0-9a-f]{64}$'),
  roster_sha256 TEXT NOT NULL CHECK (roster_sha256 ~ '^[0-9a-f]{64}$'),
  row_count INTEGER NOT NULL CHECK (row_count > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK ((source_event_id IS NULL) <> (roll_call_id IS NULL))
);

CREATE UNIQUE INDEX idx_forecast_feature_snapshots_event
  ON public.forecast_feature_snapshots (source_event_id, feature_schema_version)
  WHERE source_event_id IS NOT NULL;
CREATE UNIQUE INDEX idx_forecast_feature_snapshots_roll_call
  ON public.forecast_feature_snapshots (roll_call_id, feature_schema_version)
  WHERE roll_call_id IS NOT NULL;

CREATE TABLE public.forecast_feature_rows (
  snapshot_id UUID NOT NULL
    REFERENCES public.forecast_feature_snapshots(id) ON DELETE RESTRICT,
  politician_id TEXT NOT NULL REFERENCES public.politicians(id) ON DELETE RESTRICT,
  canonical_member_features JSONB NOT NULL,
  member_source_revisions JSONB NOT NULL,
  row_sha256 TEXT NOT NULL CHECK (row_sha256 ~ '^[0-9a-f]{64}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (snapshot_id, politician_id)
);

-- Parser outputs and training snapshots are evidence, not mutable caches.
CREATE OR REPLACE FUNCTION public.reject_forecast_append_only_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER bill_event_target_parses_append_only
  BEFORE UPDATE OR DELETE ON public.bill_event_target_parses
  FOR EACH ROW EXECUTE FUNCTION public.reject_forecast_append_only_mutation();
CREATE TRIGGER roll_call_target_parses_append_only
  BEFORE UPDATE OR DELETE ON public.roll_call_target_parses
  FOR EACH ROW EXECUTE FUNCTION public.reject_forecast_append_only_mutation();
CREATE TRIGGER forecast_feature_snapshots_append_only
  BEFORE UPDATE OR DELETE ON public.forecast_feature_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.reject_forecast_append_only_mutation();
CREATE TRIGGER forecast_feature_rows_append_only
  BEFORE UPDATE OR DELETE ON public.forecast_feature_rows
  FOR EACH ROW EXECUTE FUNCTION public.reject_forecast_append_only_mutation();
CREATE TRIGGER bill_event_target_parses_no_truncate
  BEFORE TRUNCATE ON public.bill_event_target_parses
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_forecast_append_only_mutation();
CREATE TRIGGER roll_call_target_parses_no_truncate
  BEFORE TRUNCATE ON public.roll_call_target_parses
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_forecast_append_only_mutation();
CREATE TRIGGER forecast_feature_snapshots_no_truncate
  BEFORE TRUNCATE ON public.forecast_feature_snapshots
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_forecast_append_only_mutation();
CREATE TRIGGER forecast_feature_rows_no_truncate
  BEFORE TRUNCATE ON public.forecast_feature_rows
  FOR EACH STATEMENT EXECUTE FUNCTION public.reject_forecast_append_only_mutation();

-- Canonical JSON bytes shared by the database-side hash verifier. V1 feature
-- values are limited to strings and integers, avoiding cross-runtime numeric
-- representation differences between PostgreSQL and JavaScript.
CREATE OR REPLACE FUNCTION public.forecast_canonical_jsonb_text(p_value JSONB)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = ''
AS $$
DECLARE
  v_type TEXT := jsonb_typeof(p_value);
  v_result TEXT;
BEGIN
  IF v_type IN ('null', 'boolean', 'number', 'string') THEN
    RETURN p_value::TEXT;
  ELSIF v_type = 'array' THEN
    SELECT '[' || COALESCE(string_agg(
      public.forecast_canonical_jsonb_text(item.value),
      ',' ORDER BY item.ordinality
    ), '') || ']'
    INTO v_result
    FROM jsonb_array_elements(p_value) WITH ORDINALITY AS item(value, ordinality);
    RETURN v_result;
  ELSIF v_type = 'object' THEN
    SELECT '{' || COALESCE(string_agg(
      to_jsonb(item.key)::TEXT || ':' || public.forecast_canonical_jsonb_text(item.value),
      ',' ORDER BY item.key COLLATE "C"
    ), '') || '}'
    INTO v_result
    FROM jsonb_each(p_value) AS item(key, value);
    RETURN v_result;
  END IF;

  RAISE EXCEPTION 'unsupported canonical JSON type %', v_type;
END;
$$;

-- Persist one complete roll call and its fenced cursor advance atomically.
-- Any exception rolls back every write, including the backfill checkpoint.
CREATE OR REPLACE FUNCTION public.persist_historical_roll_call(
  p_lease_key TEXT,
  p_holder TEXT,
  p_fence_token BIGINT,
  p_roll_call_id TEXT,
  p_bill_id TEXT,
  p_question TEXT,
  p_description TEXT,
  p_voted_at DATE,
  p_source_url TEXT,
  p_parser_version TEXT,
  p_raw_target_text TEXT,
  p_normalized_target_text TEXT,
  p_forecast_target TEXT,
  p_threshold_rule TEXT,
  p_parse_confidence NUMERIC,
  p_unsupported_reason TEXT,
  p_member_votes JSONB,
  p_expected_yea INTEGER,
  p_expected_nay INTEGER,
  p_expected_present INTEGER,
  p_expected_not_voting INTEGER,
  p_backfill_name TEXT,
  p_expected_previous_roll_call_id TEXT,
  p_checkpoint JSONB
)
RETURNS TABLE (
  persisted_roll_call_id TEXT,
  persisted_vote_count INTEGER,
  completed_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_input_count INTEGER;
  v_distinct_count INTEGER;
  v_bad_count INTEGER;
  v_yea INTEGER;
  v_nay INTEGER;
  v_present INTEGER;
  v_not_voting INTEGER;
  v_completed_at TIMESTAMPTZ;
  v_previous_roll_call_id TEXT;
  v_previous_lease_key TEXT;
  v_existing_parse public.roll_call_target_parses%ROWTYPE;
BEGIN
  IF NULLIF(btrim(p_backfill_name), '') IS NULL THEN
    RAISE EXCEPTION 'backfill name is required';
  END IF;

  -- Serialize by backfill identity even before a checkpoint row exists. This
  -- prevents separate valid lease keys from racing the same cursor.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('forecast-backfill:' || p_backfill_name, 0)
  );

  -- Lock the lease row so the fence cannot change during this transaction.
  PERFORM 1
  FROM public.etl_leases AS lease
  WHERE lease.lease_key = p_lease_key
    AND lease.holder = p_holder
    AND lease.fence_token = p_fence_token
    AND lease.expires_at > NOW()
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'stale or missing ETL lease' USING ERRCODE = '55000';
  END IF;

  IF p_roll_call_id IS NULL
    OR p_roll_call_id !~ '^(house|senate)-[0-9]+-[0-9]+-[0-9]+$'
    OR p_voted_at IS NULL
    OR p_source_url IS NULL
    OR p_source_url !~ '^https://'
    OR NULLIF(btrim(p_parser_version), '') IS NULL
    OR NULLIF(btrim(p_backfill_name), '') IS NULL
  THEN
    RAISE EXCEPTION 'roll-call identity, source, parser, and backfill name are required';
  END IF;

  IF p_checkpoint IS NULL OR jsonb_typeof(p_checkpoint) <> 'object' THEN
    RAISE EXCEPTION 'checkpoint must be a JSON object';
  END IF;

  SELECT
    state.checkpoint->>'last_roll_call_id',
    state.checkpoint->>'lease_key'
  INTO v_previous_roll_call_id, v_previous_lease_key
  FROM public.backfill_state AS state
  WHERE state.name = p_backfill_name
  FOR UPDATE;

  IF v_previous_lease_key IS NOT NULL
    AND v_previous_lease_key IS DISTINCT FROM p_lease_key
  THEN
    RAISE EXCEPTION 'backfill lease key mismatch: expected %, found %',
      v_previous_lease_key, p_lease_key
      USING ERRCODE = '55000';
  END IF;

  IF v_previous_roll_call_id IS DISTINCT FROM p_expected_previous_roll_call_id
    AND v_previous_roll_call_id IS DISTINCT FROM p_roll_call_id
  THEN
    RAISE EXCEPTION 'stale backfill checkpoint: expected %, found %',
      p_expected_previous_roll_call_id, v_previous_roll_call_id
      USING ERRCODE = '55000';
  END IF;

  IF p_bill_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.bills AS bill WHERE bill.id = p_bill_id)
  THEN
    RAISE EXCEPTION 'unknown bill %', p_bill_id;
  END IF;

  IF p_member_votes IS NULL
    OR jsonb_typeof(p_member_votes) <> 'array'
    OR jsonb_array_length(p_member_votes) = 0
  THEN
    RAISE EXCEPTION 'member votes must be a non-empty JSON array';
  END IF;

  SELECT
    COUNT(*)::INTEGER,
    COUNT(DISTINCT vote.item->>'politician_id')::INTEGER,
    COUNT(*) FILTER (
      WHERE jsonb_typeof(vote.item) <> 'object'
        OR NULLIF(btrim(vote.item->>'politician_id'), '') IS NULL
        OR vote.item->>'position' NOT IN ('Yea', 'Nay', 'Present', 'Not Voting')
    )::INTEGER,
    COUNT(*) FILTER (WHERE vote.item->>'position' = 'Yea')::INTEGER,
    COUNT(*) FILTER (WHERE vote.item->>'position' = 'Nay')::INTEGER,
    COUNT(*) FILTER (WHERE vote.item->>'position' = 'Present')::INTEGER,
    COUNT(*) FILTER (WHERE vote.item->>'position' = 'Not Voting')::INTEGER
  INTO
    v_input_count, v_distinct_count, v_bad_count,
    v_yea, v_nay, v_present, v_not_voting
  FROM jsonb_array_elements(p_member_votes) AS vote(item);

  IF v_bad_count > 0 OR v_input_count <> v_distinct_count THEN
    RAISE EXCEPTION 'member vote payload contains malformed or duplicate members';
  END IF;

  IF p_expected_yea IS NULL OR p_expected_nay IS NULL
    OR p_expected_present IS NULL OR p_expected_not_voting IS NULL
    OR LEAST(p_expected_yea, p_expected_nay, p_expected_present, p_expected_not_voting) < 0
    OR (v_yea, v_nay, v_present, v_not_voting) IS DISTINCT FROM
       (p_expected_yea, p_expected_nay, p_expected_present, p_expected_not_voting)
  THEN
    RAISE EXCEPTION 'source tally does not match member vote payload';
  END IF;

  -- Every member must exist and have exactly one effective term on vote day.
  SELECT COUNT(*)::INTEGER INTO v_bad_count
  FROM jsonb_array_elements(p_member_votes) AS vote(item)
  WHERE NOT EXISTS (
    SELECT 1 FROM public.politicians AS politician
    WHERE politician.id = vote.item->>'politician_id'
  ) OR 1 <> (
    SELECT COUNT(*)
    FROM public.member_congress_terms AS term
    WHERE term.bioguide_id = vote.item->>'politician_id'
      AND term.congress = split_part(p_roll_call_id, '-', 2)::INTEGER
      AND term.chamber = split_part(p_roll_call_id, '-', 1)
      AND term.term_start <= p_voted_at
      AND (term.term_end IS NULL OR term.term_end >= p_voted_at)
  );
  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'member identity or effective term attribution is unresolved';
  END IF;

  -- A House seat may have only one member in one roll-call payload.
  IF split_part(p_roll_call_id, '-', 1) = 'house' THEN
    SELECT COUNT(*)::INTEGER INTO v_bad_count
    FROM (
      SELECT term.state, term.district
      FROM jsonb_array_elements(p_member_votes) AS vote(item)
      JOIN public.member_congress_terms AS term
        ON term.bioguide_id = vote.item->>'politician_id'
       AND term.congress = split_part(p_roll_call_id, '-', 2)::INTEGER
       AND term.chamber = 'house'
       AND term.term_start <= p_voted_at
       AND (term.term_end IS NULL OR term.term_end >= p_voted_at)
      GROUP BY term.state, term.district
      HAVING COUNT(*) > 1
    ) AS duplicate_seats;
    IF v_bad_count > 0 THEN
      RAISE EXCEPTION 'duplicate House seat attribution in member vote payload';
    END IF;
  END IF;

  INSERT INTO public.roll_calls AS roll_call (
    id, bill_id, question, description, voted_at, updated_at
  ) VALUES (
    p_roll_call_id, p_bill_id, p_question, p_description, p_voted_at, NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    bill_id = COALESCE(roll_call.bill_id, EXCLUDED.bill_id),
    question = COALESCE(roll_call.question, EXCLUDED.question),
    description = COALESCE(roll_call.description, EXCLUDED.description),
    voted_at = COALESCE(roll_call.voted_at, EXCLUDED.voted_at),
    updated_at = NOW()
  WHERE (roll_call.bill_id IS NULL OR EXCLUDED.bill_id IS NULL OR roll_call.bill_id = EXCLUDED.bill_id)
    AND (roll_call.question IS NULL OR EXCLUDED.question IS NULL OR roll_call.question = EXCLUDED.question)
    AND (roll_call.description IS NULL OR EXCLUDED.description IS NULL OR roll_call.description = EXCLUDED.description)
    AND (roll_call.voted_at IS NULL OR roll_call.voted_at = EXCLUDED.voted_at);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'conflicting existing roll call %', p_roll_call_id;
  END IF;

  INSERT INTO public.roll_call_target_parses (
    roll_call_id, parser_version, raw_target_text, normalized_target_text,
    forecast_target, threshold_rule, parse_confidence, unsupported_reason
  ) VALUES (
    p_roll_call_id, p_parser_version, p_raw_target_text, p_normalized_target_text,
    p_forecast_target, p_threshold_rule, p_parse_confidence, p_unsupported_reason
  )
  ON CONFLICT (roll_call_id, parser_version) DO NOTHING;

  SELECT * INTO v_existing_parse
  FROM public.roll_call_target_parses AS parse
  WHERE parse.roll_call_id = p_roll_call_id
    AND parse.parser_version = p_parser_version;

  IF v_existing_parse.raw_target_text IS DISTINCT FROM p_raw_target_text
    OR v_existing_parse.normalized_target_text IS DISTINCT FROM p_normalized_target_text
    OR v_existing_parse.forecast_target IS DISTINCT FROM p_forecast_target
    OR v_existing_parse.threshold_rule IS DISTINCT FROM p_threshold_rule
    OR v_existing_parse.parse_confidence IS DISTINCT FROM p_parse_confidence
    OR v_existing_parse.unsupported_reason IS DISTINCT FROM p_unsupported_reason
  THEN
    RAISE EXCEPTION 'conflicting append-only target parse for %', p_roll_call_id;
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_bad_count
  FROM public.votes AS existing
  WHERE existing.roll_call_id = p_roll_call_id
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_member_votes) AS vote(item)
      WHERE vote.item->>'politician_id' = existing.politician_id
    );
  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'existing roll call contains members absent from source payload';
  END IF;

  SELECT COUNT(*)::INTEGER INTO v_bad_count
  FROM public.votes AS existing
  JOIN jsonb_array_elements(p_member_votes) AS vote(item)
    ON vote.item->>'politician_id' = existing.politician_id
  WHERE existing.roll_call_id = p_roll_call_id
    AND (
      existing.position IS DISTINCT FROM vote.item->>'position'
      OR existing.bill_id IS DISTINCT FROM p_bill_id
      OR existing.voted_at IS DISTINCT FROM p_voted_at
      OR existing.source_url IS DISTINCT FROM p_source_url
    );
  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'conflicting existing member vote for %', p_roll_call_id;
  END IF;

  INSERT INTO public.votes (
    politician_id, bill_id, roll_call_id, position, voted_at, source_url
  )
  SELECT
    vote.item->>'politician_id', p_bill_id, p_roll_call_id,
    vote.item->>'position', p_voted_at, p_source_url
  FROM jsonb_array_elements(p_member_votes) AS vote(item)
  ON CONFLICT (roll_call_id, politician_id) DO NOTHING;

  SELECT
    COUNT(*)::INTEGER,
    COUNT(*) FILTER (WHERE stored.position = 'Yea')::INTEGER,
    COUNT(*) FILTER (WHERE stored.position = 'Nay')::INTEGER,
    COUNT(*) FILTER (WHERE stored.position = 'Present')::INTEGER,
    COUNT(*) FILTER (WHERE stored.position = 'Not Voting')::INTEGER
  INTO v_distinct_count, v_yea, v_nay, v_present, v_not_voting
  FROM public.votes AS stored
  WHERE stored.roll_call_id = p_roll_call_id;

  IF (v_distinct_count, v_yea, v_nay, v_present, v_not_voting) IS DISTINCT FROM
     (v_input_count, p_expected_yea, p_expected_nay, p_expected_present, p_expected_not_voting)
  THEN
    RAISE EXCEPTION 'persisted roll-call tally failed final verification';
  END IF;

  UPDATE public.roll_calls AS roll_call
  SET member_votes_complete_at = COALESCE(roll_call.member_votes_complete_at, NOW()),
      updated_at = NOW()
  WHERE roll_call.id = p_roll_call_id
  RETURNING roll_call.member_votes_complete_at INTO v_completed_at;

  INSERT INTO public.backfill_state AS state (
    name, status, started_at, updated_at, checkpoint
  ) VALUES (
    p_backfill_name, 'running', NOW(), NOW(),
    p_checkpoint || jsonb_build_object(
      'last_roll_call_id', p_roll_call_id,
      'lease_key', p_lease_key,
      'fence_token', p_fence_token
    )
  )
  ON CONFLICT (name) DO UPDATE SET
    status = 'running',
    started_at = COALESCE(state.started_at, EXCLUDED.started_at),
    updated_at = NOW(),
    checkpoint = COALESCE(state.checkpoint, '{}'::jsonb)
      || EXCLUDED.checkpoint;

  RETURN QUERY SELECT p_roll_call_id, v_input_count, v_completed_at;
END;
$$;

-- Snapshot headers and member rows must become visible together. Direct table
-- inserts are withheld from service_role; this RPC derives row_count and
-- verifies the roster digest before committing either side of the relationship.
CREATE OR REPLACE FUNCTION public.persist_forecast_feature_snapshot(
  p_source_event_id UUID,
  p_roll_call_id TEXT,
  p_feature_schema_version TEXT,
  p_feature_cutoff_at TIMESTAMPTZ,
  p_cutoff_quality TEXT,
  p_canonical_event_features JSONB,
  p_event_source_revisions JSONB,
  p_event_sha256 TEXT,
  p_roster_sha256 TEXT,
  p_rows JSONB
)
RETURNS TABLE (
  snapshot_id UUID,
  persisted_row_count INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_snapshot_id UUID;
  v_input_count INTEGER;
  v_distinct_count INTEGER;
  v_bad_count INTEGER;
  v_stored_count INTEGER;
  v_calculated_event_sha TEXT;
  v_calculated_roster_sha TEXT;
  v_existing_snapshot public.forecast_feature_snapshots%ROWTYPE;
BEGIN
  IF (p_source_event_id IS NULL) = (p_roll_call_id IS NULL)
    OR p_feature_schema_version IS DISTINCT FROM 'forecast-features-v1'
    OR p_feature_cutoff_at IS NULL
    OR NOT pg_catalog.isfinite(p_feature_cutoff_at)
    OR p_cutoff_quality NOT IN ('official_schedule', 'synthetic_conservative')
    OR p_event_sha256 !~ '^[0-9a-f]{64}$'
    OR p_roster_sha256 !~ '^[0-9a-f]{64}$'
  THEN
    RAISE EXCEPTION 'snapshot identity, schema, cutoff, quality, and hashes are required';
  END IF;

  IF p_canonical_event_features IS NULL
    OR jsonb_typeof(p_canonical_event_features) <> 'object'
    OR p_event_source_revisions IS NULL
    OR jsonb_typeof(p_event_source_revisions) <> 'array'
    OR (
      p_canonical_event_features <> '{}'::jsonb
      AND jsonb_array_length(p_event_source_revisions) = 0
    )
  THEN
    RAISE EXCEPTION 'event features and source revisions are invalid';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_canonical_event_features) AS feature(key)
    WHERE feature.key NOT IN ('chamber', 'policyArea')
  ) OR (
    p_canonical_event_features ? 'chamber'
    AND (
      jsonb_typeof(p_canonical_event_features->'chamber') IS DISTINCT FROM 'string'
      OR p_canonical_event_features->>'chamber' NOT IN ('house', 'senate')
    )
  ) OR (
    p_canonical_event_features ? 'policyArea'
    AND (
      jsonb_typeof(p_canonical_event_features->'policyArea') IS DISTINCT FROM 'string'
      OR NULLIF(btrim(p_canonical_event_features->>'policyArea'), '') IS NULL
    )
  ) THEN
    RAISE EXCEPTION 'event feature schema is invalid';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_bad_count
  FROM jsonb_array_elements(p_event_source_revisions) AS source(item)
  WHERE CASE
    WHEN jsonb_typeof(source.item) <> 'object' THEN true
    ELSE
      (SELECT COUNT(*) FROM jsonb_object_keys(source.item)) <> 4
      OR NOT source.item ?& ARRAY['source', 'sourceUrl', 'availableAt', 'revisionId']
      OR jsonb_typeof(source.item->'source') IS DISTINCT FROM 'string'
      OR NULLIF(btrim(source.item->>'source'), '') IS NULL
      OR jsonb_typeof(source.item->'sourceUrl') IS DISTINCT FROM 'string'
      OR source.item->>'sourceUrl' !~ '^https://'
      OR jsonb_typeof(source.item->'availableAt') IS DISTINCT FROM 'string'
      OR NULLIF(btrim(source.item->>'availableAt'), '') IS NULL
      OR NOT pg_catalog.isfinite((source.item->>'availableAt')::TIMESTAMPTZ)
      OR (source.item->>'availableAt')::TIMESTAMPTZ > p_feature_cutoff_at
      OR jsonb_typeof(source.item->'revisionId') IS DISTINCT FROM 'string'
      OR NULLIF(btrim(source.item->>'revisionId'), '') IS NULL
  END;
  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'event source revisions are malformed or newer than the feature cutoff';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'snapshot rows must be a non-empty JSON array';
  END IF;

  SELECT
    COUNT(*)::INTEGER,
    COUNT(DISTINCT row.item->>'politician_id')::INTEGER,
    COUNT(*) FILTER (
      WHERE jsonb_typeof(row.item) <> 'object'
        OR NULLIF(btrim(row.item->>'politician_id'), '') IS NULL
        OR jsonb_typeof(row.item->'canonical_member_features') <> 'object'
        OR jsonb_typeof(row.item->'member_source_revisions') <> 'array'
        OR (
          row.item->'canonical_member_features' <> '{}'::jsonb
          AND jsonb_array_length(row.item->'member_source_revisions') = 0
        )
        OR row.item->>'row_sha256' !~ '^[0-9a-f]{64}$'
    )::INTEGER
  INTO v_input_count, v_distinct_count, v_bad_count
  FROM jsonb_array_elements(p_rows) AS row(item);

  IF v_bad_count > 0 OR v_input_count <> v_distinct_count THEN
    RAISE EXCEPTION 'snapshot rows contain malformed or duplicate members';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_bad_count
  FROM jsonb_array_elements(p_rows) AS row(item)
  WHERE EXISTS (
    SELECT 1
    FROM jsonb_object_keys(row.item->'canonical_member_features') AS feature(key)
    WHERE feature.key <> 'tenure'
  ) OR (
    row.item->'canonical_member_features' ? 'tenure'
    AND CASE
      WHEN jsonb_typeof(row.item->'canonical_member_features'->'tenure')
        IS DISTINCT FROM 'number'
      THEN true
      WHEN row.item->'canonical_member_features'->>'tenure' !~ '^[0-9]+$'
      THEN true
      ELSE (row.item->'canonical_member_features'->>'tenure')::NUMERIC
        > 9007199254740991
    END
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_array_elements(row.item->'member_source_revisions') AS source(item)
    WHERE CASE
      WHEN jsonb_typeof(source.item) <> 'object' THEN true
      ELSE
        (SELECT COUNT(*) FROM jsonb_object_keys(source.item)) <> 4
        OR NOT source.item ?& ARRAY['source', 'sourceUrl', 'availableAt', 'revisionId']
        OR jsonb_typeof(source.item->'source') IS DISTINCT FROM 'string'
        OR NULLIF(btrim(source.item->>'source'), '') IS NULL
        OR jsonb_typeof(source.item->'sourceUrl') IS DISTINCT FROM 'string'
        OR source.item->>'sourceUrl' !~ '^https://'
        OR jsonb_typeof(source.item->'availableAt') IS DISTINCT FROM 'string'
        OR NULLIF(btrim(source.item->>'availableAt'), '') IS NULL
        OR NOT pg_catalog.isfinite((source.item->>'availableAt')::TIMESTAMPTZ)
        OR (source.item->>'availableAt')::TIMESTAMPTZ > p_feature_cutoff_at
        OR jsonb_typeof(source.item->'revisionId') IS DISTINCT FROM 'string'
        OR NULLIF(btrim(source.item->>'revisionId'), '') IS NULL
    END
  );
  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'member feature schema or source revisions are invalid';
  END IF;

  SELECT encode(
    extensions.digest(
      convert_to(
        public.forecast_canonical_jsonb_text(jsonb_build_object(
          'featureSchemaVersion', p_feature_schema_version,
          'features', p_canonical_event_features,
          'sources', p_event_source_revisions
        )),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  INTO v_calculated_event_sha;
  IF v_calculated_event_sha IS DISTINCT FROM p_event_sha256 THEN
    RAISE EXCEPTION 'snapshot event hash does not match event features and provenance';
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_bad_count
  FROM jsonb_array_elements(p_rows) AS row(item)
  WHERE row.item->>'row_sha256' IS DISTINCT FROM encode(
    extensions.digest(
      convert_to(
        public.forecast_canonical_jsonb_text(jsonb_build_object(
          'eventSha256', p_event_sha256,
          'politicianId', row.item->>'politician_id',
          'features', row.item->'canonical_member_features',
          'sources', row.item->'member_source_revisions'
        )),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  );
  IF v_bad_count > 0 THEN
    RAISE EXCEPTION 'snapshot row hash does not match member features and provenance';
  END IF;

  SELECT encode(
    extensions.digest(
      convert_to(
        public.forecast_canonical_jsonb_text(jsonb_agg(
          row.item->>'row_sha256' ORDER BY row.item->>'politician_id'
        )),
        'UTF8'
      ),
      'sha256'
    ),
    'hex'
  )
  INTO v_calculated_roster_sha
  FROM jsonb_array_elements(p_rows) AS row(item);

  IF v_calculated_roster_sha IS DISTINCT FROM p_roster_sha256 THEN
    RAISE EXCEPTION 'snapshot roster hash does not match member rows';
  END IF;

  -- Serialize a logical snapshot identity so concurrent first writes and
  -- ambiguous-commit retries cannot race the unique indexes.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'forecast-snapshot:'
      || COALESCE(p_source_event_id::TEXT, p_roll_call_id)
      || ':' || p_feature_schema_version,
    0
  ));

  SELECT snapshot.*
  INTO v_existing_snapshot
  FROM public.forecast_feature_snapshots AS snapshot
  WHERE snapshot.feature_schema_version = p_feature_schema_version
    AND (
      (p_source_event_id IS NOT NULL AND snapshot.source_event_id = p_source_event_id)
      OR (p_roll_call_id IS NOT NULL AND snapshot.roll_call_id = p_roll_call_id)
    )
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_snapshot.source_event_id IS DISTINCT FROM p_source_event_id
      OR v_existing_snapshot.roll_call_id IS DISTINCT FROM p_roll_call_id
      OR v_existing_snapshot.feature_cutoff_at IS DISTINCT FROM p_feature_cutoff_at
      OR v_existing_snapshot.cutoff_quality IS DISTINCT FROM p_cutoff_quality
      OR v_existing_snapshot.canonical_event_features IS DISTINCT FROM p_canonical_event_features
      OR v_existing_snapshot.event_source_revisions IS DISTINCT FROM p_event_source_revisions
      OR v_existing_snapshot.event_sha256 IS DISTINCT FROM p_event_sha256
      OR v_existing_snapshot.roster_sha256 IS DISTINCT FROM p_roster_sha256
      OR v_existing_snapshot.row_count IS DISTINCT FROM v_input_count
    THEN
      RAISE EXCEPTION 'conflicting append-only feature snapshot';
    END IF;

    SELECT COUNT(*)::INTEGER
    INTO v_stored_count
    FROM public.forecast_feature_rows AS stored
    WHERE stored.snapshot_id = v_existing_snapshot.id;

    SELECT COUNT(*)::INTEGER
    INTO v_bad_count
    FROM jsonb_array_elements(p_rows) AS row(item)
    LEFT JOIN public.forecast_feature_rows AS stored
      ON stored.snapshot_id = v_existing_snapshot.id
     AND stored.politician_id = row.item->>'politician_id'
    WHERE stored.politician_id IS NULL
      OR stored.canonical_member_features IS DISTINCT FROM row.item->'canonical_member_features'
      OR stored.member_source_revisions IS DISTINCT FROM row.item->'member_source_revisions'
      OR stored.row_sha256 IS DISTINCT FROM row.item->>'row_sha256';

    IF v_stored_count <> v_input_count OR v_bad_count > 0 THEN
      RAISE EXCEPTION 'conflicting append-only feature snapshot';
    END IF;

    RETURN QUERY SELECT v_existing_snapshot.id, v_stored_count;
    RETURN;
  END IF;

  INSERT INTO public.forecast_feature_snapshots (
    source_event_id, roll_call_id, feature_schema_version, feature_cutoff_at,
    cutoff_quality, canonical_event_features, event_source_revisions,
    event_sha256, roster_sha256, row_count
  ) VALUES (
    p_source_event_id, p_roll_call_id, p_feature_schema_version, p_feature_cutoff_at,
    p_cutoff_quality, p_canonical_event_features, p_event_source_revisions,
    p_event_sha256, p_roster_sha256, v_input_count
  )
  RETURNING id INTO v_snapshot_id;

  INSERT INTO public.forecast_feature_rows (
    snapshot_id, politician_id, canonical_member_features,
    member_source_revisions, row_sha256
  )
  SELECT
    v_snapshot_id,
    row.item->>'politician_id',
    row.item->'canonical_member_features',
    row.item->'member_source_revisions',
    row.item->>'row_sha256'
  FROM jsonb_array_elements(p_rows) AS row(item);

  SELECT COUNT(*)::INTEGER
  INTO v_stored_count
  FROM public.forecast_feature_rows AS stored
  WHERE stored.snapshot_id = v_snapshot_id;

  IF v_stored_count <> v_input_count THEN
    RAISE EXCEPTION 'snapshot row count failed final verification';
  END IF;

  RETURN QUERY SELECT v_snapshot_id, v_stored_count;
END;
$$;

-- All forecasting-foundation tables are server-only until a separately
-- reviewed public read model is introduced.
ALTER TABLE public.bill_event_target_parses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roll_call_target_parses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_feature_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_feature_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "No public API access" ON public.bill_event_target_parses
  FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "No public API access" ON public.roll_call_target_parses
  FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "No public API access" ON public.forecast_feature_snapshots
  FOR ALL TO public USING (false) WITH CHECK (false);
CREATE POLICY "No public API access" ON public.forecast_feature_rows
  FOR ALL TO public USING (false) WITH CHECK (false);

REVOKE ALL ON TABLE public.bill_event_target_parses FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.roll_call_target_parses FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.forecast_feature_snapshots FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.forecast_feature_rows FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.bill_event_target_parses TO service_role;
GRANT SELECT, INSERT ON TABLE public.roll_call_target_parses TO service_role;
GRANT SELECT ON TABLE public.forecast_feature_snapshots TO service_role;
GRANT SELECT ON TABLE public.forecast_feature_rows TO service_role;

REVOKE EXECUTE ON FUNCTION public.reject_forecast_append_only_mutation()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.forecast_canonical_jsonb_text(JSONB)
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.persist_historical_roll_call(
  TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, NUMERIC, TEXT, JSONB, INTEGER, INTEGER, INTEGER, INTEGER, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_historical_roll_call(
  TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, DATE, TEXT, TEXT, TEXT, TEXT,
  TEXT, TEXT, NUMERIC, TEXT, JSONB, INTEGER, INTEGER, INTEGER, INTEGER, TEXT, TEXT, JSONB
) TO service_role;

REVOKE EXECUTE ON FUNCTION public.persist_forecast_feature_snapshot(
  UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB, JSONB, TEXT, TEXT, JSONB
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_forecast_feature_snapshot(
  UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, JSONB, JSONB, TEXT, TEXT, JSONB
) TO service_role;

NOTIFY pgrst, 'reload schema';
