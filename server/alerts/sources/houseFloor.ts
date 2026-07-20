import type { AlertSource, SourceObservation } from '../types.js';
import { billIdFromLabel, contentHash } from '../canonical.js';

function mondayIso(date: Date, addWeeks = 0): string {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay() || 7;
  copy.setUTCDate(copy.getUTCDate() - day + 1 + addWeeks * 7);
  return copy.toISOString().slice(0, 10);
}

function attribute(tag: string, name: string): string | null {
  return tag.match(new RegExp(`${name}="([^"]*)"`, 'i'))?.[1] ?? null;
}

function element(xml: string, name: string): string {
  return (xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

async function fetchWeek(week: string) {
  const compact = week.replaceAll('-', '');
  const download = new URL('https://docs.house.gov/floor/Download.aspx');
  download.searchParams.set('file', `/billsthisweek/${compact}/${compact}.xml`);
  const response = await fetch(download, { headers: { accept: 'application/xml,text/xml' } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`House floor schedule request failed (${response.status})`);
  return response.text();
}

export const houseFloorSource: AlertSource = {
  name: 'house_floor_schedule',
  async poll({ cursorBefore, followedBillIds, now }) {
    const observations: SourceObservation[] = [];
    let newestRevision = now.toISOString();

    for (const week of [mondayIso(now), mondayIso(now, 1)]) {
      const xml = await fetchWeek(week);
      if (!xml) continue;
      const root = xml.match(/<floorschedule\b[^>]*>/i)?.[0] ?? '';
      const congress = attribute(root, 'congress-num') ?? '';
      const updated = attribute(root, 'update-date') ?? attribute(root, 'create-date') ?? week;
      newestRevision = updated > newestRevision ? updated : newestRevision;
      const sourceUrl = `https://docs.house.gov/floor/Default.aspx?date=${week}`;
      const itemPattern = /<floor-item\b([^>]*)>([\s\S]*?)<\/floor-item>/gi;
      let match: RegExpExecArray | null;

      while ((match = itemPattern.exec(xml))) {
        const attrs = match[1];
        const body = match[2];
        const label = element(body, 'legis-num');
        const billId = billIdFromLabel(congress, label);
        const removedAt = attribute(attrs, 'remove-date');
        const itemId = attribute(attrs, 'id') ?? contentHash({ label, body });
        const title = element(body, 'floor-text');
        const payload = { week, congress, itemId, label, title, removedAt, xml: match[0] };

        if (!billId) {
          observations.push({
            sourceName: 'house_floor_schedule',
            upstreamItemId: `${week}:${itemId}`,
            sourceRevision: String(updated),
            billId: null,
            canonicalBillHint: label || title || null,
            sourceUrl,
            sourceUpdatedAt: updated,
            sourceStatus: removedAt ? 'removed' : 'listed',
            payload,
          });
          continue;
        }
        if (!followedBillIds.has(billId)) continue;

        const isFresh = Boolean(cursorBefore && (
          new Date(updated).getTime() >= new Date(cursorBefore).getTime() - 3_600_000
        ));
        observations.push({
          sourceName: 'house_floor_schedule',
          upstreamItemId: `${week}:${itemId}:${billId}`,
          sourceRevision: String(updated),
          billId,
          sourceUrl,
          sourceUpdatedAt: updated,
          sourceStatus: removedAt ? 'removed' : 'listed',
          payload,
          fingerprint: { week, label, title, removedAt },
          event: isFresh ? {
            eventType: removedAt ? 'house_floor_listing_changed' : 'house_floor_listed',
            correctionEventType: 'house_floor_listing_changed',
            headline: removedAt ? 'House floor listing removed' : 'Listed for House floor consideration',
            detail: title || label,
            chamber: 'house',
            scheduledWeekStart: week,
            sourceTimezone: 'America/New_York',
            timePrecision: 'week',
            sourcePublishedAt: updated,
            certainty: 'tentative',
            eventSeriesKey: `house-floor:${week}:${billId}`,
          } : undefined,
        });
      }
    }

    return { observations, cursorAfter: newestRevision };
  },
};
