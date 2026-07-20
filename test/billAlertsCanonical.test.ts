import { afterEach, describe, expect, it, vi } from 'vitest';
import { billIdFromLabel, canonicalBillId, contentHash, eventKey, stableJson } from '../server/alerts/canonical.js';
import { billAlertModeCapabilities } from '../server/alerts/runtime.js';
import { houseFloorSource } from '../server/alerts/sources/houseFloor.js';

afterEach(() => vi.unstubAllGlobals());

describe('bill alert canonical identity', () => {
  it('normalizes every supported federal bill label', () => {
    expect(billIdFromLabel(119, 'H.R. 4437')).toBe('119-hr-4437');
    expect(billIdFromLabel(119, 'S. 21')).toBe('119-s-21');
    expect(billIdFromLabel(119, 'H. J. Res. 12')).toBe('119-hjres-12');
    expect(billIdFromLabel(119, 'S. Con. Res. 8')).toBe('119-sconres-8');
    expect(canonicalBillId(119, 'HRES', '0042')).toBe('119-hres-42');
  });

  it('uses sorted canonical JSON for stable hashes', () => {
    expect(stableJson({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
    expect(contentHash({ a: 1, b: 2 })).toBe(contentHash({ b: 2, a: 1 }));
    expect(eventKey({ bill_id: '119-hr-1' })).toHaveLength(64);
  });
});

describe('bill alert runtime modes', () => {
  it('keeps off as a true kill switch and shadow as ingest-only', () => {
    expect(billAlertModeCapabilities('off')).toEqual({ ingest: false, deliver: false });
    expect(billAlertModeCapabilities('shadow')).toEqual({ ingest: true, deliver: false });
  });

  it('allows delivery only for staged internal and public rollout', () => {
    expect(billAlertModeCapabilities('internal')).toEqual({ ingest: true, deliver: true });
    expect(billAlertModeCapabilities('public')).toEqual({ ingest: true, deliver: true });
  });
});

describe('House floor source', () => {
  it('parses an official weekly XML item and emits only after the baseline', async () => {
    const xml = `<floorschedule congress-num="119" week-date="2026-07-20" update-date="2026-07-20T14:00:00Z">
      <category type="Items that may be considered"><floor-items>
        <floor-item id="409519" add-date="2026-07-20T13:00:00Z" remove-date="">
          <legis-num>H.R. 4437</legis-num><floor-text>SMART Act, as amended</floor-text>
        </floor-item>
      </floor-items></category>
    </floorschedule>`;
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => new Response(xml, { status: 200 })));
    const context = {
      apiKey: '',
      followedBillIds: new Set(['119-hr-4437']),
      now: new Date('2026-07-20T15:00:00Z'),
    };
    const baseline = await houseFloorSource.poll({ ...context, cursorBefore: null });
    expect(baseline.observations).toHaveLength(2);
    expect(baseline.observations[0].billId).toBe('119-hr-4437');
    expect(baseline.observations[0].event).toBeUndefined();

    const changed = await houseFloorSource.poll({
      ...context,
      cursorBefore: '2026-07-20T13:30:00Z',
    });
    expect(changed.observations[0].event?.eventType).toBe('house_floor_listed');
    expect(changed.observations[0].event?.scheduledWeekStart).toBe('2026-07-20');
  });
});
