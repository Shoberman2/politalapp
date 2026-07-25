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
