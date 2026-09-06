import { describe, it, expect } from 'vitest'
import { parseRepairArgs, buildRepairUpdate, DEFAULT_MAX_DETAIL_CALLS } from '../../etl/repairPlaceholderTitles'
import { mergeIntroducedBill } from '../../etl/load'

describe('repairPlaceholderTitles helpers', () => {
  it('parses flags and never lets --limit become NaN', () => {
    expect(parseRepairArgs([])).toEqual({ dryRun: false, all: false, maxDetailCalls: DEFAULT_MAX_DETAIL_CALLS })
    expect(parseRepairArgs(['--dry-run', '--all', '--limit', '50'])).toEqual({ dryRun: true, all: true, maxDetailCalls: 50 })
    expect(parseRepairArgs(['--limit', 'abc']).maxDetailCalls).toBe(DEFAULT_MAX_DETAIL_CALLS)
    expect(parseRepairArgs(['--limit']).maxDetailCalls).toBe(DEFAULT_MAX_DETAIL_CALLS)
  })

  it('builds an update only from a real title and validates the date', () => {
    expect(buildRepairUpdate({ bill: { title: 'HR 1' } })).toBeNull()
    expect(buildRepairUpdate({})).toBeNull()
    expect(buildRepairUpdate({ bill: { title: ' GENIUS Act ', introducedDate: '2025-05-01', policyArea: { name: 'Finance' } } }))
      .toEqual({ title: 'GENIUS Act', introduced_at: '2025-05-01', policy_area: 'Finance' })
    expect(buildRepairUpdate({ bill: { title: 'GENIUS Act', introducedDate: 'yesterday' } })).toEqual({ title: 'GENIUS Act' })
    expect(String(buildRepairUpdate({ bill: { title: 'x'.repeat(5000) } })!.title)).toHaveLength(2000)
  })
})

describe('mergeIntroducedBill', () => {
  const base = { id: '119-hr-1', title: 'HR 1', introduced_at: null, summary: null, crs_summary: null, policy_area: null, source_url: 'https://x' }
  it('lets the feed replace a stub but not a real title, and fills sponsor fields', () => {
    const merged = mergeIntroducedBill(base, { ...base, title: 'One Big Beautiful Bill Act', introduced_at: '2025-05-20', sponsor_name: 'Jodey Arrington', legislative_stage: 'passed_house' })
    expect(merged.title).toBe('One Big Beautiful Bill Act')
    expect(merged.introduced_at).toBe('2025-05-20')
    expect(merged.sponsor_name).toBe('Jodey Arrington')
    expect(merged.legislative_stage).toBe('passed_house')
    expect(mergeIntroducedBill({ ...base, title: 'Vote feed title' }, { ...base, title: 'Feed title' }).title).toBe('Vote feed title')
    expect(mergeIntroducedBill(base, { ...base, title: 'S 1' }).title).toBe('HR 1')
  })
})
