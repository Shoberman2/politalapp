import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260901214646_forecast_foundation.sql'),
  'utf8',
);

describe('forecast foundation migration contract', () => {
  it('keeps parser and feature evidence append-only', () => {
    expect(sql).toContain('reject_forecast_append_only_mutation');
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.bill_event_target_parses/);
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.roll_call_target_parses/);
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.forecast_feature_snapshots/);
    expect(sql).toMatch(/BEFORE UPDATE OR DELETE ON public\.forecast_feature_rows/);
  });

  it('makes completion and checkpoint advancement part of one fenced RPC', () => {
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.persist_historical_roll_call\(/);
    expect(sql).toMatch(/lease\.fence_token = p_fence_token[\s\S]*?FOR SHARE/);
    expect(sql).toMatch(/source tally does not match member vote payload/);
    expect(sql).toMatch(/member identity or effective term attribution is unresolved/);
    expect(sql).toMatch(/SET member_votes_complete_at = COALESCE/);
    expect(sql).toMatch(/INSERT INTO public\.backfill_state[\s\S]*?checkpoint/);
  });

  it('pins the definer function search path and service-role execution', () => {
    expect(sql).toMatch(/persist_historical_roll_call\([\s\S]*?SECURITY DEFINER[\s\S]*?SET search_path = ''/);
    expect(sql).toMatch(/REVOKE EXECUTE ON FUNCTION public\.persist_historical_roll_call\([\s\S]*?FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.persist_historical_roll_call\([\s\S]*?TO service_role/);
  });

  it('enables default-deny RLS on every private forecast table', () => {
    for (const table of [
      'bill_event_target_parses',
      'roll_call_target_parses',
      'forecast_feature_snapshots',
      'forecast_feature_rows',
    ]) {
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
      expect(sql).toMatch(new RegExp(`CREATE POLICY "No public API access" ON public\\.${table}`));
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON TABLE public\\.${table} FROM PUBLIC, anon, authenticated`));
    }
  });
});
