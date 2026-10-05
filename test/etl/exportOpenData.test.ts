// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  exportOpenData,
  paginate,
  csvEscape,
  csvLine,
  rollCallRow,
  officialRollCallUrl,
  billRow,
  pruneSnapshots,
  uploadSnapshot,
  ensurePublicBucket,
  contentTypeFor,
} from '../../etl/exportOpenData'
import { OPEN_DATA_TABLES, openDataFiles } from '../../shared/openData.js'

// ---------------------------------------------------------------------------
// A tiny in-memory PostgREST stand-in: select/order/range/limit/gt/eq/
// maybeSingle, with a server-side max-rows cap like Supabase's.
// ---------------------------------------------------------------------------
type Row = Record<string, any>

function mockClient(tables: Record<string, Row[]>, { maxRows = 1000, missing = [] as string[] } = {}) {
  const calls: { table: string; from?: number; gt?: unknown }[] = []
  function query(table: string) {
    const st: any = { orders: [] as string[], from: 0, to: Infinity, limit: Infinity, gt: null, eq: null }
    const run = () => {
      if (missing.includes(table)) return { data: null, error: { code: 'PGRST205', message: `Could not find the table 'public.${table}'` } }
      let rows = [...(tables[table] || [])]
      if (st.eq) rows = rows.filter((r) => r[st.eq[0]] === st.eq[1])
      if (st.gt) rows = rows.filter((r) => r[st.gt[0]] > st.gt[1])
      if (st.orders.length) rows.sort((a, b) => { for (const k of st.orders) { if (a[k] < b[k]) return -1; if (a[k] > b[k]) return 1 } return 0 })
      const end = Math.min(st.to + 1, st.from + st.limit, st.from + maxRows)
      calls.push({ table, from: st.from, gt: st.gt?.[1] })
      return { data: rows.slice(st.from, end), error: null }
    }
    const q: any = {
      select() { return q },
      order(col: string) { st.orders.push(col); return q },
      range(a: number, b: number) { st.from = a; st.to = b; return q },
      limit(n: number) { st.limit = n; return q },
      gt(col: string, v: unknown) { st.gt = [col, v]; return q },
      eq(col: string, v: unknown) { st.eq = [col, v]; return q },
      maybeSingle() { const r = run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }) },
      then(res: any, rej: any) { return Promise.resolve(run()).then(res, rej) },
    }
    return q
  }
  return { from: (t: string) => query(t), calls }
}

