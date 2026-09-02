BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(63);

SELECT has_table('public', 'bill_event_target_parses', 'event target parses exist');
SELECT has_table('public', 'roll_call_target_parses', 'roll-call target parses exist');
SELECT has_table('public', 'forecast_feature_snapshots', 'feature snapshots exist');
SELECT has_table('public', 'forecast_feature_rows', 'feature rows exist');
SELECT has_column('public', 'roll_calls', 'member_votes_complete_at', 'roll calls have completeness marker');

SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.bill_event_target_parses'::regclass),
  'event parses have RLS'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.roll_call_target_parses'::regclass),
  'roll-call parses have RLS'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.forecast_feature_snapshots'::regclass),
  'feature snapshots have RLS'
);
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.forecast_feature_rows'::regclass),
  'feature rows have RLS'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.persist_historical_roll_call(text,text,bigint,text,text,text,text,date,text,text,text,text,text,text,numeric,text,jsonb,integer,integer,integer,integer,text,text,jsonb)',
    'EXECUTE'
  ),
  'service role can execute atomic persistence'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.persist_historical_roll_call(text,text,bigint,text,text,text,text,date,text,text,text,text,text,text,numeric,text,jsonb,integer,integer,integer,integer,text,text,jsonb)',
    'EXECUTE'
  ),
  'anonymous clients cannot execute atomic persistence'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.persist_historical_roll_call(text,text,bigint,text,text,text,text,date,text,text,text,text,text,text,numeric,text,jsonb,integer,integer,integer,integer,text,text,jsonb)',
    'EXECUTE'
  ),
  'authenticated clients cannot execute atomic persistence'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.persist_forecast_feature_snapshot(uuid,text,text,timestamp with time zone,text,jsonb,jsonb,text,text,jsonb)',
    'EXECUTE'
  ),
  'service role can execute atomic snapshot persistence'
);
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.persist_forecast_feature_snapshot(uuid,text,text,timestamp with time zone,text,jsonb,jsonb,text,text,jsonb)',
    'EXECUTE'
  ),
  'anonymous clients cannot execute atomic snapshot persistence'
);
SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.persist_forecast_feature_snapshot(uuid,text,text,timestamp with time zone,text,jsonb,jsonb,text,text,jsonb)',
    'EXECUTE'
  ),
  'authenticated clients cannot execute atomic snapshot persistence'
);

INSERT INTO public.politicians (id, name, chamber, state, district, party)
VALUES
  ('ZZTEST001', 'Forecast Test One', 'house', 'ZZ', '1', 'I'),
  ('ZZTEST002', 'Forecast Test Two', 'house', 'ZZ', '2', 'I');

INSERT INTO public.member_congress_terms (
  bioguide_id, congress, term_start, chamber, state, district, party, term_end, source
)
VALUES
  ('ZZTEST001', 999, '3787-01-01', 'house', 'ZZ', '1', 'I', '3788-12-31', 'pgtap_fixture'),
  ('ZZTEST002', 999, '3787-01-01', 'house', 'ZZ', '2', 'I', '3788-12-31', 'pgtap_fixture');

INSERT INTO public.bills (id, title, introduced_at, source_url)
VALUES ('999-hr-999999', 'Forecast test bill', '3787-01-01', 'https://example.test/bill');

INSERT INTO public.etl_leases (lease_key, holder, expires_at, fence_token)
VALUES ('forecast-test', 'pgtap', NOW() + INTERVAL '1 hour', 41);

SELECT lives_ok(
  $$
    SELECT * FROM public.persist_historical_roll_call(
      'forecast-test', 'pgtap', 41, 'house-999-1-1', '999-hr-999999',
      'On Passage', 'Forecast fixture', '3787-02-01', 'https://example.test/vote/1',
      '1.0.0', 'On Passage', 'on passage', 'final_passage',
      'simple_majority_present_voting', 0.98, NULL,
      '[{"politician_id":"ZZTEST001","position":"Yea"},{"politician_id":"ZZTEST002","position":"Nay"}]'::jsonb,
      1, 1, 0, 0, 'forecast-pgtap', NULL, '{"source_cursor":"page-1"}'::jsonb
    )
  $$,
  'a complete matching roll call persists atomically'
);

