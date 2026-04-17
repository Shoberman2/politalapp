/**
 * Voting Pattern Analysis — Pure Compute Module
 *
 * DATA FLOW:
 *   getMemberDashboardData → votes (with bills + roll_call_stats joined)
 *   getMoneyVotesCorrelation → per-industry yea% correlations
 *   donorIndustries (getIndustryBreakdown) → top-5 donor industries
 *   districtLean2024 / stateLean2024 → district partisan lean
 *   caucusOverrides → independents' effective party
 *     │
 *     ▼
 *   computePatternMatchScore  — 0-100% headline
 *   computePartyCrossover     — % + crossover count + top policy areas
 *   computeDistrictMismatch   — count of votes vs district lean
 *   computeMoneyAligned       — thin adapter for existing correlations
 *     │
 *     ▼
 *   rankNotableVotes — 6 typical + 6 atypical, deterministic sort
 */

import { CAUCUS_OVERRIDES } from '../data/caucusOverrides.js'
import { getDistrictLean } from '../data/districtLean2024.js'
import { getStateLean } from '../data/stateLean2024.js'
import { INDUSTRY_TO_POLICY } from '../data/industryMap.js'

export const VPA_SCHEMA_VERSION = '1.0'

// Classifier weights
const W_PARTY = 0.60
const W_DONOR = 0.25
const W_DISTRICT = 0.15

const MIN_VOTES_FOR_ANALYSIS = 50
const MIN_INDUSTRY_VOTES = 10
const NOTABLE_TYPICAL_COUNT = 6
const NOTABLE_ATYPICAL_COUNT = 6
const TOP_DONOR_INDUSTRIES = 5

/**
 * Return the party a politician effectively votes with (D, R, or I).
 * Caucusing independents are remapped to their caucus party.
 */
export function effectivePartyCode(bioguideId, partyCode) {
  if (CAUCUS_OVERRIDES[bioguideId]) return CAUCUS_OVERRIDES[bioguideId]
  if (!partyCode) return null
  const p = partyCode.toUpperCase()
  if (p.startsWith('D')) return 'D'
  if (p.startsWith('R')) return 'R'
  return 'I'
}

/**
 * Return party majority direction on a roll call for a given party.
 * @param {object|null} stats - roll_call_stats row with dem_yea/dem_nay/etc.
 * @param {'D'|'R'|'I'} effParty
 * @returns {0|1|null} 1 = party majority Yea, 0 = majority Nay, null = unknown
 */
export function partyMajorityDirection(stats, effParty) {
  if (!stats || !effParty) return null
  const yea = effParty === 'D' ? stats.dem_yea : effParty === 'R' ? stats.rep_yea : stats.ind_yea
  const nay = effParty === 'D' ? stats.dem_nay : effParty === 'R' ? stats.rep_nay : stats.ind_nay
  if ((yea ?? 0) + (nay ?? 0) === 0) return null
  return yea > nay ? 1 : 0
}

/**
 * Donor-industry signal for a single vote.
 * Returns 1 if bill's policy area maps to a top-donor industry and the rep
 * historically votes Yea on that industry's bills, 0 if historically Nay,
 * null if no industry match or insufficient correlation data.
 */
function donorSignal(bill, topDonorIndustries, correlations) {
  if (!bill?.policy_area) return null
  if (!topDonorIndustries?.length) return null
  const top = topDonorIndustries.slice(0, TOP_DONOR_INDUSTRIES).map(i => i.industry)
  for (const industry of top) {
    const policies = INDUSTRY_TO_POLICY[industry]
    if (!policies?.includes(bill.policy_area)) continue
    const corr = correlations?.find(c => c.industry === industry)
    if (!corr || corr.billsVotedOn < 3) return null
    return corr.yeaPercent >= 50 ? 1 : 0
  }
  return null
}

/**
 * District-lean signal for a single vote.
 * The district signal predicts "party-line vote" when the district leans the
 * rep's party, and predicts "against-party" when the district leans opposite.
 * Requires the party signal to compose with, so returns the predicted Yea/Nay
 * given party majority direction.
 *
 * @param {{harrisMargin:number,trumpMargin:number}|null} lean
 * @param {'D'|'R'|'I'} effParty
 * @param {0|1} partyDirection - 1 if party majority Yea, 0 if Nay
 */
function districtSignal(lean, effParty, partyDirection) {
  if (!lean || partyDirection === null) return null
  const districtDem = lean.harrisMargin > lean.trumpMargin
  const partyAligned = (effParty === 'D' && districtDem) || (effParty === 'R' && !districtDem)
  // Aligned district: district predicts same as party direction.
  // Misaligned district: district predicts opposite of party direction.
  return partyAligned ? partyDirection : (partyDirection === 1 ? 0 : 1)
}

/**
 * Renormalize signal weights based on which signals are present.
 */
