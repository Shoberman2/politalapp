/**
 * URL slug generation for BallotWatch.
 *
 * Rules (from docs/designs/wave-1-seo-wedge.md):
 *   - Deterministic: same input always produces same output.
 *   - Unicode-safe: strips diacritics, normalizes non-ASCII to safe ASCII.
 *   - URL-safe: only [a-z0-9-], no double dashes, no leading/trailing dash.
 *   - Truncated at 60 chars at word boundary.
 *   - Freeze-on-publish: slugs are written ONCE by the ETL and never recomputed.
 *
 * Vote slug source chain (first non-empty wins):
 *   1. Vote question text (if specific)
 *   2. Bill title (if bill exists)
 *   3. "procedural-motion-{motion_type}" (for procedural votes)
 *   4. "vote-{roll_call_id}" (always available fallback)
 */

const MAX_LEN = 60;

/**
 * Convert arbitrary text to a URL-safe slug.
 *
 * Deterministic for the same input. Handles unicode via NFKD decomposition,
 * strips combining marks, lowercases, replaces non-alphanumeric with dashes,
 * collapses consecutive dashes, trims leading/trailing dashes, truncates at
 * MAX_LEN at a word boundary.
 */
export function slugify(text: string): string {
  if (!text) return '';

  const normalized = text
    .normalize('NFKD')
    // Strip combining marks (accents, diacritics)
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    // Replace ampersand with "and" before dash conversion
    .replace(/&/g, ' and ')
    // Anything that is not a-z, 0-9 becomes a dash
    .replace(/[^a-z0-9]+/g, '-')
    // Collapse consecutive dashes
    .replace(/-+/g, '-')
    // Trim leading/trailing dashes
    .replace(/^-+|-+$/g, '');

  if (normalized.length <= MAX_LEN) return normalized;

  // Truncate at MAX_LEN, then walk back to the last dash (word boundary)
  // so we don't cut a word in half.
  const sliced = normalized.slice(0, MAX_LEN);
  const lastDash = sliced.lastIndexOf('-');

  // If there's a reasonable dash position (not in the first 30% of the string),
  // use it as the truncation point. Otherwise truncate at MAX_LEN exactly.
  if (lastDash > MAX_LEN * 0.3) {
    return sliced.slice(0, lastDash);
  }
  return sliced;
}

export interface VoteSlugInput {
  /** The vote's roll_call_id, e.g., "senate-118-1-423". Always present. */
  roll_call_id: string;
  /** Vote question text from Congress.gov, e.g., "On Passage of the Bill". */
  question?: string | null;
  /** Associated bill title, if the vote is linked to a bill. */
  bill_title?: string | null;
  /** Motion type for procedural votes, e.g., "Motion to Recommit". */
  motion_type?: string | null;
}

/**
 * Generate a vote slug from the first non-empty source in the chain.
 *
 * This is the WRITE-ONCE generator. Once a vote's slug is stored with
 * slug_locked_at set, ETL re-runs must NOT call this again for that vote.
 * Caller is responsible for checking slug_locked_at.
 *
 * Never returns an empty string — "vote-{roll_call_id}" is the ultimate fallback.
 */
export function generateVoteSlug(input: VoteSlugInput): string {
  // 1. Specific question text
  if (input.question && isSpecificQuestion(input.question)) {
    const s = slugify(input.question);
    if (s) return s;
  }

  // 2. Bill title
  if (input.bill_title) {
    const s = slugify(input.bill_title);
    if (s) return s;
  }

  // 3. Procedural motion
  if (input.motion_type) {
    const s = slugify(input.motion_type);
    if (s) return `procedural-motion-${s}`;
  }

  // 4. Fallback
  return `vote-${slugify(input.roll_call_id)}`;
}

/**
 * Returns true if the question text is specific enough to be a meaningful slug.
 *
 * Generic questions like "On Passage" or "On the Motion" produce useless slugs
 * when many votes share them. We want to fall through to the bill title in
 * those cases.
 */
function isSpecificQuestion(q: string): boolean {
  const generic = [
    /^on passage$/i,
    /^on the motion$/i,
    /^on agreeing to/i,
    /^on the amendment$/i,
    /^on the concurrent resolution$/i,
    /^on cloture/i,
  ];
  const trimmed = q.trim();
  if (trimmed.length < 10) return false;
  return !generic.some((re) => re.test(trimmed));
}

/**
 * Build the canonical vote URL path from the identifiers.
 * Format: /vote/{congress}/{chamber}/{roll}-{slug}
 *
 * Matches the parser `parseVoteUrl` below.
 */
export function buildVoteUrl(params: {
  congress: number | string;
  chamber: string;
  roll_number: number | string;
  slug: string;
}): string {
  const chamber = params.chamber.toLowerCase();
  return `/vote/${params.congress}/${chamber}/${params.roll_number}-${params.slug}`;
}

export interface ParsedVoteUrl {
  congress: number;
  chamber: 'house' | 'senate';
  roll_number: number;
  slug: string;
}

/**
 * Parse a vote URL back into its components.
 * Returns null if the URL doesn't match the expected shape.
 */
export function parseVoteUrl(path: string): ParsedVoteUrl | null {
  const match = path.match(
    /^\/vote\/(\d+)\/(house|senate)\/(\d+)-(.+)$/,
  );
  if (!match) return null;

  const [, congress, chamber, rollNumber, slug] = match;
  return {
    congress: parseInt(congress, 10),
    chamber: chamber as 'house' | 'senate',
    roll_number: parseInt(rollNumber, 10),
    slug,
  };
}
