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
// A failed fetch is remembered for a minute, so an outage at docs.house.gov
// costs one upstream request per week per minute per instance, not one per
// API call.
const FAILURE_TTL_MS = 60 * 1000
const UPSTREAM_TIMEOUT_MS = 8000
const memo = new Map()
const inFlight = new Map()
const MEMO_MAX = 64

export function _resetFloorScheduleMemo() {
  memo.clear()
  inFlight.clear()
}

async function fetchWeek(week) {
  const xml = await fetchHouseFloorWeek(week, (url, init) =>
    fetch(url, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) }))
  return xml ? parseHouseFloorXml(xml, week) : null
}

function remember(week, entry) {
  memo.delete(week)
  memo.set(week, entry)
  // Bounded: drop the oldest entries once the memo outgrows a few months of weeks.
  while (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value)
}

function loadWeek(week, now) {
  const hit = memo.get(week)
  if (hit) {
    if (hit.error && now - hit.at < FAILURE_TTL_MS) return Promise.reject(hit.error)
    if (!hit.error && now - hit.at < MEMO_TTL_MS) return Promise.resolve(hit.value)
  }
  // Concurrent callers for the same week share one upstream request.
  const pending = inFlight.get(week)
  if (pending) return pending
  const request = fetchWeek(week)
    .then((value) => {
      remember(week, { at: Date.now(), value })
      return value
    }, (error) => {
      remember(week, { at: Date.now(), error })
      throw error
    })
    .finally(() => { if (inFlight.get(week) === request) inFlight.delete(week) })
  inFlight.set(week, request)
  return request
}

/**
 * Today's calendar date in Washington (America/New_York), as a Date at UTC
 * noon so mondayIso (which reads UTC fields) sees that day. The House
 * schedules in Eastern time: Sunday evening in ET is still the current week
 * even though it is already Monday in UTC.
 */
export function easternDate(now = new Date()) {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  return new Date(`${ymd}T12:00:00Z`)
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
    // Reject impossible dates (2026-02-30 would roll over into March) and weeks
    // the House never published or can't have published yet.
    if (date.toISOString().slice(0, 10) !== String(weekParam)) return null
    const year = date.getUTCFullYear()
    if (year < 2010 || date.getTime() > today.getTime() + 60 * 86400000) return null
    return [mondayIso(date)]
  }
  const eastern = easternDate(today)
  return [mondayIso(eastern), mondayIso(eastern, 1)]
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
