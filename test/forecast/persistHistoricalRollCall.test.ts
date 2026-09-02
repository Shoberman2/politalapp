import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { persistHistoricalRollCall } from '../../etl/forecast/persistHistoricalRollCall.js';
import { parseForecastTarget } from '../../etl/forecast/targetParser.js';

function input() {
  return {
    leaseKey: 'forecast:118',
    lease: { holder: 'worker-1', fenceToken: 7 },
    rollCallId: 'house-118-1-42',
    billId: '118-hr-1',
    question: 'On Passage',
    description: 'Test vote',
    votedAt: '2023-02-01',
    sourceUrl: 'https://clerk.house.gov/Votes/202342',
    targetParse: parseForecastTarget('On Passage'),
    memberVotes: [
      { politicianId: 'A000001', position: 'Yea' as const },
      { politicianId: 'B000002', position: 'Nay' as const },
    ],
    sourceTally: { yea: 1, nay: 1, present: 0, notVoting: 0 },
    backfillName: 'forecast-118',
    expectedPreviousRollCallId: null,
    checkpoint: { sourceCursor: '42' },
  };
}

describe('persistHistoricalRollCall', () => {
  it('passes the fence, parser evidence, tally, and checkpoint to one RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        persisted_roll_call_id: 'house-118-1-42',
        persisted_vote_count: 2,
        completed_at: '2026-09-01T20:00:00Z',
      }],
      error: null,
    });

    await expect(
      persistHistoricalRollCall({ rpc } as unknown as SupabaseClient, input()),
    ).resolves.toEqual({
      rollCallId: 'house-118-1-42',
      voteCount: 2,
      completedAt: '2026-09-01T20:00:00Z',
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('persist_historical_roll_call', expect.objectContaining({
      p_lease_key: 'forecast:118',
      p_holder: 'worker-1',
      p_fence_token: 7,
      p_parser_version: '1.0.0',
      p_forecast_target: 'final_passage',
      p_member_votes: [
        { politician_id: 'A000001', position: 'Yea' },
        { politician_id: 'B000002', position: 'Nay' },
      ],
      p_expected_yea: 1,
      p_expected_nay: 1,
      p_expected_previous_roll_call_id: null,
      p_checkpoint: { sourceCursor: '42' },
    }));
  });

  it('surfaces database rejection with the roll-call identity', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: 'stale or missing ETL lease' },
    });

    await expect(
      persistHistoricalRollCall({ rpc } as unknown as SupabaseClient, input()),
    ).rejects.toThrow(
      'Unable to persist historical roll call house-118-1-42: stale or missing ETL lease',
    );
  });

  it('fails closed when the RPC gives no completion receipt', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await expect(
      persistHistoricalRollCall({ rpc } as unknown as SupabaseClient, input()),
    ).rejects.toThrow(/returned no completion receipt/);
  });

  it('accepts a singleton receipt and normalizes its vote count', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        persisted_roll_call_id: 'house-118-1-42',
        persisted_vote_count: '2',
        completed_at: '2026-09-01T20:00:00Z',
      },
      error: null,
    });
    await expect(
      persistHistoricalRollCall({ rpc } as unknown as SupabaseClient, input()),
    ).resolves.toMatchObject({ voteCount: 2 });
  });

  it('rejects a malformed persisted vote count', async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        persisted_roll_call_id: 'house-118-1-42',
        persisted_vote_count: 'not-a-number',
        completed_at: '2026-09-01T20:00:00Z',
      },
      error: null,
    });
    await expect(
      persistHistoricalRollCall({ rpc } as unknown as SupabaseClient, input()),
    ).rejects.toThrow(/invalid vote count/);
  });
});
