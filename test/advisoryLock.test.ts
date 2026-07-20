import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  acquireLease,
  withLease,
  LeaseUnavailableError,
  listLeases,
} from '../etl/advisoryLock.js';

/**
 * Minimal in-memory stand-in for the fenced lease RPCs plus listLeases().
 *
 * This is explicitly a contract test against a mock, not against Supabase.
 * Integration tests run against a real DB after the migration lands.
 */
function makeMockSupabase() {
  const leases: Record<string, any> = {};
  const fenceCounters: Record<string, number> = {};

  const supabase: any = {
    rpc(name: string, args: any) {
      const key = args.p_lease_key;
      const existing = leases[key];
      if (name === 'acquire_etl_lease') {
        if (existing && new Date(existing.expires_at).getTime() > Date.now()) {
          return Promise.resolve({ data: [], error: null });
        }
        const fence = (fenceCounters[key] ?? 0) + 1;
        fenceCounters[key] = fence;
        const row = {
          lease_key: key,
          holder: args.p_holder,
          fence_token: fence,
          acquired_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + args.p_ttl_seconds * 1000).toISOString(),
          metadata: args.p_metadata,
        };
        leases[key] = row;
        return Promise.resolve({
          data: [{ holder: row.holder, fence_token: fence, expires_at: row.expires_at }],
          error: null,
        });
      }
      if (name === 'renew_etl_lease') {
        const matches = existing
          && existing.holder === args.p_holder
          && existing.fence_token === args.p_fence_token
          && new Date(existing.expires_at).getTime() > Date.now();
        if (!matches) return Promise.resolve({ data: null, error: null });
        existing.expires_at = new Date(Date.now() + args.p_ttl_seconds * 1000).toISOString();
        return Promise.resolve({ data: existing.expires_at, error: null });
      }
      if (name === 'release_etl_lease') {
        if (existing
          && existing.holder === args.p_holder
          && existing.fence_token === args.p_fence_token) {
          delete leases[key];
          return Promise.resolve({ data: true, error: null });
        }
        return Promise.resolve({ data: false, error: null });
      }
      throw new Error(`unexpected rpc: ${name}`);
    },
    from(table: string) {
      if (table !== 'etl_leases') {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        select() {
          return {
            order() {
              return Promise.resolve({
                data: Object.values(leases),
                error: null,
              });
            },
          };
        },
      };
    },
  };

  return { supabase: supabase as SupabaseClient, leases };
}

describe('acquireLease', () => {
  it('acquires a lease when no one holds it', async () => {
    const { supabase } = makeMockSupabase();
    const lease = await acquireLease(supabase, 'test-key', 60);
    expect(lease).not.toBeNull();
    expect(lease?.holder).toContain('-'); // format: host-pid-timestamp
  });

  it('returns null when another process holds an active lease', async () => {
    const { supabase } = makeMockSupabase();
    const first = await acquireLease(supabase, 'busy-key', 3600);
    expect(first).not.toBeNull();

    const second = await acquireLease(supabase, 'busy-key', 3600);
    expect(second).toBeNull();
  });

  it('acquires lease after the previous one is released', async () => {
    const { supabase } = makeMockSupabase();
    const first = await acquireLease(supabase, 'flap-key', 3600);
    expect(first).not.toBeNull();
    await first!.release();

    const second = await acquireLease(supabase, 'flap-key', 3600);
    expect(second).not.toBeNull();
    expect(second!.holder).not.toBe(first!.holder);
  });

  it('sweeps expired leases before acquiring', async () => {
    const { supabase, leases } = makeMockSupabase();

    // Plant an expired lease
    leases['stale-key'] = {
      lease_key: 'stale-key',
      holder: 'dead-process',
      acquired_at: '2020-01-01T00:00:00Z',
      expires_at: '2020-01-01T00:00:01Z',
      metadata: {},
    };

    const lease = await acquireLease(supabase, 'stale-key', 60);
    expect(lease).not.toBeNull();
    expect(lease!.holder).not.toBe('dead-process');
  });

  it('stores metadata on the lease row', async () => {
    const { supabase, leases } = makeMockSupabase();
    await acquireLease(supabase, 'meta-key', 60, {
      congress: 117,
      runId: 'abc',
    });
    expect(leases['meta-key'].metadata).toEqual({
      congress: 117,
      runId: 'abc',
    });
  });

  it('renews only the current fenced lease', async () => {
    const { supabase } = makeMockSupabase();
    const lease = await acquireLease(supabase, 'renew-key', 60);
    const before = lease!.expiresAt;
    const renewed = await lease!.renew(120);
    expect(new Date(renewed).getTime()).toBeGreaterThan(new Date(before).getTime());
    expect(lease!.expiresAt).toBe(renewed);
  });

  it('release only removes the lease for matching holder', async () => {
    const { supabase, leases } = makeMockSupabase();
    const lease = await acquireLease(supabase, 'release-key', 60);
    expect(lease).not.toBeNull();
    // Simulate a different process stole the key (shouldn't happen but test it)
    leases['release-key'] = { ...leases['release-key'], holder: 'someone-else' };

    await lease!.release();
    // Someone else's lease should NOT have been deleted
    expect(leases['release-key']).toBeDefined();
  });
});

describe('withLease', () => {
  it('runs the function and releases on success', async () => {
    const { supabase, leases } = makeMockSupabase();
    const result = await withLease(supabase, 'run-key', 60, async () => 42);
    expect(result).toBe(42);
    expect(leases['run-key']).toBeUndefined();
  });

  it('releases on error', async () => {
    const { supabase, leases } = makeMockSupabase();
    await expect(
      withLease(supabase, 'err-key', 60, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(leases['err-key']).toBeUndefined();
  });

  it('throws LeaseUnavailableError when another process holds the lease', async () => {
    const { supabase } = makeMockSupabase();
    await acquireLease(supabase, 'contest-key', 3600);

    await expect(
      withLease(supabase, 'contest-key', 60, async () => 'never-runs'),
    ).rejects.toBeInstanceOf(LeaseUnavailableError);
  });
});

describe('listLeases', () => {
  it('returns held leases', async () => {
    const { supabase } = makeMockSupabase();
    await acquireLease(supabase, 'list-a', 60);
    await acquireLease(supabase, 'list-b', 60);

    const leases = await listLeases(supabase);
    const keys = leases.map((l) => l.lease_key).sort();
    expect(keys).toEqual(['list-a', 'list-b']);
  });
});
