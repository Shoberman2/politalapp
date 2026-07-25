import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// REGRESSION: three ETL aggregation loops paged with .range(offset, offset+N)
// and no .order(). Postgres guarantees no stable row order without an ORDER BY,
// so offset paging over 200k+ rows can repeat some rows and skip others. A
// skipped roll call simply never gets a roll_call_stats row, and nothing errors
// — the aggregate just comes out quietly incomplete.
// Found alongside the stale-stats investigation, 2026-07-25.

const FILES = [
  { path: '../../etl/computeStats.ts', table: 'votes' },
  { path: '../../etl/computeCommitteeSurvival.ts', table: 'bill_committee_routings' },
  { path: '../../etl/preWarmBillExplanations.ts', table: 'bill_explanations' },
]

/**
 * Returns the source slice for each `.range(` call site, walking backwards to
 * the `.from(` that opened the query chain.
 */
function rangeChains(source: string): string[] {
  const chains: string[] = []
  let idx = source.indexOf('.range(')
  while (idx !== -1) {
    const fromAt = source.lastIndexOf('.from(', idx)
    if (fromAt !== -1) chains.push(source.slice(fromAt, idx))
    idx = source.indexOf('.range(', idx + 1)
  }
  return chains
}

describe('ETL offset pagination is ordered', () => {
  for (const { path, table } of FILES) {
    it(`orders every paged read in ${path.split('/').pop()} (${table})`, () => {
      const source = readFileSync(resolve(__dirname, path), 'utf8')
      const chains = rangeChains(source)

      expect(chains.length).toBeGreaterThan(0)
      for (const chain of chains) {
        expect(chain).toContain('.order(')
      }
    })
  }
})
