import { describe, it, expect } from 'vitest'
import { isPlaceholderTitle, preferRealTitle, parseBillId, PLACEHOLDER_TITLE_RE } from '../../etl/utils'
import { PLACEHOLDER_TITLE_RE as API_PLACEHOLDER_TITLE_RE } from '../../api/_lib/indexGate.js'
import { mergeBillRow } from '../../etl/load'

const stub = { id: '119-hr-1', title: 'HR 1', introduced_at: null, summary: null, crs_summary: null, policy_area: null, source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/1' }

describe('bill title preservation in the loader', () => {
  it('recognises vote-feed stubs', () => {
    for (const t of ['HR 1', 'S 1582', 'HCONRES 108', 'H.R. 4795', 'S.J.Res. 4', '', null, undefined]) expect(isPlaceholderTitle(t)).toBe(true)
    expect(isPlaceholderTitle('An act to provide for reconciliation pursuant to title II of H. Con. Res. 14.')).toBe(false)
  })

  it('uses the same placeholder pattern as the API gate', () => {
    expect(PLACEHOLDER_TITLE_RE.source).toBe(API_PLACEHOLDER_TITLE_RE.source)
    expect(PLACEHOLDER_TITLE_RE.flags).toBe(API_PLACEHOLDER_TITLE_RE.flags)
  })

  it('prefers a real title from either side and parses bill ids', () => {
    expect(preferRealTitle('HR 1', 'One Big Beautiful Bill Act')).toBe('One Big Beautiful Bill Act')
    expect(preferRealTitle('One Big Beautiful Bill Act', 'HR 1')).toBe('One Big Beautiful Bill Act')
    expect(preferRealTitle('Feed title', 'Existing title')).toBe('Feed title')
    expect(preferRealTitle('HR 1', null)).toBe('HR 1')
    expect(preferRealTitle(null, undefined)).toBe('')
    expect(parseBillId('119-hr-1')).toEqual({ congress: 119, type: 'hr', number: 1 })
    expect(parseBillId('119-HJRES-4')).toEqual({ congress: 119, type: 'hjres', number: 4 })
    expect(parseBillId('nope')).toBeNull()
  })

  it('keeps the real title and date when the incoming record is a stub', () => {
    const existing = { title: 'An act to provide for reconciliation pursuant to title II of H. Con. Res. 14.', introduced_at: '2025-07-04', summary: null, crs_summary: 'CRS text', policy_area: 'Economics and Public Finance' }
    const row = mergeBillRow(stub, existing)
    expect(row.title).toBe(existing.title)
    expect(row.introduced_at).toBe('2025-07-04')
    expect(row.crs_summary).toBe('CRS text')
    expect(row.policy_area).toBe('Economics and Public Finance')
  })

  it('lets a real incoming title replace a stub', () => {
    const row = mergeBillRow({ ...stub, title: 'One Big Beautiful Bill Act', introduced_at: '2025-05-20' }, { title: 'HR 1', introduced_at: null })
    expect(row.title).toBe('One Big Beautiful Bill Act')
    expect(row.introduced_at).toBe('2025-05-20')
  })

  it('uses the stub when nothing better is known and never fabricates a date', () => {
    const row = mergeBillRow(stub, undefined)
    expect(row.title).toBe('HR 1')
    expect(row.introduced_at).toBeNull()
    expect(row).not.toHaveProperty('sponsor_name')
  })
})
