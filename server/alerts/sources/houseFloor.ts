import type { AlertSource, SourceObservation } from '../types.js';
import { billIdFromLabel, contentHash } from '../canonical.js';
import {
  fetchHouseFloorWeek,
  houseFloorPageUrl,
  mondayIso,
  parseHouseFloorXml,
} from '../../../shared/houseFloorSchedule.js';

export const houseFloorSource: AlertSource = {
  name: 'house_floor_schedule',
  async poll({ cursorBefore, followedBillIds, now }) {
    const observations: SourceObservation[] = [];
    let newestRevision = now.toISOString();

    for (const week of [mondayIso(now), mondayIso(now, 1)]) {
      const xml = await fetchHouseFloorWeek(week);
      if (!xml) continue;
      const parsed = parseHouseFloorXml(xml, week);
      if (!parsed) continue;
      const congress = parsed.congress;
      const updated = parsed.updated ?? week;
      newestRevision = updated > newestRevision ? updated : newestRevision;
      const sourceUrl = houseFloorPageUrl(week);

      for (const item of parsed.items) {
        const { label, title, removedAt } = item;
        const body = item.body;
        const billId = billIdFromLabel(congress, label);
        const itemId = item.itemId ?? contentHash({ label, body });
        const payload = { week, congress, itemId, label, title, removedAt, xml: item.xml };

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
