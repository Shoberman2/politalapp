/**
 * Load Module - Supabase Data Loading
 *
 * Loads transformed data into Supabase using the service role key.
 * Handles upserts for politicians and bills, and inserts for votes.
 *
 * Order of operations is critical:
 * 1. Politicians (required by votes foreign key)
 * 2. Bills (required by votes foreign key)
 * 3. Votes
 *
 * All operations use upserts where appropriate to handle idempotency.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  Politician,
  Bill,
  Vote,
  TransformedData,
  LoadResult,
  ETLConfig,
} from './types.js';
import { logger, chunk } from './utils.js';

// =============================================================================
// SUPABASE CLIENT
// =============================================================================

let supabaseClient: SupabaseClient | null = null;

/**
 * Gets or creates the Supabase client.
 */
function getSupabaseClient(config: ETLConfig): SupabaseClient {
  if (!supabaseClient) {
    supabaseClient = createClient(config.supabaseUrl, config.supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }
  return supabaseClient;
}

// =============================================================================
// MAIN LOAD FUNCTION
// =============================================================================

/**
 * Loads all transformed data into Supabase.
 *
 * Performs operations in the correct order to respect foreign key constraints.
 */
export async function loadToSupabase(
  data: TransformedData,
  config: ETLConfig
): Promise<LoadResult> {
  const result: LoadResult = {
    politiciansUpserted: 0,
    billsUpserted: 0,
    votesInserted: 0,
    errors: [],
  };

  if (config.dryRun) {
    logger.info('DRY RUN MODE - No data will be written to Supabase');
    result.politiciansUpserted = data.politicians.size;
    result.billsUpserted = data.bills.size;
    result.votesInserted = data.votes.length;
    return result;
  }

  const supabase = getSupabaseClient(config);

  // Step 1: Upsert politicians
  logger.info(`Loading ${data.politicians.size} politicians...`);
  const politicianResult = await upsertPoliticians(
    supabase,
    Array.from(data.politicians.values())
  );
  result.politiciansUpserted = politicianResult.count;
  result.errors.push(...politicianResult.errors);

  // Step 2: Upsert bills
  logger.info(`Loading ${data.bills.size} bills...`);
  const billResult = await upsertBills(supabase, Array.from(data.bills.values()));
  result.billsUpserted = billResult.count;
  result.errors.push(...billResult.errors);

  // Step 3: Upsert votes
  logger.info(`Loading ${data.votes.length} votes...`);
  const voteResult = await upsertVotes(supabase, data.votes);
  result.votesInserted = voteResult.count;
  result.errors.push(...voteResult.errors);

  logger.info('Load complete', {
    politiciansUpserted: result.politiciansUpserted,
    billsUpserted: result.billsUpserted,
    votesInserted: result.votesInserted,
    errorCount: result.errors.length,
  });

  return result;
}

// =============================================================================
// INDIVIDUAL LOAD FUNCTIONS
// =============================================================================

interface LoadOperationResult {
  count: number;
  errors: string[];
}

/**
 * Upserts politicians to Supabase.
 *
 * Uses the BioGuide ID as the primary key for conflict resolution.
 */
async function upsertPoliticians(
  supabase: SupabaseClient,
  politicians: Politician[]
): Promise<LoadOperationResult> {
  const result: LoadOperationResult = { count: 0, errors: [] };

  if (politicians.length === 0) {
    return result;
  }

  // Process in batches to avoid hitting request size limits
  const batches = chunk(politicians, 100);

  for (const batch of batches) {
    try {
      const { data, error } = await supabase
        .from('politicians')
        .upsert(
          batch.map((p) => ({
            id: p.id,
            name: p.name,
            chamber: p.chamber,
            state: p.state,
            district: p.district,
            party: p.party,
            photo_url: p.photo_url,
          })),
          {
            onConflict: 'id',
            ignoreDuplicates: false, // Update existing records
          }
        )
        .select();

      if (error) {
        result.errors.push(`Politicians upsert error: ${error.message}`);
        logger.error('Politicians upsert error', error);
      } else {
        result.count += data?.length || batch.length;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Politicians batch error: ${message}`);
      logger.error('Politicians batch error', error);
    }
  }

  return result;
}

/**
 * Upserts bills to Supabase.
 *
 * Uses the bill ID as the primary key for conflict resolution.
 * Preserves existing summaries if not provided in new data.
 */
async function upsertBills(
  supabase: SupabaseClient,
  bills: Bill[]
): Promise<LoadOperationResult> {
  const result: LoadOperationResult = { count: 0, errors: [] };

  if (bills.length === 0) {
    return result;
  }

  // First, fetch existing bills to preserve summaries
  const existingBills = new Map<string, Bill>();
  try {
    const { data: existing } = await supabase
      .from('bills')
      .select('id, summary, crs_summary, policy_area')
      .in('id', bills.map((b) => b.id));

    if (existing) {
      for (const bill of existing) {
        existingBills.set(bill.id, bill as Bill);
      }
    }
  } catch (error) {
    logger.warn('Could not fetch existing bills for summary preservation', error);
  }

  // Process in batches
  const batches = chunk(bills, 100);

  for (const batch of batches) {
    try {
      const { data, error } = await supabase
        .from('bills')
        .upsert(
          batch.map((b) => {
            const existing = existingBills.get(b.id);
            return {
              id: b.id,
              title: b.title,
              introduced_at: b.introduced_at,
              summary: b.summary || existing?.summary || null,
              crs_summary: b.crs_summary || (existing as any)?.crs_summary || null,
              policy_area: b.policy_area || (existing as any)?.policy_area || null,
              source_url: b.source_url,
            };
          }),
          {
            onConflict: 'id',
            ignoreDuplicates: false,
          }
        )
        .select();

      if (error) {
        result.errors.push(`Bills upsert error: ${error.message}`);
        logger.error('Bills upsert error', error);
      } else {
        result.count += data?.length || batch.length;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Bills batch error: ${message}`);
      logger.error('Bills batch error', error);
    }
  }

  return result;
}

/**
 * Upserts votes to Supabase.
 *
 * Uses a composite key (politician_id, bill_id, voted_at) for deduplication.
 * Votes are considered immutable facts - we don't overwrite existing votes.
 */
async function upsertVotes(
  supabase: SupabaseClient,
  votes: Vote[]
): Promise<LoadOperationResult> {
  const result: LoadOperationResult = { count: 0, errors: [] };

  if (votes.length === 0) {
    return result;
  }

  // Process in batches
  const batches = chunk(votes, 100);

  for (const batch of batches) {
    try {
      // Use a conflict resolution strategy that doesn't overwrite
      // We use ON CONFLICT DO NOTHING for votes since they're immutable facts
      const { data, error } = await supabase
        .from('votes')
        .upsert(
          batch.map((v) => ({
            politician_id: v.politician_id,
            bill_id: v.bill_id,
            roll_call_id: v.roll_call_id,
            position: v.position,
            voted_at: v.voted_at,
            source_url: v.source_url,
          })),
          {
            // Create a unique constraint on (politician_id, bill_id, voted_at)
            // or use the default primary key behavior
            ignoreDuplicates: true, // Don't update existing votes
          }
        )
        .select();

      if (error) {
        // Handle specific error cases
        if (error.code === '23503') {
          // Foreign key violation
          result.errors.push(`Votes FK error: ${error.message}`);
          logger.error('Votes foreign key error', error);
        } else {
          result.errors.push(`Votes upsert error: ${error.message}`);
          logger.error('Votes upsert error', error);
        }
      } else {
        result.count += data?.length || batch.length;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Votes batch error: ${message}`);
      logger.error('Votes batch error', error);
    }
  }

  return result;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Checks if required tables exist in Supabase.
 */
export async function checkTablesExist(config: ETLConfig): Promise<boolean> {
  const supabase = getSupabaseClient(config);

  const tables = ['politicians', 'bills', 'votes'];

  for (const table of tables) {
    try {
      const { error } = await supabase.from(table).select('id').limit(1);

      if (error) {
        logger.error(`Table '${table}' check failed: ${error.message}`);
        return false;
      }
    } catch (error) {
      logger.error(`Table '${table}' check error`, error);
      return false;
    }
  }

  return true;
}

/**
 * Gets counts of existing records in each table.
 */
export async function getExistingCounts(
  config: ETLConfig
): Promise<{ politicians: number; bills: number; votes: number }> {
  const supabase = getSupabaseClient(config);

  const counts = { politicians: 0, bills: 0, votes: 0 };

  try {
    const [politiciansRes, billsRes, votesRes] = await Promise.all([
      supabase.from('politicians').select('id', { count: 'exact', head: true }),
      supabase.from('bills').select('id', { count: 'exact', head: true }),
      supabase.from('votes').select('id', { count: 'exact', head: true }),
    ]);

    counts.politicians = politiciansRes.count || 0;
    counts.bills = billsRes.count || 0;
    counts.votes = votesRes.count || 0;
  } catch (error) {
    logger.error('Failed to get existing counts', error);
  }

  return counts;
}

/**
 * Fetches bills that need AI summaries.
 */
export async function getBillsNeedingSummaries(
  config: ETLConfig,
  limit: number = 50
): Promise<Bill[]> {
  const supabase = getSupabaseClient(config);

  try {
    const { data, error } = await supabase
      .from('bills')
      .select('*')
      .is('summary', null)
      .limit(limit);

    if (error) {
      logger.error('Failed to fetch bills needing summaries', error);
      return [];
    }

    return data as Bill[];
  } catch (error) {
    logger.error('Error fetching bills needing summaries', error);
    return [];
  }
}

/**
 * Updates a bill's summary after AI enrichment.
 */
export async function updateBillSummary(
  config: ETLConfig,
  billId: string,
  summary: string
): Promise<boolean> {
  const supabase = getSupabaseClient(config);

  try {
    const { error } = await supabase
      .from('bills')
      .update({ summary })
      .eq('id', billId);

    if (error) {
      logger.error(`Failed to update summary for bill ${billId}`, error);
      return false;
    }

    return true;
  } catch (error) {
    logger.error(`Error updating bill summary for ${billId}`, error);
    return false;
  }
}