SELECT is(
  (SELECT COUNT(*) FROM public.votes WHERE roll_call_id = 'house-999-1-1'),
  2::BIGINT,
  'both member votes were persisted'
);
SELECT ok(
  (SELECT member_votes_complete_at IS NOT NULL FROM public.roll_calls WHERE id = 'house-999-1-1'),
  'completion marker is set only after verification'
);
SELECT is(
  (SELECT checkpoint->>'last_roll_call_id' FROM public.backfill_state WHERE name = 'forecast-pgtap'),
  'house-999-1-1',
  'checkpoint advanced with the completed roll call'
);
SELECT is(
  (SELECT checkpoint->>'source_cursor' FROM public.backfill_state WHERE name = 'forecast-pgtap'),
  'page-1',
  'caller checkpoint detail was preserved'
);

SELECT lives_ok(
  $$
    SELECT * FROM public.persist_historical_roll_call(
      'forecast-test', 'pgtap', 41, 'house-999-1-1', '999-hr-999999',
      'On Passage', 'Forecast fixture', '3787-02-01', 'https://example.test/vote/1',
      '1.0.0', 'On Passage', 'on passage', 'final_passage',
      'simple_majority_present_voting', 0.98, NULL,
      '[{"politician_id":"ZZTEST001","position":"Yea"},{"politician_id":"ZZTEST002","position":"Nay"}]'::jsonb,
      1, 1, 0, 0, 'forecast-pgtap', NULL, '{"source_cursor":"page-1"}'::jsonb
    )
  $$,
  'an exact retry is idempotent'
);
SELECT is(
  (SELECT COUNT(*) FROM public.votes WHERE roll_call_id = 'house-999-1-1'),
  2::BIGINT,
  'idempotent retry did not duplicate votes'
);

SELECT throws_ok(
  $$
    SELECT * FROM public.persist_historical_roll_call(
      'forecast-test', 'pgtap', 41, 'house-999-1-1', '999-hr-999999',
      'On Passage', 'Forecast fixture', '3787-02-01', 'https://example.test/vote/1',
      '1.0.0', 'On Passage', 'on passage', 'final_passage',
      'simple_majority_present_voting', 0.98, NULL,
      '[{"politician_id":"ZZTEST001","position":"Nay"},{"politician_id":"ZZTEST002","position":"Nay"}]'::jsonb,
      0, 2, 0, 0, 'forecast-pgtap', NULL, '{"source_cursor":"conflict"}'::jsonb
    )
  $$,
  'P0001',
  'conflicting existing member vote for house-999-1-1',
  'a conflicting retry is rejected'
);
SELECT is(
  (SELECT position FROM public.votes WHERE roll_call_id = 'house-999-1-1' AND politician_id = 'ZZTEST001'),
  'Yea',
  'a conflicting retry did not rewrite stored votes'
);
SELECT is(
  (SELECT checkpoint->>'source_cursor' FROM public.backfill_state WHERE name = 'forecast-pgtap'),
  'page-1',
  'a conflicting retry did not advance the checkpoint'
);

SELECT throws_ok(
  $$
    SELECT * FROM public.persist_historical_roll_call(
      'forecast-test', 'pgtap', 41, 'house-999-1-5', '999-hr-999999',
      'On Passage', 'Stale checkpoint fixture', '3787-02-05', 'https://example.test/vote/5',
      '1.0.0', 'On Passage', 'on passage', 'final_passage',
      'simple_majority_present_voting', 0.98, NULL,
      '[{"politician_id":"ZZTEST001","position":"Yea"},{"politician_id":"ZZTEST002","position":"Nay"}]'::jsonb,
      1, 1, 0, 0, 'forecast-pgtap', 'house-999-1-0', '{"source_cursor":"stale-checkpoint"}'::jsonb
    )
  $$,
  '55000',
  'stale backfill checkpoint: expected house-999-1-0, found house-999-1-1',
  'a stale checkpoint compare-and-swap is rejected'
);
SELECT is(
  (SELECT COUNT(*) FROM public.roll_calls WHERE id = 'house-999-1-5'),
  0::BIGINT,
  'stale checkpoint wrote no roll call'
);
SELECT is(
  (SELECT checkpoint->>'source_cursor' FROM public.backfill_state WHERE name = 'forecast-pgtap'),
  'page-1',
  'stale checkpoint did not advance the cursor'
);

INSERT INTO public.etl_leases (lease_key, holder, expires_at, fence_token)
VALUES ('forecast-test-other', 'pgtap-other', NOW() + INTERVAL '1 hour', 42);

