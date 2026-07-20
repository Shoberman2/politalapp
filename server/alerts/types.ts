export type BillAlertEventType =
  | 'committee_referral'
  | 'committee_meeting_scheduled'
  | 'committee_meeting_rescheduled'
  | 'committee_meeting_cancelled'
  | 'house_floor_listed'
  | 'house_floor_listing_changed'
  | 'senate_floor_attention'
  | 'floor_vote_recorded';

export type AlertCertainty = 'recorded' | 'scheduled' | 'tentative';

export interface PriorSourceItem {
  id: string;
  content_hash: string;
  source_status: string | null;
}

export interface AlertEventDraft {
  eventType: BillAlertEventType;
  correctionEventType?: BillAlertEventType;
  headline: string;
  detail?: string | null;
  chamber?: 'house' | 'senate' | 'joint' | null;
  committeeCode?: string | null;
  occurredAt?: string | null;
  scheduledFor?: string | null;
  scheduledDate?: string | null;
  scheduledWeekStart?: string | null;
  sourceTimezone?: string | null;
  timePrecision?: 'exact' | 'date' | 'week' | 'unknown';
  sourcePublishedAt?: string | null;
  certainty: AlertCertainty;
  eventSeriesKey?: string | null;
}

export interface SourceObservation {
  sourceName: string;
  upstreamItemId: string;
  sourceRevision: string;
  billId: string | null;
  canonicalBillHint?: string | null;
  sourceUrl: string;
  sourceUpdatedAt?: string | null;
  sourceStatus?: string | null;
  payload: unknown;
  /** Stable notification-relevant subset; raw evidence remains in payload. */
  fingerprint?: unknown;
  event?: AlertEventDraft;
}

export interface SourcePollResult {
  observations: SourceObservation[];
  cursorAfter: string;
  etag?: string | null;
}

export interface AlertSource {
  name: string;
  poll: (context: {
    apiKey: string;
    cursorBefore: string | null;
    followedBillIds: Set<string>;
    now: Date;
  }) => Promise<SourcePollResult>;
}

export interface PersistedAlertEvent {
  eventId: string | null;
  inserted: boolean;
}

export interface AlertLeaseIdentity {
  leaseKey: string;
  holder: string;
  fenceToken: number;
}

export interface DeliveryBatch {
  id: string;
  user_id: string;
  bill_id: string;
  send_status: string;
  claim_fence: number;
  claimed_by: string;
  attempt_count: number;
  recipient_email: string;
  from_snapshot: string;
  subject_snapshot: string;
  html_snapshot: string;
  text_snapshot: string;
  headers_snapshot: Record<string, string>;
}
