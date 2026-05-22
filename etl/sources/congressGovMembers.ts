/**
 * Congress.gov members fetcher for historical backfill.
 *
 * Differs from the daily-ETL member fetch in two ways:
 *   1. Paginated by Congress (not just current); accepts `congress` arg.
 *   2. Emits MemberCongressTerm rows (time-ranged) rather than upserting
 *      politicians directly. The trigger from migration 009 keeps politicians
 *      in sync.
 *
 * Congress.gov endpoints used:
 *   GET /v3/member/congress/{congress}     — paginated list of members
 *   GET /v3/member/{bioguideId}            — detail (terms array)
 *
 * Pagination: 250 per page. ~535 members per Congress means usually 3 pages.
 *
 * Rate limit: respects the existing waitForRateLimit in etl/utils.ts.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '../utils.js';
import type {
  MemberCongressTerm,
  SourceFetchResult,
  BackfillSource,
} from '../historicalTypes.js';

const CONGRESS_API_BASE = 'https://api.congress.gov/v3';

interface CongressGovMemberListItem {
  bioguideId: string;
  name: string;
  partyName: string;
  state: string;
  district?: number;
  depiction?: { imageUrl?: string };
  terms?: { item: Array<{ chamber: string; startYear: number; endYear?: number }> };
}

interface CongressGovMemberListResponse {
  members: CongressGovMemberListItem[];
  pagination?: { count: number; next?: string };
}

/**
 * Maps Congress.gov chamber strings ('House of Representatives' | 'Senate')
 * to our enum ('house' | 'senate').
 */
function normalizeChamber(raw: string): 'house' | 'senate' | null {
  const lower = raw.toLowerCase();
  if (lower.includes('senat')) return 'senate';
  if (lower.includes('house') || lower.includes('representative')) return 'house';
  return null;
}

/**
 * Maps Congress.gov party names to single-letter party codes.
 */
function normalizeParty(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes('democrat')) return 'D';
  if (lower.includes('republican')) return 'R';
  if (lower.includes('independent')) return 'I';
  return raw; // Pass through unknown; reconciliation will flag.
}

/**
 * Fetches all members of a given Congress, paginated.
 *
 * Returns one MemberCongressTerm per member with term_start defaulting to the
 * Congress's start_date (looked up from congress_metadata) — the orchestrator
 * provides this in `congressStartDate`.
 */
export async function fetchMembersForCongress(
  congress: number,
  congressStartDate: string,
  apiKey: string
): Promise<{ terms: MemberCongressTerm[]; errors: string[] }> {
  const terms: MemberCongressTerm[] = [];
  const errors: string[] = [];

  let url:
    | string
    | null = `${CONGRESS_API_BASE}/member/congress/${congress}?format=json&limit=250&api_key=${apiKey}`;
  let page = 0;

  while (url) {
    page++;
    logger.debug(`[congress-gov-members] congress=${congress} page=${page} url=${url}`);
    let resp: Response;
    try {
      resp = await fetch(url);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`network error on page ${page}: ${message}`);
      break;
    }

    if (!resp.ok) {
      // 4xx and 5xx both surface here. Orchestrator's error budget interprets.
      errors.push(`HTTP ${resp.status} on page ${page}: ${resp.statusText}`);
      break;
    }

    let data: CongressGovMemberListResponse;
    try {
      data = (await resp.json()) as CongressGovMemberListResponse;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`JSON parse failed on page ${page}: ${message}`);
      break;
    }

    for (const m of data.members ?? []) {
      // Per-record validation: skip records missing required fields, log to errors.
      if (!m.bioguideId || !m.state) {
        errors.push(
          `skipped malformed member: bioguideId=${m.bioguideId}, state=${m.state}`
        );
        continue;
      }

      // Determine chamber from the member's terms array. The terms list may
      // include multiple chambers across a long career; pick the one matching
      // this congress's chamber if discoverable, else fall back to the first term.
      let chamber: 'house' | 'senate' | null = null;
      const termsArr = m.terms?.item ?? [];
      for (const t of termsArr) {
        const c = normalizeChamber(t.chamber);
        if (c) {
          chamber = c;
          break;
        }
      }
      if (!chamber) {
        errors.push(`skipped member ${m.bioguideId}: no chamber resolved`);
        continue;
      }

      terms.push({
        bioguide_id: m.bioguideId,
        congress,
        term_start: congressStartDate,
        chamber,
        state: m.state,
        district: m.district != null ? String(m.district) : null,
        party: normalizeParty(m.partyName ?? ''),
        caucus: null,
        term_end: null,
        reason_for_end: null,
        source: 'congress_gov',
      });
    }

    url = data.pagination?.next ?? null;
    // Construct full URL if Congress.gov gives us a relative `next`.
    if (url && !url.startsWith('http')) {
      url = `${CONGRESS_API_BASE}/${url.replace(/^\/+/, '')}`;
    }
    if (url && !url.includes('api_key=')) {
      url += url.includes('?') ? `&api_key=${apiKey}` : `?api_key=${apiKey}`;
    }
  }

  return { terms, errors };
}

/**
 * Loads MemberCongressTerm rows into Supabase. The migration-009 trigger
 * syncs politicians on each insert.
 */
export async function loadMemberCongressTerms(
  supabase: SupabaseClient,
  terms: MemberCongressTerm[]
): Promise<number> {
  if (terms.length === 0) return 0;

  // Chunk to keep upsert payloads manageable.
  const CHUNK = 200;
  let loaded = 0;
  for (let i = 0; i < terms.length; i += CHUNK) {
    const chunk = terms.slice(i, i + CHUNK);
    const { error } = await supabase
      .from('member_congress_terms')
      .upsert(chunk, { onConflict: 'bioguide_id,congress,term_start' });
    if (error) {
      logger.error(`[congress-gov-members] upsert chunk ${i} failed`, error);
      throw error;
    }
    loaded += chunk.length;
  }
  return loaded;
}

export async function ingestCongressGovMembers(
  supabase: SupabaseClient,
  congress: number,
  congressStartDate: string,
  apiKey: string
): Promise<SourceFetchResult> {
  const source: BackfillSource = 'congress_gov_members';
  try {
    const { terms, errors } = await fetchMembersForCongress(
      congress,
      congressStartDate,
      apiKey
    );
    const loaded = await loadMemberCongressTerms(supabase, terms);

    // If errors exist but we still loaded some terms, partial. If zero loaded
    // AND errors exist, count it as failed for the Congress's fidelity tier.
    let status: SourceFetchResult['status'];
    if (loaded > 0 && errors.length === 0) status = 'success';
    else if (loaded > 0 && errors.length > 0) status = 'partial';
    else status = 'failed';

    return {
      source,
      congress,
      status,
      records_loaded: loaded,
      records_skipped: errors.length,
      errors,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      source,
      congress,
      status: 'failed',
      records_loaded: 0,
      records_skipped: 0,
      errors: [message],
    };
  }
}
