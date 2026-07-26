import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the supabase client for getRecentFloorVotes.
//
// The service makes three shapes of call:
//   1. roll_calls  → .select().order().limit()            → awaited
//   2. roll_call_stats → .select().in()                   → awaited
//   3. votes       → .select(_, {count, head}).eq().eq()  → awaited, count only
//
// `voteCounts` drives (3): keyed `${rollCallId}|${position}` → count.
const tableResponses = {};
const responseQueue = {};
let voteCounts = {};
let voteCountCalls = [];
let queries = [];

function makeChain(table, selectOpts) {
  const state = { filters: {}, order: [], cols: '' };

  const resolve = () => {
    if (table === 'votes' && selectOpts?.head) {
      const key = `${state.filters.roll_call_id}|${state.filters.position}`;
      voteCountCalls.push(key);
      const count = voteCounts[key];
      return { count: count === undefined ? null : count, error: null, data: null };
    }
    // A queued response models a sequence of calls against the same table —
    // e.g. the voted_at query failing, then the fallback succeeding.
    const queued = responseQueue[table];
    if (queued && queued.length) return queued.shift();
    return tableResponses[table] || { data: null, error: null };
  };

  const chain = {
    select: vi.fn((cols, opts) => {
      if (opts) selectOpts = opts;
      state.cols = cols || '';
      return chain;
    }),
    eq: vi.fn((col, val) => {
      state.filters[col] = val;
      return chain;
    }),
    in: vi.fn(() => chain),
    order: vi.fn((col, opts) => {
      state.order.push({ col, ...(opts || {}) });
      return chain;
    }),
    limit: vi.fn(() => chain),
    then: (res) => {
      if (!(table === 'votes' && selectOpts?.head)) {
        queries.push({ table, cols: state.cols, order: state.order });
      }
      return res(resolve());
    },
  };
  return chain;
}

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table) => makeChain(table)),
  },
}));

let getRecentFloorVotes;

beforeEach(async () => {
  vi.resetModules();
  for (const k of Object.keys(tableResponses)) delete tableResponses[k];
  for (const k of Object.keys(responseQueue)) delete responseQueue[k];
  voteCounts = {};
  voteCountCalls = [];
  queries = [];
  const mod = await import('../../src/services/floorVotes.js');
  getRecentFloorVotes = mod.getRecentFloorVotes;
});

const rollCall = (id, billId, question = 'On Passage', description = null) => ({
  id,
  bill_id: billId,
  question,
  description,
  created_at: '2026-07-24T08:45:16.676969+00:00',
});

const byId = (votes, id) => votes.find((v) => v.id === id);

