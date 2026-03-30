/**
 * Extract Module - Congress.gov API Data Fetching
 *
 * Fetches roll call votes from the House and Senate using the official
 * Congress.gov API v3. This module is the ONLY source of truth for vote data.
 *
 * API Documentation: https://api.congress.gov/
 *
 * Key Endpoints (updated format as of 2025):
 * - GET /v3/house-vote/{congress} - List House roll call votes
 * - GET /v3/senate-vote/{congress} - List Senate roll call votes
 * - GET /v3/house-vote/{congress}/{session}/{rollNumber} - House vote details
 * - GET /v3/senate-vote/{congress}/{session}/{rollNumber} - Senate vote details
 * - GET /v3/house-vote/{congress}/{session}/{rollNumber}/members - Member positions
 * - GET /v3/senate-vote/{congress}/{session}/{rollNumber}/members - Member positions
 * - GET /v3/member - Member information
 * - GET /v3/bill/{congress}/{type}/{number} - Bill details
 */

import type {
  ExtractedVoteData,
  CongressVoteDetail,
  CongressMemberVote,
  CongressBill,
  ETLConfig,
} from './types.js';

import {
  fetchCongressApi,
  getDateRange,
  logger,
  retry,
  sleep,
} from './utils.js';

// =============================================================================
// API RESPONSE INTERFACES (Internal to this module)
// =============================================================================

// New API response shapes (as of 2025)
interface HouseVoteListItem {
  congress: number;
  rollCallNumber: number;
  sessionNumber: number;
  startDate: string;
  updateDate: string;
  result: string;
  voteType: string;
  voteQuestion?: string;
  legislationType?: string;
  legislationNumber?: string;
  legislationUrl?: string;
  url: string;
}

interface SenateVoteListItem {
  congress: number;
  rollCallNumber: number;
  sessionNumber: number;
  voteDate: string;
  updateDate: string;
  result: string;
  voteType: string;
  question?: string;
  issue?: string;
  url: string;
}

interface HouseVoteDetailResponse {
  houseRollCallVote: {
    congress: number;
    rollCallNumber: number;
    sessionNumber: number;
    startDate: string;
    updateDate: string;
    result: string;
    voteType: string;
    voteQuestion?: string;
    legislationType?: string;
    legislationNumber?: string;
    legislationUrl?: string;
    votePartyTotal?: Array<{
      yeaTotal: number;
      nayTotal: number;
      presentTotal: number;
      notVotingTotal: number;
      voteParty: string;
      party: { name: string; type: string };
    }>;
  };
}

interface SenateVoteDetailResponse {
  senateRollCallVote: {
    congress: number;
    rollCallNumber: number;
    sessionNumber: number;
    voteDate: string;
    updateDate: string;
    result: string;
    voteType: string;
    question?: string;
    issue?: string;
    votePartyTotal?: Array<{
      yeaTotal: number;
      nayTotal: number;
      presentTotal: number;
      notVotingTotal: number;
      voteParty: string;
    }>;
  };
}

interface HouseMemberVotesResponse {
  houseRollCallVoteMemberVotes: {
    congress: number;
    rollCallNumber: number;
    sessionNumber: number;
    results: Array<{
      bioguideID: string;
      firstName: string;
      lastName: string;
      voteCast: string;
      voteParty: string;
      voteState: string;
    }>;
  };
  pagination?: { count: number; next?: string };
}

interface SenateMemberVotesResponse {
  senateRollCallVoteMemberVotes: {
    congress: number;
    rollCallNumber: number;
    sessionNumber: number;
    results: Array<{
      bioguideID: string;
      firstName: string;
      lastName: string;
      voteCast: string;
      voteParty: string;
      voteState: string;
    }>;
  };
  pagination?: { count: number; next?: string };
}

// Legacy interfaces kept for backward compatibility with types.ts
interface VoteListResponse {
  votes: Array<{
    congress: number;
    chamber: string;
    number: number;
    date: string;
    updateDate: string;
    url: string;
  }>;
  pagination?: {
    count: number;
    next?: string;
  };
}

interface VotePositionsResponse {
  positions: Array<{
    member: {
      bioguideId: string;
      name: string;
      party: string;
      state: string;
      district?: number;
    };
    votePosition: string;
  }>;
  pagination?: {
    count: number;
    next?: string;
  };
}

interface MemberListResponse {
  members: Array<{
    bioguideId: string;
    name: string;
    partyName: string;
    state: string;
    district?: number;
    depiction?: {
      imageUrl?: string;
    };
    terms?: {
      item?: Array<{
        chamber: string;
        startYear: number;
        endYear?: number;
      }>;
    };
    url: string;
  }>;
  pagination?: {
    count: number;
    next?: string;
  };
}

// =============================================================================
// MAIN EXTRACT FUNCTIONS
// =============================================================================

/**
 * Extracts recent roll call votes from both House and Senate.
 *
 * This is the main entry point for the extract phase.
 */
