import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

const m = vi.hoisted(() => ({ insert: vi.fn(), maybeSingle: vi.fn() }))
vi.mock('../../api/_lib/supabase.js', () => ({
  supabaseAdmin: {
    from: (table) => {
      if (table === 'etl_metadata') return { select: () => ({ eq: () => ({ maybeSingle: m.maybeSingle }) }) }
      if (table === 'api_usage') return { insert: m.insert }
      throw new Error(`unexpected table ${table}`)
    },
  },
}))

import handler, { _resetFloorScheduleMemo, SENATE_NOTE } from '../../api/v1/floor/schedule.js'
import { _resetMemory } from '../../api/_lib/rateLimit.js'
import { loadFloorSchedule, resolveFloorWeeks, easternDate } from '../../api/_lib/floorSchedule.js'
import { _resetEtlMetaCache } from '../../api/_lib/etlMeta.js'

const FIXTURE = readFileSync(resolve(process.cwd(), 'test/fixtures/houseFloor/20260914.xml'), 'utf8')
const NOT_FOUND_HTML = '<HTML><body><span id="Label1">The requested file was not found.</span></body></HTML>'

function res() {
  const h = new Map()
  return { statusCode: 0, body: '', setHeader: (k, v) => h.set(k.toLowerCase(), v), end(b) { this.body = b || '' }, h }
}

function get(url) {
  const r = res()
  return handler({ method: 'GET', url, headers: { 'x-real-ip': '203.0.113.9' } }, r).then(() => r)
}

