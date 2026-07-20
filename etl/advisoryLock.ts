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
  fence_token: number;
}

export interface AcquiredLease {
  /** Unique holder ID that was written to the lease row. */
  holder: string;
  /** Monotonically increasing token that fences stale workers. */
  fenceToken: number;
  /** ISO expiry timestamp. */
  expiresAt: string;
  /** Extend this exact lease. Throws if ownership has changed or expired. */
  renew: (ttlSeconds?: number) => Promise<string>;
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
  const { data, error } = await supabase.rpc('acquire_etl_lease', {
    p_lease_key: leaseKey,
    p_holder: holder,
    p_ttl_seconds: ttlSeconds,
    p_metadata: metadata,
  });

  if (error) {
    throw new Error(`Failed to acquire lease ${leaseKey}: ${error.message}`);
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  const fenceToken = Number(row.fence_token);
  let expiresAt = String(row.expires_at);

  const acquired: AcquiredLease = {
    holder,
    fenceToken,
    expiresAt,
    renew: async (renewTtlSeconds = ttlSeconds) => {
      const { data: renewedAt, error: renewError } = await supabase.rpc('renew_etl_lease', {
        p_lease_key: leaseKey,
        p_holder: holder,
        p_fence_token: fenceToken,
        p_ttl_seconds: renewTtlSeconds,
      });
      if (renewError) {
        throw new Error(`Failed to renew lease ${leaseKey}: ${renewError.message}`);
      }
      if (!renewedAt) throw new LeaseLostError(leaseKey);
      expiresAt = String(renewedAt);
      acquired.expiresAt = expiresAt;
      return expiresAt;
    },
    release: async () => {
      const { error: releaseError } = await supabase.rpc('release_etl_lease', {
        p_lease_key: leaseKey,
        p_holder: holder,
        p_fence_token: fenceToken,
      });

      if (releaseError) {
        // Log but don't throw — the lease will expire naturally.
        console.warn(
          `[advisoryLock] Lease release failed for ${leaseKey} (holder=${holder}): ${releaseError.message}`,
        );
      }
    },
  };
  return acquired;
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

export class LeaseLostError extends Error {
  constructor(leaseKey: string) {
    super(`Lease '${leaseKey}' expired or was reassigned to another process.`);
    this.name = 'LeaseLostError';
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
