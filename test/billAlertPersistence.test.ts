import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { contentHash } from '../server/alerts/canonical.js';
import {
  fanOutEvent,
  followedBillIds,
  persistObservation,
  resumePendingFanOut,
} from '../server/alerts/persistence.js';

const lease = { leaseKey: 'bill-alerts:source:source', holder: 'worker', fenceToken: 7 };

function sourceItemQuery(prior: any) {
  const query: any = {
    select: () => query,
    eq: () => query,
    maybeSingle: () => Promise.resolve({ data: prior, error: null }),
  };
  return query;
}

function persistenceClient(prior: any = null, recorded: any = [{ event_id: null, inserted: false }]) {
  const rpc = vi.fn().mockResolvedValue({ data: recorded, error: null });
  const supabase: any = {
    from: vi.fn((table: string) => {
      if (table !== 'bill_source_items') throw new Error(`unexpected table: ${table}`);
      return sourceItemQuery(prior);
    }),
    rpc,
  };
  return { supabase: supabase as SupabaseClient, rpc };
}

const observation = {
  sourceName: 'source', upstreamItemId: 'upstream-1', sourceRevision: 'r1',
  billId: '119-hr-1', sourceUrl: 'https://example.gov/item',
  sourceUpdatedAt: '2026-07-20T15:00:00Z', sourceStatus: 'recorded',
  payload: { official: true }, fingerprint: { state: 'recorded' },
  event: {
    eventType: 'floor_vote_recorded' as const,
    headline: 'Floor vote recorded', occurredAt: '2026-07-20T12:00:00Z',
    sourcePublishedAt: '2026-07-20T15:00:00Z', certainty: 'recorded' as const,
  },
};

describe('fenced bill-alert persistence', () => {
  it('polls active in-app follows even when email delivery is disabled', async () => {
    const query: any = {
      select: vi.fn(() => query),
      is: vi.fn(() => query),
      then: (resolve: (value: unknown) => unknown) => resolve({
        data: [{ bill_id: '119-hr-1' }],
        error: null,
      }),
    };
    const from = vi.fn(() => query);

    await expect(followedBillIds({ from } as any as SupabaseClient))
      .resolves.toEqual(new Set(['119-hr-1']));
    expect(query.is).toHaveBeenCalledTimes(2);
    expect(query).not.toHaveProperty('eq');
  });

  it('persists evidence and a new event in one fenced RPC', async () => {
    const { supabase, rpc } = persistenceClient(null, [{ event_id: 'event-1', inserted: true }]);
    const result = await persistObservation(supabase, 'run-1', observation, lease);
    expect(result).toEqual({ eventId: 'event-1', inserted: true });
    expect(rpc).toHaveBeenCalledWith('persist_bill_alert_observation', expect.objectContaining({
      p_run_id: 'run-1', p_lease_key: lease.leaseKey, p_holder: lease.holder,
      p_fence_token: 7,
      p_event: expect.objectContaining({ event_type: 'floor_vote_recorded' }),
    }));
  });

  it('updates duplicate evidence without creating the same event again', async () => {
    const prior = { id: 'item-1', content_hash: contentHash(observation.fingerprint), source_status: 'recorded' };
    const { supabase, rpc } = persistenceClient(prior);
    await persistObservation(supabase, 'run-1', observation, lease);
    expect(rpc).toHaveBeenCalledWith('persist_bill_alert_observation', expect.objectContaining({ p_event: null }));
  });

  it('persists unmatched evidence through the fenced RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 'unmatched-1', error: null });
    const supabase = { rpc } as any as SupabaseClient;
    await persistObservation(supabase, 'run-1', { ...observation, billId: null, event: undefined }, lease);
    expect(rpc).toHaveBeenCalledWith('persist_bill_alert_unmatched_item', expect.objectContaining({
      p_run_id: 'run-1', p_fence_token: 7,
    }));
  });
});

describe('durable fan-out resumption', () => {
  it('pages until the database marks an event complete', async () => {
    let emailPage = 0;
    const rpc = vi.fn(async (name: string) => {
      if (name === 'fan_out_bill_event_in_app') {
        return { data: 1, error: null };
      }
      emailPage += 1;
      return { data: [{ completed: emailPage > 1 }], error: null };
    });
    await fanOutEvent({ rpc } as any as SupabaseClient, 'event-1', lease);
    expect(rpc).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenCalledWith('fan_out_bill_event_in_app', expect.objectContaining({
      p_event_id: 'event-1', p_fence_token: 7,
    }));
    expect(rpc).toHaveBeenLastCalledWith('fan_out_bill_event', expect.objectContaining({
      p_event_id: 'event-1', p_fence_token: 7,
    }));
  });

  it('sweeps incomplete events independently of whether insertion is replayed', async () => {
    const query: any = {
      select: () => query, is: () => query, order: () => query,
      limit: () => Promise.resolve({ data: [{ event_id: 'event-1' }, { event_id: 'event-2' }], error: null }),
    };
    const rpc = vi.fn(async (name: string) => ({
      data: name === 'fan_out_bill_event_in_app' ? 1 : [{ completed: true }],
      error: null,
    }));
    const supabase = { from: () => query, rpc } as any as SupabaseClient;
    await expect(resumePendingFanOut(supabase, lease)).resolves.toBe(2);
    expect(rpc.mock.calls.filter((call) => call[0] === 'fan_out_bill_event')
      .map((call) => call[1].p_event_id)).toEqual(['event-1', 'event-2']);
  });
});
