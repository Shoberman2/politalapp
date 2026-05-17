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
  RollCall,
  BillCommitteeRouting,
  BillCosponsor,
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
    rollCallsUpserted: 0,
    votesInserted: 0,
    billCommitteeRoutingsUpserted: 0,
    billCosponsorsUpserted: 0,
    unknownCommitteeCodesLogged: 0,
    errors: [],
  };

  if (config.dryRun) {
    logger.info('DRY RUN MODE - No data will be written to Supabase');
    result.politiciansUpserted = data.politicians.size;
    result.billsUpserted = data.bills.size;
    result.rollCallsUpserted = data.rollCalls.size;
    result.votesInserted = data.votes.length;
    result.billCommitteeRoutingsUpserted = data.billCommitteeRoutings?.length ?? 0;
    result.billCosponsorsUpserted = data.billCosponsors?.length ?? 0;
    result.unknownCommitteeCodesLogged = data.unknownCommitteeCodes?.length ?? 0;
    return result;
  }

  const supabase = getSupabaseClient(config);

  // Order is critical for foreign keys:
  //   politicians → bills → roll_calls (FK to bills) → votes (FK to politicians + bills)
  // Roll calls must be upserted before votes so the soft join from
  // votes.roll_call_id → roll_calls.id always finds a row.

  logger.info(`Loading ${data.politicians.size} politicians...`);
  const politicianResult = await upsertPoliticians(
    supabase,
    Array.from(data.politicians.values())
  );
  result.politiciansUpserted = politicianResult.count;
  result.errors.push(...politicianResult.errors);

  logger.info(`Loading ${data.bills.size} bills...`);
  const billResult = await upsertBills(supabase, Array.from(data.bills.values()));
  result.billsUpserted = billResult.count;
  result.errors.push(...billResult.errors);

  logger.info(`Loading ${data.rollCalls.size} roll calls...`);
  const rollCallResult = await upsertRollCalls(
    supabase,
    Array.from(data.rollCalls.values())
  );
  result.rollCallsUpserted = rollCallResult.count;
  result.errors.push(...rollCallResult.errors);

  logger.info(`Loading ${data.votes.length} votes...`);
  const voteResult = await upsertVotes(supabase, data.votes);
  result.votesInserted = voteResult.count;
  result.errors.push(...voteResult.errors);

  // Bill enrichment (sponsor/routings/cosponsors) — strict order per eng-review D19.
  // bills upsert above must complete BEFORE we touch routings or cosponsors,
  // because both FK back to bills(id). The sequential awaits enforce this.
  if (data.billCommitteeRoutings && data.billCommitteeRoutings.length > 0) {
    logger.info(`Loading ${data.billCommitteeRoutings.length} bill_committee_routings...`);
    const routingResult = await upsertBillCommitteeRoutings(supabase, data.billCommitteeRoutings);
    result.billCommitteeRoutingsUpserted = routingResult.count;
    result.errors.push(...routingResult.errors);
  }

  if (data.billCosponsors && data.billCosponsors.length > 0) {
    logger.info(`Loading ${data.billCosponsors.length} bill_cosponsors...`);
    const cospResult = await upsertBillCosponsors(supabase, data.billCosponsors);
    result.billCosponsorsUpserted = cospResult.count;
    result.errors.push(...cospResult.errors);
  }

  if (data.unknownCommitteeCodes && data.unknownCommitteeCodes.length > 0) {
    logger.info(`Logging ${data.unknownCommitteeCodes.length} unknown committee codes...`);
    const unkResult = await upsertUnknownCommitteeCodes(supabase, data.unknownCommitteeCodes);
    result.unknownCommitteeCodesLogged = unkResult.count;
    result.errors.push(...unkResult.errors);
  }

  logger.info('Load complete', {
    politiciansUpserted: result.politiciansUpserted,
    billsUpserted: result.billsUpserted,
    rollCallsUpserted: result.rollCallsUpserted,
    votesInserted: result.votesInserted,
    billCommitteeRoutingsUpserted: result.billCommitteeRoutingsUpserted,
    billCosponsorsUpserted: result.billCosponsorsUpserted,
    unknownCommitteeCodesLogged: result.unknownCommitteeCodesLogged,
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
            // Build payload — only include sponsor cols when we have a value,
            // so older rows whose detail fetch was skipped don't get null'd out.
            const row: Record<string, unknown> = {
              id: b.id,
              title: b.title,
              introduced_at: b.introduced_at,
              summary: b.summary || existing?.summary || null,
              crs_summary: b.crs_summary || (existing as any)?.crs_summary || null,
              policy_area: b.policy_area || (existing as any)?.policy_area || null,
              source_url: b.source_url,
            };
            if (b.sponsor_bioguide_id != null) row.sponsor_bioguide_id = b.sponsor_bioguide_id;
            if (b.sponsor_name != null) row.sponsor_name = b.sponsor_name;
            if (b.sponsor_party != null) row.sponsor_party = b.sponsor_party;
            if (b.sponsor_state != null) row.sponsor_state = b.sponsor_state;
            if (b.legislative_stage != null) row.legislative_stage = b.legislative_stage;
            return row;
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
 * Upserts roll calls to Supabase.
 *
 * Roll calls are NOT immutable — a row may exist (created during the
 * migration's pre-population step) without question/description, and a
 * later ETL run fills those fields in. So we use ON CONFLICT UPDATE.
 *
 * Data preservation rules:
 *   - The payload only includes columns whose new value is non-null.
 *     Postgres' UPDATE ... SET col = EXCLUDED.col only fires for keys present
 *     in the INSERT row, so omitting null keys leaves the existing column
 *     untouched. This prevents a transient empty Congress.gov response from
 *     wiping a previously-populated question or bill_id.
 *   - Rows where every enrichable column is null become a no-op (the
 *     pre-existing row keeps its data; the new id-only row is harmless).
 */
async function upsertRollCalls(
  supabase: SupabaseClient,
  rollCalls: RollCall[]
): Promise<LoadOperationResult> {
  const result: LoadOperationResult = { count: 0, errors: [] };

  if (rollCalls.length === 0) {
    return result;
  }

  const batches = chunk(rollCalls, 100);

  for (const batch of batches) {
    try {
      // Build each upsert payload with only the columns we have data for.
      // Omitted keys preserve the existing value on conflict.
      const payloads = batch.map((r) => {
        const row: Record<string, unknown> = {
          id: r.id,
          updated_at: new Date().toISOString(),
        };
        if (r.bill_id != null) row.bill_id = r.bill_id;
        if (r.question != null) row.question = r.question;
        if (r.description != null) row.description = r.description;
        return row;
      });

      const { data, error } = await supabase
        .from('roll_calls')
        .upsert(payloads, {
          onConflict: 'id',
          ignoreDuplicates: false, // Update question/description if they arrive
        })
        .select();

      if (error) {
        if (error.code === '23503') {
          result.errors.push(`Roll calls FK error: ${error.message}`);
          logger.error('Roll calls foreign key error', error);
        } else {
          result.errors.push(`Roll calls upsert error: ${error.message}`);
          logger.error('Roll calls upsert error', error);
        }
      } else {
        result.count += data?.length || batch.length;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Roll calls batch error: ${message}`);
      logger.error('Roll calls batch error', error);
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

/**
 * Upserts bill_committee_routings to Supabase.
 *
 * Primary key is (bill_id, committee_code, COALESCE(subcommittee_code, '')).
 * Caller is responsible for ensuring bills are loaded FIRST (FK constraint).
 */
async function upsertBillCommitteeRoutings(
  supabase: SupabaseClient,
  routings: BillCommitteeRouting[]
): Promise<LoadOperationResult> {
  const result: LoadOperationResult = { count: 0, errors: [] };
  if (routings.length === 0) return result;

  const batches = chunk(routings, 100);
  for (const batch of batches) {
    try {
      const { data, error } = await supabase
        .from('bill_committee_routings')
        .upsert(
          batch.map((r) => ({
            bill_id: r.bill_id,
            committee_code: r.committee_code,
            committee_name: r.committee_name,
            subcommittee_code: r.subcommittee_code,
            subcommittee_name: r.subcommittee_name,
            chamber: r.chamber,
            referred_at: r.referred_at,
            activity_type: r.activity_type,
            updated_at: new Date().toISOString(),
          })),
          {
            // PK is composite (bill_id, committee_code, COALESCE(subcommittee_code, '')).
            // Supabase upsert only accepts a comma-separated column list for
            // onConflict; the COALESCE expression in the migration handles the null
            // case at the DB level. We pass the three columns directly.
            onConflict: 'bill_id,committee_code,subcommittee_code',
            ignoreDuplicates: false,
          }
        )
        .select();

      if (error) {
        if (error.code === '23503') {
          result.errors.push(`Routings FK error (bills not loaded first?): ${error.message}`);
          logger.error('Routings FK error', error);
        } else {
          result.errors.push(`Routings upsert error: ${error.message}`);
          logger.error('Routings upsert error', error);
        }
      } else {
        result.count += data?.length || batch.length;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Routings batch error: ${message}`);
      logger.error('Routings batch error', error);
    }
  }
  return result;
}

/**
 * Upserts bill_cosponsors to Supabase.
 *
 * Primary key is (bill_id, bioguide_id). Caller ensures bills loaded first.
 */
async function upsertBillCosponsors(
  supabase: SupabaseClient,
  cosponsors: BillCosponsor[]
): Promise<LoadOperationResult> {
  const result: LoadOperationResult = { count: 0, errors: [] };
  if (cosponsors.length === 0) return result;

  const batches = chunk(cosponsors, 100);
  for (const batch of batches) {
    try {
      const { data, error } = await supabase
        .from('bill_cosponsors')
        .upsert(
          batch.map((c) => ({
            bill_id: c.bill_id,
            bioguide_id: c.bioguide_id,
            cosponsored_at: c.cosponsored_at,
            withdrawn_at: c.withdrawn_at,
          })),
          {
            onConflict: 'bill_id,bioguide_id',
            ignoreDuplicates: false,
          }
        )
        .select();

      if (error) {
        if (error.code === '23503') {
          result.errors.push(`Cosponsors FK error (bills not loaded first?): ${error.message}`);
          logger.error('Cosponsors FK error', error);
        } else {
          result.errors.push(`Cosponsors upsert error: ${error.message}`);
          logger.error('Cosponsors upsert error', error);
        }
      } else {
        result.count += data?.length || batch.length;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      result.errors.push(`Cosponsors batch error: ${message}`);
      logger.error('Cosponsors batch error', error);
    }
  }
  return result;
}

/**
 * Logs committee codes that aren't in our static glossary to
 * unknown_committee_codes. Increments occurrence_count on conflict.
 *
 * Quarterly review picks up the top entries to add to committees.ts.
 */
async function upsertUnknownCommitteeCodes(
  supabase: SupabaseClient,
  codes: Array<{ committee_code: string; subcommittee_code: string | null }>
): Promise<LoadOperationResult> {
  const result: LoadOperationResult = { count: 0, errors: [] };
  if (codes.length === 0) return result;

  const now = new Date().toISOString();
  // Try insert; on conflict bump last_seen_at + occurrence_count.
  // Supabase JS doesn't have native "increment" via upsert payload, so we use
  // an RPC-free approach: fetch existing, then insert OR update individually.
  // At realistic volumes (a handful of unknowns per day) this is fine.
  for (const code of codes) {
    try {
      const subKey = code.subcommittee_code ?? '';
      const { data: existing } = await supabase
        .from('unknown_committee_codes')
        .select('occurrence_count')
        .eq('committee_code', code.committee_code)
        .filter('subcommittee_code', code.subcommittee_code == null ? 'is' : 'eq', code.subcommittee_code ?? null)
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from('unknown_committee_codes')
          .update({
            last_seen_at: now,
            occurrence_count: ((existing as any).occurrence_count || 0) + 1,
          })
          .eq('committee_code', code.committee_code)
          .filter('subcommittee_code', code.subcommittee_code == null ? 'is' : 'eq', code.subcommittee_code ?? null);
        if (error) {
          result.errors.push(`Unknown committee code update error (${code.committee_code}/${subKey}): ${error.message}`);
        } else {
          result.count++;
        }
      } else {
        const { error } = await supabase
          .from('unknown_committee_codes')
          .insert({
            committee_code: code.committee_code,
            subcommittee_code: code.subcommittee_code,
            first_seen_at: now,
            last_seen_at: now,
            occurrence_count: 1,
          });
        if (error) {
          result.errors.push(`Unknown committee code insert error (${code.committee_code}/${subKey}): ${error.message}`);
        } else {
          result.count++;
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      result.errors.push(`Unknown committee codes batch error: ${message}`);
      logger.error('Unknown committee codes batch error', err);
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

  const tables = ['politicians', 'bills', 'roll_calls', 'votes'];

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
