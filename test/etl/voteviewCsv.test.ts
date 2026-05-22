import { describe, it, expect } from 'vitest'
import { parseVoteviewCsv } from '../../etl/sources/voteview'

describe('parseVoteviewCsv', () => {
  it('parses well-formed CSV with required columns', () => {
    const csv =
      'congress,chamber,icpsr,bioguide_id,bioname,party_code,state_abbrev\n' +
      '119,Senate,29345,S000148,"SCHUMER, Charles E.",100,NY\n' +
      '119,Senate,15425,M000355,"McCONNELL, Mitch",200,KY\n'
    const rows = parseVoteviewCsv(csv)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      icpsr: '29345',
      bioguide_id: 'S000148',
    })
    expect(rows[1].bioguide_id).toBe('M000355')
  })

  it('dedupes (icpsr, bioguide) pairs that recur across Congresses', () => {
    const csv =
      'congress,chamber,icpsr,bioguide_id,bioname\n' +
      '118,Senate,29345,S000148,SCHUMER\n' +
      '119,Senate,29345,S000148,SCHUMER\n'
    const rows = parseVoteviewCsv(csv)
    expect(rows).toHaveLength(1)
  })

  it('skips rows with empty bioguide_id (cannot be aliased)', () => {
    const csv =
      'congress,chamber,icpsr,bioguide_id,bioname\n' +
      '99,Senate,12345,,OLD_MEMBER_NO_BIOGUIDE\n' +
      '119,Senate,29345,S000148,SCHUMER\n'
    const rows = parseVoteviewCsv(csv)
    expect(rows).toHaveLength(1)
    expect(rows[0].bioguide_id).toBe('S000148')
  })

  it('returns empty array for empty input', () => {
    expect(parseVoteviewCsv('')).toEqual([])
    expect(parseVoteviewCsv('\n')).toEqual([])
  })

  it('throws on CSV missing required columns', () => {
    const csv = 'congress,chamber,name\n119,Senate,SCHUMER\n'
    expect(() => parseVoteviewCsv(csv)).toThrow(/missing required columns/i)
  })

  it('handles trailing whitespace and blank lines', () => {
    const csv =
      'congress,chamber,icpsr,bioguide_id,bioname\n' +
      '\n' +
      '  \n' +
      '119,Senate,29345,S000148,SCHUMER\n' +
      '\n'
    const rows = parseVoteviewCsv(csv)
    expect(rows).toHaveLength(1)
  })
})
