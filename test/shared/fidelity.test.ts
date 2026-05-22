import { describe, it, expect } from 'vitest'
import {
  getFidelityInfo,
  isFidelityTier,
  fidelityDotColor,
  type FidelityTier,
} from '../../shared/fidelity'

describe('isFidelityTier', () => {
  it('returns true for the three valid tiers', () => {
    expect(isFidelityTier('full')).toBe(true)
    expect(isFidelityTier('partial')).toBe(true)
    expect(isFidelityTier('composition_only')).toBe(true)
  })

  it('returns false for other strings, null, undefined, numbers', () => {
    expect(isFidelityTier('FULL')).toBe(false)
    expect(isFidelityTier('composition-only')).toBe(false)
    expect(isFidelityTier(null)).toBe(false)
    expect(isFidelityTier(undefined)).toBe(false)
    expect(isFidelityTier(1)).toBe(false)
    expect(isFidelityTier('')).toBe(false)
  })
})

describe('getFidelityInfo', () => {
  it('marks full record as having desk + vote data and no caveat', () => {
    const info = getFidelityInfo('full')
    expect(info.tier).toBe('full')
    expect(info.label).toBe('Full record')
    expect(info.caveat).toBeNull()
    expect(info.hasDeskData).toBe(true)
    expect(info.hasVoteData).toBe(true)
  })

  it('marks partial record as having desk + vote data but with a caveat', () => {
    const info = getFidelityInfo('partial')
    expect(info.tier).toBe('partial')
    expect(info.label).toBe('Partial record')
    expect(info.caveat).not.toBeNull()
    expect(info.caveat).toMatch(/missing/i)
    expect(info.hasDeskData).toBe(true)
    expect(info.hasVoteData).toBe(true)
  })

  it('marks composition-only as having NO desk or vote data + chamber caveat', () => {
    const info = getFidelityInfo('composition_only')
    expect(info.tier).toBe('composition_only')
    expect(info.label).toBe('Composition only')
    expect(info.caveat).not.toBeNull()
    expect(info.caveat).toMatch(/positions are illustrative/i)
    expect(info.hasDeskData).toBe(false)
    expect(info.hasVoteData).toBe(false)
  })
})

describe('fidelityDotColor', () => {
  it('returns DESIGN.md semantic colors for each tier', () => {
    expect(fidelityDotColor('full')).toBe('#16A34A')
    expect(fidelityDotColor('partial')).toBe('#D97706')
    expect(fidelityDotColor('composition_only')).toBe('#9C9789')
  })

  it('exhaustively covers every FidelityTier value', () => {
    // Compile-time check: if a new tier is added without updating the
    // switch, TypeScript would emit a "function has no return value" error
    // in fidelityDotColor itself. At runtime, this assert catches the case
    // where someone bypasses the type system.
    const tiers: FidelityTier[] = ['full', 'partial', 'composition_only']
    for (const t of tiers) {
      const color = fidelityDotColor(t)
      expect(color).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })
})
