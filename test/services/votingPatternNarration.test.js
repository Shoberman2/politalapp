import { describe, it, expect } from 'vitest'
import { __internal, narrateVotes } from '../../src/services/votingPatternNarration.js'

const { templateNarration } = __internal

describe('templateNarration', () => {
  const billVote = { position: 'Yea', bill: { title: 'S.2617 Medicare Advantage Reform' } }

  it('produces a Yea template when matched', () => {
    const text = templateNarration(billVote, 1, 1)
    expect(text).toContain('YES')
    expect(text).toContain('Medicare Advantage Reform')
    expect(text).toContain('matched')
  })

  it('produces a Nay template when diverged', () => {
    const text = templateNarration({ position: 'Nay', bill: { title: 'H.R. 5 Reform Bill' } }, 0, 1)
    expect(text).toContain('NO')
    expect(text).toContain('differed from')
  })

  it('handles unknown match state', () => {
    const text = templateNarration(billVote, null, null)
    expect(text).toContain('YES')
    expect(text).not.toContain('matched')
    expect(text).not.toContain('differed from')
  })

  it('handles missing bill title gracefully', () => {
    const text = templateNarration({ position: 'Nay', bill: null }, 0, 1)
    expect(text).toContain('an unlabeled measure')
  })
})

describe('narrateVotes', () => {
  it('returns complete record-based narration without a network dependency', async () => {
    const annotated = [{
      vote: { position: 'Yea', bill: { title: 'H.R. 42 Test Act' } },
      matched: 1,
      pDir: 1,
      margin: 12,
    }]

    await expect(narrateVotes(annotated)).resolves.toEqual({
      narrations: ['Voted YES on H.R. 42 Test Act — matched the party majority (Yea).'],
      degraded: false,
    })
  })
})
