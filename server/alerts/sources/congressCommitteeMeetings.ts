import type { AlertSource, SourceObservation } from '../types.js';
import { canonicalBillId, contentHash, currentCongress } from '../canonical.js';

const API_ROOT = 'https://api.congress.gov/v3';

function list<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

async function congressJson(path: string, apiKey: string) {
  const url = new URL(`${API_ROOT}${path}`);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '250');
  url.searchParams.set('api_key', apiKey);
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Congress.gov committee request failed (${response.status})`);
  return response.json() as Promise<any>;
}

function statusEvent(status: string) {
  const value = status.toLowerCase();
  if (value === 'canceled' || value === 'cancelled' || value === 'postponed') {
    return {
      eventType: 'committee_meeting_cancelled' as const,
      headline: value === 'postponed' ? 'Committee meeting postponed' : 'Committee meeting cancelled',
      certainty: 'recorded' as const,
    };
  }
  if (value === 'rescheduled') {
    return {
      eventType: 'committee_meeting_rescheduled' as const,
      headline: 'Committee meeting rescheduled',
      certainty: 'scheduled' as const,
    };
  }
  return {
    eventType: 'committee_meeting_scheduled' as const,
    correctionEventType: 'committee_meeting_rescheduled' as const,
    headline: 'Committee meeting scheduled',
    certainty: 'scheduled' as const,
  };
}

export const congressCommitteeMeetingsSource: AlertSource = {
  name: 'congress_committee_meetings',
  async poll({ apiKey, cursorBefore, followedBillIds, now }) {
    const observations: SourceObservation[] = [];
    const congress = currentCongress(now);

    for (const chamber of ['house', 'senate'] as const) {
      const listBody = await congressJson(`/committee-meeting/${congress}/${chamber}`, apiKey);
      for (const summary of listBody.committeeMeetings ?? []) {
        const eventId = String(summary.eventId ?? '');
        if (!eventId) continue;
        if (cursorBefore && summary.updateDate && (
          new Date(summary.updateDate).getTime() < new Date(cursorBefore).getTime() - 3_600_000
        )) continue;
        const detailBody = await congressJson(`/committee-meeting/${congress}/${chamber}/${eventId}`, apiKey);
        const meeting = detailBody.committeeMeeting ?? detailBody.committeeMeetings?.[0];
        if (!meeting) continue;
        const bills = list(meeting.relatedItems?.bills?.bill ?? meeting.relatedItems?.bills?.item);
        const status = String(meeting.meetingStatus ?? 'Scheduled');
        const committee = list(meeting.committees?.item)[0] as any;
        const updatedAt = meeting.updateDate ?? summary.updateDate ?? null;
        const meetingAt = meeting.date ? new Date(meeting.date).getTime() : Number.POSITIVE_INFINITY;
        const isFresh = Boolean(cursorBefore && updatedAt && (
          new Date(updatedAt).getTime() >= new Date(cursorBefore).getTime() - 3_600_000
        ));
        const isRelevantTime = meetingAt >= now.getTime() - 86_400_000;

        for (const bill of bills as any[]) {
          const billId = canonicalBillId(bill.congress ?? congress, bill.type, bill.number);
          const sourceUrl = `https://www.congress.gov/event/${congress}th-congress/${chamber}-event/${eventId}`;
          if (!billId) {
            observations.push({
              sourceName: 'congress_committee_meetings',
              upstreamItemId: `${eventId}:${contentHash(bill)}`,
              sourceRevision: String(meeting.updateDate ?? summary.updateDate ?? contentHash(meeting)),
              billId: null,
              canonicalBillHint: `${bill.congress ?? congress}:${bill.type ?? ''}:${bill.number ?? ''}`,
              sourceUrl,
              sourceUpdatedAt: meeting.updateDate ?? summary.updateDate ?? null,
              sourceStatus: status.toLowerCase(),
              payload: { meeting, relatedBill: bill },
            });
            continue;
          }
          if (!followedBillIds.has(billId)) continue;
          observations.push({
            sourceName: 'congress_committee_meetings',
            upstreamItemId: `${eventId}:${billId}`,
            sourceRevision: String(meeting.updateDate ?? summary.updateDate ?? contentHash(meeting)),
            billId,
            sourceUrl,
            sourceUpdatedAt: meeting.updateDate ?? summary.updateDate ?? null,
            sourceStatus: status.toLowerCase(),
            payload: meeting,
            fingerprint: {
              status,
              title: meeting.title ?? null,
              date: meeting.date ?? null,
              committeeCode: committee?.systemCode ?? null,
            },
            event: isFresh && isRelevantTime ? {
              ...statusEvent(status),
              detail: String(meeting.title ?? '').trim() || null,
              chamber,
              committeeCode: committee?.systemCode ?? null,
              scheduledFor: meeting.date ?? null,
              sourceTimezone: 'America/New_York',
              timePrecision: meeting.date ? 'exact' : 'unknown',
              sourcePublishedAt: meeting.updateDate ?? summary.updateDate ?? null,
              eventSeriesKey: `committee:${eventId}:${billId}`,
            } : undefined,
          });
        }
      }
    }

    return { observations, cursorAfter: now.toISOString() };
  },
};