export async function extractRecentVotes(
  config: ETLConfig
): Promise<ExtractedVoteData[]> {
  const { fromDate, toDate } = getDateRange(config.daysBack);
  logger.info(`Extracting votes from ${fromDate} to ${toDate}`);

  const extractedVotes: ExtractedVoteData[] = [];
  const congress = getCurrentCongress();

  // Extract House votes
  logger.info('Fetching House roll call votes...');
  const houseVotes = await extractChamberVotes(
    config,
    'house',
    congress,
    fromDate,
    toDate
  );
  extractedVotes.push(...houseVotes);

  // Extract Senate votes
  logger.info('Fetching Senate roll call votes...');
  const senateVotes = await extractChamberVotes(
    config,
    'senate',
    congress,
    fromDate,
    toDate
  );
  extractedVotes.push(...senateVotes);

  // Respect max votes limit
  if (extractedVotes.length > config.maxVotesPerRun) {
    logger.warn(
      `Extracted ${extractedVotes.length} votes, limiting to ${config.maxVotesPerRun}`
    );
    return extractedVotes.slice(0, config.maxVotesPerRun);
  }

  logger.info(`Total votes extracted: ${extractedVotes.length}`);
  return extractedVotes;
}

/**
 * Extracts votes for a specific chamber (House or Senate).
 * Uses the new Congress.gov API endpoints (2025+):
 *   /house-vote/{congress} and /senate-vote/{congress}
 */
async function extractChamberVotes(
  config: ETLConfig,
  chamber: 'house' | 'senate',
  congress: number,
  fromDate: string,
  toDate: string
): Promise<ExtractedVoteData[]> {
  const extractedVotes: ExtractedVoteData[] = [];

  try {
    const voteList = await fetchVoteList(config.congressApiKey, chamber, congress);

    logger.info(`Found ${voteList.length} ${chamber} votes for congress ${congress}`);

    // Filter votes within our date range
    const filteredVotes = voteList.filter((vote) => {
      const voteDate = vote.date.split('T')[0];
      return voteDate >= fromDate && voteDate <= toDate;
    });

    logger.info(
      `${filteredVotes.length} ${chamber} votes within date range ${fromDate} to ${toDate}`
    );

    // Fetch details for each vote
    for (const vote of filteredVotes) {
      try {
        const voteData = await extractSingleVote(
          config.congressApiKey,
          chamber,
          congress,
          vote.session,
          vote.number
        );

        if (voteData) {
          extractedVotes.push(voteData);
          logger.debug(
            `Extracted ${chamber} vote #${vote.number}: ${voteData.vote.question}`
          );
        }

        await sleep(100);
      } catch (error) {
        logger.error(`Failed to extract ${chamber} vote #${vote.number}`, error);
      }
    }
  } catch (error) {
    logger.error(`Failed to extract ${chamber} votes`, error);
  }

  return extractedVotes;
}

/**
 * Fetches the list of roll call votes using the new API format.
 * House: /house-vote/{congress}   Senate: /senate-vote/{congress}
 */
async function fetchVoteList(
  apiKey: string,
  chamber: 'house' | 'senate',
  congress: number
): Promise<Array<{ number: number; session: number; date: string; url: string }>> {
  const allVotes: Array<{ number: number; session: number; date: string; url: string }> = [];
  let offset = 0;
  const limit = 250;
  const endpoint = chamber === 'house' ? 'house-vote' : 'senate-vote';

  while (true) {
    const response = await retry(() =>
      fetchCongressApi<any>(
        `/${endpoint}/${congress}`,
        apiKey,
        { offset, limit }
      )
    );

    // New API uses different response keys per chamber
    const votes: any[] =
      response.houseRollCallVotes ||
      response.senateRollCallVotes ||
      [];

    if (votes.length === 0) break;

    allVotes.push(
      ...votes
        .filter((v: any) => v.congress === congress)
        .map((v: any) => ({
          number: v.rollCallNumber,
          session: v.sessionNumber,
          date: v.startDate || v.voteDate || '',
          url: v.url || '',
        }))
    );

    if (votes.length < limit) break;

    offset += limit;
    await sleep(100);
  }

  return allVotes;
}

/**
 * Extracts a single vote with all member positions using the new API.
 * House: /house-vote/{congress}/{session}/{rollNumber}
 * Senate: /senate-vote/{congress}/{session}/{rollNumber}
 */