const T = {
  politicians: [
    { id: 'A000001', name: 'Ann Able', chamber: 'house', state: 'CA', district: '12', party: 'Democrat', photo_url: null },
    { id: 'B000002', name: 'Bob "Bo" Baker, Jr.', chamber: 'senate', state: 'TX', district: null, party: 'Republican', photo_url: 'https://x/p.jpg' },
    { id: 'C000003', name: 'Cy Cole', chamber: 'house', state: 'NY', district: '3', party: 'Republican', photo_url: null },
  ],
  member_congress_terms: [
    { bioguide_id: 'A000001', congress: 118, term_start: '2023-01-03', term_end: '2025-01-03', chamber: 'house', state: 'CA', district: '12', party: 'Democrat', caucus: null, reason_for_end: null, source: 'congress_gov' },
    { bioguide_id: 'A000001', congress: 119, term_start: '2025-01-03', term_end: null, chamber: 'house', state: 'CA', district: '12', party: 'Democrat', caucus: null, reason_for_end: null, source: 'congress_gov' },
    { bioguide_id: 'B000002', congress: 119, term_start: '2025-01-03', term_end: null, chamber: 'senate', state: 'TX', district: null, party: 'Republican', caucus: null, reason_for_end: null, source: 'congress_gov' },
  ],
  bills: [
    { id: '118-hr-9', title: 'Old Act', introduced_at: '2023-02-01', policy_area: 'Taxation', legislative_stage: 'introduced', source_url: 'https://www.congress.gov/bill/118th-congress/house-bill/9' },
    { id: '119-hr-1', title: 'One Big Act, "the line"\nsecond line', introduced_at: '2025-01-03', policy_area: 'Economics', legislative_stage: 'became_law', sponsor_bioguide_id: 'C000003', source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/1' },
    { id: '119-hr-2', title: 'H.R. 2', introduced_at: null, policy_area: null, source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/2' },
    { id: '119-s-5', title: 'S.5', introduced_at: '2025-01-06', source_url: 'https://www.congress.gov/bill/119th-congress/senate-bill/5' },
  ],
  bill_cosponsors: [
    { bill_id: '119-hr-1', bioguide_id: 'A000001', cosponsored_at: '2025-01-04', withdrawn_at: null },
    { bill_id: '118-hr-9', bioguide_id: 'C000003', cosponsored_at: '2023-03-01', withdrawn_at: '2023-04-01' },
  ],
  roll_calls: [
    { id: 'house-119-1-10', bill_id: '119-hr-1', question: 'On Passage', description: 'One Big Act', voted_at: '2025-05-22' },
    { id: 'house-118-1-4', bill_id: '118-hr-9', question: 'On Passage', description: null, voted_at: '2023-02-10' },
    { id: 'senate-119-1-2', bill_id: null, question: 'On the Cloture Motion', description: 'A bill', voted_at: '2025-01-09' },
  ],
  roll_call_stats: [
    { roll_call_id: 'house-119-1-10', dem_yea: 0, dem_nay: 212, rep_yea: 215, rep_nay: 2, ind_yea: 0, ind_nay: 0 },
    // insane: 900 votes in a 435-seat chamber (double-counted ETL rows)
    { roll_call_id: 'house-118-1-4', dem_yea: 400, dem_nay: 0, rep_yea: 500, rep_nay: 0, ind_yea: 0, ind_nay: 0 },
  ],
  votes: [] as Row[],
  etl_metadata: [{ key: 'last_successful_run', value: '2026-10-04T06:40:00.000Z' }],
}
// 7 votes: forces several pages at pageSize 2 and a roll call (senate-119-1-3)
// that exists only in the votes table, plus one legacy row without a roll call.
T.votes = [
  { id: 1, politician_id: 'A000001', roll_call_id: 'house-119-1-10', position: 'Nay', voted_at: '2025-05-22', source_url: 'https://clerk.house.gov/Votes/202510' },
  { id: 2, politician_id: 'C000003', roll_call_id: 'house-119-1-10', position: 'Yea', voted_at: '2025-05-22', source_url: 'https://clerk.house.gov/Votes/202510' },
  { id: 3, politician_id: 'A000001', roll_call_id: 'house-118-1-4', position: 'Yea', voted_at: '2023-02-10', source_url: 'https://clerk.house.gov/Votes/20234' },
  { id: 4, politician_id: 'B000002', roll_call_id: 'senate-119-1-2', position: 'Yea', voted_at: '2025-01-09', source_url: 'https://www.senate.gov/v2' },
  { id: 5, politician_id: 'B000002', roll_call_id: 'senate-119-1-3', position: 'Not Voting', voted_at: '2025-01-10', source_url: 'https://www.senate.gov/v3' },
  { id: 6, politician_id: 'C000003', roll_call_id: null, position: 'Yea', voted_at: '2024-01-01', source_url: 'x' },
  { id: 7, politician_id: 'C000003', roll_call_id: 'house-118-1-4', position: 'Present', voted_at: '2023-02-10', source_url: 'https://clerk.house.gov/Votes/20234' },
]

function readGz(p: string) { return gunzipSync(readFileSync(p)).toString('utf8') }

// Minimal RFC 4180 parser for round-trip checks.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let cur = ''; let q = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (q) { if (c === '"' && text[i + 1] === '"') { cur += '"'; i++ } else if (c === '"') q = false; else cur += c }
    else if (c === '"') q = true
    else if (c === ',') { row.push(cur); cur = '' }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
    else cur += c
  }
  return rows
}

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'bw-open-')) })
afterEach(() => { rmSync(dir, { recursive: true, force: true }) })

describe('paginate', () => {
  it('reads every row across pages even when the server caps rows below the page size', async () => {
    const rows = Array.from({ length: 23 }, (_, i) => ({ id: `k${String(i).padStart(2, '0')}` }))
    const client = mockClient({ t: rows }, { maxRows: 4 })
    const got: Row[] = []
    for await (const page of paginate(client, 't', 'id', { orderBy: ['id'], pageSize: 10 })) got.push(...page)
    expect(got.map((r) => r.id)).toEqual(rows.map((r) => r.id))
    expect(client.calls.length).toBeGreaterThan(2)
  })

  it('keyset mode walks id > last until an empty page', async () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ id: i + 1 }))
    const client = mockClient({ t: rows })
    const got: Row[] = []
    for await (const page of paginate(client, 't', 'id', { orderBy: ['id'], keyset: 'id', pageSize: 2 })) got.push(...page)
    expect(got.map((r) => r.id)).toEqual([1, 2, 3, 4, 5])
    expect(client.calls.map((c) => c.gt ?? null)).toEqual([null, 2, 4, 5])
  })

  it('every paged read in the exporter is ordered', () => {
    const src = readFileSync(join(__dirname, '../../etl/exportOpenData.ts'), 'utf8')
    for (const m of src.matchAll(/paginate\(client, '[a-z_]+', [^\n]+/g)) expect(m[0]).toMatch(/orderBy: \[/)
  })
})

