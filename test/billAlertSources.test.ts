import { afterEach, describe, expect, it, vi } from 'vitest';
import { congressBillActionsSource } from '../server/alerts/sources/congressBillActions.js';
import { congressCommitteeMeetingsSource } from '../server/alerts/sources/congressCommitteeMeetings.js';
import { houseFloorSource } from '../server/alerts/sources/houseFloor.js';

afterEach(() => vi.unstubAllGlobals());

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('Congress.gov bill action alerts', () => {
  it('classifies committee referrals and recorded votes after the baseline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      actions: [
        { text: 'Referred to the House Committee on Rules.', actionDate: '2026-07-20', updateDate: '2026-07-20T15:00:00Z' },
        { text: 'On motion to suspend the rules and pass Agreed to by recorded vote: 400 - 12.', actionDate: '2026-07-20', updateDate: '2026-07-20T15:01:00Z' },
      ],
    })));

    const result = await congressBillActionsSource.poll({
      apiKey: 'secret',
      cursorBefore: '2026-07-20T14:00:00Z',
      followedBillIds: new Set(['119-hr-1']),
      now: new Date('2026-07-20T16:00:00Z'),
    });

    expect(result.observations.map((item) => item.event?.eventType)).toEqual([
      'committee_referral',
      'floor_vote_recorded',
    ]);
    expect(String((fetch as any).mock.calls[0][0])).toContain('/bill/119/hr/1/actions');
  });

  it('persists the first poll as a baseline without an alert event', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({
      actions: [{ text: 'Referred to the Committee on Rules.', actionDate: '2026-07-19' }],
    })));
    const result = await congressBillActionsSource.poll({
      apiKey: 'secret', cursorBefore: null,
      followedBillIds: new Set(['119-hr-1']), now: new Date('2026-07-20T16:00:00Z'),
    });
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0].event).toBeUndefined();
  });

  it('fails closed when Congress.gov rejects the request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({}, 503)));
    await expect(congressBillActionsSource.poll({
      apiKey: 'secret', cursorBefore: '2026-07-20T14:00:00Z',
      followedBillIds: new Set(['119-hr-1']), now: new Date('2026-07-20T16:00:00Z'),
    })).rejects.toThrow('Congress.gov actions request failed (503)');
  });
});

describe('Congress.gov committee meeting alerts', () => {
  it('normalizes an upcoming meeting for a followed bill', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes('/committee-meeting/119/house/42')) {
        return jsonResponse({ committeeMeeting: {
          eventId: '42', meetingStatus: 'Scheduled', title: 'Markup of H.R. 1',
          date: '2026-07-22T14:00:00Z', updateDate: '2026-07-20T15:00:00Z',
          committees: { item: [{ systemCode: 'hsru00' }] },
          relatedItems: { bills: { bill: [{ congress: 119, type: 'HR', number: 1 }] } },
        } });
      }
      if (url.includes('/committee-meeting/119/house')) {
        return jsonResponse({ committeeMeetings: [{ eventId: '42', updateDate: '2026-07-20T15:00:00Z' }] });
      }
      return jsonResponse({ committeeMeetings: [] });
    }));

    const result = await congressCommitteeMeetingsSource.poll({
      apiKey: 'secret', cursorBefore: '2026-07-20T14:00:00Z',
      followedBillIds: new Set(['119-hr-1']), now: new Date('2026-07-20T16:00:00Z'),
    });
    expect(result.observations).toHaveLength(1);
    expect(result.observations[0]).toMatchObject({
      billId: '119-hr-1',
      event: { eventType: 'committee_meeting_scheduled', committeeCode: 'hsru00' },
    });
  });
});

describe('House weekly floor alerts', () => {
  it('treats a missing future-week document as a normal empty result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
    const result = await houseFloorSource.poll({
      apiKey: '', cursorBefore: '2026-07-20T14:00:00Z',
      followedBillIds: new Set(['119-hr-1']), now: new Date('2026-07-20T16:00:00Z'),
    });
    expect(result.observations).toEqual([]);
  });

  it('fails closed on a non-404 source error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    await expect(houseFloorSource.poll({
      apiKey: '', cursorBefore: '2026-07-20T14:00:00Z',
      followedBillIds: new Set(['119-hr-1']), now: new Date('2026-07-20T16:00:00Z'),
    })).rejects.toThrow('House floor schedule request failed (500)');
  });
});
