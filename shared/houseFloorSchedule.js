// House weekly floor schedule ("Bills This Week") from docs.house.gov.
//
// Shared by the bill-alert source (server/alerts/sources/houseFloor.ts) and the
// public endpoint GET /api/v1/floor/schedule. Plain JS with no Node-only
// imports so both the TypeScript alert runtime and the JS Vercel functions can
// use it.
//
// What the XML does and does not say: it lists items the Majority Leader says
// *may* be considered during a week, grouped by procedure (suspension of the
// rules, pursuant to a rule, ...). It carries the week, not a day or time per
// item. The Senate publishes nothing equivalent in this format.

const BILL_TYPE_PATTERN =
  /^(H\.?\s*R\.?|S\.?|H\.?\s*J\.?\s*Res\.?|S\.?\s*J\.?\s*Res\.?|H\.?\s*Con\.?\s*Res\.?|S\.?\s*Con\.?\s*Res\.?|H\.?\s*Res\.?|S\.?\s*Res\.?)\s*(\d+)/i

const BILL_TYPES = new Set(['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'])

/** Monday (UTC calendar) of the week containing `date`, plus `addWeeks`, as YYYY-MM-DD. */
export function mondayIso(date, addWeeks = 0) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = copy.getUTCDay() || 7
  copy.setUTCDate(copy.getUTCDate() - day + 1 + addWeeks * 7)
  return copy.toISOString().slice(0, 10)
}

/** The machine-readable XML for a week (Monday, YYYY-MM-DD). */
export function houseFloorXmlUrl(week) {
  const compact = week.replaceAll('-', '')
  const download = new URL('https://docs.house.gov/floor/Download.aspx')
  download.searchParams.set('file', `/billsthisweek/${compact}/${compact}.xml`)
  return download.toString()
}

/** The human-readable schedule page for a week. */
export function houseFloorPageUrl(week) {
  return `https://docs.house.gov/floor/Default.aspx?date=${week}`
}

export function attribute(tag, name) {
  return tag.match(new RegExp(`${name}="([^"]*)"`, 'i'))?.[1] ?? null
}

export function element(xml, name) {
  return (xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] ?? '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
}

/**
 * "H.R. 4931 " -> { congress, type:'hr', number:4931, id:'119-hr-4931' }, or null
 * when the label is not a bill or resolution (e.g. a motion or a blank label).
 */
export function billFromFloorLabel(congress, label) {
  // "Senate amendments to H.R. 5334" and "Conference report to accompany
  // H.R. 1" are floor business on that bill; the page for it is the bill's.
  const text = String(label || '').trim()
    .replace(/^(senate amendments?|house amendments?|conference report)\s+(to(\s+accompany)?|on)\s+/i, '')
  const match = text.match(BILL_TYPE_PATTERN)
  if (!match) return null
  const type = match[1].toLowerCase().replace(/[^a-z]/g, '')
  const c = String(congress ?? '').replace(/\D/g, '')
  const number = Number(match[2])
  if (!BILL_TYPES.has(type) || !c || !number) return null
  return { congress: Number(c), type, number, id: `${c}-${type}-${number}` }
}

/** Short, plain-English name for the procedure a category describes. */
export function floorCategoryLabel(type) {
  const t = String(type || '').toLowerCase()
  if (t.includes('suspension')) return 'Suspension'
  if (t.includes('pursuant to a rule')) return 'Under a rule'
  if (t.includes('rule')) return 'Rule'
  if (t.includes('conference')) return 'Conference report'
  if (t.includes('motion')) return 'Motion'
  return t ? 'May be considered' : null
}

/**
 * Parse one week's XML. Returns null when the body is not a floor schedule
 * (docs.house.gov answers a missing week with a 200 HTML "file was not found"
 * page, not a 404).
 *
 * Items are returned in document order, removed ones included (truthy
 * `removedAt`), and each carries its raw `<floor-item>` XML (`xml`) and inner
 * XML (`body`) for the alert pipeline.
 */
export function parseHouseFloorXml(xml, fallbackWeek = null) {
  const root = String(xml || '').match(/<floorschedule\b[^>]*>/i)?.[0]
  if (!root) return null

  const congress = attribute(root, 'congress-num') ?? ''
  const week = attribute(root, 'week-date') || fallbackWeek
  const updated = attribute(root, 'update-date') || attribute(root, 'create-date') || null

  const items = []
  const categoryPattern = /<category\b([^>]*)>([\s\S]*?)<\/category>/gi
  let cat
  const sections = []
  while ((cat = categoryPattern.exec(xml))) sections.push({ type: attribute(cat[1], 'type'), body: cat[2] })
  // A schedule without category wrappers still has items; treat it as one section.
  if (!sections.length) sections.push({ type: null, body: xml })

  for (const section of sections) {
    const itemPattern = /<floor-item\b([^>]*)>([\s\S]*?)<\/floor-item>/gi
    let match
    while ((match = itemPattern.exec(section.body))) {
      const attrs = match[1]
      const body = match[2]
      const label = element(body, 'legis-num')
      items.push({
        itemId: attribute(attrs, 'id'),
        label,
        title: element(body, 'floor-text'),
        categoryType: section.type,
        category: floorCategoryLabel(section.type),
        addedAt: attribute(attrs, 'add-date') || null,
        // Raw attribute: '' when listed, a timestamp when pulled, null if absent.
        // Kept verbatim because the alert pipeline fingerprints it.
        removedAt: attribute(attrs, 'remove-date'),
        bill: billFromFloorLabel(congress, label),
        xml: match[0],
        body,
      })
    }
  }

  return { congress, week, updated, items }
}

/**
 * Fetch one week's XML text. Resolves null when the week is not published
 * (404, or the 200 "not found" HTML page); throws on other upstream errors.
 */
export async function fetchHouseFloorWeek(week, fetchImpl = fetch) {
  const response = await fetchImpl(houseFloorXmlUrl(week), { headers: { accept: 'application/xml,text/xml' } })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`House floor schedule request failed (${response.status})`)
  const text = await response.text()
  return /<floorschedule\b/i.test(text) ? text : null
}
