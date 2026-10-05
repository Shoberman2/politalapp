import { describe, it, expect } from 'vitest'
import { parseRepairArgs, planFix, repairTable, formatReport, main, URL_TABLES, DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE } from '../../etl/repairVoteSourceUrls'

type Row = { id: number; roll_call_id: string | null; source_url: string | null }

// In-memory stand-in for the Supabase query builder: supports the select scan
// (order/limit/gt) and the guarded update (in/neq/select) the script uses.
function mockClient(rows: Row[], opts: { failUpdateOnCall?: number } = {}) {
  const calls = { selects: 0, updates: [] as Array<{ url: string; ids: number[] }> }
  let updateCalls = 0
  const client = {
    from(table: string) {
      expect(table).toBe('votes')
      return {
        select() {
          calls.selects += 1
          let after: number | null = null
          let limit = Infinity
          const q: any = {
            order: () => q,
            limit: (n: number) => { limit = n; return q },
            gt: (_c: string, v: number) => { after = v; return q },
            then: (resolve: (v: unknown) => void) => {
              const data = rows.filter((r) => after == null || r.id > after).sort((a, b) => a.id - b.id).slice(0, limit).map((r) => ({ ...r }))
              resolve({ data, error: null })
            },
          }
          return q
        },
        update(patch: { source_url: string }) {
          let ids: number[] = []
          let neq: string | null = null
          const q: any = {
            in: (_c: string, v: number[]) => { ids = v; return q },
            neq: (_c: string, v: string) => { neq = v; return q },
            select: () => q,
            then: (resolve: (v: unknown) => void) => {
              updateCalls += 1
              if (opts.failUpdateOnCall === updateCalls) return resolve({ data: null, error: { message: 'boom' } })
              const hit = rows.filter((r) => ids.includes(r.id) && r.source_url !== neq)
              for (const r of hit) r.source_url = patch.source_url
              calls.updates.push({ url: patch.source_url, ids: hit.map((r) => r.id) })
              resolve({ data: hit.map((r) => ({ id: r.id })), error: null })
            },
          }
          return q
        },
      }
    },
  }
  return { client, calls }
}

