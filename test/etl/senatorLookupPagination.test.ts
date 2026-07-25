import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractRecentVotes } from '../../etl/extractHouseVotes'

// REGRESSION: the senator bioguideId lookup fetched a SINGLE page of
// /member?limit=250. That endpoint is not ordered by chamber — as of July 2026
// the first 250 current members are all House — so the lookup map came back
// with zero senators and every Senate member position was silently discarded
// for want of a bioguideId. Senate roll calls still landed, just with no votes
// attached, which is why it went unnoticed for months (the ETL log said
// "Built lookup for 1 senators" and nothing failed).
// Found while tracing missing Senate tallies on the landing page, 2026-07-25.

const CONGRESS = 119
const SESSION = 2

// The extractor filters Senate votes to [today - daysBack, today], so build the
// fixture around the real clock rather than a frozen date.
const today = new Date()
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const voteDay = `${String(today.getDate()).padStart(2, '0')}-${MONTHS[today.getMonth()]}`
const voteDateIso = today.toISOString().split('T')[0]

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(''),
  } as unknown as Response
}

function xmlResponse(xml: string): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: vi.fn().mockResolvedValue({}),
    text: vi.fn().mockResolvedValue(xml),
  } as unknown as Response
}

const houseMember = (i: number) => ({
  bioguideId: `H${String(i).padStart(6, '0')}`,
  name: `Doe${i}, John`,
  partyName: 'Republican',
  state: 'California',
  terms: { item: [{ chamber: 'House of Representatives', startYear: 2025 }] },
})

const senator = {
  bioguideId: 'S000148',
  name: 'Schumer, Charles',
  partyName: 'Democratic',
  state: 'New York',
  terms: { item: [{ chamber: 'Senate', startYear: 2025 }] },
}

const voteMenuXml = `<vote_summary><votes><vote>
  <vote_number>207</vote_number>
  <vote_date>${voteDay}</vote_date>
  <issue>S.J.Res. 180</issue>
  <question>On the Motion to Discharge</question>
  <result>Agreed to</result>
  <title>A joint resolution</title>
</vote></votes></vote_summary>`

const voteDetailXml = `<roll_call_vote>
  <vote_date>${voteDateIso}</vote_date>
  <members><member>
    <member_full>Schumer (D-NY)</member_full>
    <last_name>Schumer</last_name>
    <first_name>Charles</first_name>
    <party>D</party>
    <state>NY</state>
    <vote_cast>Yea</vote_cast>
    <lis_member_id>S270</lis_member_id>
  </member></members>
</roll_call_vote>`

/**
 * Routes every fetch the extractor makes. Member pages are served
 * House-first so that a single-page fetch sees zero senators — exactly the
 * production ordering that caused the bug.
 */
function installFetchStub() {
  const memberOffsets: number[] = []

  const fetchMock = vi.fn(async (input: string | URL) => {
    const url = String(input)

    if (url.includes('/v3/member')) {
      const offset = Number(new URL(url).searchParams.get('offset') || '0')
      memberOffsets.push(offset)
      // 300 members total: 250 House on page 1, then the lone senator.
      if (offset === 0) {
        return jsonResponse({ members: Array.from({ length: 250 }, (_, i) => houseMember(i)) })
      }
      if (offset === 250) {
        return jsonResponse({ members: [senator] })
      }
      return jsonResponse({ members: [] })
    }

    // No House votes in range — this test is about the Senate path.
    if (url.includes('/v3/house-vote')) {
      return jsonResponse({ houseRollCallVotes: [] })
    }
    if (url.includes(`vote_menu_${CONGRESS}_${SESSION}.xml`)) {
      return xmlResponse(voteMenuXml)
    }
    if (url.includes('vote_menu_')) {
      return xmlResponse('<vote_summary><votes></votes></vote_summary>')
    }
    if (url.includes('roll_call_votes')) {
      return xmlResponse(voteDetailXml)
    }
    return jsonResponse({})
  })

  vi.stubGlobal('fetch', fetchMock)
  return { memberOffsets }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Senate member-vote extraction — senator lookup pagination', () => {
  it('pages through every /member page instead of stopping at the first', async () => {
    const { memberOffsets } = installFetchStub()

    await extractRecentVotes({
      congressApiKey: 'test-key',
      supabaseUrl: 'http://localhost',
      supabaseServiceKey: 'test',
      daysBack: 7,
      dryRun: true,
    } as never)

    // The bug was fetching offset 0 only. Page 2 is where the senators live.
    expect(memberOffsets).toContain(0)
    expect(memberOffsets).toContain(250)
  })

  it('resolves a bioguideId for Senate positions so they are not dropped', async () => {
    installFetchStub()

    const votes = await extractRecentVotes({
      congressApiKey: 'test-key',
      supabaseUrl: 'http://localhost',
      supabaseServiceKey: 'test',
      daysBack: 7,
      dryRun: true,
    } as never)

    const senateVotes = votes.filter(
      (v: never) => ((v as { vote?: { chamber?: string } }).vote?.chamber || '').toLowerCase() === 'senate'
    )
    expect(senateVotes.length).toBeGreaterThan(0)

    const positions = senateVotes.flatMap(
      (v: never) => (v as { memberVotes?: Array<{ member?: { bioguideId?: string } }> }).memberVotes || []
    )
    expect(positions.length).toBeGreaterThan(0)
    // Before the fix every one of these was '' and got discarded downstream.
    for (const p of positions) {
      expect(p.member?.bioguideId).toBeTruthy()
    }
    expect(positions.some((p) => p.member?.bioguideId === 'S000148')).toBe(true)
  })
})
