import { describe, it, expect } from 'vitest'
import { parseRollCallId, buildRollCallId, rollCallPath, deriveResult, saneTally, tallyFromStats, resultKind } from '../../api/_lib/rollCallResult.js'

describe('rollCallResult', () => {
  it('round-trips roll call ids with the session in the key', () => {
    expect(parseRollCallId('house-119-2-295')).toEqual({ chamberKey: 'house', chamber: 'House', congress: 119, session: 2, roll: 295 })
    expect(parseRollCallId('senate-119-1-262').chamber).toBe('Senate')
    expect(parseRollCallId('house-119-295')).toBeNull()
    expect(buildRollCallId({ congress: '119', chamber: 'House', session: '2', roll: '295' })).toBe('house-119-2-295')
    expect(buildRollCallId({ congress: '119', chamber: 'joint', session: '2', roll: '1' })).toBeNull()
    expect(rollCallPath('senate-119-1-262')).toBe('/vote/119/senate/1/262')
  })

  it('derives results with the real thresholds', () => {
    expect(deriveResult('On Passage', 220, 210)).toBe('Passed')
    expect(deriveResult('On Passage', 210, 210)).toBe('Failed on a tie')
    expect(deriveResult('On Motion to Suspend the Rules and Pass', 280, 150)).toBe('Failed')
    expect(deriveResult('On Motion to Suspend the Rules and Pass', 300, 130)).toBe('Passed')
    expect(deriveResult('On the Cloture Motion', 60, 40)).toBe('Cloture invoked')
    expect(deriveResult('On the Cloture Motion', 41, 59)).toBe('Cloture rejected')
    // Nomination cloture is a simple majority; the nominee lives in the description.
    expect(deriveResult('On the Cloture Motion', 52, 48, 'Senate', 'Nomination of Jane Doe to be Judge')).toBe('Cloture invoked')
    expect(deriveResult('On the Cloture Motion', 48, 52, 'Senate', 'Nomination of Jane Doe to be Judge')).toBe('Cloture rejected')
    // Majority under 60 on a motion of unknown threshold: no claim.
    expect(deriveResult('On the Cloture Motion', 55, 45, 'Senate', 'Motion to invoke cloture on S. 1')).toBeNull()
    expect(deriveResult('On the Nomination', 51, 49)).toBe('Confirmed')
    // A procedural motion about a nomination is still a motion.
    expect(deriveResult('On the Motion to Discharge', 52, 48, 'Senate', 'Nomination of Jane Doe to be Judge')).toBe('Motion agreed to')
    expect(deriveResult('On the Motion to Table', 40, 60, 'Senate', 'Nomination of Jane Doe')).toBe('Motion rejected')
    expect(deriveResult('On Overriding the Veto', 290, 140)).toBe('Veto overridden')
    expect(deriveResult('On Overriding the Veto', 250, 180)).toBe('Veto sustained')
    expect(deriveResult('On the Resolution of Ratification', 70, 30)).toBe('Ratified')
    expect(deriveResult('On the Motion to Waive', 58, 42, 'Senate')).toBe('Motion rejected')
    expect(deriveResult('On the Motion to Waive', 58, 42, 'House')).toBe('Motion agreed to')
    expect(deriveResult('On Passage', null, 10)).toBeNull()
    expect(resultKind('Cloture invoked')).toBe('passed')
    expect(resultKind('Motion rejected')).toBe('failed')
  })

  it('rejects impossible tallies', () => {
    expect(saneTally(220, 210, 'House')).toBe(true)
    expect(saneTally(300, 200, 'House')).toBe(false)
    expect(saneTally(60, 41, 'Senate')).toBe(false)
    expect(saneTally(0, 0, 'House')).toBe(false)
    expect(tallyFromStats({ dem_yea: 1, rep_yea: 2, ind_yea: 3, dem_nay: 4, rep_nay: 5, ind_nay: 6 })).toEqual({ yea: 6, nay: 15 })
    expect(tallyFromStats(null)).toEqual({ yea: null, nay: null })
  })
})
