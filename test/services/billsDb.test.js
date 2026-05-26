import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Integration test for searchBillsInDb sponsor + cosponsor filters
 * (eng-review test plan). Mocks the Supabase client and asserts the
 * correct .eq() / .from()!inner join chain is built for each filter shape.
 */

const supabaseCalls = []

vi.mock('../../src/lib/supabase', () => {
  function makeChain(tableName) {
    const chain = {
      _table: tableName,
      _filters: {},
      select(cols) {
        chain._select = cols
        supabaseCalls.push({ op: 'select', table: tableName, cols })
        return chain
      },
      eq(col, val) {
        chain._filters[col] = val
        supabaseCalls.push({ op: 'eq', table: tableName, col, val })
        return chain
      },
      ilike(col, pattern) {
        supabaseCalls.push({ op: 'ilike', table: tableName, col, pattern })
        return chain
      },
      like(col, pattern) {
        supabaseCalls.push({ op: 'like', table: tableName, col, pattern })
        return chain
      },
      gte(col, val) {
        supabaseCalls.push({ op: 'gte', table: tableName, col, val })
        return chain
      },
      or(filter) {
        supabaseCalls.push({ op: 'or', table: tableName, filter })
        return chain
      },
      order() { return chain },
      limit() {
        return Promise.resolve({ data: [], error: null })
      },
      range(from, to) {
        supabaseCalls.push({ op: 'range', table: tableName, from, to })
        return Promise.resolve({ data: [], error: null })
      },
      not() { return chain },
      maybeSingle() { return Promise.resolve({ data: null, error: null }) },
    }
    return chain
  }
  return {
    supabase: {
      from(table) {
        return makeChain(table)
      },
    },
  }
})

describe('searchBillsInDb — sponsor + cosponsor filters', () => {
  beforeEach(() => {
    supabaseCalls.length = 0
  })

  it('plain query → no sponsor filter, no inner join', async () => {
    const { searchBillsInDb } = await import('../../src/services/billsDb')
    await searchBillsInDb({})
    const sponsorEq = supabaseCalls.find((c) => c.op === 'eq' && c.col === 'sponsor_bioguide_id')
    expect(sponsorEq).toBeUndefined()
    const selectWithInner = supabaseCalls.find(
      (c) => c.op === 'select' && c.cols && c.cols.includes('bill_cosponsors!inner')
    )
    expect(selectWithInner).toBeUndefined()
  })

  it('sponsorBioguideId filter → adds .eq("sponsor_bioguide_id", X)', async () => {
    const { searchBillsInDb } = await import('../../src/services/billsDb')
    await searchBillsInDb({ sponsorBioguideId: 'W000817' })
    const sponsorEq = supabaseCalls.find((c) => c.op === 'eq' && c.col === 'sponsor_bioguide_id')
    expect(sponsorEq).toBeDefined()
    expect(sponsorEq.val).toBe('W000817')
  })

  it('cosponsorBioguideId filter → bill_cosponsors!inner join', async () => {
    const { searchBillsInDb } = await import('../../src/services/billsDb')
    await searchBillsInDb({ cosponsorBioguideId: 'O000172' })
    const selectWithInner = supabaseCalls.find(
      (c) => c.op === 'select' && c.cols && c.cols.includes('bill_cosponsors!inner')
    )
    expect(selectWithInner).toBeDefined()
    const cosponsorEq = supabaseCalls.find(
      (c) => c.op === 'eq' && c.col === 'bill_cosponsors.bioguide_id'
    )
    expect(cosponsorEq).toBeDefined()
    expect(cosponsorEq.val).toBe('O000172')
  })

  it('combined sponsor + cosponsor filter (intersection)', async () => {
    const { searchBillsInDb } = await import('../../src/services/billsDb')
    await searchBillsInDb({
      sponsorBioguideId: 'W000817',
      cosponsorBioguideId: 'O000172',
    })
    const sponsorEq = supabaseCalls.find((c) => c.op === 'eq' && c.col === 'sponsor_bioguide_id')
    const cosponsorEq = supabaseCalls.find((c) => c.op === 'eq' && c.col === 'bill_cosponsors.bioguide_id')
    expect(sponsorEq?.val).toBe('W000817')
    expect(cosponsorEq?.val).toBe('O000172')
  })

  it('REGRESSION: existing title/bill-id search works alongside sponsor filter', async () => {
    const { searchBillsInDb } = await import('../../src/services/billsDb')
    await searchBillsInDb({
      query: 'infrastructure',
      sponsorBioguideId: 'W000817',
    })
    const ilike = supabaseCalls.find((c) => c.op === 'ilike' && c.col === 'title')
    expect(ilike).toBeDefined()
    const sponsorEq = supabaseCalls.find((c) => c.op === 'eq' && c.col === 'sponsor_bioguide_id')
    expect(sponsorEq).toBeDefined()
  })

  it('REGRESSION: bill-ID-style query still matches title.ilike + id.ilike', async () => {
    const { searchBillsInDb } = await import('../../src/services/billsDb')
    await searchBillsInDb({ query: 'S 1234' })
    const orFilter = supabaseCalls.find((c) => c.op === 'or')
    expect(orFilter).toBeDefined()
    expect(orFilter.filter).toContain('title.ilike')
    expect(orFilter.filter).toContain('id.ilike')
  })

  it('supports an introducedFrom floor for all-Congress archive search', async () => {
    const { searchBillsInDb } = await import('../../src/services/billsDb')
    await searchBillsInDb({ query: 'education', introducedFrom: '2001-01-03' })
    const dateFloor = supabaseCalls.find((c) => c.op === 'gte' && c.col === 'introduced_at')
    expect(dateFloor).toBeDefined()
    expect(dateFloor.val).toBe('2001-01-03')
  })

  it('supports offset pagination for archive browsing', async () => {
    const { searchBillsInDb } = await import('../../src/services/billsDb')
    await searchBillsInDb({ congress: 107, limit: 20, offset: 40 })
    const range = supabaseCalls.find((c) => c.op === 'range')
    expect(range).toBeDefined()
    expect(range.from).toBe(40)
    expect(range.to).toBe(59)
  })
})
