/**
 * ETL concurrency control — lease-based locking.
 *
 * Why a lease table instead of pg_try_advisory_lock():
 *   Advisory locks are session-scoped and released when the connection closes.
 *   Supabase's HTTP-based JS client doesn't hold a single session across
 *   multiple RPC calls, so advisory locks alone don't give us durable
 *   cross-process exclusion. A row in etl_leases with expires_at gives us:
 *     1. Hard mutual exclusion via UNIQUE(lease_key) PRIMARY KEY.
 *     2. Crash recovery via expires_at — a process that dies holding a lease
 *        auto-frees it after the expiry window.
 *     3. Operator visibility — you can SELECT from etl_leases to see what's
 *        running.
 *
 * The pg_try_advisory_lock RPC is still available in the migration for any
 * future direct-connection ETL code (e.g., a node-postgres backfill worker).
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface Lease {
  lease_key: string;
  holder: string;
  acquired_at: string;
  expires_at: string;
  metadata: Record<string, unknown>;
}

export interface AcquiredLease {
  /** Unique holder ID that was written to the lease row. */
  holder: string;
  /** ISO expiry timestamp. */
  expiresAt: string;
  /**
   * Release the lease. Safe to call multiple times. Only deletes if the
   * holder matches (so we don't wipe someone else's lease after expiry
   * reassignment).
   */
  release: () => Promise<void>;
}

/**
 * Attempt to acquire a lease. Returns null if someone else holds an active
 * (non-expired) lease under the same key.
 *
 * @param supabase  Supabase client (should use service role).
 * @param leaseKey  Logical lock name, e.g., "etl:backfill:congress-117".
 * @param ttlSeconds  How long the lease is valid. Default 1 hour. Set this to
 *                    at least 2x the expected run time so heartbeats don't
 *                    need to be frequent.
 * @param metadata  Free-form JSON for operator visibility (e.g., {args, env}).
 */
export async function acquireLease(
  supabase: SupabaseClient,
  leaseKey: string,
  ttlSeconds: number = 3600,
  metadata: Record<string, unknown> = {},
): Promise<AcquiredLease | null> {
  const holder = `${process.env.HOSTNAME ?? 'local'}-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlSeconds * 1000).toISOString();

  // First: sweep any expired lease for this key. Otherwise, a crashed process
  // would block us forever even though its lease is stale.
  await supabase
    .from('etl_leases')
    .delete()
    .eq('lease_key', leaseKey)
    .lt('expires_at', now.toISOString());

  // Now try to insert the lease. UNIQUE(lease_key) PRIMARY KEY means this
  // fails cleanly if another process holds an unexpired lease.
  const { error } = await supabase.from('etl_leases').insert({
    lease_key: leaseKey,
    holder,
    acquired_at: now.toISOString(),
    expires_at: expiresAt,
    metadata,
  });

  if (error) {
    // 23505 = unique_violation → someone else holds the lease. Not our problem.
    if (error.code === '23505') return null;
    // Any other error is unexpected, propagate it.
    throw new Error(`Failed to acquire lease ${leaseKey}: ${error.message}`);
  }

  return {
    holder,
    expiresAt,
    release: async () => {
      const { error: releaseError } = await supabase
        .from('etl_leases')
        .delete()
        .eq('lease_key', leaseKey)
        .eq('holder', holder);

      if (releaseError) {
        // Log but don't throw — the lease will expire naturally.
        console.warn(
          `[advisoryLock] Lease release failed for ${leaseKey} (holder=${holder}): ${releaseError.message}`,
        );
      }
    },
  };
}

/**
 * Run a function inside a lease. Acquires, runs, releases — even on error.
 *
 * Throws if the lease cannot be acquired (another process holds it).
 */
export async function withLease<T>(
  supabase: SupabaseClient,
  leaseKey: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
  metadata: Record<string, unknown> = {},
): Promise<T> {
  const lease = await acquireLease(supabase, leaseKey, ttlSeconds, metadata);
  if (!lease) {
    throw new LeaseUnavailableError(leaseKey);
  }
  try {
    return await fn();
  } finally {
    await lease.release();
  }
}

export class LeaseUnavailableError extends Error {
  constructor(leaseKey: string) {
    super(
      `Lease '${leaseKey}' is held by another process. Wait for it to finish or expire.`,
    );
    this.name = 'LeaseUnavailableError';
  }
}

/**
 * Inspect currently-held leases. Useful for debugging / operator dashboards.
 * Does NOT filter out expired leases (caller can inspect expires_at).
 */
export async function listLeases(
  supabase: SupabaseClient,
): Promise<Lease[]> {
  const { data, error } = await supabase
    .from('etl_leases')
    .select('*')
    .order('acquired_at', { ascending: false });

  if (error) {
    throw new Error(`Failed to list leases: ${error.message}`);
  }
  return (data ?? []) as Lease[];
}
