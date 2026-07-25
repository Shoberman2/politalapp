import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractRecentVotes } from '../../etl/extractHouseVotes'

// REGRESSION: the Senate vote-menu parser used one regex demanding an exact
// child sequence — vote_number, vote_date, issue, question, result, ... title —
// directly under <vote>. En bloc votes (batched nomination confirmations, very
// common in the Senate) nest issue/question/result inside <en_bloc><matter>
// instead, so they never matched. A non-match yields nothing at all, so those
// roll calls were dropped with no error and no log line.
// Measured against the live feed 2026-07-25: 122 of 659 session-1 votes and
// 50 of 209 session-2 votes silently lost.

const today = new Date()
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const day = `${String(today.getDate()).padStart(2, '0')}-${MONTHS[today.getMonth()]}`
const iso = today.toISOString().split('T')[0]

// Shape copied from the real feed (senate.gov vote_menu_119_1.xml, vote 00655).
// Placed in session 2 here so it falls inside the 7-day extraction window.
const EN_BLOC_VOTE = `<vote>
      <vote_number>00655</vote_number>
      <vote_date>${day}</vote_date>
      <en_bloc>
        <matter>
          <issue>PN416-9</issue>
          <question>On the Nomination</question>
          <result>Confirmed</result>
        </matter>
      </en_bloc>
    </vote>`

const PLAIN_VOTE = `<vote>
      <vote_number>00656</vote_number>
      <vote_date>${day}</vote_date>
      <issue>S.J.Res. 180</issue>
      <question>On the Motion to Discharge</question>
      <result>Agreed to</result>
      <title>A joint resolution</title>
    </vote>`

const menuXml = (body: string) => `<vote_summary><votes>${body}</votes></vote_summary>`

const voteDetailXml = `<roll_call_vote>
  <vote_date>${iso}</vote_date>
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

function res(body: unknown, isJson: boolean): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: vi.fn().mockResolvedValue(isJson ? body : {}),
    text: vi.fn().mockResolvedValue(isJson ? '' : String(body)),
  } as unknown as Response
}

const senator = {
  bioguideId: 'S000148',
  name: 'Schumer, Charles',
  partyName: 'Democratic',
  state: 'New York',
  terms: { item: [{ chamber: 'Senate', startYear: 2025 }] },
}

function installFetchStub() {
  const fetched: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
    const url = String(input)
    if (url.includes('/v3/member')) {
      const offset = Number(new URL(url).searchParams.get('offset') || '0')
      return res({ members: offset === 0 ? [senator] : [] }, true)
    }
    if (url.includes('/v3/house-vote')) return res({ houseRollCallVotes: [] }, true)
    if (url.includes('vote_menu_119_2.xml')) {
      return res(menuXml(`${EN_BLOC_VOTE}${PLAIN_VOTE}`), false)
    }
    if (url.includes('vote_menu_')) return res(menuXml(''), false)
    if (url.includes('roll_call_votes')) {
      fetched.push(url)
      return res(voteDetailXml, false)
    }
    return res({}, true)
  }))
  return { fetched }
}

afterEach(() => { vi.unstubAllGlobals() })

const config = {
  congressApiKey: 'test-key',
  supabaseUrl: 'http://localhost',
  supabaseServiceKey: 'test',
  daysBack: 7,
  dryRun: true,
} as never

describe('Senate vote-menu parsing', () => {
  it('extracts en bloc votes, not just flat ones', async () => {
    const { fetched } = installFetchStub()
    await extractRecentVotes(config)

    // Both roll calls must have had their detail XML requested. Before the fix
    // only 00656 did — 00655 never survived the menu parse.
    expect(fetched.some((u) => u.includes('vote_119_2_00655'))).toBe(true)
    expect(fetched.some((u) => u.includes('vote_119_2_00656'))).toBe(true)
  })

  it('leaves no menu entry behind', async () => {
    const { fetched } = installFetchStub()
    await extractRecentVotes(config)

    // Two entries in the menu, two detail fetches. The old parser made one:
    // silent 50% loss on a feed where en bloc confirmations are routine.
    const senateDetail = fetched.filter((u) => u.includes('roll_call_votes'))
    expect(senateDetail).toHaveLength(2)
  })
})
