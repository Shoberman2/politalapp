import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  acquireLease,
  withLease,
  LeaseUnavailableError,
  listLeases,
} from '../etl/advisoryLock.js';

/**
 * Minimal in-memory Supabase stand-in that implements only the fluent calls
 * used by advisoryLock.ts: from(table).insert(), .delete().eq().eq(),
 * .delete().eq().lt(), .select().order().
 *
 * This is explicitly a contract test against a mock, not against Supabase.
 * Integration tests run against a real DB after the migration lands.
 */
function makeMockSupabase() {
  const leases: Record<string, any> = {};

  const supabase: any = {
    from(table: string) {
      if (table !== 'etl_leases') {
        throw new Error(`unexpected table: ${table}`);
      }
      return {
        insert(row: any) {
          if (leases[row.lease_key]) {
            return Promise.resolve({
              error: { code: '23505', message: 'unique_violation' },
            });
          }
          leases[row.lease_key] = row;
          return Promise.resolve({ error: null });
        },
        delete() {
          const filters: Array<{ op: string; col: string; val: any }> = [];
          const builder: any = {
            eq(col: string, val: any) {
              filters.push({ op: 'eq', col, val });
              return builder;
            },
            lt(col: string, val: any) {
              filters.push({ op: 'lt', col, val });
              return builder;
            },
            then(resolve: any, reject: any) {
              try {
                const res = runDelete(leases, filters);
                resolve({ ...res, error: null });
              } catch (err) {
                reject(err);
              }
            },
          };
          return builder;
        },
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

function runDelete(
  leases: Record<string, any>,
  filters: Array<{ op: string; col: string; val: any }>,
) {
  let count = 0;
  for (const key of Object.keys(leases)) {
    const row = leases[key];
    const matches = filters.every(({ op, col, val }) => {
      if (op === 'eq') return row[col] === val;
      if (op === 'lt') return new Date(row[col]).getTime() < new Date(val).getTime();
      return false;
    });
    if (matches) {
      delete leases[key];
      count++;
    }
  }
  return { count };
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
