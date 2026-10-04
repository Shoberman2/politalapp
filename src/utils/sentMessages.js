// "You wrote; they voted": a record of messages the person says they sent,
// kept on this device only (localStorage). No account, no server copy, never
// the message text and never the person's position. Each entry is
// { ref, kind, member, memberName, billId?, at }.
//
// Every storage access is wrapped: private windows, blocked site data and
// hand-edited values must never break a page.

// Same labels as services/floorVotes BILL_TYPE_LABELS; kept local so this
// module (imported by TellYourRep) doesn't pull in the database client.
const BILL_TYPE_LABELS = {
  hr: 'H.R.', s: 'S.', hres: 'H.Res.', sres: 'S.Res.',
  hjres: 'H.J.Res.', sjres: 'S.J.Res.', hconres: 'H.Con.Res.', sconres: 'S.Con.Res.',
}

export const SENT_KEY = 'wrote:v1'
export const SENT_EVENT = 'wrote:changed'
const MAX_ENTRIES = 200

const BILL_ID_RE = /^\d{2,3}-(hr|s|hres|sres|hjres|sjres|hconres|sconres)-\d+$/
const MEMBER_RE = /^[A-Z]\d{6}$/

function storage() {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

/** A storage row is kept only if every field it relies on is well formed. */
export function normalizeSend(raw) {
  if (!raw || typeof raw !== 'object') return null
  const ref = typeof raw.ref === 'string' ? raw.ref.trim() : ''
  const member = typeof raw.member === 'string' ? raw.member.trim().toUpperCase() : ''
  const at = typeof raw.at === 'string' ? raw.at : ''
  if (!ref || !MEMBER_RE.test(member) || !at || Number.isNaN(new Date(at).getTime())) return null
  const kind = ['vote', 'bill', 'member'].includes(raw.kind) ? raw.kind : String(ref.split(':')[0] || '')
  const billId = typeof raw.billId === 'string' && BILL_ID_RE.test(raw.billId.toLowerCase())
    ? raw.billId.toLowerCase()
    : null
  const memberName = typeof raw.memberName === 'string' && raw.memberName.trim()
    ? raw.memberName.trim().slice(0, 120)
    : member
  return { ref, kind, member, memberName, ...(billId ? { billId } : {}), at }
}

export function sendId(send) {
  return `${send.ref}|${send.member}`
}

/** All saved sends, newest first. Corrupt storage reads as an empty list. */
export function readSends() {
  const s = storage()
  if (!s) return []
  let parsed
  try {
    parsed = JSON.parse(s.getItem(SENT_KEY) || '[]')
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const seen = new Set()
  const out = []
  for (const raw of parsed) {
    const send = normalizeSend(raw)
    if (!send || seen.has(sendId(send))) continue
    seen.add(sendId(send))
    out.push(send)
  }
  return out.sort((a, b) => new Date(b.at) - new Date(a.at))
}

function writeSends(list) {
  const s = storage()
  if (!s) return false
  try {
    s.setItem(SENT_KEY, JSON.stringify(list.slice(0, MAX_ENTRIES)))
  } catch {
    return false
  }
  try {
    window.dispatchEvent(new Event(SENT_EVENT))
  } catch {
    // Listeners are a convenience.
  }
  return true
}

export function findSend(ref, member) {
  const id = `${ref}|${String(member || '').toUpperCase()}`
  return readSends().find((s) => sendId(s) === id) || null
}

/**
 * Record a send. One entry per record + member: confirming again keeps the
 * first date. Returns the saved entry, or null when it could not be saved.
 */
export function recordSend({ ref, kind, member, memberName, billId, at } = {}) {
  const send = normalizeSend({ ref, kind, member, memberName, billId, at: at || new Date().toISOString() })
  if (!send) return null
  const list = readSends()
  const existing = list.find((s) => sendId(s) === sendId(send))
  if (existing) return existing
  return writeSends([send, ...list]) ? send : null
}

export function forgetSend(ref, member) {
  const id = `${ref}|${String(member || '').toUpperCase()}`
  const list = readSends()
  const next = list.filter((s) => sendId(s) !== id)
  if (next.length === list.length) return false
  return writeSends(next)
}

/** "119-hr-1" from route params, or null. */
export function billIdFrom(congress, billType, number) {
  const id = `${Number(congress)}-${String(billType || '').toLowerCase()}-${Number(number)}`
  return BILL_ID_RE.test(id) ? id : null
}

// ---------------------------------------------------------------------------
// The follow-up line. Facts only: who, what, when, and the recorded vote. It
// never says whether a vote matched what the person wanted; we don't know.

const SHORT = { month: 'short', day: 'numeric' }

function shortDate(value, { utc = false, now = new Date() } = {}) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  const tz = utc ? { timeZone: 'UTC' } : {}
  const year = utc ? d.getUTCFullYear() : d.getFullYear()
  const opts = year === now.getFullYear() ? { ...SHORT, ...tz } : { ...SHORT, year: 'numeric', ...tz }
  return d.toLocaleDateString('en-US', opts)
}

/** The person's local calendar date of the send, as YYYY-MM-DD. */
export function sendDay(at) {
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return null
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function billLabel(billId) {
  const m = BILL_ID_RE.exec(String(billId || '').toLowerCase())
  if (!m) return ''
  const [, type, number] = String(billId).toLowerCase().split('-')
  return `${BILL_TYPE_LABELS[type]} ${number}`
}

export function billHref(billId) {
  if (!BILL_ID_RE.test(String(billId || '').toLowerCase())) return null
  const [congress, type, number] = String(billId).toLowerCase().split('-')
  return `/bill/${congress}/${type}/${number}`
}

/** "You wrote to Nancy Pelosi about H.R. 1 on Oct 3." */
export function wroteLine(send, { now } = {}) {
  const when = shortDate(send.at, { now })
  const about = send.billId ? ` about ${billLabel(send.billId)}` : ''
  return `You wrote to ${send.memberName}${about}${when ? ` on ${when}` : ''}.`
}

/** "Nancy Pelosi voted Yea on On Passage (Roll Call 295, Oct 5)." */
export function voteLine(memberName, vote, { now } = {}) {
  const question = vote.question ? vote.question : 'a recorded vote'
  const action = vote.position === 'Not Voting'
    ? `did not vote on ${question}`
    : `voted ${vote.position} on ${question}`
  const when = shortDate(vote.votedAt, { utc: true, now })
  const where = [vote.rollNumber ? `Roll Call ${vote.rollNumber}` : '', when].filter(Boolean).join(', ')
  return `${memberName} ${action}${where ? ` (${where})` : ''}.`
}

export function noVoteLine(memberName) {
  return `No recorded vote by ${memberName} on this bill since you wrote.`
}
