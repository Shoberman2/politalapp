import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { countParties, partyLetter } from '../../src/utils/partyLetter'
import { clampProse } from '../../src/components/BillDetail'
import { lastNameOf, computeDeskPosition } from '../../src/components/SenateChamberMap'
import HouseCompositionMap from '../../src/components/HouseCompositionMap'
import { LANDING_FAQ } from '../../src/data/landingFaq'

describe('party counts', () => {
  it('reads every spelling of a party and never invents one', () => {
    expect(['D', 'Democrat', 'Democratic', 'democrat'].map(partyLetter)).toEqual(['D', 'D', 'D', 'D'])
    expect(['R', 'Republican'].map(partyLetter)).toEqual(['R', 'R'])
    expect(['I', 'Independent'].map(partyLetter)).toEqual(['I', 'I'])
    expect([null, '', 'Whig'].map(partyLetter)).toEqual([null, null, null])
  })

  it('counts a caucus override first and keeps unknown parties apart', () => {
    const counts = countParties([
      { party: 'R' }, { party: 'Republican' }, { party: 'Democrat' }, { party: 'I', caucus: 'D' }, { party: null },
    ])
    expect(counts).toEqual({ D: 2, R: 2, I: 0, unlisted: 1, total: 5 })
  })
})

describe('House composition', () => {
  it('draws one dot per member, calls nobody vacant, and says what the total counts', () => {
    const members = [
      ...Array.from({ length: 3 }, () => ({ party: 'R' })),
      { party: 'Republican' }, { party: 'Democrat' }, { party: 'D' }, { party: 'I' },
    ]
    const { container } = render(<HouseCompositionMap members={members} />)
    expect(container.querySelectorAll('.house-composition-dot')).toHaveLength(7)
    expect(container.querySelector('.house-composition-total-r').textContent.trim()).toBe('4 R')
    expect(container.querySelector('.house-composition-total-d').textContent.trim()).toBe('2 D')
    expect(container.textContent).not.toMatch(/vacant/i)
    expect(screen.getByText(/7 members have served in this Congress/)).toBeInTheDocument()
  })
})

describe('Senate desk labels', () => {
  it('uses the surname whichever way the name is written', () => {
    expect(lastNameOf('Shaheen, Jeanne')).toBe('Shaheen')
    expect(lastNameOf('Jeanne Shaheen')).toBe('Shaheen')
    expect(lastNameOf('Robert P. Casey Jr.')).toBe('Casey')
    expect(lastNameOf('')).toBeNull()
  })
})

describe('Senate desk positions', () => {
  it('keeps every desk on its own side of the centre aisle when the sides are uneven', () => {
    // Row 2 of the 119th: 11 desks left of the aisle, 12 right.
    const counts = { 2: 23 }
    const sides = { 2: { D: 11, R: 12 } }
    const centre = computeDeskPosition({ arc: 2, position: 12, side: 'R' }, { 2: 1 }, {}).x
    const xs = (side, from, to) => Array.from({ length: to - from + 1 }, (_, i) =>
      computeDeskPosition({ arc: 2, position: from + i, side }, counts, sides).x)
    expect(xs('D', 1, 11).every((x) => x < centre)).toBe(true)
    expect(xs('R', 12, 23).every((x) => x > centre)).toBe(true)
  })
})

describe('long official summaries', () => {
  const long = Array.from({ length: 40 }, (_, i) => `Section ${i} does one specific thing to one specific program. `.repeat(4).trim())

  it('opens on a preview that ends at a paragraph break, and shows everything when opened', () => {
    const preview = clampProse(long, { clamp: true })
    expect(preview.clamped).toBe(true)
    expect(preview.shown.length).toBeGreaterThan(0)
    expect(preview.shown.length).toBeLessThan(long.length)
    expect(preview.shown).toEqual(long.slice(0, preview.shown.length))
    const open = clampProse(long, { clamp: false })
    expect(open.shown).toEqual(long)
    expect(open.clamped).toBe(true)
  })

  it('cuts one enormous paragraph at a sentence end', () => {
    const one = ['A sentence about the bill. '.repeat(200).trim()]
    const { shown } = clampProse(one, { clamp: true })
    expect(shown).toHaveLength(1)
    expect(shown[0].length).toBeLessThanOrEqual(1200)
    expect(shown[0].endsWith('.')).toBe(true)
  })

  it('leaves a short summary alone, with no toggle', () => {
    expect(clampProse(['Short.', 'Also short.'], { clamp: true })).toEqual({ shown: ['Short.', 'Also short.'], clamped: false })
  })
})

describe('landing FAQ', () => {
  it('says bills are explained from their text, with the summary as the fallback', () => {
    const ai = LANDING_FAQ.find((f) => f.q === 'How is AI used?').a
    expect(ai).toMatch(/official text/)
    expect(ai).toMatch(/official summary when the text is too long or not yet published/)
  })
})
