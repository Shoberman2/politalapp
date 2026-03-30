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
import { transformVoteData, validateTransformedData, getTransformStats } from './transform.js';
import { loadToSupabase, checkTablesExist, getExistingCounts } from './load.js';
import { enrichBillsWithSummaries } from './enrichBillsWithAI.js';
import { computeMemberStats } from './computeStats.js';
import { fetchCRSSummaries } from './fetchCRS.js';
import { loadConfig, logger, setLogLevel, LogLevel } from './utils.js';

// =============================================================================
// CLI ARGUMENT PARSING
// =============================================================================

interface CLIOptions {
  dryRun: boolean;
  enrichOnly: boolean;
  skipEnrich: boolean;
  days: number;
  verbose: boolean;
}

function parseArgs(): CLIOptions {
  const args = process.argv.slice(2);

  const options: CLIOptions = {
    dryRun: args.includes('--dry-run'),
    enrichOnly: args.includes('--enrich-only'),
    skipEnrich: args.includes('--skip-enrich'),
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

    // ===========================================
    // EXTRACT PHASE
    // ===========================================
    logger.info('=== EXTRACT PHASE ===');
    const extractedData = await extractRecentVotes(config);
    result.extractedVotes = extractedData.length;

    if (extractedData.length === 0) {
      logger.warn('No votes extracted, ending pipeline');
      result.success = true;
      result.endTime = new Date();
      return result;
    }

    logger.info(`Extracted ${extractedData.length} vote events`);

    // ===========================================
    // TRANSFORM PHASE
    // ===========================================
    logger.info('=== TRANSFORM PHASE ===');
    const transformedData = transformVoteData(extractedData, config);

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