function renormalize(hasParty, hasDonor, hasDistrict) {
  let wParty = hasParty ? W_PARTY : 0
  let wDonor = hasDonor ? W_DONOR : 0
  let wDistrict = hasDistrict ? W_DISTRICT : 0
  const sum = wParty + wDonor + wDistrict
  if (sum === 0) return { wParty: 0, wDonor: 0, wDistrict: 0 }
  return { wParty: wParty / sum, wDonor: wDonor / sum, wDistrict: wDistrict / sum }
}

/**
 * Convert vote position to numeric.
 * @returns {1|0|null} 1 = Yea, 0 = Nay, null = Present/Not Voting (skip)
 */
function positionToNumeric(position) {
  if (position === 'Yea' || position === 'Yes') return 1
  if (position === 'Nay' || position === 'No') return 0
  return null
}

/**
 * Compute the Pattern Match score (0-100) for a politician.
 *
 * @param {object} args
 * @param {string} args.bioguideId
 * @param {string} args.partyCode
 * @param {string|null} args.state
 * @param {string|null} args.district
 * @param {Array} args.votes - joined vote+bill+roll_call_stats rows
 * @param {Array} args.topDonorIndustries - from getIndustryBreakdown()
 * @param {Array} args.correlations - from getMoneyVotesCorrelation()
 * @returns {{score:number|null, totalVotes:number, matched:number, signalCoverage:object}}
 */
export function computePatternMatchScore({
  bioguideId,
  partyCode,
  state,
  district,
  votes,
  topDonorIndustries,
  correlations,
}) {
  if (!votes || votes.length < MIN_VOTES_FOR_ANALYSIS) {
    return { score: null, totalVotes: votes?.length ?? 0, matched: 0, signalCoverage: {} }
  }
  const effParty = effectivePartyCode(bioguideId, partyCode)
  const lean = district ? getDistrictLean(state, district) : getStateLean(state)

  let matched = 0
  let usable = 0
  let partyHits = 0
  let donorHits = 0
  let districtHits = 0

  for (const v of votes) {
    const actual = positionToNumeric(v.position)
    if (actual === null) continue // skip Present / Not Voting

    const stats = v.roll_call_stats ?? null
    const bill = v.bill ?? null

    const pDir = partyMajorityDirection(stats, effParty)
    const dSig = donorSignal(bill, topDonorIndustries, correlations)
    const ddSig = pDir !== null ? districtSignal(lean, effParty, pDir) : null

    const hasParty = pDir !== null
    const hasDonor = dSig !== null
    const hasDistrict = ddSig !== null

    if (!hasParty && !hasDonor && !hasDistrict) continue

    if (hasParty) partyHits++
    if (hasDonor) donorHits++
    if (hasDistrict) districtHits++

    const { wParty, wDonor, wDistrict } = renormalize(hasParty, hasDonor, hasDistrict)
    const weighted =
      (hasParty ? wParty * pDir : 0) +
      (hasDonor ? wDonor * dSig : 0) +
      (hasDistrict ? wDistrict * ddSig : 0)
    const predicted = weighted >= 0.5 ? 1 : 0
    if (predicted === actual) matched++
    usable++
  }

  const score = usable === 0 ? null : Math.round((matched / usable) * 100)
  return {
    score,
    totalVotes: votes.length,
    matched,
    signalCoverage: { party: partyHits, donor: donorHits, district: districtHits, usable },
  }
}

/**
 * Party crossover: percent of substantive votes where the rep voted against
 * their effective party's majority.
 */
export function computePartyCrossover({ bioguideId, partyCode, votes }) {
  const effParty = effectivePartyCode(bioguideId, partyCode)
  if (!votes?.length) {
    return { crossoverRate: 0, crossoverCount: 0, substantiveCount: 0, topPolicyAreas: [] }
  }

  let crossovers = 0
  let substantive = 0
  const policyCrosses = {}
  const policyTotals = {}

  for (const v of votes) {
    const actual = positionToNumeric(v.position)
    if (actual === null) continue
    const pDir = partyMajorityDirection(v.roll_call_stats, effParty)
    if (pDir === null) continue
    substantive++
    const policy = v.bill?.policy_area
    if (policy) policyTotals[policy] = (policyTotals[policy] || 0) + 1
    if (actual !== pDir) {
      crossovers++
      if (policy) policyCrosses[policy] = (policyCrosses[policy] || 0) + 1
    }
  }

  const topPolicyAreas = Object.keys(policyCrosses)
    .map(area => ({
      area,
      crossCount: policyCrosses[area],
      total: policyTotals[area],
      crossPct: Math.round((policyCrosses[area] / policyTotals[area]) * 100),
    }))
    .filter(p => p.total >= 3)
    .sort((a, b) => b.crossPct - a.crossPct || b.crossCount - a.crossCount)
    .slice(0, 3)

  return {
    crossoverRate: substantive === 0 ? 0 : Math.round((crossovers / substantive) * 100),
    crossoverCount: crossovers,
    substantiveCount: substantive,
    topPolicyAreas,
  }
}