SELECT throws_ok(
  $$
    SELECT * FROM public.persist_historical_roll_call(
      'forecast-test-other', 'pgtap-other', 42, 'house-999-1-6', '999-hr-999999',
      'On Passage', 'Cross-lease fixture', '3787-02-06', 'https://example.test/vote/6',
      '1.0.0', 'On Passage', 'on passage', 'final_passage',
      'simple_majority_present_voting', 0.98, NULL,
      '[{"politician_id":"ZZTEST001","position":"Yea"},{"politician_id":"ZZTEST002","position":"Nay"}]'::jsonb,
      1, 1, 0, 0, 'forecast-pgtap', 'house-999-1-1', '{"source_cursor":"cross-lease"}'::jsonb
    )
  $$,
  '55000',
  'backfill lease key mismatch: expected forecast-test, found forecast-test-other',
  'a second lease key cannot target the same backfill cursor'
);
SELECT is(
  (SELECT COUNT(*) FROM public.roll_calls WHERE id = 'house-999-1-6'),
  0::BIGINT,
  'cross-lease checkpoint contention wrote no roll call'
);

SELECT throws_ok(
  $$
    SELECT * FROM public.persist_historical_roll_call(
      'forecast-test', 'pgtap', 41, 'house-999-1-4', '999-hr-999999',
      'On Passage', 'Duplicate member fixture', '3787-02-04', 'https://example.test/vote/4',
      '1.0.0', 'On Passage', 'on passage', 'final_passage',
      'simple_majority_present_voting', 0.98, NULL,
      '[{"politician_id":"ZZTEST001","position":"Yea"},{"politician_id":"ZZTEST001","position":"Yea"}]'::jsonb,
      2, 0, 0, 0, 'forecast-pgtap', 'house-999-1-1', '{"source_cursor":"duplicate"}'::jsonb
    )
  $$,
  'P0001',
  'member vote payload contains malformed or duplicate members',
  'duplicate members abort the roll call'
);
SELECT is(
  (SELECT COUNT(*) FROM public.roll_calls WHERE id = 'house-999-1-4'),
  0::BIGINT,
  'duplicate members wrote no roll call'
);
SELECT is(
  (SELECT checkpoint->>'source_cursor' FROM public.backfill_state WHERE name = 'forecast-pgtap'),
  'page-1',
  'duplicate members did not advance the checkpoint'
);

SELECT throws_ok(
  $$
    SELECT * FROM public.persist_historical_roll_call(
      'forecast-test', 'pgtap', 41, 'house-999-1-2', '999-hr-999999',
      'On Passage', 'Bad tally fixture', '3787-02-02', 'https://example.test/vote/2',
      '1.0.0', 'On Passage', 'on passage', 'final_passage',
      'simple_majority_present_voting', 0.98, NULL,
      '[{"politician_id":"ZZTEST001","position":"Yea"},{"politician_id":"ZZTEST002","position":"Nay"}]'::jsonb,
      2, 0, 0, 0, 'forecast-pgtap', 'house-999-1-1', '{"source_cursor":"page-2"}'::jsonb
    )
  $$,
  'P0001',
  'source tally does not match member vote payload',
  'a source tally mismatch aborts'
);
SELECT is(
  (SELECT COUNT(*) FROM public.roll_calls WHERE id = 'house-999-1-2'),
  0::BIGINT,
  'failed tally wrote no roll call'
);
SELECT is(
  (SELECT checkpoint->>'last_roll_call_id' FROM public.backfill_state WHERE name = 'forecast-pgtap'),
  'house-999-1-1',
  'failed tally did not advance the checkpoint'
);

SELECT throws_ok(
  $$
    SELECT * FROM public.persist_historical_roll_call(
      'forecast-test', 'pgtap', 40, 'house-999-1-3', '999-hr-999999',
      'On Passage', 'Stale fence fixture', '3787-02-03', 'https://example.test/vote/3',
      '1.0.0', 'On Passage', 'on passage', 'final_passage',
      'simple_majority_present_voting', 0.98, NULL,
      '[{"politician_id":"ZZTEST001","position":"Yea"},{"politician_id":"ZZTEST002","position":"Nay"}]'::jsonb,
      1, 1, 0, 0, 'forecast-pgtap', 'house-999-1-1', '{"source_cursor":"page-3"}'::jsonb
    )
  $$,
  '55000',
  'stale or missing ETL lease',
  'a stale fence is rejected'
);
SELECT is(
  (SELECT COUNT(*) FROM public.roll_calls WHERE id = 'house-999-1-3'),
  0::BIGINT,
  'stale fence wrote no roll call'
);

