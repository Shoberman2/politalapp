import { describe, it, expect } from 'vitest'
import {
  containsForbidden,
  generateWithForbiddenFilter,
  FORBIDDEN_REGEX,
} from '../../shared/forbiddenWordFilter'

describe('containsForbidden', () => {
  it('catches bias / biased', () => {
    expect(containsForbidden('Senator showed bias in the vote.')).toBe(true)
    expect(containsForbidden('The text was clearly biased.')).toBe(true)
  })
  it('catches anti-American', () => {
    expect(containsForbidden('The amendment was anti-American in spirit.')).toBe(true)
  })
  it('catches corruption / corrupt', () => {
    expect(containsForbidden('Corruption in the committee.')).toBe(true)
    expect(containsForbidden('A corrupt official.')).toBe(true)
  })
  it('catches influence-peddling and influence peddling', () => {
    expect(containsForbidden('Influence-peddling has shaped the bill.')).toBe(true)
    expect(containsForbidden('Influence peddling has shaped the bill.')).toBe(true)
  })
  it('is case-insensitive', () => {
    expect(containsForbidden('BIAS!')).toBe(true)
    expect(containsForbidden('Corrupt!')).toBe(true)
  })
  it('returns false for clean narrations', () => {
    expect(containsForbidden('The senator voted yes on the infrastructure bill.')).toBe(false)
    expect(containsForbidden('Hard work was rewarded.')).toBe(false)
  })
  it('handles nulls', () => {
    expect(containsForbidden(null)).toBe(false)
    expect(containsForbidden(undefined)).toBe(false)
    expect(containsForbidden('')).toBe(false)
  })
})

describe('generateWithForbiddenFilter', () => {
  it('returns first clean generation as { source: first }', async () => {
    const result = await generateWithForbiddenFilter(
      async () => 'A clean narration.',
      'fallback'
    )
    expect(result).toEqual({ narration: 'A clean narration.', source: 'first' })
  })

  it('retries when first attempt is dirty, returns retry on clean second', async () => {
    let attempt = 0
    const gen = async () => {
      attempt++
      return attempt === 1 ? 'Showed bias.' : 'Clean second attempt.'
    }
    const result = await generateWithForbiddenFilter(gen, 'fallback')
    expect(result).toEqual({ narration: 'Clean second attempt.', source: 'retry' })
  })

  it('falls back when both attempts are dirty', async () => {
    const result = await generateWithForbiddenFilter(
      async () => 'Showed bias and corruption.',
      'fallback template here'
    )
    expect(result).toEqual({ narration: 'fallback template here', source: 'fallback' })
  })

  it('falls back when generator throws on first call', async () => {
    const result = await generateWithForbiddenFilter(
      async () => {
        throw new Error('network')
      },
      'fallback'
    )
    expect(result).toEqual({ narration: 'fallback', source: 'fallback' })
  })

  it('falls back when first ok-with-forbidden then retry throws', async () => {
    let attempt = 0
    const gen = async () => {
      attempt++
      if (attempt === 1) return 'showed bias'
      throw new Error('network')
    }
    const result = await generateWithForbiddenFilter(gen, 'fallback')
    expect(result).toEqual({ narration: 'fallback', source: 'fallback' })
  })

  it('falls back when generator returns null both times', async () => {
    const result = await generateWithForbiddenFilter(async () => null, 'fallback')
    expect(result).toEqual({ narration: 'fallback', source: 'fallback' })
  })
})

describe('FORBIDDEN_REGEX', () => {
  it('is the same regex used by both consumers', () => {
    // Both shared/forbiddenWordFilter and supabase/functions/explain-bill-path
    // inline this regex. If anyone updates one, the other must match.
    expect(FORBIDDEN_REGEX.source).toBe('\\b(bias(ed)?|anti-american|corrupt(ion)?|influence[- ]peddling)\\b')
    expect(FORBIDDEN_REGEX.flags).toBe('i')
  })
})
