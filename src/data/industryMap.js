/**
 * Industry classification for FEC campaign finance data.
 *
 * Maps employer names to industry sectors via keyword matching.
 * Handles messy FEC employer data (RETIRED, SELF-EMPLOYED, etc.).
 *
 * DATA FLOW:
 *   FEC donor.employer → classifyIndustry() → sector string
 *   donors[] → getIndustryBreakdown() → [{industry, totalAmount, donorCount, percentage}]
 *   sector → INDUSTRY_TO_POLICY[sector] → Congress.gov policy_area values
 */

// Special employer values that appear frequently in FEC data
const SPECIAL_EMPLOYERS = {
  'Retired': [
    'retired', 'retired person', 'retiree', 'homemaker', 'home maker',
    'not employed - retired',
  ],
  'Self-Employed': [
    'self-employed', 'self employed', 'self', 'sole proprietor',
    'owner', 'freelance', 'consultant',
  ],
  'Not Disclosed': [
    'not employed', 'none', 'n/a', 'na', 'information requested',
    'information requested per best efforts', 'refused', 'unknown',
    'not available', '',
  ],
}

// Industry keywords — checked in order, first match wins
export const INDUSTRY_MAP = {
  'Healthcare': [
    'pfizer', 'johnson & johnson', 'unitedhealth', 'cigna', 'anthem',
    'merck', 'abbvie', 'eli lilly', 'amgen', 'bristol-myers',
    'hospital', 'medical', 'pharma', 'health', 'clinic', 'physician',
    'nurse', 'dental', 'biotech', 'therapeutics',
  ],
  'Finance': [
    'jpmorgan', 'goldman sachs', 'morgan stanley', 'bank of america',
    'citigroup', 'wells fargo', 'blackrock', 'fidelity', 'charles schwab',
    'investment', 'hedge fund', 'private equity', 'banking', 'financial',
    'insurance', 'capital management', 'asset management',
  ],
  'Technology': [
    'google', 'alphabet', 'apple', 'microsoft', 'amazon', 'meta',
    'oracle', 'salesforce', 'adobe', 'nvidia', 'intel',
    'software', 'tech', 'computing', 'data', 'cyber', 'ai ',
    'artificial intelligence', 'startup',
  ],
  'Energy': [
    'exxon', 'chevron', 'conocophillips', 'shell', 'bp ',
    'halliburton', 'schlumberger',
    'oil', 'gas', 'petroleum', 'energy', 'mining', 'coal',
    'solar', 'wind power', 'renewable',
  ],
  'Defense': [
    'lockheed', 'raytheon', 'boeing', 'northrop', 'general dynamics',
    'l3harris', 'bae systems', 'leidos',
    'defense', 'military', 'aerospace', 'weapons',
  ],
  'Real Estate': [
    'real estate', 'property', 'realty', 'housing', 'construction',
    'developer', 'building', 'architecture', 'mortgage',
  ],
  'Legal': [
    'law firm', 'attorney', 'legal', 'llp', 'counsel', 'lawyer',
    'law office', 'pllc',
  ],
  'Education': [
    'university', 'college', 'school', 'education', 'professor',
    'teacher', 'academic', 'research',
  ],
  'Retail': [
    'walmart', 'target', 'costco', 'home depot', 'kroger',
    'retail', 'store', 'restaurant', 'food service', 'hospitality',
  ],
  'Telecom & Media': [
    'at&t', 'verizon', 'comcast', 't-mobile', 'disney', 'netflix',
    'telecom', 'media', 'broadcast', 'entertainment', 'publishing',
  ],
  'Agriculture': [
    'farm', 'ranch', 'agriculture', 'crop', 'livestock', 'dairy',
    'cargill', 'archer daniels', 'deere',
  ],
  'Transportation': [
    'airline', 'railroad', 'trucking', 'shipping', 'logistics',
    'fedex', 'ups', 'united airlines', 'delta air',
  ],
}

/**
 * Maps industry sectors to Congress.gov policy_area values
 * for money-votes correlation.
 */
export const INDUSTRY_TO_POLICY = {
  'Healthcare': ['Health'],
  'Finance': ['Finance and Financial Sector', 'Economics and Public Finance'],
  'Technology': ['Science, Technology, Communications'],
  'Energy': ['Energy', 'Environmental Protection'],
  'Defense': ['Armed Forces and National Security'],
  'Real Estate': ['Housing and Community Development'],
  'Legal': ['Law', 'Crime and Law Enforcement'],
  'Education': ['Education'],
  'Retail': ['Commerce', 'Labor and Employment'],
  'Telecom & Media': ['Science, Technology, Communications'],
  'Agriculture': ['Agriculture and Food'],
  'Transportation': ['Transportation and Public Works'],
}

/**
 * Classify a donor's employer/occupation into an industry sector.
 *
 * Priority:
 *   1. Special categories (Retired, Self-Employed, Not Disclosed)
 *   2. Exact company name match against INDUSTRY_MAP
 *   3. Keyword substring match (first matching sector wins)
 *   4. Default to "Other"
 */
export function classifyIndustry(employer, occupation = '') {
  if (!employer && !occupation) return 'Not Disclosed'

  const emp = (employer || '').toLowerCase().trim()
  const occ = (occupation || '').toLowerCase().trim()

  // Check special categories first
  for (const [category, keywords] of Object.entries(SPECIAL_EMPLOYERS)) {
    if (keywords.some(kw => emp === kw || (kw && emp.includes(kw)))) {
      return category
    }
  }

  // Check industry keywords against employer and occupation
  const searchText = `${emp} ${occ}`
  for (const [industry, keywords] of Object.entries(INDUSTRY_MAP)) {
    if (keywords.some(kw => searchText.includes(kw))) {
      return industry
    }
  }

  return 'Other'
}

/**
 * Aggregate donors by industry sector.
 * Returns sorted array with percentages.
 */
export function getIndustryBreakdown(donors) {
  if (!donors || donors.length === 0) return []

  const sectors = {}

  for (const donor of donors) {
    const industry = classifyIndustry(donor.employer || donor.name, donor.occupation)
    if (!sectors[industry]) {
      sectors[industry] = { industry, totalAmount: 0, donorCount: 0 }
    }
    sectors[industry].totalAmount += Math.abs(donor.totalAmount || donor.amount || 0)
    sectors[industry].donorCount += 1
  }

  const total = Object.values(sectors).reduce((sum, s) => sum + s.totalAmount, 0)

  return Object.values(sectors)
    .map(s => ({
      ...s,
      percentage: total > 0 ? Math.round((s.totalAmount / total) * 100) : 0,
    }))
    .sort((a, b) => b.totalAmount - a.totalAmount)
}

/**
 * Format a number as USD currency.
 */
export function formatCurrency(amount) {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`
  return `$${Math.round(amount)}`
}
