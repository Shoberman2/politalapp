BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(50);

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

SELECT lives_ok(
  $$
    SELECT * FROM public.persist_forecast_feature_snapshot(
      NULL,
      'house-999-1-1',
      'forecast-v1',
      '3787-02-01T00:00:00Z',
      'official_schedule',
      '{"chamber":"house"}'::jsonb,
      '["roll-call:pgtap-v1"]'::jsonb,
      repeat('e', 64),
      encode(
        extensions.digest(
          convert_to('["' || repeat('a', 64) || '","' || repeat('b', 64) || '"]', 'UTF8'),
          'sha256'
        ),
        'hex'
      ),
      jsonb_build_array(
        jsonb_build_object(
          'politician_id', 'ZZTEST001',
          'canonical_member_features', jsonb_build_object('tenure', 2),
          'member_source_revisions', jsonb_build_array('terms:pgtap-v1'),
          'row_sha256', repeat('a', 64)
        ),
        jsonb_build_object(
          'politician_id', 'ZZTEST002',
          'canonical_member_features', jsonb_build_object('tenure', 1),
          'member_source_revisions', jsonb_build_array('terms:pgtap-v1'),
          'row_sha256', repeat('b', 64)
        )
      )
    )
  $$,
  'a feature snapshot and its rows persist atomically'
);
SELECT is(
  (
    SELECT row_count
    FROM public.forecast_feature_snapshots
    WHERE roll_call_id = 'house-999-1-1' AND feature_schema_version = 'forecast-v1'
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
      AND snapshot.feature_schema_version = 'forecast-v1'
  ),
  2::BIGINT,
  'snapshot member rows become visible with the header'
);
SELECT throws_ok(
  $$
    SELECT * FROM public.persist_forecast_feature_snapshot(
      NULL,
      'house-999-1-1',
      'forecast-v2',
      '3787-02-01T00:00:00Z',
      'official_schedule',
      '{"chamber":"house"}'::jsonb,
      '["roll-call:pgtap-v1"]'::jsonb,
      repeat('e', 64),
      repeat('f', 64),
      jsonb_build_array(
        jsonb_build_object(
          'politician_id', 'ZZTEST001',
          'canonical_member_features', jsonb_build_object('tenure', 2),
          'member_source_revisions', jsonb_build_array('terms:pgtap-v1'),
          'row_sha256', repeat('a', 64)
        )
      )
    )
  $$,
  'P0001',
  'snapshot roster hash does not match member rows',
  'a mismatched roster digest aborts the snapshot'
);
SELECT is(
  (
    SELECT COUNT(*)
    FROM public.forecast_feature_snapshots
    WHERE roll_call_id = 'house-999-1-1' AND feature_schema_version = 'forecast-v2'
  ),
  0::BIGINT,
  'a rejected snapshot wrote no header'
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
