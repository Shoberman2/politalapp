import { acquireLease, LeaseUnavailableError } from '../../etl/advisoryLock.js';
import {
  fanOutEvent,
  followedBillIds,
  persistObservation,
  reconcileUnmatchedItems,
  resumePendingFanOut,
} from './persistence.js';
import { congressBillActionsSource } from './sources/congressBillActions.js';
import { congressCommitteeMeetingsSource } from './sources/congressCommitteeMeetings.js';
import { houseFloorSource } from './sources/houseFloor.js';
import type { AlertSource } from './types.js';
import type { SupabaseClient } from '@supabase/supabase-js';

const SOURCES: AlertSource[] = [
  congressBillActionsSource,
  congressCommitteeMeetingsSource,
  houseFloorSource,
];

function firstRow(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

async function runSource(
  supabase: SupabaseClient,
  source: AlertSource,
  apiKey: string,
  bills: Set<string>,
) {
  const leaseKey = `bill-alerts:source:${source.name}`;
  const lease = await acquireLease(supabase, leaseKey, 600, { source: source.name });
  if (!lease) throw new LeaseUnavailableError(leaseKey);
  let runId: string | null = null;
  let heartbeatError: unknown = null;
  const heartbeat = setInterval(() => {
    lease.renew(600).catch((error) => { heartbeatError = error; });
  }, 120_000);

  try {
    const leaseIdentity = {
      leaseKey,
      holder: lease.holder,
      fenceToken: lease.fenceToken,
    };
    const { data: started, error: startError } = await supabase.rpc('begin_bill_alert_source_run', {
      p_source_name: source.name,
      p_lease_key: leaseKey,
      p_holder: lease.holder,
      p_fence_token: lease.fenceToken,
    });
    if (startError) throw new Error(`Unable to begin ${source.name}: ${startError.message}`);
    const start = firstRow(started);
    runId = start.run_id;

    const result = await source.poll({
      apiKey,
      cursorBefore: start.cursor_before ?? null,
      followedBillIds: bills,
      now: new Date(),
    });
    if (heartbeatError) throw heartbeatError;
    await lease.renew(600);

    let eventsRecorded = 0;
    let unmatchedItems = 0;
    for (const observation of result.observations) {
      if (!observation.billId) unmatchedItems += 1;
      if (heartbeatError) throw heartbeatError;
      const event = await persistObservation(supabase, runId, observation, leaseIdentity);
      if (event.inserted && event.eventId) {
        eventsRecorded += 1;
        await fanOutEvent(supabase, event.eventId, leaseIdentity);
      }
    }
    const unmatchedReplayed = await reconcileUnmatchedItems(
      supabase,
      source.name,
      runId,
      leaseIdentity,
    );

    const { data: completed, error: completeError } = await supabase.rpc('complete_bill_alert_source_run', {
      p_run_id: runId,
      p_lease_key: leaseKey,
      p_holder: lease.holder,
      p_fence_token: lease.fenceToken,
      p_cursor_after: result.cursorAfter,
      p_etag: result.etag ?? null,
      p_items_observed: result.observations.length,
      p_unmatched_items: unmatchedItems,
      p_events_recorded: eventsRecorded,
    });
    if (completeError || completed !== true) {
      throw new Error(`Unable to commit ${source.name}: ${completeError?.message ?? 'stale run'}`);
    }
    return { source: source.name, observations: result.observations.length, eventsRecorded, unmatchedItems, unmatchedReplayed };
  } catch (error) {
    if (runId) {
      await supabase.rpc('fail_bill_alert_source_run', {
        p_run_id: runId,
        p_lease_key: leaseKey,
        p_holder: lease.holder,
        p_fence_token: lease.fenceToken,
        p_error_code: error instanceof Error ? error.message.slice(0, 120) : 'UNKNOWN_SOURCE_ERROR',
      });
    }
    throw error;
  } finally {
    clearInterval(heartbeat);
    await lease.release();
  }
}

export async function ingestBillAlertSources(
  supabase: SupabaseClient,
  apiKey: string,
) {
  const fanOutLeaseKey = 'bill-alerts:fanout';
  const fanOutLease = await acquireLease(supabase, fanOutLeaseKey, 600, { task: 'resume-fanout' });
  if (fanOutLease) {
    try {
      await resumePendingFanOut(supabase, {
        leaseKey: fanOutLeaseKey,
        holder: fanOutLease.holder,
        fenceToken: fanOutLease.fenceToken,
      });
    } finally {
      await fanOutLease.release();
    }
  }
  const bills = await followedBillIds(supabase);
  if (bills.size === 0) return [];
  const results = [];
  for (const source of SOURCES) {
    results.push(await runSource(supabase, source, apiKey, bills));
  }
  return results;
}