/**
 * District-lean mismatch: votes where the rep voted against the direction
 * predicted by their district's 2024 presidential lean.
 * Returns count and rate; UI renders "not available" if lean is missing.
 */
export function computeDistrictMismatch({ bioguideId, partyCode, state, district, votes }) {
  const effParty = effectivePartyCode(bioguideId, partyCode)
  const lean = district ? getDistrictLean(state, district) : getStateLean(state)
  if (!lean || !votes?.length) {
    return { mismatchRate: null, mismatchCount: 0, substantiveCount: 0, available: false }
  }

  let mismatches = 0
  let substantive = 0

  for (const v of votes) {
    const actual = positionToNumeric(v.position)
    if (actual === null) continue
    const pDir = partyMajorityDirection(v.roll_call_stats, effParty)
    if (pDir === null) continue
    const dSig = districtSignal(lean, effParty, pDir)
    if (dSig === null) continue
    substantive++
    if (actual !== dSig) mismatches++
  }

  return {
    mismatchRate: substantive === 0 ? 0 : Math.round((mismatches / substantive) * 100),
    mismatchCount: mismatches,
    substantiveCount: substantive,
    available: true,
  }
}

/**
 * Money-aligned votes: reuses existing per-industry correlations.
 * Returns single aggregated percentage across all top-5 donor industries.
 */
export function computeMoneyAligned({ topDonorIndustries, correlations }) {
  if (!correlations?.length || !topDonorIndustries?.length) {
    return { alignmentRate: null, alignedCount: 0, industryVotes: 0, available: false }
  }
  const top5 = topDonorIndustries.slice(0, TOP_DONOR_INDUSTRIES).map(i => i.industry)
  const relevant = correlations.filter(c => top5.includes(c.industry))
  const industryVotes = relevant.reduce((sum, c) => sum + c.billsVotedOn, 0)
  if (industryVotes < MIN_INDUSTRY_VOTES) {
    return { alignmentRate: null, alignedCount: 0, industryVotes, available: false }
  }
  const alignedCount = relevant.reduce(
    (sum, c) => sum + (c.yeaPercent >= 50 ? c.yeaCount : c.nayCount),
    0,
  )
  return {
    alignmentRate: Math.round((alignedCount / industryVotes) * 100),
    alignedCount,
    industryVotes,
    available: true,
  }
}

/**
 * Compute vote margin (absolute difference of yea vs nay across all parties).
 */
function voteMargin(stats) {
  if (!stats) return Number.POSITIVE_INFINITY // unknown margin = least notable
  const yea = (stats.dem_yea ?? 0) + (stats.rep_yea ?? 0) + (stats.ind_yea ?? 0)
  const nay = (stats.dem_nay ?? 0) + (stats.rep_nay ?? 0) + (stats.ind_nay ?? 0)
  return Math.abs(yea - nay)
}

/**
 * Annotate a vote with: whether actual matched predicted (for "typical"),
 * whether it crossed party (for "exceptions"), its margin, and its date.
 */
function annotateVote(v, bioguideId, partyCode) {
  const effParty = effectivePartyCode(bioguideId, partyCode)
  const actual = positionToNumeric(v.position)
  const pDir = partyMajorityDirection(v.roll_call_stats, effParty)
  const crossedParty = actual !== null && pDir !== null && actual !== pDir
  return {
    vote: v,
    actual,
    pDir,
    crossedParty,
    margin: voteMargin(v.roll_call_stats),
    date: v.voted_at ? new Date(v.voted_at).getTime() : 0,
    substantive: actual !== null && pDir !== null,
  }
}

/**
 * Rank notable votes: 6 typical + 6 atypical.
 * Typical: voted WITH party majority, ranked by closest vote margin (most
 *          notable agreements — close calls where rep held the line).
 * Atypical: crossed party, ranked by closest margin + most recent.
 * Both lists are deterministic and user-visible via methodology modal.
 *
 * @returns {{typical: Array<{vote}>, atypical: Array<{vote}>}}
 */
export function rankNotableVotes({ bioguideId, partyCode, votes }) {
  if (!votes?.length) return { typical: [], atypical: [] }
  const annotated = votes.map(v => annotateVote(v, bioguideId, partyCode)).filter(a => a.substantive)

  const typicalCandidates = annotated.filter(a => !a.crossedParty)
  const atypicalCandidates = annotated.filter(a => a.crossedParty)

  // Sort key: margin ASC, then date DESC (recent wins on tie)
  const sortKey = (a, b) => a.margin - b.margin || b.date - a.date

  const typical = typicalCandidates.sort(sortKey).slice(0, NOTABLE_TYPICAL_COUNT).map(a => a.vote)
  const atypical = atypicalCandidates.sort(sortKey).slice(0, NOTABLE_ATYPICAL_COUNT).map(a => a.vote)

  return { typical, atypical }
}
