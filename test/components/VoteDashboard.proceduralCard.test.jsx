import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import VoteDashboard from '../../src/components/VoteDashboard.jsx';

// Mock the dashboard data service so we can drive different vote shapes.
vi.mock('../../src/services/supabaseVotes', () => ({
  getMemberDashboardData: vi.fn(),
}));

vi.mock('../../src/services/congress', () => ({
  getMemberVotes: vi.fn(),
  explainBillWithAI: vi.fn(),
}));

import { getMemberDashboardData } from '../../src/services/supabaseVotes';

function renderDashboard() {
  return render(
    <MemoryRouter>
      <VoteDashboard bioguideId="A000001" />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('VoteDashboard procedural card rendering', () => {
  it('renders question text from roll_call instead of "Procedural Vote" placeholder', async () => {
    getMemberDashboardData.mockResolvedValue({
      votes: [
        {
          politician_id: 'A000001',
          bill_id: null,
          roll_call_id: 'house-119-1-247',
          position: 'Yea',
          voted_at: '2026-04-15',
          source_url: 'https://congress.gov/x',
          bill: null,
          roll_call_stats: null,
          roll_call: {
            id: 'house-119-1-247',
            bill_id: null,
            question: 'On Motion to Recommit the Healthcare Bill',
            description: null,
          },
        },
      ],
      stats: null,
      lastRun: new Date(),
      isStale: false,
    });

    renderDashboard();

    // The question gets split into text nodes around glossary-term spans, so
    // find a contiguous chunk that lands in a single element.
    expect(await screen.findByText('Motion to Recommit')).toBeInTheDocument();
    expect(screen.getByText(/the Healthcare Bill/)).toBeInTheDocument();
    // The literal placeholder must not appear when we have question text.
    expect(screen.queryByText('Procedural Vote')).not.toBeInTheDocument();
  });

  it('annotates glossary terms inside the procedural question with tooltip triggers', async () => {
    getMemberDashboardData.mockResolvedValue({
      votes: [
        {
          politician_id: 'A000001',
          bill_id: null,
          roll_call_id: 'senate-119-1-18',
          position: 'Nay',
          voted_at: '2026-04-15',
          source_url: 'https://congress.gov/x',
          bill: null,
          roll_call_stats: null,
          roll_call: {
            id: 'senate-119-1-18',
            bill_id: null,
            question: 'On the Cloture Motion',
            description: null,
          },
        },
      ],
      stats: null,
      lastRun: new Date(),
      isStale: false,
    });

    renderDashboard();

    const cloture = await screen.findByText('Cloture');
    expect(cloture).toHaveClass('glossary-term');
    fireEvent.click(cloture);
    expect(await screen.findByText(/Senate procedure to end debate/)).toBeInTheDocument();
  });

  it('falls back to bill title when procedural question is empty (E4)', async () => {
    getMemberDashboardData.mockResolvedValue({
      votes: [
        {
          politician_id: 'A000001',
          bill_id: '119-hr-1234',
          roll_call_id: 'house-119-1-300',
          position: 'Yea',
          voted_at: '2026-04-15',
          source_url: 'https://congress.gov/x',
          bill: { id: '119-hr-1234', title: 'Test Bill', source_url: 'x' },
          roll_call_stats: null,
          roll_call: {
            id: 'house-119-1-300',
            bill_id: '119-hr-1234',
            question: '',
            description: null,
          },
        },
      ],
      stats: null,
      lastRun: new Date(),
      isStale: false,
    });

    renderDashboard();
    expect(await screen.findByText('Test Bill')).toBeInTheDocument();
  });

  it('renders gracefully when roll_call data is missing (PR 1 forward-compat)', async () => {
    getMemberDashboardData.mockResolvedValue({
      votes: [
        {
          politician_id: 'A000001',
          bill_id: null,
          roll_call_id: 'house-119-1-401',
          position: 'Yea',
          voted_at: '2026-04-15',
          source_url: 'https://congress.gov/x',
          bill: null,
          roll_call_stats: null,
          roll_call: null, // pre-backfill state
        },
      ],
      stats: null,
      lastRun: new Date(),
      isStale: false,
    });

    renderDashboard();

    // No question text → falls back to "Vote on {date}" via getProceduralTitle.
    expect(await screen.findByText(/Vote on/)).toBeInTheDocument();
    // No console errors / React crash.
  });
});
