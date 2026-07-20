import type { SupabaseClient } from '@supabase/supabase-js';
import { billIdFromLabel, canonicalBillId, contentHash, eventKey } from './canonical.js';
import type {
  AlertLeaseIdentity,
  PersistedAlertEvent,
  PriorSourceItem,
  SourceObservation,
} from './types.js';

function throwDatabase(context: string, error: any): never {
  throw new Error(`${context}: ${error?.message ?? 'unknown database error'}`);
}

function rpcRow(data: any): any {
  return Array.isArray(data) ? data[0] : data;
}

export async function followedBillIds(supabase: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('bill_follows')
    .select('bill_id')
    .is('stopped_at', null)
    .is('paused_at', null)
    .eq('email_enabled', true);
  if (error) throwDatabase('Unable to load followed bills', error);
  return new Set((data ?? []).map((row: any) => row.bill_id));
}

async function latestSeriesEvent(
  supabase: SupabaseClient,
  seriesKey: string | null | undefined,
): Promise<string | null> {
  if (!seriesKey) return null;
  const { data, error } = await supabase
    .from('bill_events')
    .select('id')
    .eq('event_series_key', seriesKey)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throwDatabase('Unable to find prior bill event', error);
  return data?.id ?? null;
}

function fencedArgs(runId: string, lease: AlertLeaseIdentity) {
  return {
    p_run_id: runId,
    p_lease_key: lease.leaseKey,
    p_holder: lease.holder,
    p_fence_token: lease.fenceToken,
  };
}

async function persistUnmatched(
  supabase: SupabaseClient,
  runId: string,
  observation: SourceObservation,
  lease: AlertLeaseIdentity,
) {
  const { error } = await supabase.rpc('persist_bill_alert_unmatched_item', {
    ...fencedArgs(runId, lease),
    p_item: {
      source_name: observation.sourceName,
      upstream_item_id: observation.upstreamItemId,
      source_revision: observation.sourceRevision,
      canonical_bill_hint: observation.canonicalBillHint ?? null,
      source_url: observation.sourceUrl,
      payload: observation.payload,
    },
  });
  if (error) throwDatabase('Unable to persist unmatched alert item', error);
}

export async function persistObservation(
  supabase: SupabaseClient,
  runId: string,
  observation: SourceObservation,
  lease: AlertLeaseIdentity,
): Promise<PersistedAlertEvent> {
  if (!observation.billId) {
    await persistUnmatched(supabase, runId, observation, lease);
    return { eventId: null, inserted: false };
  }

  const itemContentHash = contentHash(observation.fingerprint ?? observation.event ?? observation.payload);
  const payloadContentHash = contentHash(observation.payload);
  const { data: prior, error: priorError } = await supabase
    .from('bill_source_items')
    .select('id,content_hash,source_status')
    .eq('source_name', observation.sourceName)
    .eq('upstream_item_id', observation.upstreamItemId)
    .eq('bill_id', observation.billId)
    .maybeSingle();
  if (priorError) throwDatabase('Unable to inspect source item', priorError);

  const typedPrior = prior as PriorSourceItem | null;
  let eventPayload: Record<string, unknown> | null = null;

  const isCorrection = Boolean(observation.event && typedPrior && (
    observation.event.correctionEventType
    || observation.event.eventType.endsWith('_cancelled')
    || observation.event.eventType.endsWith('_rescheduled')
    || observation.event.eventType.endsWith('_changed')
  ));

  // A cancellation/reschedule first observed without a prior source snapshot
  // is a baseline fact, not a useful alert.
  const isInitialCorrection = Boolean(observation.event && !typedPrior && (
    observation.event.eventType.endsWith('_cancelled')
    || observation.event.eventType.endsWith('_rescheduled')
    || observation.event.eventType.endsWith('_changed')
  ));

  if (observation.event && typedPrior?.content_hash !== itemContentHash && !isInitialCorrection) {
    const finalType = typedPrior && observation.event.correctionEventType
      ? observation.event.correctionEventType
      : observation.event.eventType;
    const supersedesEventId = isCorrection
      ? await latestSeriesEvent(supabase, observation.event.eventSeriesKey)
      : null;
    const identity = {
      source_name: observation.sourceName,
      upstream_item_id: observation.upstreamItemId,
      source_revision: observation.sourceRevision,
      bill_id: observation.billId,
      event_type: finalType,
      occurred_at: observation.event.occurredAt ?? null,
      scheduled_for: observation.event.scheduledFor ?? null,
      scheduled_date: observation.event.scheduledDate ?? null,
      scheduled_week_start: observation.event.scheduledWeekStart ?? null,
      source_status: observation.sourceStatus ?? null,
    };
    eventPayload = {
      event_key: eventKey(identity),
      event_key_version: 1,
      evidence_content_hash: payloadContentHash,
      bill_id: observation.billId,
      event_series_key: observation.event.eventSeriesKey ?? null,
      is_correction: isCorrection,
      supersedes_event_id: supersedesEventId,
      event_type: finalType,
      headline: observation.event.headline,
      detail: observation.event.detail ?? null,
      chamber: observation.event.chamber ?? null,
      committee_code: observation.event.committeeCode ?? null,
      occurred_at: observation.event.occurredAt ?? null,
      scheduled_for: observation.event.scheduledFor ?? null,
      scheduled_date: observation.event.scheduledDate ?? null,
      scheduled_week_start: observation.event.scheduledWeekStart ?? null,
      source_timezone: observation.event.sourceTimezone ?? null,
      time_precision: observation.event.timePrecision ?? 'unknown',
      source_url: observation.sourceUrl,
      source_published_at: observation.event.sourcePublishedAt ?? null,
      certainty: observation.event.certainty,
    };
  }

  const { data: recorded, error: eventError } = await supabase.rpc('persist_bill_alert_observation', {
    ...fencedArgs(runId, lease),
    p_observation: {
      source_name: observation.sourceName,
      upstream_item_id: observation.upstreamItemId,
      source_revision: observation.sourceRevision,
      bill_id: observation.billId,
      source_status: observation.sourceStatus ?? null,
      item_content_hash: itemContentHash,
      payload_content_hash: payloadContentHash,
      source_url: observation.sourceUrl,
      source_updated_at: observation.sourceUpdatedAt ?? null,
      payload: observation.payload,
    },
    p_event: eventPayload,
  });
  if (eventError) throwDatabase('Unable to persist bill alert observation', eventError);
  const row = rpcRow(recorded);
  return { eventId: row?.event_id ?? null, inserted: row?.inserted === true };
}

