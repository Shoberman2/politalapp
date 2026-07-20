import type { AlertSource, SourceObservation } from '../types.js';
import { canonicalBillId, contentHash } from '../canonical.js';

const API_ROOT = 'https://api.congress.gov/v3';

function publicBillUrl(billId: string): string {
  const [congress, type, number] = billId.split('-');
  const paths: Record<string, string> = {
    hr: 'house-bill',
    s: 'senate-bill',
    hjres: 'house-joint-resolution',
    sjres: 'senate-joint-resolution',
    hconres: 'house-concurrent-resolution',
    sconres: 'senate-concurrent-resolution',
    hres: 'house-resolution',
    sres: 'senate-resolution',
  };
  return `https://www.congress.gov/bill/${congress}th-congress/${paths[type] ?? type}/${number}/actions`;
}

function actionEvent(text: string) {
  const normalized = text.toLowerCase();
  if (/referred to (the )?.*committee|committee referral/.test(normalized)) {
    return {
      eventType: 'committee_referral' as const,
      headline: 'Referred to committee',
      certainty: 'recorded' as const,
    };
  }
  if (/roll (no\.|number)|recorded vote|yeas? and nays?/.test(normalized)) {
    return {
      eventType: 'floor_vote_recorded' as const,
      headline: 'Floor vote recorded',
      certainty: 'recorded' as const,
    };
  }
  return null;
}

async function fetchJson(url: URL) {
  const response = await fetch(url, { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Congress.gov actions request failed (${response.status})`);
  return response.json() as Promise<any>;
}

export const congressBillActionsSource: AlertSource = {
  name: 'congress_bill_actions',
  async poll({ apiKey, cursorBefore, followedBillIds, now }) {
    const observations: SourceObservation[] = [];
    const allBills = [...followedBillIds].sort();
    const perRunLimit = 400;
    const window = Math.floor(now.getTime() / 600_000);
    const start = allBills.length > perRunLimit ? (window * perRunLimit) % allBills.length : 0;
    const billsThisRun = allBills.length > perRunLimit
      ? [...allBills.slice(start), ...allBills.slice(0, start)].slice(0, perRunLimit)
      : allBills;

    for (const billId of billsThisRun) {
      const [congress, type, number] = billId.split('-');
      if (!canonicalBillId(congress, type, number)) continue;
      const url = new URL(`${API_ROOT}/bill/${congress}/${type}/${number}/actions`);
      url.searchParams.set('format', 'json');
      url.searchParams.set('limit', '250');
      url.searchParams.set('api_key', apiKey);
      const body = await fetchJson(url);

      for (const action of body.actions ?? []) {
        const text = String(action.text ?? '').trim();
        const event = actionEvent(text);
        if (!event) continue;
        const identity = `${action.actionDate ?? ''}:${action.actionCode ?? ''}:${contentHash(text)}`;
        // A source's first run is a baseline: persist existing official facts
        // without surprising users with historical email. Subsequent runs use
        // a one-day overlap; the immutable event key removes duplicates.
        const observedAt = action.updateDate ?? action.actionDate ?? null;
        const isFresh = Boolean(cursorBefore && observedAt && (
          new Date(observedAt).getTime() >= new Date(cursorBefore).getTime() - 86_400_000
        ));
        observations.push({
          sourceName: 'congress_bill_actions',
          upstreamItemId: `${billId}:${identity}`,
          sourceRevision: String(action.updateDate ?? contentHash(action)),
          billId,
          sourceUrl: publicBillUrl(billId),
          sourceUpdatedAt: action.updateDate ?? action.actionDate ?? null,
          sourceStatus: event.eventType,
          payload: action,
          fingerprint: { text, eventType: event.eventType, actionDate: action.actionDate ?? null },
          event: isFresh ? {
            ...event,
            detail: text,
            chamber: String(action.sourceSystem?.name ?? '').toLowerCase().includes('senate')
              ? 'senate'
              : String(action.sourceSystem?.name ?? '').toLowerCase().includes('house')
                ? 'house'
                : null,
            occurredAt: action.actionDate ? `${action.actionDate}T12:00:00Z` : null,
            timePrecision: 'date',
            sourcePublishedAt: action.updateDate ?? null,
          } : undefined,
        });
      }
    }

    return { observations, cursorAfter: now.toISOString() };
  },
};