async function extractSingleVote(
  apiKey: string,
  chamber: 'house' | 'senate',
  congress: number,
  session: number,
  rollNumber: number
): Promise<ExtractedVoteData | null> {
  const endpoint = chamber === 'house' ? 'house-vote' : 'senate-vote';

  // Fetch vote details
  const detailResponse = await retry(() =>
    fetchCongressApi<any>(
      `/${endpoint}/${congress}/${session}/${rollNumber}`,
      apiKey
    )
  );

  const detail = detailResponse.houseRollCallVote || detailResponse.senateRollCallVote;
  if (!detail) {
    logger.warn(`No vote details found for ${chamber} #${rollNumber}`);
    return null;
  }

  // Fetch member positions from /members sub-endpoint
  const memberVotes = await fetchVotePositions(
    apiKey,
    chamber,
    congress,
    session,
    rollNumber
  );

  if (memberVotes.length === 0) {
    logger.warn(`No member votes found for ${chamber} #${rollNumber}`);
    return null;
  }

  // Parse bill info from legislationType/legislationNumber (house) or issue (senate)
  let bill: CongressVoteDetail['bill'] = undefined;
  if (detail.legislationType && detail.legislationNumber) {
    bill = {
      congress: detail.congress,
      type: detail.legislationType.toLowerCase().replace(/\./g, ''),
      number: parseInt(detail.legislationNumber, 10),
      title: undefined,
    };
  }

  const voteDetail: CongressVoteDetail = {
    congress: detail.congress,
    chamber: chamber === 'house' ? 'House' : 'Senate',
    session: detail.sessionNumber,
    rollNumber: detail.rollCallNumber,
    date: detail.startDate || detail.voteDate || '',
    updateDate: detail.updateDate || '',
    question: detail.voteQuestion || detail.question || '',
    description: detail.issue || '',
    voteType: detail.voteType || '',
    result: detail.result || '',
    bill,
    votes: memberVotes,
  };

  return {
    vote: voteDetail,
    memberVotes,
    rawResponse: detailResponse,
  };
}

/**
 * Fetches all member vote positions from the /members sub-endpoint.
 * House: /house-vote/{congress}/{session}/{rollNumber}/members
 * Senate: /senate-vote/{congress}/{session}/{rollNumber}/members
 */
async function fetchVotePositions(
  apiKey: string,
  chamber: 'house' | 'senate',
  congress: number,
  session: number,
  rollNumber: number
): Promise<CongressMemberVote[]> {
  const allPositions: CongressMemberVote[] = [];
  let offset = 0;
  const limit = 250;
  const endpoint = chamber === 'house' ? 'house-vote' : 'senate-vote';

  while (true) {
    const response = await retry(() =>
      fetchCongressApi<any>(
        `/${endpoint}/${congress}/${session}/${rollNumber}/members`,
        apiKey,
        { offset, limit }
      )
    );

    const data =
      response.houseRollCallVoteMemberVotes ||
      response.senateRollCallVoteMemberVotes;

    const results: any[] = data?.results || [];

    if (results.length === 0) break;

    allPositions.push(
      ...results.map((r: any) => ({
        member: {
          bioguideId: r.bioguideID || r.bioguideId,
          name: `${r.firstName} ${r.lastName}`,
          party: r.voteParty,
          state: r.voteState,
          district: undefined,
        },
        votePosition: r.voteCast,
      }))
    );

    if (!response.pagination?.next || results.length < limit) break;

    offset += limit;
    await sleep(50);
  }

  return allPositions;
}

/**
 * Fetches detailed bill information from Congress.gov.
 */
export async function fetchBillDetails(
  apiKey: string,
  congress: number,
  type: string,
  number: number
): Promise<CongressBill | null> {
  try {
    const response = await retry(() =>
      fetchCongressApi<{ bill: CongressBill }>(
        `/bill/${congress}/${type.toLowerCase()}/${number}`,
        apiKey
      )
    );

    return response.bill || null;
  } catch (error) {
    logger.warn(`Failed to fetch bill ${congress}-${type}-${number}`, error);
    return null;
  }
}

/**
 * Fetches current members of Congress.
 * Useful for enriching politician data or backfilling missing info.
 */
export async function fetchCurrentMembers(
  apiKey: string
): Promise<MemberListResponse['members']> {
  const allMembers: MemberListResponse['members'] = [];
  let offset = 0;
  const limit = 250;

  while (true) {
    const response = await retry(() =>
      fetchCongressApi<MemberListResponse>(
        '/member',
        apiKey,
        { offset, limit, currentMember: 'true' }
      )
    );

    if (!response.members || response.members.length === 0) {
      break;
    }

    allMembers.push(...response.members);

    if (!response.pagination?.next || response.members.length < limit) {
      break;
    }

    offset += limit;
    await sleep(100);
  }

  logger.info(`Fetched ${allMembers.length} current members of Congress`);
  return allMembers;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculates the current Congress number.
 *
 * Congress numbers change every 2 years on January 3rd.
 * The 1st Congress started in 1789.
 */
function getCurrentCongress(): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();

  // Congress changes on January 3rd
  let congressYear = year;
  if (month === 1 && day < 3) {
    congressYear = year - 1;
  }

  // Congress number = ((year - 1789) / 2) + 1, rounded down
  return Math.floor((congressYear - 1789) / 2) + 1;
}

// Note: getSessionNumber is exported from utils.ts