describe('GET /api/v1/floor/schedule', () => {
  beforeEach(() => {
    _resetMemory(); _resetEtlMetaCache(); _resetFloorScheduleMemo()
    m.insert.mockReset(); m.maybeSingle.mockReset()
    m.maybeSingle.mockResolvedValue({ data: { value: '2026-09-15T10:00:00.000Z' } })
    m.insert.mockImplementation(() => ({ then: (r) => { r({ error: null }); return { catch() {} } } }))
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-09-16T15:00:00Z'))
  })
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('serves this week (published) and next week (not published) to an anonymous caller', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => (
      String(url).includes('20260914') ? new Response(FIXTURE) : new Response(NOT_FOUND_HTML)
    )))
    const r = await get('/api/v1/floor/schedule')
    expect(r.statusCode).toBe(200)
    expect(r.h.get('cache-control')).toContain('s-maxage=300')
    const body = JSON.parse(r.body)
    expect(body.meta).toMatchObject({ api_version: 'v1', data_updated_at: '2026-09-15T10:00:00.000Z' })
    expect(body.data.chamber).toBe('house')
    expect(body.data.senate_note).toBe(SENATE_NOTE)
    const [thisWeek, nextWeek] = body.data.weeks
    expect(thisWeek).toMatchObject({
      week: '2026-09-14', status: 'published', congress: 119,
      source_url: 'https://docs.house.gov/floor/Default.aspx?date=2026-09-14',
    })
    expect(thisWeek.items).toHaveLength(78)
    expect(thisWeek.items[0]).toEqual({
      item_id: '409734',
      label: 'S. 283',
      title: 'Illegal Red Snapper and Tuna Enforcement Act, as amended',
      category: 'Suspension',
      category_type: 'Items that may be considered under suspension of the rules',
      bill_id: '119-s-283',
      bill_path: '/bill/119/s/283',
      added_at: '2026-09-08T13:06:15.623',
    })
    expect(nextWeek).toMatchObject({ week: '2026-09-21', status: 'not_published', items: [] })
    expect(m.insert).toHaveBeenCalledWith(expect.objectContaining({ endpoint: '/v1/floor/schedule', status_code: 200 }))
  })

  it('omits items the schedule marks as removed', async () => {
    const withRemoval = FIXTURE.replace(
      '<floor-item id="409734" add-date="2026-09-08T13:06:15.623" remove-date=""',
      '<floor-item id="409734" add-date="2026-09-08T13:06:15.623" remove-date="2026-09-10T09:00:00.000"',
    )
    expect(withRemoval).not.toBe(FIXTURE)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(withRemoval)))
    const body = JSON.parse((await get('/api/v1/floor/schedule?week=2026-09-17')).body)
    expect(body.data.weeks).toHaveLength(1)
    expect(body.data.weeks[0].items).toHaveLength(77)
    expect(body.data.weeks[0].items.some((i) => i.item_id === '409734')).toBe(false)
  })

  it('rejects a malformed week', async () => {
    vi.stubGlobal('fetch', vi.fn())
    const r = await get('/api/v1/floor/schedule?week=next')
    expect(r.statusCode).toBe(400)
    expect(JSON.parse(r.body).error.code).toBe('INVALID_PARAMETER')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('returns 502 when docs.house.gov fails for every week, cached briefly', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    const r = await get('/api/v1/floor/schedule')
    expect(r.statusCode).toBe(502)
    expect(JSON.parse(r.body).error.code).toBe('UPSTREAM_ERROR')
    expect(r.h.get('cache-control')).toBe('public, s-maxage=30')
  })

  it('remembers a failed week for 60 seconds instead of refetching on every call', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 500 })))
    await get('/api/v1/floor/schedule?week=2026-09-16')
    const afterFirst = fetch.mock.calls.length
    expect(afterFirst).toBeGreaterThan(0)
    vi.setSystemTime(new Date('2026-09-16T15:00:50Z'))
    const again = await get('/api/v1/floor/schedule?week=2026-09-16')
    expect(again.statusCode).toBe(502)
    expect(fetch.mock.calls.length).toBe(afterFirst)
    vi.setSystemTime(new Date('2026-09-16T15:01:05Z'))
    await get('/api/v1/floor/schedule?week=2026-09-16')
    expect(fetch.mock.calls.length).toBeGreaterThan(afterFirst)
  })

  it('coalesces concurrent fetches of the same week into one upstream request', async () => {
    let release
    const gate = new Promise((r) => { release = r })
    vi.stubGlobal('fetch', vi.fn(async () => { await gate; return new Response(FIXTURE) }))
    const pending = [loadFloorSchedule(['2026-09-14']), loadFloorSchedule(['2026-09-14']), loadFloorSchedule(['2026-09-14'])]
    release()
    const results = await Promise.all(pending)
    const perWeekCalls = fetch.mock.calls.length
    // fetchHouseFloorWeek may try more than one URL, but only once for all three callers.
    const solo = vi.fn(async () => new Response(FIXTURE))
    _resetFloorScheduleMemo()
    vi.stubGlobal('fetch', solo)
    await loadFloorSchedule(['2026-09-14'])
    expect(perWeekCalls).toBe(solo.mock.calls.length)
    for (const r of results) expect(r.data.weeks[0].status).toBe('published')
  })

  it('marks a single failed week unavailable rather than empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url) => (
      String(url).includes('20260914') ? new Response(FIXTURE) : new Response('', { status: 500 })
    )))
    const body = JSON.parse((await get('/api/v1/floor/schedule')).body)
    expect(body.data.weeks.map((w) => w.status)).toEqual(['published', 'unavailable'])
  })
})

describe('floor schedule "this week" is computed in Eastern time', () => {
  it('Sunday evening in Washington is still the current week (already Monday in UTC)', () => {
    // 2026-09-21T02:00Z is Sunday Sep 20, 10pm EDT.
    const now = new Date('2026-09-21T02:00:00Z')
    expect(easternDate(now).toISOString().slice(0, 10)).toBe('2026-09-20')
    expect(resolveFloorWeeks(undefined, now)).toEqual(['2026-09-14', '2026-09-21'])
  })

  it('rolls over at midnight Eastern, not midnight UTC', () => {
    // Monday Sep 21, 00:30 EDT.
    expect(resolveFloorWeeks('', new Date('2026-09-21T04:30:00Z'))).toEqual(['2026-09-21', '2026-09-28'])
  })

  it('uses EST in winter', () => {
    // Sunday Jan 10 2027, 11pm EST = Monday 04:00Z.
    expect(resolveFloorWeeks(null, new Date('2027-01-11T04:00:00Z'))).toEqual(['2027-01-04', '2027-01-11'])
  })
})
