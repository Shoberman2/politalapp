import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { makeSupabaseMock } from '../fixtures/supabaseChain.js'

const db = makeSupabaseMock()
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: (t) => db.from(t) } }))

import { getFloorSchedule, getMemberRecord } from '../../api/_lib/mcpTools.js'
import { _resetFloorScheduleMemo, SENATE_NOTE } from '../../api/_lib/floorSchedule.js'
import { _resetEtlMetaCache } from '../../api/_lib/etlMeta.js'

const FIXTURE = readFileSync(resolve(process.cwd(), 'test/fixtures/houseFloor/20260914.xml'), 'utf8')
const NOT_FOUND_HTML = '<HTML><body><span id="Label1">The requested file was not found.</span></body></HTML>'

describe('get_floor_schedule', () => {
  beforeEach(() => {
    _resetFloorScheduleMemo()
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-16T15:00:00Z'))
  })
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

  it('returns this week (published) and next (not published) with absolute bill URLs and sources', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => (
      String(url).includes('20260914') ? new Response(FIXTURE) : new Response(NOT_FOUND_HTML)
    )))
    const out = await getFloorSchedule({})
    expect(out.error).toBeUndefined()
    expect(out.chamber).toBe('house')
    expect(out.senate_note).toBe(SENATE_NOTE)
    expect(out.canonical).toBe('https://www.ballotwatch.io/this-week')
    const [thisWeek, nextWeek] = out.weeks
    expect(thisWeek).toMatchObject({
      week: '2026-09-14', status: 'published', congress: 119,
      source_url: 'https://docs.house.gov/floor/Default.aspx?date=2026-09-14',
    })
    // Same item count as GET /api/v1/floor/schedule for this fixture.
    expect(thisWeek.items).toHaveLength(78)
    expect(thisWeek.items[0]).toEqual({
      label: 'S. 283',
      title: 'Illegal Red Snapper and Tuna Enforcement Act, as amended',
      category: 'Suspension',
      bill_id: '119-s-283',
      canonical: 'https://www.ballotwatch.io/bill/119/s/283',
      source_url: 'https://docs.house.gov/floor/Default.aspx?date=2026-09-14',
    })
    expect(nextWeek).toMatchObject({ week: '2026-09-21', status: 'not_published', items: [] })
  })

  it('normalizes a given date to its Monday and fetches only that week', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(FIXTURE)))
    const out = await getFloorSchedule({ week: '2026-09-17' })
    expect(out.weeks.map((w) => w.week)).toEqual(['2026-09-14'])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('marks a failed week unavailable, and errors when every week fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => (
      String(url).includes('20260914') ? new Response(FIXTURE) : new Response('', { status: 500 })
    )))
    expect((await getFloorSchedule({})).weeks.map((w) => w.status)).toEqual(['published', 'unavailable'])

    _resetFloorScheduleMemo()
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    expect((await getFloorSchedule({})).error).toMatch(/docs\.house\.gov/)
  })

  it('rejects a malformed week without fetching', async () => {
    vi.stubGlobal('fetch', vi.fn())
    expect((await getFloorSchedule({ week: 'next' })).error).toMatch(/YYYY-MM-DD/)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('get_member_record', () => {
  beforeEach(() => { db.reset(); _resetEtlMetaCache() })

  function seed() {
    db.responses.politicians = { data: { id: 'P000197', name: 'Nancy Pelosi', chamber: 'house', state: 'CA', district: '11', party: 'Democratic', photo_url: null } }
    db.responses.member_congress_terms = { data: [
      { congress: 119, chamber: 'house', state: 'CA', district: '11', party: 'D', term_start: '2025-01-03', term_end: null },
      { congress: 118, chamber: 'house', state: 'CA', district: '11', party: 'D', term_start: '2023-01-03', term_end: '2025-01-03' },
    ] }
    db.responses.member_stats = { data: { congress: 119, total_votes: 400, yea_count: 250, nay_count: 120, present_count: 2, not_voting_count: 28 } }
    db.responses.votes = { data: [
      { roll_call_id: 'house-119-2-250', position: 'Yea', voted_at: '2026-09-18', source_url: 'https://clerk.house.gov/Votes/2026250', bill_id: '119-hr-4931', bills: { id: '119-hr-4931', title: 'A real bill title' } },
      { roll_call_id: 'house-119-2-249', position: 'No', voted_at: '2026-09-17', source_url: 'javascript:alert(1)', bill_id: null, bills: null },
    ], count: 812 }
    db.responses.roll_calls = { data: [
      { id: 'house-119-2-250', question: 'On Passage', description: null, bill_id: '119-hr-4931' },
      { id: 'house-119-2-249', question: 'On Motion to Adjourn', description: null, bill_id: null },
    ] }
    db.responses.roll_call_stats = { data: [
      { roll_call_id: 'house-119-2-250', dem_yea: 200, dem_nay: 10, rep_yea: 20, rep_nay: 190, ind_yea: 0, ind_nay: 0 },
      // Double-counted tally: no result may be shown for it.
      { roll_call_id: 'house-119-2-249', dem_yea: 400, dem_nay: 10, rep_yea: 400, rep_nay: 10, ind_yea: 0, ind_nay: 0 },
    ] }
    db.responses.etl_metadata = { data: { value: '2026-09-19T10:00:00Z' } }
  }

  it('returns the record card facts with absolute URLs and no campaign-finance data', async () => {
    seed()
    const out = await getMemberRecord({ bioguide_id: 'p000197' })
    expect(out).toMatchObject({
      bioguide_id: 'P000197', name: 'Nancy Pelosi', party: 'Democratic', chamber: 'house', state: 'CA', district: '11',
      serving_since: '2025-01-03',
      this_congress: { congress: 119, roll_calls: 400, votes_cast: 372, not_voting: 28, not_voting_pct: 7 },
      recorded_votes: 812,
      canonical: 'https://www.ballotwatch.io/politician/P000197/record',
      member_page: 'https://www.ballotwatch.io/politician/P000197',
      source_url: 'https://www.congress.gov/member/P000197',
      sources: {
        congress_gov: 'https://www.congress.gov/member/P000197',
        bioguide: 'https://bioguide.congress.gov/search/bio/P000197',
        chamber_votes: 'https://clerk.house.gov/Votes',
      },
      data_updated_at: '2026-09-19T10:00:00Z',
    })
    expect(out.recent_votes[0]).toEqual({
      voted_at: '2026-09-18',
      question: 'On Passage',
      bill: { id: '119-hr-4931', label: 'H.R. 4931', title: 'A real bill title', canonical: 'https://www.ballotwatch.io/bill/119/hr/4931' },
      position: 'Yea',
      result: expect.any(String),
      canonical: 'https://www.ballotwatch.io/vote/119/house/2/250',
      source_url: 'https://clerk.house.gov/Votes/2026250',
    })
    expect(out.recent_votes[1]).toMatchObject({ position: 'Nay', result: null, bill: null, source_url: null })
    // The card never reads campaign-finance tables.
    expect(db.tables().some((t) => /fec|donor|contribution|donation/i.test(t))).toBe(false)
    expect(db.ops('votes', 'limit')[0]).toEqual(['limit', 10])
  })

  it('reports an unknown member and a malformed id as errors', async () => {
    db.responses.politicians = { data: null }
    expect((await getMemberRecord({ bioguide_id: 'Z999999' })).error).toBe('No member with Bioguide ID Z999999')
    const bad = await getMemberRecord({ bioguide_id: 'pelosi' })
    expect(bad.error).toMatch(/looks wrong/)
  })
})
