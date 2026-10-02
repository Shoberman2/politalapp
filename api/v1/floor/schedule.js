import { validateApiKey } from '../../_lib/auth.js'
import { handleCors, jsonResponse, errorResponse, nodeHandler } from '../../_lib/response.js'
import { logUsage } from '../../_lib/usage.js'
import { getDataUpdatedAt } from '../../_lib/etlMeta.js'
import {
  fetchHouseFloorWeek,
  houseFloorPageUrl,
  houseFloorXmlUrl,
  mondayIso,
  parseHouseFloorXml,
} from '../../../shared/houseFloorSchedule.js'

// GET /api/v1/floor/schedule
//
// The House "Bills This Week" schedule for this week and next (when the
// Majority Leader has published it), parsed server-side from docs.house.gov.
// The alerts pipeline stores floor items only for bills someone follows, so it
// can't answer "what is on the floor"; this reads the source directly and
// leans on the CDN (anonymous responses get s-maxage=300 from nodeHandler)
// plus a short per-instance memo so a burst doesn't fan out upstream.

export const SENATE_NOTE =
  'House schedule only. The Senate does not publish a weekly floor schedule in this format.'

const ENDPOINT = '/v1/floor/schedule'
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

async function route(req) {
  const cors = handleCors(req)
  if (cors) return cors

  const start = Date.now()
  const auth = await validateApiKey(req)
  if (auth.error) return auth.error

  const url = new URL(req.url, 'http://localhost')
  const weekParam = url.searchParams.get('week')
  let weeks
  if (weekParam) {
    const date = /^\d{4}-\d{2}-\d{2}$/.test(weekParam) ? new Date(`${weekParam}T12:00:00Z`) : null
    if (!date || Number.isNaN(date.getTime())) {
      logUsage(auth.key, ENDPOINT, 'GET', 400, Date.now() - start)
      return errorResponse('Invalid week: use YYYY-MM-DD (any day of the week)', 400, 'INVALID_PARAMETER')
    }
    weeks = [mondayIso(date)]
  } else {
    const today = new Date()
    weeks = [mondayIso(today), mondayIso(today, 1)]
  }

  const settled = await Promise.allSettled(weeks.map((week) => loadWeek(week, Date.now())))
  if (settled.every((s) => s.status === 'rejected')) {
    logUsage(auth.key, ENDPOINT, 'GET', 502, Date.now() - start)
    return errorResponse('The House floor schedule could not be fetched from docs.house.gov', 502, 'UPSTREAM_ERROR')
  }

  const data = {
    chamber: 'house',
    senate_note: SENATE_NOTE,
    weeks: weeks.map((week, i) => (
      settled[i].status === 'fulfilled'
        ? presentWeek(week, settled[i].value)
        : { ...presentWeek(week, null), status: 'unavailable' }
    )),
  }

  logUsage(auth.key, ENDPOINT, 'GET', 200, Date.now() - start)
  return jsonResponse({
    data,
    meta: { api_version: 'v1', data_updated_at: await getDataUpdatedAt() },
  })
}

export default nodeHandler(route)

export const config = { runtime: 'nodejs' }
