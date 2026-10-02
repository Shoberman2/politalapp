// The House weekly floor schedule, via our own GET /api/v1/floor/schedule
// (which parses docs.house.gov's "Bills This Week" XML server-side). Every row
// here comes from that document; nothing is inferred. The schedule names a
// week, not a day, and lists what *may* be considered, so callers should say
// "scheduled for the week of", never "voting on <day>".

export const SENATE_NOTE = 'House schedule; the Senate does not publish one in this format.'

const ENDPOINT = '/api/v1/floor/schedule'

function normalizeItem(raw, week) {
  const billHref = raw.bill_path || null
  return {
    id: `${week.week}:${raw.item_id ?? raw.label ?? raw.title}`,
    label: raw.label || null,
    title: raw.title || null,
    category: raw.category || null,
    categoryType: raw.category_type || null,
    billId: raw.bill_id || null,
    billHref,
    tellRepHref: billHref ? `${billHref}#tell-your-rep` : null,
    week: week.week,
    sourceUrl: week.source_url,
  }
}

export function normalizeSchedule(body) {
  const data = body?.data
  if (!data || !Array.isArray(data.weeks)) return null
  return {
    chamber: 'House',
    senateNote: SENATE_NOTE,
    weeks: data.weeks.map((w) => ({
      week: w.week,
      status: w.status,
      congress: w.congress ?? null,
      sourceUrl: w.source_url,
      updatedAt: w.source_updated_at ?? null,
      items: (w.items || []).map((item) => normalizeItem(item, w)),
    })),
  }
}

/**
 * Returns { chamber:'House', senateNote, weeks:[{ week, status, congress,
 * sourceUrl, updatedAt, items:[{ id, label, title, category, billId, billHref,
 * tellRepHref, week, sourceUrl }] }] } or null when the schedule couldn't be
 * loaded. `weeks[0]` is this week; `weeks[1]`, when present, is next week.
 * `status` is 'published', 'not_published', or 'unavailable'.
 */
export async function getFloorSchedule({ fetchImpl = globalThis.fetch } = {}) {
  try {
    const res = await fetchImpl(ENDPOINT, { headers: { accept: 'application/json' } })
    if (!res.ok) return null
    return normalizeSchedule(await res.json())
  } catch (err) {
    console.warn('[FloorSchedule] request failed:', err)
    return null
  }
}