describe('getRecentFloorVotes — tally sourcing', () => {
  it('uses roll_call_stats when it covers the roll call', async () => {
    tableResponses['roll_calls'] = { data: [rollCall('house-119-2-281', '119-hconres-113')], error: null };
    tableResponses['roll_call_stats'] = {
      data: [{ roll_call_id: 'house-119-2-281', dem_yea: 5, dem_nay: 200, rep_yea: 211, rep_nay: 14, ind_yea: 0, ind_nay: 0 }],
      error: null,
    };
    tableResponses['votes'] = { data: [], error: null };

    const { votes } = await getRecentFloorVotes(16);
    expect(byId(votes, 'house-119-2-281')).toMatchObject({ yea: 216, nay: 214, result: 'Passed' });
    // No need to fall back to per-member counting when stats already answered.
    expect(voteCountCalls).toHaveLength(0);
  });

  it('falls back to counting the votes table when roll_call_stats is missing the roll call', async () => {
    // This is the real-world state that broke the front page: the stats ETL
    // lags, so every recent roll call had a null tally and the landing page's
    // "See every vote" step sat on skeletons forever.
    tableResponses['roll_calls'] = { data: [rollCall('house-119-2-278', '119-hr-8800')], error: null };
    tableResponses['roll_call_stats'] = { data: [], error: null };
    voteCounts['house-119-2-278|Yea'] = 216;
    voteCounts['house-119-2-278|Nay'] = 212;

    const { votes } = await getRecentFloorVotes(16);
    expect(byId(votes, 'house-119-2-278')).toMatchObject({ yea: 216, nay: 212, result: 'Passed' });
  });

  it('asserts no tally when neither source has the roll call', async () => {
    // Senate roll calls have no member-level rows yet — 0/0 must stay null
    // rather than being rendered as a real "0–0" vote.
    tableResponses['roll_calls'] = { data: [rollCall('senate-119-2-207', '119-sjres-180', 'On the Motion to Discharge')], error: null };
    tableResponses['roll_call_stats'] = { data: [], error: null };
    voteCounts['senate-119-2-207|Yea'] = 0;
    voteCounts['senate-119-2-207|Nay'] = 0;

    const { votes } = await getRecentFloorVotes(16);
    expect(byId(votes, 'senate-119-2-207')).toMatchObject({ yea: null, nay: null, result: null });
  });

  it('rejects counts that exceed the chamber size', async () => {
    tableResponses['roll_calls'] = { data: [rollCall('house-119-2-280', '119-hr-7008')], error: null };
    tableResponses['roll_call_stats'] = { data: [], error: null };
    voteCounts['house-119-2-280|Yea'] = 400;
    voteCounts['house-119-2-280|Nay'] = 300; // 700 > 435 — double-counted rows

    const { votes } = await getRecentFloorVotes(16);
    expect(byId(votes, 'house-119-2-280').yea).toBeNull();
  });

  it('spends its fallback budget on bill votes before bill-less ones', async () => {
    // Bill votes are what the front page leads with, and they're the ones the
    // votes table actually covers. Ordering the other way used to burn the
    // whole budget on Senate nominations and leave the mock without tallies.
    // Eight bill-less nominations land ahead of the bill vote and each carries
    // a description, so a naive "newest first" fallback order would spend the
    // entire budget on them and never reach the roll call that has a tally.
    const calls = [];
    for (let i = 0; i < 8; i += 1) {
      calls.push(rollCall(`senate-119-2-${200 + i}`, null, 'On the Nomination', `Confirmation: Nominee ${i}`));
    }
    calls.push(rollCall('house-119-2-281', '119-hconres-113'));
    tableResponses['roll_calls'] = { data: calls, error: null };
    tableResponses['roll_call_stats'] = { data: [], error: null };
    voteCounts['house-119-2-281|Yea'] = 216;
    voteCounts['house-119-2-281|Nay'] = 214;

    const { votes } = await getRecentFloorVotes(16);
    expect(byId(votes, 'house-119-2-281')).toMatchObject({ yea: 216, nay: 214 });
  });
});

describe('getRecentFloorVotes — recency ordering', () => {
  // REGRESSION: this ordered by created_at, which is INGEST time. That matches
  // vote order only while ingestion runs forward. The 2026-07-25 history
  // backfill wrote 172 roll calls from earlier in the Congress with fresh
  // created_at values, and the front page immediately began presenting
  // months-old procedural motions as the latest floor activity.
  it('orders by when the vote happened, not when we ingested it', async () => {
    tableResponses['roll_calls'] = { data: [rollCall('house-119-2-283', '119-hr-8884')], error: null };
    tableResponses['roll_call_stats'] = { data: [], error: null };

    await getRecentFloorVotes(16);

    const rc = queries.find((q) => q.table === 'roll_calls');
    expect(rc.order[0].col).toBe('voted_at');
    expect(rc.order[0].ascending).toBe(false);
    // Roll calls we hold no votes for have no date; they belong last, not first.
    expect(rc.order[0].nullsFirst).toBe(false);
    // created_at survives only as a tiebreak within a single vote day.
    expect(rc.order[1].col).toBe('created_at');
    expect(rc.cols).toContain('voted_at');
  });

  it('falls back to the old ordering where the column has not shipped yet', async () => {
    // The voted_at column arrives with its migration. Deploys that run ahead of
    // it must degrade to the previous behaviour, not to an empty feed.
    responseQueue['roll_calls'] = [
      { data: null, error: { code: '42703', message: 'column roll_calls.voted_at does not exist' } },
      { data: [rollCall('house-119-2-283', '119-hr-8884')], error: null },
    ];
    tableResponses['roll_call_stats'] = { data: [], error: null };

    const result = await getRecentFloorVotes(16);

    expect(result).not.toBeNull();
    expect(result.votes).toHaveLength(1);
    const rcQueries = queries.filter((q) => q.table === 'roll_calls');
    expect(rcQueries).toHaveLength(2);
    expect(rcQueries[1].cols).not.toContain('voted_at');
    expect(rcQueries[1].order[0].col).toBe('created_at');
  });

  it('does not retry on an unrelated error', async () => {
    responseQueue['roll_calls'] = [
      { data: null, error: { code: '500', message: 'upstream unavailable' } },
    ];
    const result = await getRecentFloorVotes(16);
    expect(result).toBeNull();
    expect(queries.filter((q) => q.table === 'roll_calls')).toHaveLength(1);
  });
});
