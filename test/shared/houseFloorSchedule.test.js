import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import {
  billFromFloorLabel,
  fetchHouseFloorWeek,
  floorCategoryLabel,
  houseFloorPageUrl,
  houseFloorXmlUrl,
  mondayIso,
  parseHouseFloorXml,
} from '../../shared/houseFloorSchedule.js'

// Real "Bills This Week" XML for the week of 2026-09-14, downloaded unmodified
// from docs.house.gov/floor/Download.aspx?file=/billsthisweek/20260914/20260914.xml
const FIXTURE = readFileSync(resolve(process.cwd(), 'test/fixtures/houseFloor/20260914.xml'), 'utf8')

// docs.house.gov answers an unpublished week with HTTP 200 and this page
// (trimmed to the parts that matter here).
const NOT_FOUND_HTML = `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.0 Transitional//EN">
<HTML><HEAD><title>Download</title></HEAD><body>
<form method="post" action="./Download.aspx?file=%2fbillsthisweek%2f20260928%2f20260928.xml" id="Form1">
<span id="Label1">The requested file was not found. Please use the BACK button on your browser to return to the previous page, then report the error.</span></form>
</body></HTML>`

describe('parseHouseFloorXml (real 2026-09-14 schedule)', () => {
  const parsed = parseHouseFloorXml(FIXTURE)

  it('reads the schedule header', () => {
    expect(parsed.congress).toBe('119')
    expect(parsed.week).toBe('2026-09-14')
    expect(parsed.updated).toBe('2026-09-15T11:20:08.180')
  })

  it('returns every floor item with its procedure category', () => {
    expect(parsed.items).toHaveLength(78)
    const counts = {}
    for (const item of parsed.items) counts[item.category] = (counts[item.category] || 0) + 1
    expect(counts).toEqual({ Suspension: 71, 'Under a rule': 5, 'May be considered': 2 })
  })

  it('maps the first item to its bill, title, and raw category heading', () => {
    expect(parsed.items[0]).toMatchObject({
      itemId: '409734',
      label: 'S. 283',
      categoryType: 'Items that may be considered under suspension of the rules',
      category: 'Suspension',
      removedAt: '',
      bill: { congress: 119, type: 's', number: 283, id: '119-s-283' },
    })
    expect(parsed.items[0].title.replace(/\s+/g, ' ')).toBe('Illegal Red Snapper and Tuna Enforcement Act, as amended')
  })

  it('does not read a nested subitem (Rules Committee Print) as the item', () => {
    const hr9576 = parsed.items.find((i) => i.label === 'H.R. 9576')
    expect(hr9576.category).toBe('Under a rule')
    expect(hr9576.title).not.toMatch(/Rules Committee Print/)
    expect(parsed.items.some((i) => /^Rules Committee Print/.test(i.title))).toBe(false)
  })

  it('links "Senate amendments to H.R. 5334" to H.R. 5334', () => {
    const item = parsed.items.find((i) => i.label.startsWith('Senate amendments'))
    expect(item.bill.id).toBe('119-hr-5334')
  })

  it('returns null for the 200 HTML "file was not found" page', () => {
    expect(parseHouseFloorXml(NOT_FOUND_HTML)).toBeNull()
    expect(parseHouseFloorXml('')).toBeNull()
  })
})

