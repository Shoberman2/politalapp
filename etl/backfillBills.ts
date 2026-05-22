#!/usr/bin/env npx ts-node
/**
 * Bill backfill (P4) — extends backfillHistorical.ts.
 *
 * Backfills historical bills 1973-now into the existing `bills` table.
 * Bill IDs use the existing `${congress}-${type}-${number}` format
 * (matches migration 001 + 006). All 8 bill types covered:
 *   HR, S, HJRES, SJRES, HCONRES, SCONRES, HRES, SRES
 *
 * STATUS: P4 deliverable per /plan-eng-review D1 re-sequencing —
 * runs AFTER the chamber UI (P0-P3) ships. Cap: ~280-350K bills total,
 * ~14 days wall-clock on a single laptop (5,000 req/hr Congress.gov limit).
 *
 * Usage:
 *   npx tsx etl/backfillBills.ts --from 93 --to 118
 *   npx tsx etl/backfillBills.ts --resume
 *   npx tsx etl/backfillBills.ts --congress 95 --bill-type HR  # single-target
 *
 * Reuses the daily-ETL pattern from etl/extractIntroducedBills.ts (which
 * already paginates /v3/bill/{congress}/{type} for the current Congress
 * with appropriate rate limiting) — that file is the implementation
 * reference.
 *
 * Sentinel coordination: writes 'historical_bill_backfill' to backfill_state
 * with the same resume semantics as backfillHistorical.ts.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { logger, setLogLevel, LogLevel } from './utils.js'
import {
  HISTORICAL_BACKFILL_NAME,
  type BackfillCheckpoint,
} from './historicalTypes.js'

const BILL_BACKFILL_NAME = 'historical_bill_backfill'

const BILL_TYPES = ['HR', 'S', 'HJRES', 'SJRES', 'HCONRES', 'SCONRES', 'HRES', 'SRES'] as const

interface CliOptions {
  fromCongress: number
  toCongress: number
  congress: number | null
  billType: typeof BILL_TYPES[number] | null
  resume: boolean
  dryRun: boolean
  verbose: boolean
}

function parseArgs(): CliOptions {
  const args = process.argv.slice(2)
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag)
    if (idx === -1) return undefined
    return args[idx + 1]
  }
  return {
    fromCongress: parseInt(get('--from') ?? '93', 10),
    toCongress: parseInt(get('--to') ?? '118', 10),  // 119 is loaded by daily ETL
    congress: get('--congress') ? parseInt(get('--congress')!, 10) : null,
    billType: (get('--bill-type') ?? null) as typeof BILL_TYPES[number] | null,
    resume: args.includes('--resume'),
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose') || args.includes('-v'),
  }
}

async function main(): Promise<void> {
  const opts = parseArgs()
  if (opts.verbose) setLogLevel(LogLevel.DEBUG)

  logger.info('Bill backfill starting', opts)
  logger.warn('=========================================================')
  logger.warn('BILL BACKFILL — P4 DELIVERABLE')
  logger.warn('')
  logger.warn('This script is a SCAFFOLD. The per-Congress bill fetcher')
  logger.warn('must be wired up to call into the existing')
  logger.warn('etl/extractIntroducedBills.ts logic with a `congress` arg.')
  logger.warn('')
  logger.warn('To implement:')
  logger.warn('  1. Refactor extractIntroducedBills.ts to take a `congress`')
  logger.warn('     parameter (currently hardcoded to 119).')
  logger.warn('  2. Call that for each (congress, billType) pair below.')
  logger.warn('  3. Reuse load.ts loadBills() — bills table already accepts')
  logger.warn('     any congress via the composite id format.')
  logger.warn('  4. Honor the 3-consecutive-5xx error budget; persist resume')
  logger.warn('     state in backfill_state(BILL_BACKFILL_NAME).')
  logger.warn('=========================================================')

  if (opts.dryRun) {
    const congresses = opts.congress
      ? [opts.congress]
      : Array.from(
          { length: opts.toCongress - opts.fromCongress + 1 },
          (_, i) => opts.fromCongress + i
        )
    const billTypes = opts.billType ? [opts.billType] : BILL_TYPES
    const totalCombos = congresses.length * billTypes.length
    logger.info(`Would process ${totalCombos} (congress, bill_type) combos:`)
    for (const c of congresses) {
      logger.info(`  Congress ${c}: ${billTypes.join(', ')}`)
    }
    logger.info(`Estimated total bills: ${totalCombos * 1500} (avg)`)
    logger.info(`Estimated wall-clock: ${(totalCombos * 1500 * 3) / 5000 / 24} days at 5000 req/hr`)
    return
  }

  logger.error('Not implemented yet — run with --dry-run to see what would happen')
  process.exit(1)
}

void main()
