// Where a constituent goes to write to a member of Congress.
//
// BallotWatch never submits an office's contact form. This helper only picks
// the page to open so the person can send their own message there.
//
// Resolution order:
//   1. A hand-curated override for offices whose form lives somewhere other
//      than `<official site>/contact`. Keyed by bioguide id.
//   2. `<official site>/contact` when the official site is on house.gov or
//      senate.gov (the convention almost every office follows).
//   3. The official website itself, when it is on some other host (we do not
//      guess paths on sites we don't recognise).
//   4. The office phone number.
//   5. Nothing: the caller shows Congress.gov's member page or a generic note.

// Hand-curated: only add an entry after checking the office's live site.
// { [bioguideId]: 'https://…/path-to-contact-form' }
export const CONTACT_URL_OVERRIDES = Object.freeze({})

const OFFICIAL_HOST_RE = /(^|\.)(house|senate)\.gov$/i

function parseHttpUrl(value) {
  if (!value || typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  try {
    const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return url
  } catch {
    return null
  }
}

/** True when the URL is on house.gov or senate.gov. */
export function isOfficialCongressHost(value) {
  const url = parseHttpUrl(value)
  return !!url && OFFICIAL_HOST_RE.test(url.hostname)
}

/**
 * The official website's contact page, or null when it cannot be derived.
 * Always https; drops any query or hash; keeps no trailing slash.
 */
export function deriveContactUrl(officialWebsiteUrl) {
  const url = parseHttpUrl(officialWebsiteUrl)
  if (!url || !OFFICIAL_HOST_RE.test(url.hostname)) return null
  return `https://${url.hostname.toLowerCase()}/contact`
}

function normalizeWebsite(officialWebsiteUrl) {
  const url = parseHttpUrl(officialWebsiteUrl)
  if (!url) return null
  url.hash = ''
  return url.toString().replace(/\/$/, '')
}

/**
 * Pick how a person reaches this member's office.
 *
 * @param {{ bioguideId?: string, officialWebsiteUrl?: string, phone?: string }} member
 * @param {Record<string, string>} [overrides] defaults to CONTACT_URL_OVERRIDES
 * @returns {{ kind: 'contact'|'website'|'phone'|'none', url: string|null, website: string|null, phone: string|null }}
 */
export function resolveContact(member, overrides = CONTACT_URL_OVERRIDES) {
  const phone = typeof member?.phone === 'string' && member.phone.trim() ? member.phone.trim() : null
  const website = normalizeWebsite(member?.officialWebsiteUrl)
  const id = member?.bioguideId ? String(member.bioguideId).toUpperCase() : null

  const override = id && overrides ? parseHttpUrl(overrides[id]) : null
  if (override) return { kind: 'contact', url: override.toString(), website, phone }

  const derived = deriveContactUrl(member?.officialWebsiteUrl)
  if (derived) return { kind: 'contact', url: derived, website, phone }

  if (website) return { kind: 'website', url: website, website, phone }
  if (phone) return { kind: 'phone', url: `tel:${phone.replace(/[^\d+]/g, '')}`, website: null, phone }
  return { kind: 'none', url: null, website: null, phone: null }
}