SELECT throws_ok(
  $$UPDATE public.roll_call_target_parses SET parse_confidence = 0.5 WHERE roll_call_id = 'house-999-1-1'$$,
  '55000',
  'roll_call_target_parses is append-only',
  'parser evidence cannot be updated'
);
SELECT throws_ok(
  $$DELETE FROM public.roll_call_target_parses WHERE roll_call_id = 'house-999-1-1'$$,
  '55000',
  'roll_call_target_parses is append-only',
  'parser evidence cannot be deleted'
);
SELECT throws_ok(
  $$TRUNCATE public.roll_call_target_parses$$,
  '55000',
  'roll_call_target_parses is append-only',
  'parser evidence cannot be truncated'
);

CREATE TEMP TABLE forecast_snapshot_fixture AS
WITH event_input AS (
  SELECT
    '{"chamber":"house","policyArea":"Health"}'::jsonb AS event_features,
    jsonb_build_array(jsonb_build_object(
      'source', 'roll_call',
      'sourceUrl', 'https://example.test/vote/1',
      'availableAt', '3787-01-31T00:00:00.000Z',
      'revisionId', 'pgtap-event-v1'
    )) AS event_sources
), event_hashed AS (
  SELECT
    event_input.*,
    encode(
      extensions.digest(
        convert_to(public.forecast_canonical_jsonb_text(jsonb_build_object(
          'featureSchemaVersion', 'forecast-features-v1',
          'features', event_features,
          'sources', event_sources
        )), 'UTF8'),
        'sha256'
      ),
      'hex'
    ) AS event_sha
  FROM event_input
), rows_hashed AS (
  SELECT
    event_hashed.*,
    member.politician_id,
    member.features,
    member.sources,
    encode(
      extensions.digest(
        convert_to(public.forecast_canonical_jsonb_text(jsonb_build_object(
          'eventSha256', event_hashed.event_sha,
          'politicianId', member.politician_id,
          'features', member.features,
          'sources', member.sources
        )), 'UTF8'),
        'sha256'
      ),
      'hex'
    ) AS row_sha
  FROM event_hashed
  CROSS JOIN (
    VALUES
      (
        'ZZTEST001',
        '{"tenure":2}'::jsonb,
        '[{"source":"terms","sourceUrl":"https://example.test/terms/1","availableAt":"3787-01-30T00:00:00.000Z","revisionId":"pgtap-member-v1"}]'::jsonb
      ),
      (
        'ZZTEST002',
        '{"tenure":1}'::jsonb,
        '[{"source":"terms","sourceUrl":"https://example.test/terms/2","availableAt":"3787-01-30T00:00:00.000Z","revisionId":"pgtap-member-v1"}]'::jsonb
      )
  ) AS member(politician_id, features, sources)
)
SELECT
  (SELECT event_features FROM event_hashed) AS event_features,
  (SELECT event_sources FROM event_hashed) AS event_sources,
  (SELECT event_sha FROM event_hashed) AS event_sha,
  encode(
    extensions.digest(
      convert_to(public.forecast_canonical_jsonb_text(
        (SELECT jsonb_agg(row_sha ORDER BY politician_id) FROM rows_hashed)
      ), 'UTF8'),
      'sha256'
    ),
    'hex'
  ) AS roster_sha,
  (
    SELECT jsonb_agg(jsonb_build_object(
      'politician_id', politician_id,
      'canonical_member_features', features,
      'member_source_revisions', sources,
      'row_sha256', row_sha
    ) ORDER BY politician_id)
    FROM rows_hashed
  ) AS rows;

SELECT is(
  (SELECT event_sha FROM forecast_snapshot_fixture),
  'f9676e0466cc1af5dd54ea35cd75a953bad40497a3e977eef935832767e33f5e',
  'database event canonicalization matches the TypeScript hash contract'
);
SELECT is(
  (SELECT rows->0->>'row_sha256' FROM forecast_snapshot_fixture),
  '3dc86cd4609b997a6d280180ff9a2b1c27876cb107c401a06d199e02cfb9832e',
  'database member canonicalization matches the TypeScript hash contract'
);
SELECT is(
  (SELECT roster_sha FROM forecast_snapshot_fixture),
  'b3036cabcc3e2e01c1608ceb1d73825c6975b2ab515255c1aff547e2412fcf08',
  'database roster canonicalization matches the TypeScript hash contract'
);

