/**
 * Transform Module - Data Normalization
 *
 * Transforms raw Congress.gov API data into our Supabase schema format.
 * This module ensures:
 * - Consistent IDs (BioGuide for politicians, deterministic for bills)
 * - Normalized vote positions
 * - Proper deduplication
 * - Source URL preservation for transparency
 *
 * CRITICAL: This module NEVER invents or infers vote data.
 * All data comes directly from the extract phase.
 */

import type {
  Politician,
  Bill,
  Vote,
  RollCall,
  ExtractedVoteData,
  TransformedData,
  CongressVoteDetail,
  CongressMemberVote,
  ETLConfig,
} from './types.js';

import {
  normalizeVotePosition,
  generateBillId,
  isValidBioguideId,
  isValidStateCode,
  getCongressionalPhotoUrl,
  getBillSourceUrl,
  getVoteSourceUrl,
  getSessionNumber,
  formatRollCallId,
  logger,
} from './utils.js';

// =============================================================================
// MAIN TRANSFORM FUNCTION
// =============================================================================

/**
 * Transforms extracted vote data into the target schema.
 *
 * Returns Maps for politicians and bills (for deduplication) and an array of votes.
 */
export function transformVoteData(
  extractedData: ExtractedVoteData[],
  config: ETLConfig
): TransformedData {
  const politicians = new Map<string, Politician>();
  const bills = new Map<string, Bill>();
  const rollCalls = new Map<string, RollCall>();
  const votes: Vote[] = [];
  const seenVotes = new Set<string>(); // For vote deduplication

  let skippedVotes = 0;
  let processedVotes = 0;

  for (const extracted of extractedData) {
    const { vote: voteDetail, memberVotes } = extracted;

    // Transform bill if present
    let billId: string | null = null;
    if (voteDetail.bill) {
      const bill = transformBill(voteDetail.bill, voteDetail.congress);
      if (bill) {
        bills.set(bill.id, bill);
        billId = bill.id;
      }
    }

    // Build the roll call record (one per vote event, not per member).
    // question + description are extracted from Congress.gov but historically
    // dropped on load; this populates the roll_calls table.
    const rollCall = transformRollCall(voteDetail, billId);
    if (rollCall) {
      // If we've seen this roll call before in the same batch, prefer the
      // version with non-null question/description.
      const existing = rollCalls.get(rollCall.id);
      if (!existing || (rollCall.question && !existing.question)) {
        rollCalls.set(rollCall.id, rollCall);
      }
    }

    // Transform each member vote
    for (const memberVote of memberVotes) {
      try {
        // Transform politician
        const politician = transformPolitician(memberVote, voteDetail.chamber);
        if (!politician) {
          skippedVotes++;
          continue;
        }
        politicians.set(politician.id, politician);

        // Transform vote
        const vote = transformVote(
          voteDetail,
          memberVote,
          billId
        );

        if (!vote) {
          skippedVotes++;
          continue;
        }

        // Deduplicate on the same key the database uses:
        // UNIQUE(roll_call_id, politician_id). The key used to be
        // politician + bill + date, which omits the roll call entirely — so
        // every bill-less roll call a member voted on in one day (nominations,
        // procedural motions, en bloc confirmations) collapsed to a single
        // key and all but the first was discarded here. On 2025-12-18 that
        // silently threw away four of five Senate roll calls' member votes,
        // and because this logs at debug level nothing surfaced.
        const voteKey = voteDedupeKey(vote);
        if (seenVotes.has(voteKey)) {
          logger.debug(`Skipping duplicate vote: ${voteKey}`);
          continue;
        }
        seenVotes.add(voteKey);

        votes.push(vote);
        processedVotes++;
      } catch (error) {
        logger.error(`Failed to transform vote for ${memberVote.member.name}`, error);
        skippedVotes++;
      }
    }
  }

  logger.info(
    `Transform complete: ${processedVotes} votes processed, ${skippedVotes} skipped`
  );
  logger.info(
    `Unique records: ${politicians.size} politicians, ${bills.size} bills, ${rollCalls.size} roll calls`
  );

  return { politicians, bills, rollCalls, votes };
}

