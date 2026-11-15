import { DEFAULT_SIGNED_IN_PATH } from './access'

// The site's one primary action. Same words on every page and in every state
// (nav, hero, closing band, footer), so it never changes after the page loads.
export const CTA_LABEL = 'Find my reps'

// Opens the create-account form and lands on the reader's representatives.
// A signed-in reader is passed straight through by /auth.
export const CTA_HREF = `/auth?mode=signup&next=${encodeURIComponent(DEFAULT_SIGNED_IN_PATH)}`
