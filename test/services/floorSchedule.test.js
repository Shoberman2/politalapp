import { describe, it, expect, vi } from 'vitest'
import { getFloorSchedule, normalizeSchedule, SENATE_NOTE } from '../../src/services/floorSchedule.js'

const API_BODY = {
  data: {
    chamber: 'house',
    senate_note: 'House schedule only.',
    weeks: [
      {
        week: '2026-09-14', chamber: 'house', status: 'published', congress: 119,
        source_updated_at: '2026-09-15T11:20:08.180',
        source_url: 'https://docs.house.gov/floor/Default.aspx?date=2026-09-14',
        xml_url: 'https://docs.house.gov/floor/Download.aspx?file=%2Fbillsthisweek%2F20260914%2F20260914.xml',
        items: [
          { item_id: '409734', label: 'S. 283', title: 'Illegal Red Snapper and Tuna Enforcement Act, as amended', category: 'Suspension', category_type: 'Items that may be considered under suspension of the rules', bill_id: '119-s-283', bill_path: '/bill/119/s/283', added_at: null },
          { item_id: '1', label: null, title: 'A non-bill item', category: 'May be considered', category_type: 'Items that may be considered', bill_id: null, bill_path: null, added_at: null },
        ],
      },
      { week: '2026-09-21', chamber: 'house', status: 'not_published', congress: null, source_updated_at: null, source_url: 'https://docs.house.gov/floor/Default.aspx?date=2026-09-21', items: [] },
    ],
  },
  meta: { api_version: 'v1' },
}

describe('getFloorSchedule', () => {
  it('calls the public endpoint and returns the normalized shape', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(API_BODY), { status: 200 }))
    const s = await getFloorSchedule({ fetchImpl })
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/floor/schedule')
    expect(s.chamber).toBe('House')
    expect(s.senateNote).toBe(SENATE_NOTE)
    expect(s.weeks.map((w) => [w.week, w.status])).toEqual([['2026-09-14', 'published'], ['2026-09-21', 'not_published']])
    expect(s.weeks[0].items[0]).toEqual({
      id: '2026-09-14:409734',
      label: 'S. 283',
      title: 'Illegal Red Snapper and Tuna Enforcement Act, as amended',
      category: 'Suspension',
      categoryType: 'Items that may be considered under suspension of the rules',
      billId: '119-s-283',
      billHref: '/bill/119/s/283',
      tellRepHref: '/bill/119/s/283#tell-your-rep',
      week: '2026-09-14',
      sourceUrl: 'https://docs.house.gov/floor/Default.aspx?date=2026-09-14',
    })
  })

  it('gives non-bill items no bill or tell-your-rep link', () => {
    const s = normalizeSchedule(API_BODY)
    expect(s.weeks[0].items[1]).toMatchObject({ billHref: null, tellRepHref: null, title: 'A non-bill item' })
  })

  it('returns null on an HTTP error, a network error, or an unexpected body', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await expect(getFloorSchedule({ fetchImpl: vi.fn().mockResolvedValue(new Response('{}', { status: 502 })) })).resolves.toBeNull()
    await expect(getFloorSchedule({ fetchImpl: vi.fn().mockRejectedValue(new Error('offline')) })).resolves.toBeNull()
    await expect(getFloorSchedule({ fetchImpl: vi.fn().mockResolvedValue(new Response('{"data":{}}')) })).resolves.toBeNull()
    warn.mockRestore()
  })
})