// =============================================================================
// INDIVIDUAL TRANSFORM FUNCTIONS
// =============================================================================

/**
 * Transforms a member vote record into a Politician record.
 */
function transformPolitician(
  memberVote: CongressMemberVote,
  chamber: string
): Politician | null {
  const { member } = memberVote;

  // Validate BioGuide ID
  if (!member.bioguideId || !isValidBioguideId(member.bioguideId)) {
    logger.warn(`Invalid BioGuide ID: ${member.bioguideId} for ${member.name}`);
    return null;
  }

  // Validate state
  if (!member.state || !isValidStateCode(member.state)) {
    logger.warn(`Invalid state: ${member.state} for ${member.name}`);
    return null;
  }

  // Normalize chamber
  const normalizedChamber = normalizeChamber(chamber);
  if (!normalizedChamber) {
    logger.warn(`Invalid chamber: ${chamber} for ${member.name}`);
    return null;
  }

  // Normalize party
  const party = normalizeParty(member.party);

  // Get district (null for senators)
  const district =
    normalizedChamber === 'house' && member.district !== undefined
      ? String(member.district)
      : null;

  return {
    id: member.bioguideId,
    name: member.name,
    chamber: normalizedChamber,
    state: member.state.toUpperCase(),
    district,
    party,
    photo_url: getCongressionalPhotoUrl(member.bioguideId),
  };
}

/**
 * Transforms bill data from a vote record into a Bill record.
 */
function transformBill(
  billData: CongressVoteDetail['bill'],
  congress: number
): Bill | null {
  if (!billData) return null;

  const { type, number, title } = billData;

  // Generate stable bill ID
  const billId = generateBillId(congress, type, number);

  // Construct source URL
  const sourceUrl = getBillSourceUrl(congress, type, number);

  return {
    id: billId,
    title: title || `${type.toUpperCase()} ${number}`,
    introduced_at: new Date().toISOString().split('T')[0], // Will be enriched later
    summary: null, // Will be populated by AI enrichment
    crs_summary: null, // Will be populated by fetchCRS
    policy_area: null, // Will be populated by fetchCRS
    source_url: sourceUrl,
  };
}

/**
 * Identity of a single member's vote, matching the database's own
 * UNIQUE(roll_call_id, politician_id) constraint. roll_call_id is always set
 * by transformVote; the bill/date fallback only guards hand-built records.
 */
function voteDedupeKey(vote: Vote): string {
  return vote.roll_call_id
    ? `${vote.roll_call_id}-${vote.politician_id}`
    : `${vote.politician_id}-${vote.bill_id}-${vote.voted_at}`;
}

/**
 * Transforms a member vote into a Vote record.
 */
function transformVote(
  voteDetail: CongressVoteDetail,
  memberVote: CongressMemberVote,
  billId: string | null
): Vote | null {
  // Validate required fields
  if (!memberVote.member.bioguideId) {
    return null;
  }

  if (!voteDetail.date) {
    logger.warn(`Missing vote date for roll call ${voteDetail.rollNumber}`);
    return null;
  }

  // Normalize vote position
  const position = normalizeVotePosition(memberVote.votePosition);

  // Parse vote date as YYYY-MM-DD. Extract the year from the string directly
  // to avoid timezone drift: `new Date("2025-01-01").getFullYear()` returns
  // 2024 in negative-UTC-offset zones, which would shift the session number.
  const votedAt = voteDetail.date.split('T')[0];
  const yearStr = votedAt.split('-')[0];
  const year = parseInt(yearStr, 10);
  if (!Number.isFinite(year)) {
    logger.warn(`Unparseable vote date for roll ${voteDetail.rollNumber}: ${voteDetail.date}`);
    return null;
  }
  const session = getSessionNumber(year);

  // Construct source URL — chamber must be normalized for both the URL and
  // the roll_call_id. Synthetic "unknown" ids would collide across roll calls
  // from different chambers that happened to share a roll number.
  const chamber = normalizeChamber(voteDetail.chamber);
  if (!chamber) {
    logger.warn(`Skipping vote with unparseable chamber: ${voteDetail.chamber}`);
    return null;
  }
  const sourceUrl = getVoteSourceUrl(chamber, voteDetail.congress, session, voteDetail.rollNumber);
  const rollCallId = formatRollCallId(chamber, voteDetail.congress, session, voteDetail.rollNumber);

  return {
    politician_id: memberVote.member.bioguideId,
    bill_id: billId,
    roll_call_id: rollCallId,
    position,
    voted_at: votedAt,
    source_url: sourceUrl,
  };
}