describe('CSV escaping', () => {
  it('quotes commas, quotes, newlines and edge whitespace; empties nulls', () => {
    expect(csvEscape(null)).toBe('')
    expect(csvEscape(undefined)).toBe('')
    expect(csvEscape('plain')).toBe('plain')
    expect(csvEscape('a,b')).toBe('"a,b"')
    expect(csvEscape('say "hi"')).toBe('"say ""hi"""')
    expect(csvEscape('two\nlines')).toBe('"two\nlines"')
    expect(csvEscape('cr\rhere')).toBe('"cr\rhere"')
    expect(csvEscape(' lead')).toBe('" lead"')
    expect(csvEscape(true)).toBe('true')
    expect(csvEscape(0)).toBe('0')
    expect(csvLine(['a', null, 'b,c'])).toBe('a,,"b,c"\n')
  })
})

describe('row builders', () => {
  it('blanks placeholder bill titles', () => {
    expect(billRow({ id: '119-hr-2', title: 'H.R. 2', source_url: 'u' })!.title).toBeNull()
    expect(billRow({ id: '119-s-5', title: 'S.5', source_url: 'u' })!.title).toBeNull()
    expect(billRow({ id: '119-hr-1', title: ' Real Title ', source_url: 'u' })).toMatchObject({ title: 'Real Title', congress: 119, type: 'hr', number: 1, page_url: 'https://www.ballotwatch.io/bill/119/hr/1' })
    expect(billRow({ id: 'garbage', title: 'x' })).toBeNull()
  })

  it('derives the official record URL from the roll-call id (House year = session year, not ingest year)', () => {
    expect(officialRollCallUrl('house-119-1-1')).toBe('https://clerk.house.gov/Votes/20251')
    expect(officialRollCallUrl('house-119-2-295')).toBe('https://clerk.house.gov/Votes/2026295')
    expect(officialRollCallUrl('house-118-1-4')).toBe('https://clerk.house.gov/Votes/20234')
    expect(officialRollCallUrl('senate-119-2-12')).toBe('https://www.senate.gov/legislative/LIS/roll_call_votes/vote1192/vote_119_2_00012.htm')
    expect(officialRollCallUrl('nope')).toBeNull()
  })

  it('nulls the tally and result for insane or missing tallies', () => {
    const insane = rollCallRow('house-118-1-4', { question: 'On Passage' }, { dem_yea: 400, rep_yea: 500 })!
    expect(insane).toMatchObject({ yea: null, nay: null, dem_yea: null, result: null })
    const none = rollCallRow('senate-119-1-3', undefined, undefined, { voted_at: '2025-01-10', source_url: 's' })!
    expect(none).toMatchObject({ yea: null, result: null, voted_at: '2025-01-10', source_url: 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00003.htm', chamber: 'senate', congress: 119, session: 1, roll: 3 })
    const ok = rollCallRow('house-119-1-10', { question: 'On Passage' }, { dem_nay: 212, rep_yea: 215, rep_nay: 2 })!
    expect(ok).toMatchObject({ yea: 215, nay: 214, result: 'Passed', page_url: 'https://www.ballotwatch.io/vote/119/house/1/10' })
  })
})

describe('exportOpenData', () => {
  it('writes every catalog file with matching headers, counts, hashes and a valid datapackage', async () => {
    const client = mockClient(T, { maxRows: 2 })
    const now = new Date('2026-10-04T07:30:00Z')
    const m = await exportOpenData({ client, outDir: dir, congress: 119, now, pageSize: 2 })

    // Files match the shared catalog exactly.
    expect(m.files.map((x) => x.path).sort()).toEqual(openDataFiles(119).map((x) => x.path).sort())
    for (const fe of m.files) {
      const abs = join(dir, fe.path)
      const buf = readFileSync(abs)
      expect(fe.bytes).toBe(buf.length)
      expect(fe.sha256).toBe(createHash('sha256').update(buf).digest('hex'))
      const text = gunzipSync(buf).toString('utf8')
      const lines = fe.format === 'csv' ? parseCsv(text).length - 1 : text.split('\n').filter(Boolean).length
      expect(lines, fe.path).toBe(fe.rows)
    }

    expect(m.license.id).toBe('CC0-1.0')
    expect(m.current_congress).toBe(119)
    expect(m.data_updated_at).toBe('2026-10-04T06:40:00.000Z')
    expect(m.snapshot_date).toBe('2026-10-04')
    expect(m.row_counts).toMatchObject({ members: 3, member_terms: 3, bills: 4, 'bills-119': 3, votes: 6, 'votes-119': 4, roll_calls: 4, 'roll_calls-119': 3, bill_cosponsors: 2, 'bill_cosponsors-119': 1 })

    // Placeholder titles never published.
    const bills = parseCsv(readGz(join(dir, 'bills.csv.gz')))
    const header = bills[0]
    const titleIdx = header.indexOf('title')
    const byId = Object.fromEntries(bills.slice(1).map((r) => [r[0], r]))
    expect(byId['119-hr-2'][titleIdx]).toBe('')
    expect(byId['119-s-5'][titleIdx]).toBe('')
    expect(byId['119-hr-1'][titleIdx]).toBe('One Big Act, "the line"\nsecond line')
    expect(readGz(join(dir, 'bills.ndjson.gz'))).not.toMatch(/"title":"(H\.R\. 2|S\.5)"/)

    // Insane tally -> empty result; roll call seen only in votes is included.
    const rcs = readGz(join(dir, 'roll_calls.ndjson.gz')).trim().split('\n').map((l) => JSON.parse(l))
    expect(rcs.map((r) => r.id)).toEqual(['house-118-1-4', 'house-119-1-10', 'senate-119-1-2', 'senate-119-1-3'])
    expect(rcs[0]).toMatchObject({ yea: null, result: null })
    expect(rcs[1]).toMatchObject({ yea: 215, nay: 214, result: 'Passed', source_url: 'https://clerk.house.gov/Votes/202510' })
    expect(rcs[3]).toMatchObject({ voted_at: '2025-01-10', source_url: 'https://www.senate.gov/legislative/LIS/roll_call_votes/vote1191/vote_119_1_00003.htm' })

    // Members carry the current term.
    const members = readGz(join(dir, 'members.ndjson.gz')).trim().split('\n').map((l) => JSON.parse(l))
    expect(members.find((x) => x.bioguide_id === 'A000001')).toMatchObject({ serving_current_congress: true, current_term_start: '2025-01-03' })
    expect(members.find((x) => x.bioguide_id === 'C000003')).toMatchObject({ serving_current_congress: false, current_term_start: null })

    // Datapackage: one CSV resource per CSV file, fields == CSV header, FKs resolve.
    const dp = JSON.parse(readFileSync(join(dir, 'datapackage.json'), 'utf8'))
    expect(dp.profile).toBe('tabular-data-package')
    expect(dp.licenses[0]).toMatchObject({ name: 'CC0-1.0', path: 'https://creativecommons.org/publicdomain/zero/1.0/' })
    const names = new Set(dp.resources.map((r: any) => r.name))
    expect(dp.resources.length).toBe(m.files.filter((x) => x.format === 'csv').length)
    for (const r of dp.resources) {
      expect(r.name).toMatch(/^[a-z0-9._-]+$/)
      expect(r.compression).toBe('gz')
      expect(r.hash).toBe(`sha256:${m.files.find((x) => x.path === r.path)!.sha256}`)
      const hdr = parseCsv(readGz(join(dir, r.path)))[0]
      expect(r.schema.fields.map((x: any) => x.name)).toEqual(hdr)
      for (const k of [r.schema.primaryKey].flat()) expect(hdr).toContain(k)
      for (const fk of r.schema.foreignKeys || []) {
        expect(names.has(fk.reference.resource), `${r.name} -> ${fk.reference.resource}`).toBe(true)
        expect(hdr).toContain(fk.fields)
      }
      for (const fld of r.schema.fields) expect(['string', 'integer', 'number', 'boolean', 'date']).toContain(fld.type)
    }
    expect(dp.resources.find((r: any) => r.name === 'votes-119').schema.foreignKeys.map((x: any) => x.reference.resource)).toEqual(['roll-calls-119', 'members'])

    // Referential integrity actually holds in the data.
    const rcIds = new Set(rcs.map((r) => r.id))
    const memberIds = new Set(members.map((x) => x.bioguide_id))
    for (const v of readGz(join(dir, 'votes.ndjson.gz')).trim().split('\n').map((l) => JSON.parse(l))) {
      expect(rcIds.has(v.roll_call_id)).toBe(true)
      expect(memberIds.has(v.bioguide_id)).toBe(true)
    }

    expect(JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')).files.length).toBe(m.files.length)
  })

  it('skips bill_cosponsors when the table does not exist', async () => {
    const client = mockClient(T, { missing: ['bill_cosponsors'] })
    const m = await exportOpenData({ client, outDir: dir, congress: 119, now: new Date('2026-10-04T00:00:00Z') })
    expect(m.files.some((x) => x.table === 'bill_cosponsors')).toBe(false)
    expect(existsSync(join(dir, 'bill_cosponsors.csv.gz'))).toBe(false)
    expect(m.notes.join(' ')).toMatch(/bill_cosponsors/)
  })

  it('every catalog table has a primary key made of its own fields', () => {
    for (const t of OPEN_DATA_TABLES) for (const k of t.primaryKey) expect(t.fields.map((x) => x.name)).toContain(k)
  })
})

describe('upload (mock storage)', () => {
  function mockStorage({ bucket = null as any, folders = [] as string[] } = {}) {
    const log: string[] = []
    const files = new Map<string, any>()
    for (const f of folders) files.set(`${f}/manifest.json`, {})
    const store = {
      upload: async (path: string, body: Buffer, opts: any) => { log.push(`upload ${path} ${opts.contentType} ${opts.cacheControl} ${opts.upsert}`); files.set(path, opts); return { error: null } },
      list: async (prefix: string) => {
        if (!prefix) return { data: [...new Set([...files.keys()].map((k) => k.split('/')[0]))].map((name) => ({ name, id: null })), error: null }
        return { data: [...files.keys()].filter((k) => k.startsWith(`${prefix}/`)).map((k) => ({ name: k.slice(prefix.length + 1) })), error: null }
      },
      remove: async (paths: string[]) => { log.push(`remove ${paths.join(',')}`); for (const p of paths) files.delete(p); return { error: null } },
    }
    const storage = {
      getBucket: async () => bucket ? { data: bucket, error: null } : { data: null, error: { message: 'Bucket not found' } },
      createBucket: async (name: string, opts: any) => { log.push(`create ${name} public=${opts.public}`); return { data: { name }, error: null } },
      updateBucket: async (name: string, opts: any) => { log.push(`update ${name} public=${opts.public}`); return { data: { name }, error: null } },
      from: () => store,
    }
    return { storage, log, files }
  }

  it('creates the bucket public when missing, and only updates it when private', async () => {
    const a = mockStorage()
    await ensurePublicBucket(a)
    expect(a.log).toEqual(['create open-data public=true'])
    const b = mockStorage({ bucket: { name: 'open-data', public: false } })
    await ensurePublicBucket(b)
    expect(b.log).toEqual(['update open-data public=true'])
    const c = mockStorage({ bucket: { name: 'open-data', public: true } })
    await ensurePublicBucket(c)
    expect(c.log).toEqual([])
  })

  it('uploads dated then latest, manifest last, gzip as application/gzip, and keeps 14 dated snapshots', async () => {
    const m = await exportOpenData({ client: mockClient(T), outDir: dir, congress: 119, now: new Date('2026-10-04T07:30:00Z') })
    const old = Array.from({ length: 15 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`)
    const s = mockStorage({ bucket: { name: 'open-data', public: true }, folders: ['latest', ...old] })
    await uploadSnapshot(s, dir, m)
    const uploads = s.log.filter((l) => l.startsWith('upload'))
    expect(uploads.length).toBe((m.files.length + 2) * 2)
    const latest = uploads.filter((l) => l.startsWith('upload latest/'))
    expect(latest[latest.length - 1]).toMatch(/^upload latest\/manifest\.json application\/json 900 true$/)
    expect(uploads[0]).toMatch(/^upload 2026-10-04\/\S+\.gz application\/gzip 31536000 true$/)
    // 15 old + today = 16 dated; the two oldest go.
    const removed = s.log.filter((l) => l.startsWith('remove'))
    expect(removed.sort()).toEqual(['remove 2026-09-01/manifest.json', 'remove 2026-09-02/manifest.json'])
    expect([...s.files.keys()].some((k) => k.startsWith('latest/'))).toBe(true)
  })

  it('pruning never touches latest/', async () => {
    const s = mockStorage({ folders: ['latest', '2026-01-01', '2026-01-02'] })
    expect(await pruneSnapshots(s, 'open-data', 1)).toEqual(['2026-01-01'])
    expect(s.files.has('latest/manifest.json')).toBe(true)
  })

  it('content types', () => {
    expect(contentTypeFor('votes.csv.gz')).toBe('application/gzip')
    expect(contentTypeFor('votes.ndjson.gz')).toBe('application/gzip')
    expect(contentTypeFor('manifest.json')).toBe('application/json')
  })
})
