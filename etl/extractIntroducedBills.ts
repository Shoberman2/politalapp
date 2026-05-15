/**
 * Introduced Bills Extractor
 *
 * Pulls bills that were introduced or had any action in the last N days
 * directly from Congress.gov's bill-list endpoint, independent of roll-call
 * votes. This lets the app surface bills like "Artificial Intelligence Data
 * Center Moratorium Act" the moment they're introduced — before any vote.
 *
 * Pipeline:
 *   1. For each bill type (hr, s, hres, sres, hjres, sjres, hconres, sconres):
 *      list /bill/{congress}/{type} filtered by updateDate window, paginated.
 *   2. For each unique bill id, fetch /bill/{congress}/{type}/{number} to get
 *      true introducedDate, full title, and policyArea.
 *   3. Emit Bill[] in the same shape transform.ts produces, so the existing
 *      loader (with its summary/crs_summary/policy_area preservation) handles
 *      upserts unchanged.
 *
 * Failure mode: best-effort. Detail fetch errors fall back to list data and
 * are logged but not fatal — the vote pipeline must not regress if this fails.
 */

import type { Bill, ETLConfig } from './types.js';
import {
  fetchCongressApi,
  generateBillId,
  getBillSourceUrl,
  logger,
  retry,
} from './utils.js';

// =============================================================================
// CONFIG
// =============================================================================

const BILL_TYPES = [
  'hr',
  's',
  'hres',
  'sres',
  'hjres',
  'sjres',
  'hconres',
  'sconres',
] as const;

const DAYS_BACK = 100;

// Hard safety caps. The Congress.gov updateDate window can resurface thousands
// of older bills if anything procedural touches them, so we cap both the list
// pagination and the per-run detail-call budget.
const LIST_PAGE_SIZE = 250;
const MAX_LIST_PAGES_PER_TYPE = 20;   // up to 5,000 bills per type per run
const MAX_DETAIL_CALLS = 1000;        // ~3.5 min at the 200 ms global rate limit

// =============================================================================
// API RESPONSE SHAPES (subset of Congress.gov fields we actually use)
// =============================================================================

interface BillListItem {
  congress: number;
  type: string;
  number: number;
  title?: string;
  updateDate?: string;
  latestAction?: { actionDate?: string; text?: string };
  originChamber?: string;
  url?: string;
}

interface BillListResponse {
  bills?: BillListItem[];
  pagination?: { count?: number; next?: string };
}

interface BillDetailResponse {
  bill?: {
    congress: number;
    type: string;
    number: number;
    title?: string;
    introducedDate?: string;
    updateDate?: string;
    policyArea?: { name?: string };
    latestAction?: { actionDate?: string; text?: string };
  };
}

export interface IntroducedBillsResult {
  bills: Bill[];
  stats: {
    listed: number;
    unique: number;
    detailed: number;
    emitted: number;
    errors: string[];
  };
}

// =============================================================================
// MAIN
// =============================================================================

export async function extractIntroducedBills(
  config: ETLConfig
): Promise<IntroducedBillsResult> {
  const stats = {
    listed: 0,
    unique: 0,
    detailed: 0,
    emitted: 0,
    errors: [] as string[],
  };

  const congress = getCurrentCongress();
  const { fromDateTime, toDateTime } = getDateTimeRange(DAYS_BACK);

  logger.info(
    `Extracting introduced bills: congress=${congress}, window=${fromDateTime} → ${toDateTime}`
  );

  // -------- Phase 1: list bills per type --------
  const candidates = new Map<string, BillListItem>();

  for (const type of BILL_TYPES) {
    let offset = 0;
    for (let page = 0; page < MAX_LIST_PAGES_PER_TYPE; page++) {
      let response: BillListResponse;
      try {
        response = await retry(() =>
          fetchCongressApi<BillListResponse>(
            `/bill/${congress}/${type}`,
            config.congressApiKey,
            {
              fromDateTime,
              toDateTime,
              sort: 'updateDate+desc',
              limit: LIST_PAGE_SIZE,
              offset,
            }
          )
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        stats.errors.push(`list ${type} page ${page}: ${message}`);
        logger.warn(`List failed for ${type} at offset ${offset}: ${message}`);
        break;
      }

      const bills = response.bills ?? [];
      if (bills.length === 0) break;

      stats.listed += bills.length;
      for (const b of bills) {
        if (b.type == null || b.number == null || b.congress == null) continue;
        const id = generateBillId(b.congress, b.type, b.number);
        if (!candidates.has(id)) candidates.set(id, b);
      }

      if (bills.length < LIST_PAGE_SIZE) break;
      offset += LIST_PAGE_SIZE;
    }
  }

  stats.unique = candidates.size;
  logger.info(
    `Listed ${stats.listed} bill rows, ${stats.unique} unique across ${BILL_TYPES.length} types`
  );

  // -------- Phase 2: per-bill detail fetch for true introducedDate + policyArea --------
  const bills: Bill[] = [];
  let detailBudget = MAX_DETAIL_CALLS;
  let skippedForBudget = 0;

  for (const [id, listItem] of candidates) {
    const congressNum = listItem.congress;
    const typeLower = listItem.type.toLowerCase();
    const number = listItem.number;

    let title: string | null = listItem.title?.trim() || null;
    let introducedAt: string | null = null;
    let policyArea: string | null = null;

    if (detailBudget > 0) {
      detailBudget--;
      try {
        const detail = await retry(() =>
          fetchCongressApi<BillDetailResponse>(
            `/bill/${congressNum}/${typeLower}/${number}`,
            config.congressApiKey
          )
        );
        const d = detail.bill;
        if (d) {
          title = d.title?.trim() || title;
          introducedAt = d.introducedDate ?? null;
          policyArea = d.policyArea?.name?.trim() || null;
          stats.detailed++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Falls back to list data; one detail failure isn't fatal.
        logger.debug(`Detail fetch failed for ${id}: ${message}`);
        if (stats.errors.length < 20) stats.errors.push(`detail ${id}: ${message}`);
      }
    } else {
      skippedForBudget++;
    }

    // Fallbacks if detail was skipped or returned nothing useful.
    if (!introducedAt) {
      introducedAt =
        listItem.latestAction?.actionDate ??
        listItem.updateDate ??
        null;
    }
    if (!title) title = `${typeLower.toUpperCase()} ${number}`;
    if (!introducedAt) introducedAt = new Date().toISOString().slice(0, 10);

    bills.push({
      id,
      title,
      introduced_at: introducedAt,
      summary: null,
      crs_summary: null,
      policy_area: policyArea,
      source_url: getBillSourceUrl(congressNum, typeLower, number),
    });
    stats.emitted++;
  }

  if (skippedForBudget > 0) {
    logger.warn(
      `Detail-call budget hit: ${skippedForBudget} bills emitted with list-only data (CRS phase will backfill)`
    );
  }

  logger.info(
    `Introduced-bills phase complete: ${stats.emitted} bills emitted (${stats.detailed} detailed)`
  );

  return { bills, stats };
}

// =============================================================================
// HELPERS
// =============================================================================

function getCurrentCongress(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  let congressYear = year;
  if (month === 1 && day < 3) congressYear = year - 1;

  return Math.floor((congressYear - 1789) / 2) + 1;
}

function getDateTimeRange(daysBack: number): {
  fromDateTime: string;
  toDateTime: string;
} {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - daysBack);

  return {
    fromDateTime: toCongressDateTime(from),
    toDateTime: toCongressDateTime(now),
  };
}

function toCongressDateTime(date: Date): string {
  // Congress.gov expects "YYYY-MM-DDTHH:mm:ssZ" without milliseconds.
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
