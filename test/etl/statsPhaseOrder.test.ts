import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// REGRESSION: the daily pipeline ran COMPUTE STATS *after* PRE-WARM. Pre-warm
// is the only open-ended phase (its own 20-minute budget) and everything before
// it takes ~25 minutes, which exactly matched the workflow's 45-minute
// timeout-minutes ceiling. Any slightly slow day was killed mid-pre-warm, so
// computeMemberStats never ran and roll_call_stats froze at the last lucky run
// — leaving every fresh roll call tally-less on the site.
// Found by tracing stale roll_call_stats, 2026-07-25.

const runSource = readFileSync(resolve(__dirname, '../../etl/run.ts'), 'utf8')
const workflow = readFileSync(
  resolve(__dirname, '../../.github/workflows/etl-daily.yml'),
  'utf8'
)
const backfill = readFileSync(
  resolve(__dirname, '../../.github/workflows/etl-procedural-backfill.yml'),
  'utf8'
)

describe('daily ETL phase order', () => {
  it('runs COMPUTE STATS before the open-ended PRE-WARM phase', () => {
    const statsAt = runSource.indexOf("'=== COMPUTE STATS PHASE ==='")
    const prewarmAt = runSource.indexOf("'=== PRE-WARM PHASE ==='")

    expect(statsAt).toBeGreaterThan(-1)
    expect(prewarmAt).toBeGreaterThan(-1)
    // Stats close out the data the run just loaded; pre-warm is optional AI
    // cache-filling and must not be able to consume the budget it depends on.
    expect(statsAt).toBeLessThan(prewarmAt)
  })

  it('gives the job more wall-clock than the phases it has to fit', () => {
    const timeout = Number(/timeout-minutes:\s*(\d+)/.exec(workflow)?.[1])
    expect(Number.isFinite(timeout)).toBe(true)
    // ~25m of pipeline + pre-warm's 20m budget = ~45m of real work. At exactly
    // 45 there was zero slack and roughly every other run was cancelled.
    expect(timeout).toBeGreaterThan(45)
  })
})

describe('procedural vote backfill workflow', () => {
  // Same disease as the daily job: a 365-day window measured 1h27m against a
  // 90m cap, and 2026-07-05 was cancelled outright at 1h30m.
  it('does not spend its budget warming bill explanations', () => {
    // Assert against the actual invocation, not a passing mention in a
    // comment — the flags only count if they reach the command.
    const invocation = /^\s*npm run etl --.*$/m.exec(backfill)?.[0] || ''
    expect(invocation).toContain('--skip-prewarm')
    expect(invocation).toContain('--skip-enrich')
  })

  it('reaches back far enough to cover the whole current Congress', () => {
    const dflt = Number(/days_back:[\s\S]*?default:\s*'(\d+)'/.exec(backfill)?.[1])
    // The 119th opened 2025-01-03. A 365-day window silently misses its first
    // session, which is why 171 House roll calls had no member votes at all.
    expect(dflt).toBeGreaterThanOrEqual(568)
  })

  it('has a ceiling it does not sit on', () => {
    const timeout = Number(/timeout-minutes:\s*(\d+)/.exec(backfill)?.[1])
    // A 600-day window extracts proportionally more than the 1h27m the
    // 365-day one took, so 90 would be under water, not merely tight.
    expect(timeout).toBeGreaterThanOrEqual(150)
  })
})
