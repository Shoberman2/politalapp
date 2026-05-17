import { describe, it, expect } from 'vitest'
import {
  deriveLegislativeStage,
  stageToLabel,
  classifyLatestAction,
} from '../../shared/legislativeStage'

describe('deriveLegislativeStage', () => {
  // Table-driven coverage of all 10 stages × multiple patterns each.
  const cases = [
    // enacted
    ['Became Public Law No: 119-12', 'enacted'],
    ['Signed by President.', 'enacted'],
    ['Presented to President.', 'enacted'],

    // passed_both
    ['Passed House. Passed Senate.', 'passed_both'],
    ['Passed Senate without amendment. Passed House.', 'passed_both'],

    // passed_one
    ['Passed House by Yea-Nay vote: 218 - 210.', 'passed_one'],
    ['Passed Senate by Unanimous Consent.', 'passed_one'],
    ['Agreed to in the House by voice vote.', 'passed_one'],
    ['Agreed to in Senate.', 'passed_one'],

    // floor
    ['Motion to proceed agreed to in Senate.', 'floor'],
    ['Placed on the Calendar No. 12.', 'floor'],
    ['Motion to recommit offered.', 'floor'],
    ['Cloture motion presented in Senate.', 'floor'],

    // committee
    ['Reported by Committee on Energy and Commerce. H.R. 1234.', 'committee'],
    ['Ordered to be Reported in the nature of a substitute', 'committee'],
    ['Markup held by Committee on Judiciary.', 'committee'],
    ['Committee consideration began.', 'committee'],

    // subcommittee
    ['Referred to the Subcommittee on Health.', 'subcommittee'],
    ['Subcommittee Hearings held.', 'subcommittee'],

    // referred
    ['Referred to the Committee on Agriculture.', 'referred'],
    ['Referred to the House Committee on Ways and Means.', 'referred'],
    ['Referred to the Senate Committee on Finance.', 'referred'],

    // dead
    ['Pocket Vetoed by President.', 'dead'],
    ['Vetoed by President. Veto message sent to House.', 'dead'],
    ['Failed of passage in the House.', 'dead'],
    ['Motion to table agreed to in House.', 'dead'],
    ['Objected to.', 'dead'],

    // introduced
    ['Introduced in House.', 'introduced'],
    ['Introduced in Senate.', 'introduced'],
    ['Introduced.', 'introduced'],
  ]

  it.each(cases)('classifies %j as %s', (text, expected) => {
    expect(deriveLegislativeStage(text)).toBe(expected)
  })

  it('returns unknown for null / undefined / empty', () => {
    expect(deriveLegislativeStage(null)).toBe('unknown')
    expect(deriveLegislativeStage(undefined)).toBe('unknown')
    expect(deriveLegislativeStage('')).toBe('unknown')
    expect(deriveLegislativeStage('xyzzy gibberish')).toBe('unknown')
  })

  it('matches highest-specificity first (passed_both wins over passed_one)', () => {
    // The patterns ARE order-sensitive — passed_both regex is listed BEFORE
    // passed_one patterns. This test pins that behavior so a refactor can't
    // silently regress it.
    expect(deriveLegislativeStage('Passed House and Passed Senate without amendment.')).toBe('passed_both')
  })
})

describe('stageToLabel', () => {
  it('returns labels for every stage', () => {
    expect(stageToLabel('introduced')).toEqual({ stage: 'introduced', label: 'Introduced' })
    expect(stageToLabel('referred')).toEqual({ stage: 'referred', label: 'In Committee' })
    expect(stageToLabel('subcommittee')).toEqual({ stage: 'subcommittee', label: 'In Subcommittee' })
    expect(stageToLabel('committee')).toEqual({ stage: 'committee', label: 'Committee Markup' })
    expect(stageToLabel('floor')).toEqual({ stage: 'floor', label: 'Awaiting Floor Vote' })
    expect(stageToLabel('passed_one')).toEqual({ stage: 'passed_one', label: 'Passed One Chamber' })
    expect(stageToLabel('passed_both')).toEqual({ stage: 'passed_both', label: 'Passed Both Chambers' })
    expect(stageToLabel('enacted')).toEqual({ stage: 'enacted', label: 'Became Law' })
    expect(stageToLabel('dead')).toEqual({ stage: 'dead', label: 'Failed / Vetoed' })
    expect(stageToLabel('unknown')).toEqual({ stage: 'unknown', label: 'In Progress' })
  })
})

describe('classifyLatestAction', () => {
  it('combines derive + stageToLabel', () => {
    expect(classifyLatestAction('Became Public Law No: 119-1')).toEqual({
      stage: 'enacted',
      label: 'Became Law',
    })
  })
})
