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

import type {
  Bill,
  BillCommitteeRouting,
  BillCosponsor,
  ETLConfig,
} from './types.js';
import {
  fetchCongressApi,
  generateBillId,
  getBillSourceUrl,
  logger,
  retry,
} from './utils.js';
import { deriveLegislativeStage } from '../shared/legislativeStage.js';
import { lookupCommittee } from './data/committees.js';

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

interface SponsorItem {
  bioguideId?: string;
  fullName?: string;
  firstName?: string;
  lastName?: string;
  party?: string;
  state?: string;
  district?: number;
}

interface CommitteeActivity {
  name?: string;
  date?: string;
}

interface CommitteeItem {
  systemCode?: string;
  name?: string;
  chamber?: string;
  type?: string;
  activities?: CommitteeActivity[];
  subcommittees?: Array<{
    systemCode?: string;
    name?: string;
    activities?: CommitteeActivity[];
  }>;
}

interface CosponsorItem {
  bioguideId?: string;
  sponsorshipDate?: string;
  sponsorshipWithdrawnDate?: string;
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
    sponsors?: SponsorItem[];
    committees?: { count?: number; url?: string };
    cosponsors?: { count?: number; url?: string };
  };
}

interface BillCommitteesResponse {
  committees?: CommitteeItem[];
}

interface BillCosponsorsResponse {
  cosponsors?: CosponsorItem[];
}

export interface IntroducedBillsResult {
  bills: Bill[];
  routings: BillCommitteeRouting[];
  cosponsors: BillCosponsor[];
  unknownCommitteeCodes: Array<{ committee_code: string; subcommittee_code: string | null }>;
  stats: {
    listed: number;
    unique: number;
    detailed: number;
    emitted: number;
    routingsEmitted: number;
    cosponsorsEmitted: number;
    errors: string[];
  };
}

export interface ExtractIntroducedBillsOptions {
  congress?: number;
  billTypes?: ReadonlyArray<typeof BILL_TYPES[number]>;
  /**
   * Number of days to include in the updateDate window. Use null for a full
   * Congress/type listing, which is what the historical bill backfill needs.
   */
  daysBack?: number | null;
  maxListPagesPerType?: number;
  maxDetailCalls?: number;
  includeCommittees?: boolean;
  includeCosponsors?: boolean;
}

// Map a Congress.gov committee "activity" name to our activity_type enum.
function mapActivityType(activityName: string | undefined | null): string {
  if (!activityName) return 'referred_to';
  const lower = activityName.toLowerCase();
  if (lower.includes('reported')) return 'reported_by';
  if (lower.includes('discharged')) return 'discharged_from';
  if (lower.includes('markup')) return 'markup';
  if (lower.includes('consideration')) return 'committee_consideration';
  return 'referred_to';
}

// =============================================================================
// MAIN
// =============================================================================

