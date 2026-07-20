import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

const mocks = vi.hoisted(() => ({
  acquireLease: vi.fn(),
  followedBillIds: vi.fn(),
  persistObservation: vi.fn(),
  fanOutEvent: vi.fn(),
  reconcileUnmatchedItems: vi.fn(),
  resumePendingFanOut: vi.fn(),
  polls: [vi.fn(), vi.fn(), vi.fn()],
}));

vi.mock('../etl/advisoryLock.js', () => ({
  acquireLease: mocks.acquireLease,
  LeaseUnavailableError: class LeaseUnavailableError extends Error {},
}));
vi.mock('../server/alerts/persistence.js', () => ({
  followedBillIds: mocks.followedBillIds,
  persistObservation: mocks.persistObservation,
  fanOutEvent: mocks.fanOutEvent,
  reconcileUnmatchedItems: mocks.reconcileUnmatchedItems,
  resumePendingFanOut: mocks.resumePendingFanOut,
}));
vi.mock('../server/alerts/sources/congressBillActions.js', () => ({
  congressBillActionsSource: { name: 'actions', poll: mocks.polls[0] },
}));
vi.mock('../server/alerts/sources/congressCommitteeMeetings.js', () => ({
  congressCommitteeMeetingsSource: { name: 'committee', poll: mocks.polls[1] },
}));
vi.mock('../server/alerts/sources/houseFloor.js', () => ({
  houseFloorSource: { name: 'floor', poll: mocks.polls[2] },
}));

import { ingestBillAlertSources } from '../server/alerts/ingest.js';

function lease(key: string) {
  return {
    holder: `holder-${key}`, fenceToken: 4, expiresAt: '2026-07-20T22:00:00Z',
    renew: vi.fn().mockResolvedValue('2026-07-20T22:00:00Z'),
    release: vi.fn().mockResolvedValue(undefined),
  };
}

function client(completion = true) {
  let run = 0;
  const rpc = vi.fn(async (name: string) => {
    if (name === 'begin_bill_alert_source_run') {
      run += 1;
      return { data: [{ run_id: `run-${run}`, cursor_before: '2026-07-20T14:00:00Z' }], error: null };
    }
    if (name === 'complete_bill_alert_source_run') return { data: completion, error: null };
    if (name === 'fail_bill_alert_source_run') return { data: true, error: null };
    throw new Error(`unexpected rpc: ${name}`);
  });
  return { supabase: { rpc } as any as SupabaseClient, rpc };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.acquireLease.mockImplementation(async (_client, key: string) => lease(key));
  mocks.resumePendingFanOut.mockResolvedValue(0);
  mocks.followedBillIds.mockResolvedValue(new Set(['119-hr-1']));
  mocks.persistObservation.mockResolvedValue({ eventId: 'event-1', inserted: true });
  mocks.fanOutEvent.mockResolvedValue(undefined);
  mocks.reconcileUnmatchedItems.mockResolvedValue(0);
  mocks.polls.forEach((poll) => poll.mockResolvedValue({ observations: [], cursorAfter: '2026-07-20T16:00:00Z' }));
});

describe('bill alert ingestion orchestration', () => {
  it('resumes unfinished fan-out even when no bills are currently followed', async () => {
    mocks.followedBillIds.mockResolvedValue(new Set());
    const { supabase } = client();
    await expect(ingestBillAlertSources(supabase, 'congress-key')).resolves.toEqual([]);
    expect(mocks.resumePendingFanOut).toHaveBeenCalledTimes(1);
    expect(mocks.acquireLease).toHaveBeenCalledTimes(1);
    expect(mocks.polls[0]).not.toHaveBeenCalled();
  });

  it('persists, fans out, and commits each source under its fenced lease', async () => {
    mocks.polls[0].mockResolvedValue({
      observations: [{ sourceName: 'actions', billId: '119-hr-1' }],
      cursorAfter: '2026-07-20T16:00:00Z',
    });
    const { supabase, rpc } = client();
    const result = await ingestBillAlertSources(supabase, 'congress-key');
    expect(result).toHaveLength(3);
    expect(mocks.persistObservation).toHaveBeenCalledWith(
      supabase, 'run-1', expect.anything(),
      expect.objectContaining({ leaseKey: 'bill-alerts:source:actions', fenceToken: 4 }),
    );
    expect(mocks.fanOutEvent).toHaveBeenCalledWith(
      supabase, 'event-1', expect.objectContaining({ leaseKey: 'bill-alerts:source:actions' }),
    );
    expect(rpc.mock.calls.filter((call) => call[0] === 'complete_bill_alert_source_run')).toHaveLength(3);
  });

  it('marks a source run failed when the fenced cursor commit is rejected', async () => {
    const { supabase, rpc } = client(false);
    await expect(ingestBillAlertSources(supabase, 'congress-key')).rejects.toThrow('stale run');
    expect(rpc).toHaveBeenCalledWith('fail_bill_alert_source_run', expect.objectContaining({
      p_run_id: 'run-1', p_fence_token: 4,
    }));
  });
});
