/**
 * CRS Summary Fetcher
 *
 * Fetches official CRS (Congressional Research Service) summaries
 * from Congress.gov for bills that don't have one yet.
 * Also fetches policyArea for topic categorization.
 */

import { createClient } from '@supabase/supabase-js';
import type { ETLConfig } from './types.js';
import { fetchCongressApi, logger, sleep } from './utils.js';

interface CRSResult {
  billsProcessed: number;
  summariesFetched: number;
  policyAreasFetched: number;
  errors: string[];
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

  // Fetch bills that are missing crs_summary OR policy_area
  const { data: bills, error } = await supabase
    .from('bills')
    .select('id, title, crs_summary, policy_area')
    .or('crs_summary.is.null,policy_area.is.null')
    .limit(maxBills);

  if (error || !bills) {
    result.errors.push(`Failed to fetch bills: ${error?.message}`);
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
        const summaryResponse = await fetchCongressApi(
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

    // Fetch policy area if missing
    if (!bill.policy_area) {
      try {
        const billResponse = await fetchCongressApi(
          `/bill/${congress}/${type}/${number}`,
          config.congressApiKey
        );

        const policyArea = billResponse?.bill?.policyArea?.name;
        if (policyArea) {
          updates.policy_area = policyArea;
          result.policyAreasFetched++;
        }
      } catch (err) {
        logger.debug(`No policy area for ${bill.id}: ${(err as Error).message}`);
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