SELECT throws_ok(
  $$
    SELECT persisted.*
    FROM forecast_snapshot_fixture AS fixture
    CROSS JOIN LATERAL public.persist_forecast_feature_snapshot(
      NULL,
      'house-999-1-1',
      'forecast-features-v1',
      'infinity',
      'official_schedule',
      fixture.event_features,
      fixture.event_sources,
      fixture.event_sha,
      fixture.roster_sha,
      fixture.rows
    ) AS persisted
  $$,
  'P0001',
  'snapshot identity, schema, cutoff, quality, and hashes are required',
  'an infinite feature cutoff is rejected'
);
SELECT throws_ok(
  $$
    SELECT persisted.*
    FROM forecast_snapshot_fixture AS fixture
    CROSS JOIN LATERAL public.persist_forecast_feature_snapshot(
      NULL,
      'house-999-1-1',
      'forecast-features-v1',
      '3787-02-01T00:00:00Z',
      'official_schedule',
      fixture.event_features,
      jsonb_set(
        fixture.event_sources,
        '{0,availableAt}',
        '"-infinity"'::jsonb
      ),
      fixture.event_sha,
      fixture.roster_sha,
      fixture.rows
    ) AS persisted
  $$,
  'P0001',
  'event source revisions are malformed or newer than the feature cutoff',
  'an infinite source timestamp is rejected'
);

SELECT throws_ok(
  $$
    SELECT persisted.*
    FROM forecast_snapshot_fixture AS fixture
    CROSS JOIN LATERAL public.persist_forecast_feature_snapshot(
      NULL,
      'house-999-1-1',
      'forecast-features-v1',
      '3787-02-01T00:00:00Z',
      'official_schedule',
      '{"chamber":"house","policyArea":{"actualOutcome":"passed"}}'::jsonb,
      fixture.event_sources,
      fixture.event_sha,
      fixture.roster_sha,
      fixture.rows
    ) AS persisted
  $$,
  'P0001',
  'event feature schema is invalid',
  'nested outcome-bearing event features are rejected by the database'
);
SELECT throws_ok(
  $$
    SELECT persisted.*
    FROM forecast_snapshot_fixture AS fixture
    CROSS JOIN LATERAL public.persist_forecast_feature_snapshot(
      NULL,
      'house-999-1-1',
      'forecast-features-v1',
      '3787-02-01T00:00:00Z',
      'official_schedule',
      fixture.event_features,
      fixture.event_sources,
      fixture.event_sha,
      fixture.roster_sha,
      jsonb_set(
        fixture.rows,
        '{0,canonical_member_features,tenure}',
        '"actual tally 250-180"'::jsonb
      )
    ) AS persisted
  $$,
  'P0001',
  'member feature schema or source revisions are invalid',
  'outcome-bearing member feature values are rejected by the database'
);
SELECT throws_ok(
  $$
    SELECT persisted.*
    FROM forecast_snapshot_fixture AS fixture
    CROSS JOIN LATERAL public.persist_forecast_feature_snapshot(
      NULL,
      'house-999-1-1',
      'forecast-features-v1',
      '3787-02-01T00:00:00Z',
      'official_schedule',
      fixture.event_features,
      fixture.event_sources,
      fixture.event_sha,
      fixture.roster_sha,
      jsonb_set(
        fixture.rows,
        '{0,canonical_member_features,tenure}',
        '9007199254740992'::jsonb
      )
    ) AS persisted
  $$,
  'P0001',
  'member feature schema or source revisions are invalid',
  'a tenure above the JavaScript safe-integer ceiling is rejected'
);