describe('helpers', () => {
  it('computes the Monday of a week', () => {
    expect(mondayIso(new Date('2026-10-02T15:00:00Z'))).toBe('2026-09-28')
    expect(mondayIso(new Date('2026-10-02T15:00:00Z'), 1)).toBe('2026-10-05')
    expect(mondayIso(new Date('2026-09-14T00:00:00Z'))).toBe('2026-09-14')
    expect(mondayIso(new Date('2026-09-20T12:00:00Z'))).toBe('2026-09-14')
  })

  it('builds the official URLs', () => {
    expect(houseFloorXmlUrl('2026-09-14')).toBe(
      'https://docs.house.gov/floor/Download.aspx?file=%2Fbillsthisweek%2F20260914%2F20260914.xml',
    )
    expect(houseFloorPageUrl('2026-09-14')).toBe('https://docs.house.gov/floor/Default.aspx?date=2026-09-14')
  })

  it('parses bill labels and rejects non-bills', () => {
    expect(billFromFloorLabel('119', 'H.J. Res. 210')?.id).toBe('119-hjres-210')
    expect(billFromFloorLabel('119', 'H. Con. Res. 93')?.id).toBe('119-hconres-93')
    expect(billFromFloorLabel('119', 'H. Res. 1530')?.id).toBe('119-hres-1530')
    expect(billFromFloorLabel('119', '')).toBeNull()
    expect(billFromFloorLabel('', 'H.R. 1')).toBeNull()
    expect(billFromFloorLabel('119', 'Motion to adjourn')).toBeNull()
  })

  it('names categories plainly', () => {
    expect(floorCategoryLabel('Items that may be considered under suspension of the rules')).toBe('Suspension')
    expect(floorCategoryLabel('Items that may be considered pursuant to a rule')).toBe('Under a rule')
    expect(floorCategoryLabel('Items that may be considered')).toBe('May be considered')
    expect(floorCategoryLabel(null)).toBeNull()
  })
})

describe('fetchHouseFloorWeek', () => {
  it('returns the XML for a published week', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(FIXTURE, { status: 200 }))
    await expect(fetchHouseFloorWeek('2026-09-14', fetchImpl)).resolves.toBe(FIXTURE)
    expect(fetchImpl.mock.calls[0][0]).toContain('20260914')
  })

  it('treats a 404 and the 200 not-found page as unpublished', async () => {
    await expect(fetchHouseFloorWeek('2026-09-28', vi.fn().mockResolvedValue(new Response('', { status: 404 })))).resolves.toBeNull()
    await expect(fetchHouseFloorWeek('2026-09-28', vi.fn().mockResolvedValue(new Response(NOT_FOUND_HTML, { status: 200 })))).resolves.toBeNull()
  })

  it('throws on other upstream errors', async () => {
    await expect(fetchHouseFloorWeek('2026-09-28', vi.fn().mockResolvedValue(new Response('', { status: 503 }))))
      .rejects.toThrow('House floor schedule request failed (503)')
  })
})

describe('parseHouseFloorXml: items outside or inside nested categories', () => {
  const item = (id, label) =>
    `<floor-item id="${id}" add-date="2026-09-08T10:00:00" remove-date=""><legis-num>${label}</legis-num><floor-text>Item ${id}</floor-text></floor-item>`

  it('keeps a floor item that sits outside any <category> (the alert source used to scan the whole XML)', () => {
    const xml = `<floorschedule congress-num="119" week-date="2026-09-14">
      <category type="Items that may be considered under suspension of the rules">${item('1', 'H.R. 1')}</category>
      ${item('2', 'H.R. 2')}
    </floorschedule>`
    const parsed = parseHouseFloorXml(xml)
    expect(parsed.items.map((i) => [i.itemId, i.category])).toEqual([['1', 'Suspension'], ['2', null]])
    expect(parsed.items[1]).toMatchObject({ categoryType: null, bill: { id: '119-hr-2' }, removedAt: '' })
    expect(parsed.items[1].xml).toContain('<floor-item id="2"')
  })

  it('a nested category does not truncate its parent; each item takes its nearest heading', () => {
    const xml = `<floorschedule congress-num="119">
      <category type="Items that may be considered pursuant to a rule">
        ${item('10', 'H.R. 10')}
        <category type="Motion to suspend">${item('11', 'H.R. 11')}</category>
        ${item('12', 'H.R. 12')}
      </category>
    </floorschedule>`
    const parsed = parseHouseFloorXml(xml)
    expect(parsed.items.map((i) => [i.itemId, i.categoryType])).toEqual([
      ['10', 'Items that may be considered pursuant to a rule'],
      ['11', 'Motion to suspend'],
      ['12', 'Items that may be considered pursuant to a rule'],
    ])
  })

  it('parses the real fixture into the same 78 items in document order', () => {
    const parsed = parseHouseFloorXml(FIXTURE, '2026-09-14')
    expect(parsed.items).toHaveLength(78)
    expect(parsed.items.every((i) => i.categoryType)).toBe(true)
  })
})
