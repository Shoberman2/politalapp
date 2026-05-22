#!/usr/bin/env npx ts-node
/**
 * Vote backfill (P5) — extends backfillHistorical.ts.
 *
 * Backfills historical roll-call votes 1989-now into the existing votes +
 * roll_calls tables (Senate.gov XML coverage starts 1989 for the Senate side;
 * House Clerk XML coverage is patchier pre-1990).
 *
 * STATUS: P5 deliverable per /plan-eng-review D1 re-sequencing — runs LAST.
 * After this completes, the historic_moments.votes maps are hydrated from
 * the votes table, unlocking the full chamber moments overlay.
 *
 * Cap: ~38K roll calls × ~535 members each ≈ ~20M vote rows total.
 * Wall-clock: ~1 week on a single laptop.
 *
 * Usage:
 *   npx tsx etl/backfillVotes.ts --from 101 --to 118
 *   npx tsx etl/backfillVotes.ts --resume
 *   npx tsx etl/backfillVotes.ts --congress 107  # just the Iraq War congress
 *
 * Reuses the daily-ETL pattern from etl/extractHouseVotes.ts. That file
 * already handles Senate.gov XML + House Clerk + member identification
 * for the current Congress; it needs to be parameterized to accept a
 * `congress` and `sessionNumber` arg.
 *
 * After vote backfill completes for the moments' Congresses (107, 111, 117),
 * a one-shot ./etl/hydrateMomentVotes.ts script (not yet written) updates
 * historic_moments.votes for each curated moment by joining votes ×
 * roll_call_id matching the moment.
 */

import { logger, setLogLevel, LogLevel } from './utils.js'

const VOTE_BACKFILL_NAME = 'historical_vote_backfill'

interface CliOptions {
  fromCongress: number
  toCongress: number
  congress: number | null
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
    fromCongress: parseInt(get('--from') ?? '101', 10),
    toCongress: parseInt(get('--to') ?? '118', 10),
    congress: get('--congress') ? parseInt(get('--congress')!, 10) : null,
    resume: args.includes('--resume'),
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose') || args.includes('-v'),
  }
}

async function main(): Promise<void> {
  const opts = parseArgs()
  if (opts.verbose) setLogLevel(LogLevel.DEBUG)

  logger.info('Vote backfill starting', opts)
  logger.warn('=========================================================')
  logger.warn('VOTE BACKFILL — P5 DELIVERABLE')
  logger.warn('')
  logger.warn('This script is a SCAFFOLD. To implement:')
  logger.warn('  1. Refactor extractHouseVotes.ts to take (congress, session)')
  logger.warn('     args (currently fetches votes for the current Congress).')
  logger.warn('  2. For each (congress, session), iterate Senate.gov XML')
  logger.warn('     using congress_metadata.senate_xml_url_pattern + House')
  logger.warn('     Clerk XML for House votes.')
  logger.warn('  3. Insert into votes + roll_calls tables (existing schema).')
  logger.warn('  4. Honor backfill_state sentinel and the 3-consecutive-5xx')
  logger.warn('     budget. Pause on halt; resume via --resume.')
  logger.warn('  5. After all curated-moments Congresses (107, 111, 117)')
  logger.warn('     complete, run a one-shot script that UPDATEs')
  logger.warn('     historic_moments.votes for each moment from the votes table.')
  logger.warn('=========================================================')

  if (opts.dryRun) {
    const congresses = opts.congress
      ? [opts.congress]
      : Array.from(
          { length: opts.toCongress - opts.fromCongress + 1 },
          (_, i) => opts.fromCongress + i
        )
    logger.info(`Would process ${congresses.length} Congresses: ${congresses.join(', ')}`)
    logger.info('Estimated roll calls: ~1500 per Congress (Senate ~600, House ~900)')
    logger.info(`Estimated total vote rows: ${congresses.length * 1500 * 535}`)
    logger.info(`Estimated wall-clock: ${(congresses.length * 1500 * 2) / 5000} hours at 5000 req/hr`)
    return
  }

  logger.error('Not implemented yet — run with --dry-run to see what would happen')
  process.exit(1)
}

void main()
