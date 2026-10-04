import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  SENT_EVENT,
  SENT_KEY,
  billHref,
  billIdFrom,
  billLabel,
  findSend,
  forgetSend,
  noVoteLine,
  readSends,
  recordSend,
  sendDay,
  voteLine,
  wroteLine,
} from '../../src/utils/sentMessages'
import { POSITION_RE } from '../fixtures/positionLanguage.js'

const send = { ref: 'bill:119-hr-1', kind: 'bill', member: 'P000197', memberName: 'Nancy Pelosi', billId: '119-hr-1', at: '2026-10-03T15:00:00.000Z' }

beforeEach(() => localStorage.clear())
afterEach(() => vi.restoreAllMocks())

describe('sentMessages storage', () => {
  it('round-trips a send with exactly the documented fields', () => {
    const saved = recordSend(send)
    expect(saved).toEqual(send)
    const raw = JSON.parse(localStorage.getItem(SENT_KEY))
    expect(raw).toEqual([send])
    expect(Object.keys(raw[0]).sort()).toEqual(['at', 'billId', 'kind', 'member', 'memberName', 'ref'])
    expect(readSends()).toEqual([send])
    expect(findSend('bill:119-hr-1', 'p000197')).toEqual(send)
  })

  it('omits billId for a member-page send and stamps the current time when none is given', () => {
    const saved = recordSend({ ref: 'member:A000055', kind: 'member', member: 'A000055', memberName: 'Robert Aderholt' })
    expect(saved).not.toHaveProperty('billId')
    expect(Number.isNaN(new Date(saved.at).getTime())).toBe(false)
  })

  it('keeps one entry per record and member, with the first date', () => {
    recordSend(send)
    const again = recordSend({ ...send, at: '2026-10-09T00:00:00.000Z' })
    expect(again.at).toBe(send.at)
    expect(readSends()).toHaveLength(1)
  })

  it('lists newest first and forgets one entry', () => {
    recordSend(send)
    recordSend({ ...send, ref: 'vote:119-house-2-295', kind: 'vote', at: '2026-10-04T15:00:00.000Z' })
    expect(readSends().map((s) => s.ref)).toEqual(['vote:119-house-2-295', 'bill:119-hr-1'])
    expect(forgetSend('vote:119-house-2-295', 'P000197')).toBe(true)
    expect(readSends().map((s) => s.ref)).toEqual(['bill:119-hr-1'])
    expect(forgetSend('vote:119-house-2-295', 'P000197')).toBe(false)
  })

  it('announces changes so open pages can refresh', () => {
    const spy = vi.fn()
    window.addEventListener(SENT_EVENT, spy)
    recordSend(send)
    forgetSend(send.ref, send.member)
    window.removeEventListener(SENT_EVENT, spy)
    expect(spy).toHaveBeenCalledTimes(2)
  })

  it('tolerates corrupt storage', () => {
    localStorage.setItem(SENT_KEY, '{not json')
    expect(readSends()).toEqual([])
    localStorage.setItem(SENT_KEY, JSON.stringify({ ref: 'x' }))
    expect(readSends()).toEqual([])
    localStorage.setItem(SENT_KEY, JSON.stringify([
      null, 7, 'str', {},
      { ...send, member: 'not-an-id' },
      { ...send, at: 'yesterday' },
      { ...send, ref: '' },
      { ...send, billId: 'drop table', memberName: 42 },
      send,
    ]))
    const rows = readSends()
    // The bad-billId row keeps its valid fields; the duplicate after it is dropped.
    expect(rows).toHaveLength(1)
    expect(rows[0]).toEqual({ ref: send.ref, kind: 'bill', member: 'P000197', memberName: 'P000197', at: send.at })
    // Writing over corrupt storage starts a clean list.
    localStorage.setItem(SENT_KEY, '{not json')
    expect(recordSend(send)).toEqual(send)
    expect(readSends()).toEqual([send])
  })

  it('survives storage that throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('denied') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(readSends()).toEqual([])
    expect(findSend(send.ref, send.member)).toBeNull()
    expect(recordSend(send)).toBeNull()
    expect(forgetSend(send.ref, send.member)).toBe(false)
  })

  it('refuses an entry without a valid member id or ref', () => {
    expect(recordSend({ ...send, member: '' })).toBeNull()
    expect(recordSend({ ...send, ref: undefined })).toBeNull()
    expect(localStorage.getItem(SENT_KEY)).toBeNull()
  })
})

describe('sentMessages helpers', () => {
  it('builds bill ids, labels and paths', () => {
    expect(billIdFrom('119', 'HR', '1')).toBe('119-hr-1')
    expect(billIdFrom('119', 'amendment', '1')).toBeNull()
    expect(billLabel('119-hjres-12')).toBe('H.J.Res. 12')
    expect(billLabel('nope')).toBe('')
    expect(billHref('119-s-5')).toBe('/bill/119/s/5')
  })

  it('uses the local calendar day of the send', () => {
    const local = new Date(2026, 9, 3, 23, 30)
    expect(sendDay(local.toISOString())).toBe('2026-10-03')
    expect(sendDay('garbage')).toBeNull()
  })
})

describe('follow-up lines', () => {
  const now = new Date('2026-10-20T12:00:00Z')
  const at = new Date(2026, 9, 3, 12).toISOString()

  it('states who, what and when', () => {
    expect(wroteLine({ ...send, at }, { now })).toBe('You wrote to Nancy Pelosi about H.R. 1 on Oct 3.')
    expect(wroteLine({ ...send, billId: undefined, at }, { now })).toBe('You wrote to Nancy Pelosi on Oct 3.')
  })

  it('states the recorded vote with the roll call and date', () => {
    const vote = { position: 'Yea', question: 'On Passage', rollNumber: 301, votedAt: '2026-10-08' }
    expect(voteLine('Nancy Pelosi', vote, { now })).toBe('Nancy Pelosi voted Yea on On Passage (Roll Call 301, Oct 8).')
    expect(voteLine('Nancy Pelosi', { ...vote, position: 'Nay' }, { now })).toBe('Nancy Pelosi voted Nay on On Passage (Roll Call 301, Oct 8).')
    expect(voteLine('Nancy Pelosi', { ...vote, position: 'Not Voting' }, { now })).toBe('Nancy Pelosi did not vote on On Passage (Roll Call 301, Oct 8).')
    expect(voteLine('Nancy Pelosi', { ...vote, question: null, votedAt: '2025-01-09' }, { now })).toBe('Nancy Pelosi voted Yea on a recorded vote (Roll Call 301, Jan 9, 2025).')
  })

  it('states plainly when there is no later vote', () => {
    expect(noVoteLine('Nancy Pelosi')).toBe('No recorded vote by Nancy Pelosi on this bill on or after the day you wrote.')
  })

  it('never uses position or judgment language', () => {
    const lines = [
      wroteLine({ ...send, at }, { now }),
      noVoteLine('Nancy Pelosi'),
      ...['Yea', 'Nay', 'Present', 'Not Voting'].map((position) => voteLine('Nancy Pelosi', { position, question: 'On Passage', rollNumber: 1, votedAt: '2026-10-08' }, { now })),
    ]
    for (const line of lines) expect(line).not.toMatch(POSITION_RE)
  })
})
