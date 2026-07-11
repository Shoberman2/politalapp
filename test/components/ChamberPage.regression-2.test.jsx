import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import ChamberPage from '../../src/components/ChamberPage'

// Regression: ISSUE-002 — /chamber/:congress/desk/:deskId rendered the
// chamber but did not restore the linked desk drawer.
// Found by /qa on 2026-07-10.

vi.mock('../../src/components/SEO', () => ({ default: () => null }))
vi.mock('../../src/components/SenateChamberMap', () => ({
  default: () => <div>Senate chamber map</div>,
}))
vi.mock('../../src/components/ChamberScrubber', () => ({ default: () => null }))
vi.mock('../../src/components/HouseCompositionMap', () => ({ default: () => null }))
vi.mock('../../src/components/HistoricMomentOverlay', () => ({ default: () => null }))
vi.mock('../../src/components/DeskLineagePanel', () => ({
  default: ({ desk, onClose }) => (
    <div role="dialog" aria-label={`Desk ${desk.desk_id}`}>
      <button type="button" onClick={onClose}>Close desk history</button>
    </div>
  ),
}))

vi.mock('../../src/services/senateDesks', () => ({
  getChamberForCongress: vi.fn().mockResolvedValue([
    { desk_id: 47, famous_name: 'Test desk', politician: null },
  ]),
}))
vi.mock('../../src/services/memberTerms', () => ({
  getMembersByCongress: vi.fn().mockResolvedValue([]),
  getPartyComposition: vi.fn().mockResolvedValue({ D: 0, R: 0, I: 0, other: 0, total: 0 }),
}))
vi.mock('../../src/services/congressMetadata', () => ({
  getAllCongressMetadata: vi.fn().mockResolvedValue([]),
  getCongressMetadata: vi.fn().mockResolvedValue({ fidelity_tier: 'composition_only' }),
}))

function LocationProbe() {
  return <output aria-label="Current path">{useLocation().pathname}</output>
}

describe('chamber desk deep-link regression', () => {
  it('opens the linked desk and returns to the congress when closed', async () => {
    render(
      <MemoryRouter initialEntries={['/chamber/107/desk/47']}>
        <LocationProbe />
        <Routes>
          <Route path="/chamber/:congress/desk/:deskId" element={<ChamberPage />} />
          <Route path="/chamber/:congress" element={<ChamberPage />} />
        </Routes>
      </MemoryRouter>
    )

    expect(await screen.findByRole('dialog', { name: 'Desk 47' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Close desk history' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Current path')).toHaveTextContent('/chamber/107')
    })
  })
})