export async function extractIntroducedBills(
  config: ETLConfig,
  options: ExtractIntroducedBillsOptions = {}
): Promise<IntroducedBillsResult> {
  const stats = {
    listed: 0,
    unique: 0,
    detailed: 0,
    emitted: 0,
    routingsEmitted: 0,
    cosponsorsEmitted: 0,
    errors: [] as string[],
  };
  const routings: BillCommitteeRouting[] = [];
  const cosponsors: BillCosponsor[] = [];
  const unknownCommitteeCodes = new Map<string, { committee_code: string; subcommittee_code: string | null }>();

  const congress = options.congress ?? getCurrentCongress();
  const billTypes = options.billTypes ?? BILL_TYPES;
  const daysBack = options.daysBack === undefined ? DAYS_BACK : options.daysBack;
  const maxListPagesPerType = options.maxListPagesPerType ?? MAX_LIST_PAGES_PER_TYPE;
  const maxDetailCalls = options.maxDetailCalls ?? MAX_DETAIL_CALLS;
  const includeCommittees = options.includeCommittees ?? true;
  const includeCosponsors = options.includeCosponsors ?? true;
  const dateRange = daysBack == null ? null : getDateTimeRange(daysBack);

  logger.info(
    dateRange
      ? `Extracting introduced bills: congress=${congress}, window=${dateRange.fromDateTime} → ${dateRange.toDateTime}`
      : `Extracting introduced bills: congress=${congress}, full Congress listing`
  );

  // -------- Phase 1: list bills per type --------
  const candidates = new Map<string, BillListItem>();

  for (const type of billTypes) {
    let offset = 0;
    for (let page = 0; page < maxListPagesPerType; page++) {
      const params: Record<string, string | number> = {
        sort: 'updateDate+desc',
        limit: LIST_PAGE_SIZE,
        offset,
      };
      if (dateRange) {
        params.fromDateTime = dateRange.fromDateTime;
        params.toDateTime = dateRange.toDateTime;
      }

      let response: BillListResponse;
      try {
        response = await retry(() =>
          fetchCongressApi<BillListResponse>(
            `/bill/${congress}/${type}`,
            config.congressApiKey,
            params
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
    `Listed ${stats.listed} bill rows, ${stats.unique} unique across ${billTypes.length} types`
  );

  // -------- Phase 2: per-bill detail fetch for true introducedDate + policyArea --------
  const bills: Bill[] = [];
  let detailBudget = maxDetailCalls;
  let skippedForBudget = 0;

  for (const [id, listItem] of candidates) {
    const congressNum = listItem.congress;
    const typeLower = listItem.type.toLowerCase();
    const number = listItem.number;

    let title: string | null = listItem.title?.trim() || null;
    let introducedAt: string | null = null;
    let policyArea: string | null = null;
    let sponsor: SponsorItem | null = null;
    let billCommittees: CommitteeItem[] | null = null;
    let billCosponsors: CosponsorItem[] | null = null;

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
          sponsor = d.sponsors?.[0] || null;
          stats.detailed++;
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        // Falls back to list data; one detail failure isn't fatal.
        logger.debug(`Detail fetch failed for ${id}: ${message}`);
        if (stats.errors.length < 20) stats.errors.push(`detail ${id}: ${message}`);
      }

      // Optional sub-fetches. The daily ETL keeps these on; the historical
      // bill backfill can disable them so bill visibility is not blocked by
      // much larger routing/cosponsor call volume.
      if (includeCommittees) {
        try {
          const committeesRes = await retry(() =>
            fetchCongressApi<BillCommitteesResponse>(
              `/bill/${congressNum}/${typeLower}/${number}/committees`,
              config.congressApiKey
            )
          );
          billCommittees = committeesRes.committees ?? [];
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.debug(`Committees fetch failed for ${id}: ${message}`);
        }
      }

      if (includeCosponsors) {
        try {
          const cospRes = await retry(() =>
            fetchCongressApi<BillCosponsorsResponse>(
              `/bill/${congressNum}/${typeLower}/${number}/cosponsors`,
              config.congressApiKey
            )
          );
          billCosponsors = cospRes.cosponsors ?? [];
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          logger.debug(`Cosponsors fetch failed for ${id}: ${message}`);
        }
      }
    } else {
      skippedForBudget++;
    }

    // Fallbacks if detail was skipped or returned nothing useful.
    const latestActionText = listItem.latestAction?.text ?? null;
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
      // Sponsor cols populated only when detail-fetch succeeded.
      sponsor_bioguide_id: sponsor?.bioguideId ?? null,
      sponsor_name:
        sponsor?.fullName ??
        (sponsor?.firstName || sponsor?.lastName
          ? `${sponsor.firstName ?? ''} ${sponsor.lastName ?? ''}`.trim()
          : null),
      sponsor_party: sponsor?.party ?? null,
      sponsor_state: sponsor?.state ?? null,
      // Stage derived from latestAction text — single source of truth via shared util.
      legislative_stage: deriveLegislativeStage(latestActionText),
    });
    stats.emitted++;

    // Flatten committees + subcommittees into one routing row per (bill, committee, subcommittee).
    if (billCommittees) {
      for (const c of billCommittees) {
        const committeeCode = c.systemCode?.toUpperCase() ?? null;
        if (!committeeCode) continue;
        const firstActivity = c.activities?.[0];
        const referredAt = firstActivity?.date ?? null;
        const activityType = mapActivityType(firstActivity?.name);

        // Glossary lookup: if missing, log to unknown_committee_codes for quarterly review.
        if (!lookupCommittee(committeeCode)) {
          if (!unknownCommitteeCodes.has(committeeCode)) {
            unknownCommitteeCodes.set(committeeCode, {
              committee_code: committeeCode,
              subcommittee_code: null,
            });
          }
        }

        const subs = c.subcommittees ?? [];
        if (subs.length === 0) {
          routings.push({
            bill_id: id,
            committee_code: committeeCode,
            committee_name: c.name ?? null,
            subcommittee_code: null,
            subcommittee_name: null,
            chamber: c.chamber ?? null,
            referred_at: referredAt,
            activity_type: activityType,
          });
          stats.routingsEmitted++;
        } else {
          for (const s of subs) {
            const subCode = s.systemCode?.toUpperCase() ?? null;
            const subFirstAct = s.activities?.[0];
            const subReferredAt = subFirstAct?.date ?? referredAt;
            const subActivityType = mapActivityType(subFirstAct?.name);

            if (subCode && !lookupCommittee(subCode)) {
              const key = `${committeeCode}:${subCode}`;
              if (!unknownCommitteeCodes.has(key)) {
                unknownCommitteeCodes.set(key, {
                  committee_code: committeeCode,
                  subcommittee_code: subCode,
                });
              }
            }

            routings.push({
              bill_id: id,
              committee_code: committeeCode,
              committee_name: c.name ?? null,
              subcommittee_code: subCode,
              subcommittee_name: s.name ?? null,
              chamber: c.chamber ?? null,
              referred_at: subReferredAt,
              activity_type: subActivityType,
            });
            stats.routingsEmitted++;
          }
        }
      }
    }

    // Cosponsors — one row per (bill, member).
    if (billCosponsors) {
      for (const cs of billCosponsors) {
        if (!cs.bioguideId) continue;
        cosponsors.push({
          bill_id: id,
          bioguide_id: cs.bioguideId,
          cosponsored_at: cs.sponsorshipDate ?? null,
          withdrawn_at: cs.sponsorshipWithdrawnDate ?? null,
        });
        stats.cosponsorsEmitted++;
      }
    }
  }

  if (skippedForBudget > 0) {
    logger.warn(
      `Detail-call budget hit: ${skippedForBudget} bills emitted with list-only data (CRS phase will backfill)`
    );
  }

  logger.info(
    `Introduced-bills phase complete: ${stats.emitted} bills, ${stats.routingsEmitted} routings, ${stats.cosponsorsEmitted} cosponsors (${stats.detailed} detailed)`
  );
  if (unknownCommitteeCodes.size > 0) {
    logger.warn(
      `Encountered ${unknownCommitteeCodes.size} unknown committee codes — will be logged to unknown_committee_codes for quarterly review`
    );
  }

  return {
    bills,
    routings,
    cosponsors,
    unknownCommitteeCodes: Array.from(unknownCommitteeCodes.values()),
    stats,
  };
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
