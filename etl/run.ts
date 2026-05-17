#!/usr/bin/env npx ts-node
/**
 * ETL Pipeline Runner
 *
 * Main entry point for the vote tracking ETL pipeline.
 * Orchestrates the Extract → Transform → Load → Enrich workflow.
 *
 * Usage:
 *   npx ts-node etl/run.ts                    # Run full pipeline
 *   npx ts-node etl/run.ts --dry-run          # Preview without writing to DB
 *   npx ts-node etl/run.ts --enrich-only      # Only run AI enrichment
 *   npx ts-node etl/run.ts --days 30          # Fetch last 30 days of votes
 *
 * Environment Variables:
 *   CONGRESS_API_KEY         - Required: Congress.gov API key
 *   SUPABASE_URL             - Required: Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY - Required: Supabase service role key
 *   OPENAI_API_KEY           - Optional: For AI bill summaries (or ANTHROPIC_API_KEY)
 *   ETL_DAYS_BACK            - Optional: Days of history to fetch (default: 7)
 *   ETL_MAX_VOTES            - Optional: Max votes per run (default: 100)
 *   ETL_DRY_RUN              - Optional: Set to 'true' for dry run mode
 */

import type { ETLRunResult, ETLConfig } from './types.js';
import { extractRecentVotes } from './extractHouseVotes.js';
import { extractIntroducedBills } from './extractIntroducedBills.js';
import { transformVoteData, validateTransformedData, getTransformStats } from './transform.js';
import { loadToSupabase, checkTablesExist, getExistingCounts } from './load.js';
import { enrichBillsWithSummaries } from './enrichBillsWithAI.js';
import { preWarmBillExplanations } from './preWarmBillExplanations.js';
import { computeMemberStats } from './computeStats.js';
import { fetchCRSSummaries } from './fetchCRS.js';
import { loadConfig, logger, setLogLevel, LogLevel } from './utils.js';

// =============================================================================
// CLI ARGUMENT PARSING
// =============================================================================

interface CLIOptions {
  dryRun: boolean;
  enrichOnly: boolean;
  backfillExplanations: boolean;
  skipEnrich: boolean;
  skipPrewarm: boolean;
  days: number;
  verbose: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);

  const options: CLIOptions = {
    dryRun: args.includes('--dry-run'),
    enrichOnly: args.includes('--enrich-only'),
    backfillExplanations: args.includes('--backfill-explanations'),
    skipEnrich: args.includes('--skip-enrich'),
    skipPrewarm: args.includes('--skip-prewarm'),
    days: 7,
    verbose: args.includes('--verbose') || args.includes('-v'),
  };

  // Parse --days argument
  const daysIndex = args.indexOf('--days');
  if (daysIndex !== -1 && args[daysIndex + 1]) {
    const days = parseInt(args[daysIndex + 1], 10);
    if (!isNaN(days) && days > 0) {
      options.days = days;
    }
  }

  return options;
}

// =============================================================================
// MAIN ETL PIPELINE
// =============================================================================

