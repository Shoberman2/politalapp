import { describe, expect, it } from 'vitest'
import {
  OWN_WORDS_LINE,
  billRef,
  buildScaffold,
  congressGovBillUrl,
  displayName,
  lastName,
  memberRef,
  seatLabel,
  voteRef,
} from '../../src/utils/tellYourRepDraft'

// Words that would put a position, an argument, or an ask in the person's
// mouth. The outline must contain none of them.
const ADVOCACY_RE = /\b(support|oppose|opposed|urge|demand|thank|grateful|disappoint\w*|outrag\w*|proud|shame\w*|should|must|please vote|vote (yes|no)|reconsider|stand with|fight|protect|wrong|right thing|agree|disagree)\b/i

const voteContext = {
  kind: 'vote',
  ref: 'vote:119-house-2-295',
  label: 'House roll call 295 (119th Congress, session 2)',
  title: 'On Passage on H.R. 4795: Water Resources Development Act of 2026',
  sourceUrl: 'https://clerk.house.gov/Votes/2026295',
  href: '/vote/119/house/2/295',
  chamber: 'house',
  date: '2026-09-03',
  result: 'Passed',
  memberVotes: { P000197: 'Nay', A000055: 'Yea' },
}

const rep = { bioguideId: 'P000197', name: 'Pelosi, Nancy', chamber: 'house', state: 'CA', district: '11' }
const senator = { bioguideId: 'P000145', name: 'Padilla, Alex', chamber: 'senate', state: 'CA' }

describe('buildScaffold', () => {
  it('states only facts from the record for a vote and leaves a bracketed line for the person', () => {
    const text = buildScaffold({ context: voteContext, member: rep, constituent: true })
    expect(text).toBe([
      'Dear Representative Pelosi,',
      '',
      'I am a constituent in CA-11. I am writing about House roll call 295 (119th Congress, session 2), held September 3, 2026: On Passage on H.R. 4795: Water Resources Development Act of 2026.',
      '',
      'Your recorded vote: Nay.',
      'Result: Passed.',
      'Official record: https://clerk.house.gov/Votes/2026295',
      '',
      OWN_WORDS_LINE,
      '',
      'Sincerely,',
      '[Your name]',
      '[Your street address, city, ZIP]',
    ].join('\n'))
    expect(text).not.toMatch(ADVOCACY_RE)
  })

  it('says plainly when a member of the other chamber did not vote', () => {
    const text = buildScaffold({ context: voteContext, member: senator, constituent: true })
    expect(text).toMatch(/^Dear Senator Padilla,/)
    expect(text).toContain('I am a constituent in CA.')
    expect(text).toContain('This was a House vote, so you did not vote on it.')
    expect(text).not.toContain('Your recorded vote')
    expect(text).not.toMatch(ADVOCACY_RE)
  })

  it('omits the constituent line when the member was not found from the person’s location', () => {
    const text = buildScaffold({ context: voteContext, member: rep, constituent: false })
    expect(text).not.toContain('constituent')
  })

  it('builds a bill outline with the latest action and the official page', () => {
    const text = buildScaffold({
      context: { kind: 'bill', ref: 'bill:119-hr-1', label: 'H.R. 1 (119th Congress)', title: 'One Big Beautiful Bill Act', sourceUrl: 'https://www.congress.gov/bill/119th-congress/house-bill/1', href: '/bill/119/hr/1', result: 'Became Public Law No: 119-21. (July 4, 2025)' },
      member: senator,
      constituent: true,
    })
    expect(text).toContain('I am writing about H.R. 1 (119th Congress), One Big Beautiful Bill Act.')
    expect(text).toContain('Latest action: Became Public Law No: 119-21. (July 4, 2025)')
    expect(text).toContain('Official record: https://www.congress.gov/bill/119th-congress/house-bill/1')
    expect(text).not.toMatch(ADVOCACY_RE)
  })

  it('falls back to the BallotWatch page when there is no official source', () => {
    const text = buildScaffold({ context: { ...voteContext, sourceUrl: undefined }, member: rep, origin: 'https://www.ballotwatch.io' })
    expect(text).toContain('Official record: https://www.ballotwatch.io/vote/119/house/2/295')
  })

  it('leaves the subject to the person on a member page', () => {
    const text = buildScaffold({ context: { kind: 'member', ref: 'member:P000197', label: 'Nancy Pelosi', href: '/politician/P000197' }, member: rep })
    expect(text).toContain('I am writing about [the bill, vote, or issue you want to raise].')
    expect(text).not.toContain('Official record')
    expect(text).not.toMatch(ADVOCACY_RE)
  })
})

describe('helpers', () => {
  it('formats names, seats, references, and bill URLs', () => {
    expect(displayName('Bean, Aaron')).toBe('Aaron Bean')
    expect(displayName('Robert Aderholt')).toBe('Robert Aderholt')
    expect(lastName({ name: 'Robert B. Aderholt Jr.' })).toBe('Aderholt')
    expect(lastName({ name: 'Bean, Aaron', lastName: 'Bean' })).toBe('Bean')
    expect(seatLabel({ chamber: 'House of Representatives', state: 'ak', district: '0' })).toBe('AK-AL')
    expect(seatLabel({ chamber: 'house', state: 'TX', district: '07' })).toBe('TX-7')
    expect(seatLabel({ chamber: 'Senate', state: 'TX', district: '07' })).toBe('TX')
    expect(voteRef({ congress: '119', chamber: 'House', session: '2', roll: '295' })).toBe('vote:119-house-2-295')
    expect(billRef({ congress: 119, billType: 'HR', number: '1' })).toBe('bill:119-hr-1')
    expect(memberRef('p000197')).toBe('member:P000197')
    expect(congressGovBillUrl(119, 'hjres', 12)).toBe('https://www.congress.gov/bill/119th-congress/house-joint-resolution/12')
    expect(congressGovBillUrl(111, 's', 3)).toBe('https://www.congress.gov/bill/111th-congress/senate-bill/3')
    expect(congressGovBillUrl(119, 'xx', 1)).toBeNull()
  })
})