/**
 * Builds a RollCall record (one per unique vote event).
 *
 * Uses the same formatRollCallId() the votes loop uses, so every vote row
 * with this roll_call_id will join cleanly to this roll_calls row.
 *
 * Returns null when the source data is incomplete enough that we'd produce
 * a colliding synthetic id (missing chamber) or unparseable session (bad
 * date string). Better to skip than to silently merge unrelated roll calls.
 */
function transformRollCall(
  voteDetail: CongressVoteDetail,
  billId: string | null
): RollCall | null {
  if (!voteDetail.date) return null;

  const chamber = normalizeChamber(voteDetail.chamber);
  if (!chamber) return null;

  const votedAt = voteDetail.date.split('T')[0];
  const yearStr = votedAt.split('-')[0];
  const year = parseInt(yearStr, 10);
  if (!Number.isFinite(year)) return null;

  const session = getSessionNumber(year);
  const id = formatRollCallId(chamber, voteDetail.congress, session, voteDetail.rollNumber);

  // Cap upstream text at 4000 chars. Congress.gov has historically returned
  // multi-KB description blobs; uncapped storage inflates row size and slows
  // dashboard reads. 4000 chars covers every reasonable question + description
  // and rejects malformed responses.
  const truncate = (s: string | undefined): string | null => {
    if (!s) return null;
    const trimmed = s.trim();
    if (!trimmed) return null;
    return trimmed.length > 4000 ? trimmed.slice(0, 4000) : trimmed;
  };

  return {
    id,
    bill_id: billId,
    question: truncate(voteDetail.question),
    description: truncate(voteDetail.description),
    // Already derived above for the id's session; persist it so consumers can
    // order by when the vote happened rather than when we ingested it.
    voted_at: votedAt,
  };
}

// =============================================================================
// NORMALIZATION HELPERS
// =============================================================================

/**
 * Normalizes chamber names to our schema values.
 */
function normalizeChamber(rawChamber: string): 'house' | 'senate' | null {
  const normalized = rawChamber.toLowerCase().trim();

  if (normalized === 'house' || normalized === 'h' || normalized === 'house of representatives') {
    return 'house';
  }

  if (normalized === 'senate' || normalized === 's') {
    return 'senate';
  }

  return null;
}

/**
 * Normalizes party names to consistent values.
 */
function normalizeParty(rawParty: string): string {
  const normalized = rawParty.toLowerCase().trim();

  const partyMap: Record<string, string> = {
    d: 'Democrat',
    democrat: 'Democrat',
    democratic: 'Democrat',
    r: 'Republican',
    republican: 'Republican',
    i: 'Independent',
    independent: 'Independent',
    id: 'Independent', // Independent Democrat
    l: 'Libertarian',
    libertarian: 'Libertarian',
  };

  return partyMap[normalized] || rawParty;
}

// =============================================================================
// BATCH PROCESSING
// =============================================================================

/**
 * Merges transformed data from multiple batches, handling deduplication.
 */