SELECT throws_ok(
  $$
    SELECT persisted.*
    FROM forecast_snapshot_fixture AS fixture
    CROSS JOIN LATERAL public.persist_forecast_feature_snapshot(
      NULL,
      'house-999-1-1',
      'forecast-features-v1',
      '3787-02-01T00:00:00Z',
      'official_schedule',
      fixture.event_features,
      jsonb_set(
        fixture.event_sources,
        '{0,availableAt}',
        '"3787-02-02T00:00:00.000Z"'::jsonb
      ),
      fixture.event_sha,
      fixture.roster_sha,
      fixture.rows
    ) AS persisted
  $$,
  'P0001',
  'event source revisions are malformed or newer than the feature cutoff',
  'post-cutoff event provenance is rejected at the database boundary'
);
SELECT throws_ok(
  $$
    SELECT persisted.*
    FROM forecast_snapshot_fixture AS fixture
    CROSS JOIN LATERAL public.persist_forecast_feature_snapshot(
      NULL,
      'house-999-1-1',
      'forecast-features-v1',
      '3787-02-01T00:00:00Z',
      'official_schedule',
      fixture.event_features,
      fixture.event_sources,
      repeat('e', 64),
      fixture.roster_sha,
      fixture.rows
    ) AS persisted
  $$,
  'P0001',
  'snapshot event hash does not match event features and provenance',
  'a mismatched event digest aborts the snapshot'
);
SELECT is(
  (
    SELECT COUNT(*)
    FROM public.forecast_feature_snapshots
    WHERE roll_call_id = 'house-999-1-1'
      AND feature_schema_version = 'forecast-features-v1'
  ),
  0::BIGINT,
  'rejected snapshots wrote no header'
);
SELECT lives_ok(
  $$
    SELECT persisted.*
    FROM forecast_snapshot_fixture AS fixture
    CROSS JOIN LATERAL public.persist_forecast_feature_snapshot(
      NULL,
      'house-999-1-1',
      'forecast-features-v1',
      '3787-02-01T00:00:00Z',
      'official_schedule',
      fixture.event_features,
      fixture.event_sources,
      fixture.event_sha,
      fixture.roster_sha,
      fixture.rows
    ) AS persisted
  $$,
  'a feature snapshot and its rows persist atomically'
);
SELECT is(
  (
    SELECT row_count
    FROM public.forecast_feature_snapshots
    WHERE roll_call_id = 'house-999-1-1'
      AND feature_schema_version = 'forecast-features-v1'
  ),
  2,
  'snapshot header derives the member row count'
);
SELECT is(
  (
    SELECT COUNT(*)
    FROM public.forecast_feature_rows AS feature_row
    JOIN public.forecast_feature_snapshots AS snapshot ON snapshot.id = feature_row.snapshot_id
    WHERE snapshot.roll_call_id = 'house-999-1-1'
      AND snapshot.feature_schema_version = 'forecast-features-v1'
  ),
  2::BIGINT,
  'snapshot member rows become visible with the header'
);
SELECT lives_ok(
  $$
    SELECT persisted.*
    FROM forecast_snapshot_fixture AS fixture
    CROSS JOIN LATERAL public.persist_forecast_feature_snapshot(
      NULL,
      'house-999-1-1',
      'forecast-features-v1',
      '3787-02-01T00:00:00Z',
      'official_schedule',
      fixture.event_features,
      fixture.event_sources,
      fixture.event_sha,
      fixture.roster_sha,
      fixture.rows
    ) AS persisted
  $$,
  'an exact snapshot retry returns the existing receipt'
);
SELECT is(
  (
    SELECT COUNT(*)
    FROM public.forecast_feature_snapshots
    WHERE roll_call_id = 'house-999-1-1'
      AND feature_schema_version = 'forecast-features-v1'
  ),
  1::BIGINT,
  'an exact snapshot retry writes no duplicate header'
);

SET LOCAL ROLE service_role;
SELECT throws_ok(
  $$INSERT INTO public.forecast_feature_snapshots DEFAULT VALUES$$,
  '42501',
  'permission denied for table forecast_feature_snapshots',
  'service role cannot bypass atomic snapshot persistence'
);
SELECT throws_ok(
  $$TRUNCATE public.forecast_feature_snapshots, public.forecast_feature_rows$$,
  '55000',
  'forecast_feature_snapshots is append-only',
  'service role cannot truncate private snapshots'
);
RESET ROLE;

SET LOCAL ROLE anon;
SELECT throws_ok(
  $$SELECT * FROM public.forecast_feature_snapshots$$,
  '42501',
  'permission denied for table forecast_feature_snapshots',
  'anonymous clients cannot read private snapshots'
);
SELECT throws_ok(
  $$INSERT INTO public.forecast_feature_snapshots DEFAULT VALUES$$,
  '42501',
  'permission denied for table forecast_feature_snapshots',
  'anonymous clients cannot write private snapshots'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT throws_ok(
  $$SELECT * FROM public.forecast_feature_snapshots$$,
  '42501',
  'permission denied for table forecast_feature_snapshots',
  'authenticated clients cannot read private snapshots'
);
SELECT throws_ok(
  $$INSERT INTO public.forecast_feature_snapshots DEFAULT VALUES$$,
  '42501',
  'permission denied for table forecast_feature_snapshots',
  'authenticated clients cannot write private snapshots'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
