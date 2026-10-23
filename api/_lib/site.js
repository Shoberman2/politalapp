// Single source for site-wide constants used by the server functions.
export const SITE_ORIGIN = 'https://www.ballotwatch.io'
export const CANONICAL_HOST = 'www.ballotwatch.io'

// 435 House + 100 Senate, plus slack for delegates and vacancies.
export const MAX_ROLL_CALL_ROWS = 600

// Which cached bill explanation the site reads: the one written from the
// bill's own text (shared/billExplainer.js). Older title-based rows
// (gpt-4o-mini v2) are ignored.
export { EXPLAINER_MODEL as EXPLANATION_MODEL, EXPLAINER_PROMPT_VERSION as EXPLANATION_PROMPT_VERSION } from '../../shared/billExplainer.js'

export function congressGovMemberUrl(bioguideId) {
  return `https://www.congress.gov/member/${bioguideId}`
}

export function bioguideUrl(bioguideId) {
  return `https://bioguide.congress.gov/search/bio/${bioguideId}`
}