export function mergeTransformedData(
  batches: TransformedData[]
): TransformedData {
  const politicians = new Map<string, Politician>();
  const bills = new Map<string, Bill>();
  const rollCalls = new Map<string, RollCall>();
  const votes: Vote[] = [];
  const seenVotes = new Set<string>();

  for (const batch of batches) {
    // Merge politicians (later data overwrites earlier)
    for (const [id, politician] of batch.politicians) {
      politicians.set(id, politician);
    }

    // Merge bills (later data overwrites earlier)
    for (const [id, bill] of batch.bills) {
      // Preserve existing summary if present
      const existing = bills.get(id);
      if (existing?.summary && !bill.summary) {
        bill.summary = existing.summary;
      }
      bills.set(id, bill);
    }

    // Merge roll calls. Prefer the row with non-null question/description.
    for (const [id, rollCall] of batch.rollCalls) {
      const existing = rollCalls.get(id);
      if (!existing || (rollCall.question && !existing.question)) {
        rollCalls.set(id, rollCall);
      }
    }

    // Merge votes with deduplication (same key as the per-batch pass above).
    for (const vote of batch.votes) {
      const voteKey = voteDedupeKey(vote);
      if (!seenVotes.has(voteKey)) {
        seenVotes.add(voteKey);
        votes.push(vote);
      }
    }
  }

  return { politicians, bills, rollCalls, votes };
}

/**
 * Validates transformed data before loading.
 *
 * Returns an array of validation errors (empty if valid).
 */
export function validateTransformedData(data: TransformedData): string[] {
  const errors: string[] = [];

  // Validate politicians
  for (const [id, politician] of data.politicians) {
    if (!isValidBioguideId(id)) {
      errors.push(`Invalid politician ID: ${id}`);
    }
    if (!politician.name) {
      errors.push(`Missing name for politician: ${id}`);
    }
    if (!politician.chamber) {
      errors.push(`Missing chamber for politician: ${id}`);
    }
    if (!isValidStateCode(politician.state)) {
      errors.push(`Invalid state for politician ${id}: ${politician.state}`);
    }
  }

  // Validate bills
  for (const [id, bill] of data.bills) {
    if (!id) {
      errors.push('Bill with empty ID found');
    }
    if (!bill.title) {
      errors.push(`Missing title for bill: ${id}`);
    }
    if (!bill.source_url) {
      errors.push(`Missing source URL for bill: ${id}`);
    }
  }

  // Validate roll calls
  for (const [id, rollCall] of data.rollCalls) {
    if (!id) {
      errors.push('Roll call with empty id');
    }
    if (rollCall.bill_id && !data.bills.has(rollCall.bill_id)) {
      errors.push(`Roll call ${id} references unknown bill: ${rollCall.bill_id}`);
    }
  }

  // Validate votes
  for (const vote of data.votes) {
    if (!vote.politician_id) {
      errors.push('Vote with missing politician_id');
    }
    if (!data.politicians.has(vote.politician_id)) {
      errors.push(`Vote references unknown politician: ${vote.politician_id}`);
    }
    if (vote.bill_id && !data.bills.has(vote.bill_id)) {
      errors.push(`Vote references unknown bill: ${vote.bill_id}`);
    }
    if (!vote.source_url) {
      errors.push(`Vote missing source URL for politician ${vote.politician_id}`);
    }
    if (!['Yea', 'Nay', 'Present', 'Not Voting'].includes(vote.position)) {
      errors.push(`Invalid vote position: ${vote.position}`);
    }
  }

  return errors;
}

/**
 * Generates statistics about transformed data for logging.
 */
export function getTransformStats(data: TransformedData): Record<string, unknown> {
  const votesByPosition = {
    Yea: 0,
    Nay: 0,
    Present: 0,
    'Not Voting': 0,
  };

  for (const vote of data.votes) {
    votesByPosition[vote.position]++;
  }

  const politiciansByChamber = {
    house: 0,
    senate: 0,
  };

  for (const politician of data.politicians.values()) {
    politiciansByChamber[politician.chamber]++;
  }

  const politiciansByParty: Record<string, number> = {};
  for (const politician of data.politicians.values()) {
    politiciansByParty[politician.party] = (politiciansByParty[politician.party] || 0) + 1;
  }

  return {
    totalPoliticians: data.politicians.size,
    totalBills: data.bills.size,
    totalVotes: data.votes.length,
    votesByPosition,
    politiciansByChamber,
    politiciansByParty,
  };
}
