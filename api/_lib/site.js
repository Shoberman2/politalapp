// Single source for site-wide constants used by the server functions.
export const SITE_ORIGIN = 'https://www.ballotwatch.io'
export const CANONICAL_HOST = 'www.ballotwatch.io'

// 435 House + 100 Senate, plus slack for delegates and vacancies.
export const MAX_ROLL_CALL_ROWS = 600

// Which cached bill explanation the site reads.
export const EXPLANATION_MODEL = 'gpt-4o-mini'
export const EXPLANATION_PROMPT_VERSION = 2

export function congressGovMemberUrl(bioguideId) {
  return `https://www.congress.gov/member/${bioguideId}`
}

export function bioguideUrl(bioguideId) {
  return `https://bioguide.congress.gov/search/bio/${bioguideId}`
}
