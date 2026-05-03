import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import VotingHistory from '../../src/components/VotingHistory.jsx';

// REGR-2: existing glossary tooltip behavior must still work after the
// refactor that moved the inline GLOSSARY const to src/data/proceduralGlossary.js.

vi.mock('../../src/services/congress', () => ({
  getMemberSponsorship: vi.fn(),
  explainBillWithAI: vi.fn(),
}));

import { getMemberSponsorship } from '../../src/services/congress';

beforeEach(() => {
  vi.resetAllMocks();
});

function renderWithBills(bills) {
  getMemberSponsorship.mockResolvedValue(bills);
  return render(<VotingHistory bioguideId="A000001" />);
}

describe('VotingHistory glossary regression (REGR-2)', () => {
  it('renders the legislative activity heading', async () => {
    renderWithBills([]);
    expect(await screen.findByText('No recent legislative activity available')).toBeInTheDocument();
  });

  it('annotates known glossary terms inside latestAction.text with click-to-define', async () => {
    const bills = [
      {
        type: 'hr',
        number: 'HR.1234',
        title: 'A test bill',
        latestAction: {
          actionDate: '2026-04-15',
          text: 'Referred to the Committee on Energy and Commerce.',
        },
      },
    ];
    renderWithBills(bills);

    // Wait for the bill to render
    await screen.findByText(/A test bill/);

    // The glossary should highlight "committee" (from the shared glossary).
    const term = await screen.findByText('Committee');
    expect(term).toBeInTheDocument();
    // Click reveals definition
    fireEvent.click(term);
    expect(await screen.findByText(/A small group of members of Congress/)).toBeInTheDocument();
  });

  it('highlights "cloture" when present (preserves existing 21-term coverage)', async () => {
    const bills = [
      {
        type: 'hr',
        number: 'HR.1',
        title: 'Cloture test',
        latestAction: {
          actionDate: '2026-04-15',
          text: 'Cloture motion presented in Senate.',
        },
      },
    ];
    renderWithBills(bills);

    await screen.findByText(/Cloture test/);
    const cloture = await screen.findByText('Cloture');
    expect(cloture).toBeInTheDocument();
  });
});