const WRONG_2025 = (roll: number) => ({ roll_call_id: `house-119-1-${roll}`, source_url: `https://clerk.house.gov/Votes/2026${roll}` })
const RIGHT_2026 = (roll: number) => ({ roll_call_id: `house-119-2-${roll}`, source_url: `https://clerk.house.gov/Votes/2026${roll}` })
const SENATE_OK = { roll_call_id: 'senate-119-1-7', source_url: 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00007.htm' }

function fixture(): Row[] {
  return [
    { id: 1, ...WRONG_2025(123) },
    { id: 2, ...WRONG_2025(123) },
    { id: 3, ...RIGHT_2026(10) },
    { id: 4, ...SENATE_OK },
    { id: 5, roll_call_id: null, source_url: 'https://x.gov' },
    { id: 6, roll_call_id: 'house-118-1-4', source_url: 'https://clerk.house.gov/Votes/20264' },
    { id: 7, ...WRONG_2025(5) },
    { id: 8, roll_call_id: 'senate-119-2-12', source_url: 'https://www.senate.gov/bad' },
  ]
}

describe('parseRepairArgs', () => {
  it('defaults to a dry run', () => {
    expect(parseRepairArgs([])).toEqual({ apply: false, batchSize: DEFAULT_BATCH_SIZE, after: null })
    expect(parseRepairArgs(['--dry-run']).apply).toBe(false)
    expect(parseRepairArgs(['--apply', '--dry-run']).apply).toBe(false)
  })
  it('parses --apply, --batch-size (capped) and --after', () => {
    expect(parseRepairArgs(['--apply', '--batch-size', '50', '--after', '900'])).toEqual({ apply: true, batchSize: 50, after: 900 })
    expect(parseRepairArgs(['--batch-size', '99999']).batchSize).toBe(MAX_BATCH_SIZE)
    expect(parseRepairArgs(['--batch-size', 'abc']).batchSize).toBe(DEFAULT_BATCH_SIZE)
    expect(parseRepairArgs(['--after']).after).toBeNull()
  })
})

describe('planFix', () => {
  it('fixes a wrong-year House URL and leaves correct or unparseable rows alone', () => {
    expect(planFix({ id: 1, ...WRONG_2025(123) })).toMatchObject({ after: 'https://clerk.house.gov/Votes/2025123', year: 2025, chamber: 'house' })
    expect(planFix({ id: 3, ...RIGHT_2026(10) })).toBeNull()
    expect(planFix({ id: 4, ...SENATE_OK })).toBeNull()
    expect(planFix({ id: 5, roll_call_id: null, source_url: 'x' })).toBeNull()
    expect(planFix({ id: 9, roll_call_id: 'house-119-3-1', source_url: 'x' })).toBeNull()
  })
})

describe('repairTable', () => {
  const spec = URL_TABLES[0]

  it('dry run reports counts, per-year and per-chamber, and samples without writing', async () => {
    const rows = fixture()
    const before = JSON.stringify(rows)
    const { client, calls } = mockClient(rows)
    const r = await repairTable(client, spec, { apply: false, batchSize: 2, after: null, pageSize: 3 }, () => {})
    expect(calls.updates).toHaveLength(0)
    expect(JSON.stringify(rows)).toBe(before)
    expect(r).toMatchObject({ scanned: 8, correct: 2, underivable: 1, mismatched: 5, updated: 0, lastId: 8 })
    expect(r.byYear).toEqual({ '2023': 1, '2025': 3, '2026': 1 })
    expect(r.byChamber).toEqual({ house: 4, senate: 1 })
    expect(r.samples).toHaveLength(5)
    expect(r.samples[0]).toEqual({ id: 1, roll_call_id: 'house-119-1-123', before: 'https://clerk.house.gov/Votes/2026123', after: 'https://clerk.house.gov/Votes/2025123' })
    const text = formatReport(r, false)
    expect(text).toContain('5 wrong')
    expect(text).toContain('wrong by session year: 2023 1, 2025 3, 2026 1')
    expect(text).toContain('house-119-1-123 (id 1): https://clerk.house.gov/Votes/2026123 -> https://clerk.house.gov/Votes/2025123')
  })

  it('apply fixes only wrong rows, in small batches, and a re-run is a no-op', async () => {
    const rows = fixture()
    const { client, calls } = mockClient(rows)
    const r = await repairTable(client, spec, { apply: true, batchSize: 1, after: null, pageSize: 3 }, () => {})
    expect(r.updated).toBe(5)
    expect(calls.updates.every((u) => u.ids.length <= 1)).toBe(true)
    const byId = new Map(rows.map((x) => [x.id, x.source_url]))
    expect(byId.get(1)).toBe('https://clerk.house.gov/Votes/2025123')
    expect(byId.get(2)).toBe('https://clerk.house.gov/Votes/2025123')
    expect(byId.get(6)).toBe('https://clerk.house.gov/Votes/20234')
    expect(byId.get(7)).toBe('https://clerk.house.gov/Votes/20255')
    expect(byId.get(8)).toBe('https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00012.htm')
    // Untouched: already correct and unparseable rows.
    expect(byId.get(3)).toBe('https://clerk.house.gov/Votes/202610')
    expect(byId.get(5)).toBe('https://x.gov')
    const touched = calls.updates.flatMap((u) => u.ids)
    expect(touched).not.toContain(3)
    expect(touched).not.toContain(4)
    expect(touched).not.toContain(5)

    const again = mockClient(rows)
    const r2 = await repairTable(again.client, spec, { apply: true, batchSize: 200, after: null }, () => {})
    expect(r2).toMatchObject({ mismatched: 0, updated: 0 })
    expect(again.calls.updates).toHaveLength(0)
  })

  it('resumes after a given id and names the resume point when an update fails', async () => {
    const { client } = mockClient(fixture())
    const r = await repairTable(client, spec, { apply: false, batchSize: 200, after: 5, pageSize: 2 }, () => {})
    expect(r).toMatchObject({ scanned: 3, mismatched: 3 })

    const failing = mockClient(fixture(), { failUpdateOnCall: 2 })
    await expect(repairTable(failing.client, spec, { apply: true, batchSize: 1, after: null, pageSize: 3 }, () => {}))
      .rejects.toThrow(/resume with --after 0/)
  })
})

describe('main', () => {
  it('runs a dry run against an injected client', async () => {
    const { client, calls } = mockClient(fixture())
    const reports = await main([], client)
    expect(reports).toHaveLength(1)
    expect(reports[0].mismatched).toBe(5)
    expect(calls.updates).toHaveLength(0)
  })
})