export async function fanOutEvent(
  supabase: SupabaseClient,
  eventId: string,
  lease: AlertLeaseIdentity,
) {
  for (let page = 0; page < 100; page += 1) {
    const { data, error } = await supabase.rpc('fan_out_bill_event', {
      p_event_id: eventId,
      p_limit: 1000,
      p_lease_key: lease.leaseKey,
      p_holder: lease.holder,
      p_fence_token: lease.fenceToken,
    });
    if (error) throwDatabase('Unable to fan out bill event', error);
    if (rpcRow(data)?.completed !== false) return;
  }
  throw new Error(`Fan-out page limit exceeded for event ${eventId}`);
}

export async function resumePendingFanOut(
  supabase: SupabaseClient,
  lease: AlertLeaseIdentity,
  limit = 100,
) {
  const { data, error } = await supabase
    .from('bill_alert_fanout_progress')
    .select('event_id')
    .is('completed_at', null)
    .order('updated_at', { ascending: true })
    .limit(limit);
  if (error) throwDatabase('Unable to load pending bill alert fan-out', error);
  for (const row of data ?? []) {
    await fanOutEvent(supabase, row.event_id, lease);
  }
  return data?.length ?? 0;
}

function resolvedHint(row: any): string | null {
  const payload = row.payload ?? {};
  if (row.source_name === 'house_floor_schedule') {
    return billIdFromLabel(payload.congress ?? '', payload.label ?? row.canonical_bill_hint ?? '');
  }
  if (row.source_name === 'congress_committee_meetings') {
    const related = payload.relatedBill ?? {};
    if (related.type && related.number) {
      return canonicalBillId(related.congress ?? '', related.type, related.number);
    }
    const [congress, type, number] = String(row.canonical_bill_hint ?? '').split(':');
    return canonicalBillId(congress, type, number);
  }
  return null;
}

/**
 * Replay previously-unmatched evidence once the regular bill ETL has hydrated
 * the canonical bill. Replays establish a baseline and intentionally do not
 * emit a historical notification.
 */
export async function reconcileUnmatchedItems(
  supabase: SupabaseClient,
  sourceName: string,
  runId: string,
  lease: AlertLeaseIdentity,
) {
  const { data: rows, error } = await supabase
    .from('bill_alert_unmatched_items')
    .select('*')
    .eq('source_name', sourceName)
    .is('resolved_at', null)
    .order('first_seen_at', { ascending: true })
    .limit(100);
  if (error) throwDatabase('Unable to load unmatched source items', error);
  let replayed = 0;

  for (const unmatched of rows ?? []) {
    const billId = resolvedHint(unmatched);
    if (!billId) continue;
    const { data: bill, error: billError } = await supabase
      .from('bills')
      .select('id')
      .eq('id', billId)
      .maybeSingle();
    if (billError) throwDatabase('Unable to verify reconciled bill', billError);
    if (!bill) continue;

    const replayUpstreamId = unmatched.source_name === 'house_floor_schedule'
      ? `${unmatched.upstream_item_id}:${billId}`
      : unmatched.source_name === 'congress_committee_meetings'
        ? `${unmatched.payload?.meeting?.eventId ?? String(unmatched.upstream_item_id).split(':')[0]}:${billId}`
        : unmatched.upstream_item_id;
    const replayFingerprint = unmatched.source_name === 'house_floor_schedule'
      ? {
          week: unmatched.payload?.week,
          label: unmatched.payload?.label,
          title: unmatched.payload?.title,
          removedAt: unmatched.payload?.removedAt,
        }
      : {
          status: unmatched.payload?.meeting?.meetingStatus ?? 'Scheduled',
          title: unmatched.payload?.meeting?.title ?? null,
          date: unmatched.payload?.meeting?.date ?? null,
          committeeCode: unmatched.payload?.meeting?.committees?.item?.[0]?.systemCode
            ?? unmatched.payload?.meeting?.committees?.item?.systemCode
            ?? null,
        };

    await persistObservation(supabase, runId, {
      sourceName: unmatched.source_name,
      upstreamItemId: replayUpstreamId,
      sourceRevision: unmatched.source_revision,
      billId,
      sourceUrl: unmatched.source_url,
      sourceStatus: unmatched.payload?.removedAt ? 'removed' : null,
      payload: unmatched.source_name === 'congress_committee_meetings'
        ? unmatched.payload?.meeting
        : unmatched.payload,
      fingerprint: replayFingerprint,
    }, lease);
    const { error: updateError } = await supabase.rpc('resolve_bill_alert_unmatched_item', {
      ...fencedArgs(runId, lease),
      p_item_id: unmatched.id,
      p_bill_id: billId,
    });
    if (updateError) throwDatabase('Unable to mark source item reconciled', updateError);
    replayed += 1;
  }
  return replayed;
}
