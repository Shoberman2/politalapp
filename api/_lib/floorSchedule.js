// House weekly floor schedule, fetched from docs.house.gov and shaped for the
// public surfaces. Shared by GET /api/v1/floor/schedule and the MCP tool
// get_floor_schedule so both read the same parser, the same per-instance memo,
// and the same presentation.

import {
  fetchHouseFloorWeek,
  houseFloorPageUrl,
  houseFloorXmlUrl,
  mondayIso,
  parseHouseFloorXml,
} from '../../shared/houseFloorSchedule.js'

export const SENATE_NOTE =
  'House schedule only. The Senate does not publish a weekly floor schedule in this format.'

const MEMO_TTL_MS = 5 * 60 * 1000
const UPSTREAM_TIMEOUT_MS = 8000
const memo = new Map()

export function _resetFloorScheduleMemo() {
  memo.clear()
}

async function loadWeek(week, now) {
  const hit = memo.get(week)
  if (hit && now - hit.at < MEMO_TTL_MS) return hit.value
  const xml = await fetchHouseFloorWeek(week, (url, init) =>
    fetch(url, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) }))
  const value = xml ? parseHouseFloorXml(xml, week) : null
  memo.set(week, { at: now, value })
  return value
}

export function presentWeek(week, parsed) {
  const base = {
    week,
    chamber: 'house',
    source_url: houseFloorPageUrl(week),
    xml_url: houseFloorXmlUrl(week),
  }
  if (!parsed) return { ...base, status: 'not_published', congress: null, source_updated_at: null, items: [] }
  return {
    ...base,
    status: 'published',
    congress: Number(parsed.congress) || null,
    source_updated_at: parsed.updated || null,
    // Items the Majority Leader has pulled from the week stay in the XML with a
    // remove-date; they are no longer scheduled, so they are left out here.
    items: parsed.items
      .filter((item) => !item.removedAt)
      .map((item) => ({
        item_id: item.itemId,
        label: item.label.replace(/\s+/g, ' ').trim() || null,
        title: item.title.replace(/\s+/g, ' ').trim() || null,
        category: item.category,
        category_type: item.categoryType,
        bill_id: item.bill?.id ?? null,
        bill_path: item.bill ? `/bill/${item.bill.congress}/${item.bill.type}/${item.bill.number}` : null,
        added_at: item.addedAt,
      })),
  }
}

/**
 * The weeks to show: the week containing `weekParam` (any day, YYYY-MM-DD),
 * or this week and next when it is absent. Null for a malformed date.
 */
export function resolveFloorWeeks(weekParam, today = new Date()) {
  if (weekParam != null && weekParam !== '') {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(weekParam)) ? new Date(`${weekParam}T12:00:00Z`) : null
    if (!date || Number.isNaN(date.getTime())) return null
    return [mondayIso(date)]
  }
  return [mondayIso(today), mondayIso(today, 1)]
}

/**
 * Fetch and present the given weeks. A week whose fetch fails is marked
 * `unavailable`; `allFailed` is true when every week failed upstream.
 */
export async function loadFloorSchedule(weeks) {
  const settled = await Promise.allSettled(weeks.map((week) => loadWeek(week, Date.now())))
  return {
    allFailed: settled.every((s) => s.status === 'rejected'),
    data: {
      chamber: 'house',
      senate_note: SENATE_NOTE,
      weeks: weeks.map((week, i) => (
        settled[i].status === 'fulfilled'
          ? presentWeek(week, settled[i].value)
          : { ...presentWeek(week, null), status: 'unavailable' }
      )),
    },
  }
}
