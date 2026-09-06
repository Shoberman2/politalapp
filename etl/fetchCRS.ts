/**
 * CRS Summary Fetcher
 *
 * Fetches official CRS (Congressional Research Service) summaries
 * from Congress.gov for bills that don't have one yet.
 * Also fetches policyArea for topic categorization.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { ETLConfig } from './types.js';
import { fetchCongressApi, isPlaceholderTitle, logger, sleep } from './utils.js';

interface CRSResult {
  billsProcessed: number;
  summariesFetched: number;
  policyAreasFetched: number;
  errors: string[];
}

interface CRSSummaryResponse {
  summaries?: Array<{
    text?: string;
  }>;
}

interface CRSBillResponse {
  bill?: {
    title?: string;
    introducedDate?: string;
    policyArea?: {
      name?: string;
    };
  };
}

interface EnrichableBill {
  id: string;
  title: string | null;
  introduced_at: string | null;
  crs_summary: string | null;
  policy_area: string | null;
}

// PostgREST cannot express the placeholder regex, so this ilike net is
// deliberately wide; isPlaceholderTitle decides before anything is written.
const PLACEHOLDER_TITLE_FILTER =
  'title.is.null,title.ilike.HR %,title.ilike.S %,title.ilike.HRES %,title.ilike.SRES %,title.ilike.HJRES %,title.ilike.SJRES %,title.ilike.HCONRES %,title.ilike.SCONRES %';
const MISSING_ENRICHMENT_FILTER = 'crs_summary.is.null,policy_area.is.null,introduced_at.is.null';
const SELECT_COLUMNS = 'id, title, introduced_at, crs_summary, policy_area';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Pick the bills to enrich this run. Placeholder-titled bills come first: a
 * bill whose only name is "HR 4795" is hidden from the sitemap and the API
 * until a real title arrives, so it must not wait its turn behind the 100k+
 * archive rows that merely lack a CRS summary. Newest Congress first within
 * each pass so current bills heal before historical ones.
 */
export async function selectBillsToEnrich(
  supabase: SupabaseClient,
  maxBills: number
): Promise<{ bills: EnrichableBill[]; error: string | null }> {
  const chosen = new Map<string, EnrichableBill>();

  const { data: stubs, error: stubError } = await supabase
    .from('bills')
    .select(SELECT_COLUMNS)
    .or(PLACEHOLDER_TITLE_FILTER)
    .order('id', { ascending: false })
    .limit(maxBills);
  if (stubError) return { bills: [], error: stubError.message };
  for (const bill of (stubs || []) as EnrichableBill[]) {
    if (isPlaceholderTitle(bill.title)) chosen.set(bill.id, bill);
  }

  const remaining = maxBills - chosen.size;
  if (remaining > 0) {
    const { data: rest, error: restError } = await supabase
      .from('bills')
      .select(SELECT_COLUMNS)
      .or(MISSING_ENRICHMENT_FILTER)
      .order('id', { ascending: false })
      .limit(remaining + chosen.size);
    if (restError) return { bills: [...chosen.values()], error: restError.message };
    for (const bill of (rest || []) as EnrichableBill[]) {
      if (chosen.size >= maxBills) break;
      if (!chosen.has(bill.id)) chosen.set(bill.id, bill);
    }
  }

  return { bills: [...chosen.values()], error: null };
}

/**
 * Fetch CRS summaries and policy areas for bills that need them.
 */
export async function fetchCRSSummaries(
  config: ETLConfig,
  maxBills: number = 50
): Promise<CRSResult> {
  const result: CRSResult = {
    billsProcessed: 0,
    summariesFetched: 0,
    policyAreasFetched: 0,
    errors: [],
  };

  const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Bills that need enrichment: placeholder titles first, then rows missing a
  // CRS summary, policy area, or introduced date (see selectBillsToEnrich).
  const { bills, error } = await selectBillsToEnrich(supabase, maxBills);

  if (error) {
    result.errors.push(`Failed to fetch bills: ${error}`);
    return result;
  }

  logger.info(`Found ${bills.length} bills needing CRS data`);

  for (const bill of bills) {
    result.billsProcessed++;

    // Parse bill ID: "119-hr-1234" -> congress=119, type=hr, number=1234
    const parts = bill.id.split('-');
    if (parts.length < 3) continue;
    const [congress, type, number] = parts;

    const updates: Record<string, string> = {};

    // Fetch CRS summary if missing
    if (!bill.crs_summary) {
      try {
        const summaryResponse = await fetchCongressApi<CRSSummaryResponse>(
          `/bill/${congress}/${type}/${number}/summaries`,
          config.congressApiKey
        );

        const summaries = summaryResponse?.summaries || [];
        if (summaries.length > 0) {
          // Use the most recent summary
          const latest = summaries[summaries.length - 1];
          const text = stripHtml(latest.text || '');
          if (text.length > 10) {
            updates.crs_summary = text;
            result.summariesFetched++;
          }
        }
      } catch (err) {
        // Not all bills have CRS summaries, this is expected
        logger.debug(`No CRS summary for ${bill.id}: ${(err as Error).message}`);
      }
    }

    // Fetch bill details (title, introduced date, policy area) if missing
    const needsTitle = isPlaceholderTitle(bill.title);
    if (!bill.policy_area || !bill.introduced_at || needsTitle) {
      try {
        const billResponse = await fetchCongressApi<CRSBillResponse>(
          `/bill/${congress}/${type}/${number}`,
          config.congressApiKey
        );

        const billData = billResponse?.bill;
        if (billData) {
          if (billData.policyArea?.name) {
            updates.policy_area = billData.policyArea.name;
            result.policyAreasFetched++;
          }
          if (needsTitle && billData.title && !isPlaceholderTitle(billData.title)) {
            updates.title = billData.title;
          }
          // The detail's introducedDate is the real one; the vote feed and the
          // bill list never carry it, so this is where a null date gets filled.
          if (billData.introducedDate && ISO_DATE.test(billData.introducedDate)) {
            updates.introduced_at = billData.introducedDate;
          }
        }
      } catch (err) {
        logger.debug(`No bill details for ${bill.id}: ${(err as Error).message}`);
      }
    }

    // Update bill if we got any new data
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await supabase
        .from('bills')
        .update(updates)
        .eq('id', bill.id);

      if (updateError) {
        result.errors.push(`Update failed for ${bill.id}: ${updateError.message}`);
      }
    }

    // Rate limit: 750ms between calls (Congress.gov 5000/hr limit)
    await sleep(750);
  }

  logger.info(`CRS fetch complete: ${result.summariesFetched} summaries, ${result.policyAreasFetched} policy areas`);
  return result;
}

/**
 * Strip HTML tags from CRS summary text.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}