async function runETLPipeline(options: CLIOptions): Promise<ETLRunResult> {
  const startTime = new Date();
  const result: ETLRunResult = {
    success: false,
    extractedVotes: 0,
    transformedRecords: { politicians: 0, bills: 0, votes: 0 },
    errors: [],
    startTime,
    endTime: startTime,
  };

  try {
    // Load configuration
    logger.info('Loading configuration...');
    const config = loadConfig();

    // Apply CLI overrides
    config.dryRun = options.dryRun || config.dryRun;
    config.daysBack = options.days;

    logger.info('Configuration loaded', {
      supabaseUrl: config.supabaseUrl.replace(/https:\/\/([^.]+).*/, 'https://$1...'),
      daysBack: config.daysBack,
      maxVotesPerRun: config.maxVotesPerRun,
      dryRun: config.dryRun,
    });

    // Check database connectivity
    logger.info('Checking database connectivity...');
    const tablesExist = await checkTablesExist(config);
    if (!tablesExist) {
      throw new Error('Required database tables do not exist');
    }

    // Log existing counts
    const existingCounts = await getExistingCounts(config);
    logger.info('Existing records in database', existingCounts);

    // Run enrichment only if requested
    if (options.enrichOnly) {
      logger.info('Running AI enrichment only...');
      const enrichResult = await enrichBillsWithSummaries(config);
      logger.info('Enrichment complete', enrichResult);
      result.success = enrichResult.errors.length === 0;
      result.errors = enrichResult.errors;
      result.endTime = new Date();
      return result;
    }

    // Run long-form explanation backfill only (skips extract/transform/load).
    // Used by the etl-backfill-explanations.yml workflow to drain the
    // bill_explanations backlog in a single 6-hour run.
    if (options.backfillExplanations) {
      logger.info('Running explanation backfill only (skipping all other phases)...');
      // Let ETL_PREWARM_MAX override (workflow_dispatch input). Default 100k
      // means "everything" in practice — we'd never actually have that many
      // bills in the 100-day window.
      const envCap = parseInt(process.env.ETL_PREWARM_MAX || '', 10);
      const cap = Number.isFinite(envCap) && envCap > 0 ? envCap : 100_000;
      const prewarmResult = await preWarmBillExplanations(config, cap);
      logger.info('Backfill complete', prewarmResult);
      result.success = prewarmResult.errors.length < Math.max(prewarmResult.scanned, 1);
      result.errors = prewarmResult.errors.slice(0, 20);
      result.endTime = new Date();
      return result;
    }

    // ===========================================
    // EXTRACT PHASE
    // ===========================================
    logger.info('=== EXTRACT PHASE ===');
    const extractedData = await extractRecentVotes(config);
    result.extractedVotes = extractedData.length;

    if (extractedData.length === 0) {
      logger.warn('No vote events in window — continuing with introduced-bills phase');
    } else {
      logger.info(`Extracted ${extractedData.length} vote events`);
    }

    // ===========================================
    // TRANSFORM PHASE
    // ===========================================
    logger.info('=== TRANSFORM PHASE ===');
    const transformedData = transformVoteData(extractedData, config);

    // ===========================================
    // INTRODUCED BILLS PHASE
    // ===========================================
    // Runs every ETL execution — see extractIntroducedBills.ts. Bills are
    // merged into transformedData.bills so they flow through the same
    // validate/load/enrich/prewarm pipeline as vote-derived bills. A failure
    // here must not break the vote pipeline, so it's fully isolated.
    logger.info('=== INTRODUCED BILLS PHASE ===');
    try {
      const intro = await extractIntroducedBills(config);
      for (const bill of intro.bills) {
        const existing = transformedData.bills.get(bill.id);
        if (existing) {
          // Vote-derived bill already present; merge sponsor + stage onto it.
          transformedData.bills.set(bill.id, {
            ...existing,
            title: existing.title || bill.title,
            introduced_at: existing.introduced_at || bill.introduced_at,
            policy_area: existing.policy_area || bill.policy_area,
            sponsor_bioguide_id: bill.sponsor_bioguide_id ?? existing.sponsor_bioguide_id ?? null,
            sponsor_name: bill.sponsor_name ?? existing.sponsor_name ?? null,
            sponsor_party: bill.sponsor_party ?? existing.sponsor_party ?? null,
            sponsor_state: bill.sponsor_state ?? existing.sponsor_state ?? null,
            legislative_stage: bill.legislative_stage ?? existing.legislative_stage ?? null,
          });
        } else {
          transformedData.bills.set(bill.id, bill);
        }
      }
      // Attach routings/cosponsors/unknown codes to the transformed payload.
      // load.ts persists them in strict order (after bills upsert) per FK requirement.
      transformedData.billCommitteeRoutings = intro.routings;
      transformedData.billCosponsors = intro.cosponsors;
      transformedData.unknownCommitteeCodes = intro.unknownCommitteeCodes;

      logger.info('Introduced bills merged', intro.stats);
      if (intro.stats.errors.length > 0) {
        result.errors.push(...intro.stats.errors.slice(0, 5));
      }
    } catch (introError) {
      const message = introError instanceof Error ? introError.message : String(introError);
      logger.warn('Introduced-bills phase failed, continuing', message);
      result.errors.push(`Introduced bills: ${message}`);
    }

    result.transformedRecords = {
      politicians: transformedData.politicians.size,
      bills: transformedData.bills.size,
      votes: transformedData.votes.length,
    };

    // Validate transformed data
    const validationErrors = validateTransformedData(transformedData);
    if (validationErrors.length > 0) {
      logger.error('Validation errors found:', validationErrors);
      result.errors.push(...validationErrors);
      // Continue with valid data
    }

    // Log stats
    const stats = getTransformStats(transformedData);
    logger.info('Transform statistics', stats);

    // ===========================================
    // LOAD PHASE
    // ===========================================
    logger.info('=== LOAD PHASE ===');
    const loadResult = await loadToSupabase(transformedData, config);
    result.loadResult = loadResult;
    result.errors.push(...loadResult.errors);

    logger.info('Load complete', {
      politiciansUpserted: loadResult.politiciansUpserted,
      billsUpserted: loadResult.billsUpserted,
      votesInserted: loadResult.votesInserted,
    });

    // ===========================================
    // CRS SUMMARY PHASE
    // ===========================================
    logger.info('=== CRS SUMMARY PHASE ===');
    try {
      const crsResult = await fetchCRSSummaries(config);
      logger.info('CRS summaries complete', crsResult);
      if (crsResult.errors.length > 0) {
        result.errors.push(...crsResult.errors.slice(0, 5));
      }
    } catch (crsError) {
      logger.warn('CRS summary phase failed, continuing', crsError);
    }

    // ===========================================
    // ENRICH PHASE (Optional - AI summaries)
    // ===========================================
    if (!options.skipEnrich) {
      logger.info('=== ENRICH PHASE ===');
      const enrichResult = await enrichBillsWithSummaries(config);
      logger.info('Enrichment complete', enrichResult);

      if (enrichResult.errors.length > 0) {
        result.errors.push(...enrichResult.errors.slice(0, 5));
      }
    } else {
      logger.info('Skipping AI enrichment (--skip-enrich flag)');
    }

    // ===========================================
    // PRE-WARM PHASE (Long-form bill_explanations)
    // ===========================================
    if (!options.skipPrewarm) {
      logger.info('=== PRE-WARM PHASE ===');
      try {
        const prewarmResult = await preWarmBillExplanations(config);
        logger.info('Pre-warm complete', prewarmResult);
        if (prewarmResult.errors.length > 0) {
          result.errors.push(...prewarmResult.errors.slice(0, 5));
        }
      } catch (prewarmError) {
        logger.warn('Pre-warm phase failed, continuing', prewarmError);
      }
    } else {
      logger.info('Skipping explanation pre-warm (--skip-prewarm flag)');
    }

    // ===========================================
    // COMPUTE STATS PHASE
    // ===========================================
    logger.info('=== COMPUTE STATS PHASE ===');
    try {
      const statsResult = await computeMemberStats(config);
      logger.info('Stats computation complete', statsResult);
      if (statsResult.errors.length > 0) {
        result.errors.push(...statsResult.errors.slice(0, 5));
      }
    } catch (statsError) {
      logger.warn('Stats computation failed, continuing', statsError);
    }

    // ===========================================
    // FINAL SUMMARY
    // ===========================================
    result.success = loadResult.errors.length === 0;
    result.endTime = new Date();

    const duration = (result.endTime.getTime() - result.startTime.getTime()) / 1000;
    logger.info('=== ETL PIPELINE COMPLETE ===', {
      success: result.success,
      duration: `${duration.toFixed(2)}s`,
      extractedVotes: result.extractedVotes,
      transformedRecords: result.transformedRecords,
      loadedRecords: {
        politicians: loadResult.politiciansUpserted,
        bills: loadResult.billsUpserted,
        votes: loadResult.votesInserted,
      },
      errorCount: result.errors.length,
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(message);
    result.endTime = new Date();

    logger.error('ETL Pipeline failed', { error: message, stack: (error as Error).stack });

    return result;
  }
}

// =============================================================================
// ENTRY POINT
// =============================================================================

async function main(): Promise<void> {
  const options = parseArgs();

  // Set log level
  if (options.verbose) {
    setLogLevel(LogLevel.DEBUG);
  }

  console.log(`
╔═══════════════════════════════════════════════════════════════╗
║          Political Vote Tracker - ETL Pipeline                ║
╚═══════════════════════════════════════════════════════════════╝
`);

  logger.info('Starting ETL pipeline...', {
    dryRun: options.dryRun,
    enrichOnly: options.enrichOnly,
    skipEnrich: options.skipEnrich,
    skipPrewarm: options.skipPrewarm,
    days: options.days,
    verbose: options.verbose,
  });

  try {
    const result = await runETLPipeline(options);

    if (result.success) {
      console.log('\n✓ ETL pipeline completed successfully');
      process.exit(0);
    } else {
      console.log('\n✗ ETL pipeline completed with errors');
      console.log('Errors:', result.errors.slice(0, 10).join('\n  '));
      process.exit(1);
    }
  } catch (error) {
    console.error('\n✗ ETL pipeline failed:', error);
    process.exit(1);
  }
}

// Run if this is the main module
main().catch((error) => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

export { runETLPipeline };
