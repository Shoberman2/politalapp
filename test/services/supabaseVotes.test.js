import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the supabase client.
//
// Each .from(table) returns a chain whose methods return another chain
// (so .select().eq().order().limit().maybeSingle() works), and that chain
// is also a thenable so `await` on any chain step resolves to the canned
// {data, error} response for that table.
//
// tableResponses[table] sets the return value for the next operation on
// that table.
const tableResponses = {};
const fromCalls = [];

function makeChain(table) {
  const respFor = () => tableResponses[table] || { data: null, error: null };
  let inWasCalled = false; // separate response slot for `.in()` if needed

  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => {
      inWasCalled = true;
      return chain;
    }),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(() => chain),
    // Make the chain awaitable: await chain → resolves with {data, error}
    then: (resolve) => resolve(respFor()),
  };
  return chain;
}

vi.mock('../../src/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table) => {
      fromCalls.push(table);
      return makeChain(table);
    }),
  },
}));

let getMemberDashboardData;

beforeEach(async () => {
  vi.resetModules();
  for (const k of Object.keys(tableResponses)) delete tableResponses[k];
  fromCalls.length = 0;
  const mod = await import('../../src/services/supabaseVotes.js');
  getMemberDashboardData = mod.getMemberDashboardData;
});

describe('getMemberDashboardData — roll_calls JOIN behavior', () => {
  it('returns null when there are no votes for the politician', async () => {
    tableResponses['votes'] = { data: [], error: null };
    tableResponses['member_stats'] = { data: null, error: null };
    tableResponses['etl_metadata'] = { data: null, error: null };

    const result = await getMemberDashboardData('A000001');
    expect(result).toBeNull();
  });

  it('joins roll_calls onto each vote when roll_call_id is present', async () => {
    const votes = [
      {
        politician_id: 'A000001',
        bill_id: null,
        roll_call_id: 'house-119-1-247',
        position: 'Yea',
        voted_at: '2026-04-15',
        source_url: 'https://congress.gov/x',
        bills: null,
      },
    ];
    const rollCalls = [
      {
        id: 'house-119-1-247',
        bill_id: null,
        question: 'On Motion to Recommit',
        description: 'Healthcare bill',
      },
    ];
    tableResponses['votes'] = { data: votes, error: null };
    tableResponses['member_stats'] = { data: null, error: null };
    tableResponses['etl_metadata'] = { data: null, error: null };
    tableResponses['roll_call_stats'] = { data: [], error: null };
    tableResponses['roll_calls'] = { data: rollCalls, error: null };

    const result = await getMemberDashboardData('A000001');
    expect(result).not.toBeNull();
    expect(result.votes).toHaveLength(1);
    expect(result.votes[0].roll_call).toEqual({
      id: 'house-119-1-247',
      bill_id: null,
      question: 'On Motion to Recommit',
      description: 'Healthcare bill',
    });
  });

  it('returns roll_call=null when no matching roll_calls row exists', async () => {
    const votes = [
      {
        politician_id: 'A000001',
        bill_id: null,
        roll_call_id: 'house-119-1-999',
        position: 'Yea',
        voted_at: '2026-04-15',
        source_url: 'https://congress.gov/x',
        bills: null,
      },
    ];
    tableResponses['votes'] = { data: votes, error: null };
    tableResponses['member_stats'] = { data: null, error: null };
    tableResponses['etl_metadata'] = { data: null, error: null };
    tableResponses['roll_call_stats'] = { data: [], error: null };
    tableResponses['roll_calls'] = { data: [], error: null };

    const result = await getMemberDashboardData('A000001');
    expect(result).not.toBeNull();
    expect(result.votes[0].roll_call).toBeNull();
  });

  it('degrades gracefully when roll_calls table does not exist', async () => {
    const votes = [
      {
        politician_id: 'A000001',
        bill_id: null,
        roll_call_id: 'house-119-1-247',
        position: 'Yea',
        voted_at: '2026-04-15',
        source_url: 'https://congress.gov/x',
        bills: null,
      },
    ];
    tableResponses['votes'] = { data: votes, error: null };
    tableResponses['member_stats'] = { data: null, error: null };
    tableResponses['etl_metadata'] = { data: null, error: null };
    tableResponses['roll_call_stats'] = { data: [], error: null };
    tableResponses['roll_calls'] = { data: null, error: { message: 'relation "roll_calls" does not exist' } };

    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await getMemberDashboardData('A000001');
    expect(result).not.toBeNull();
    expect(result.votes[0].roll_call).toBeNull();
    warn.mockRestore();
  });
});
