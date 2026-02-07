/**
 * Extract Module - Congress.gov API Data Fetching
 *
 * Fetches roll call votes from the House and Senate using the official
 * Congress.gov API v3. This module is the ONLY source of truth for vote data.
 *
 * API Documentation: https://api.congress.gov/
 *
 * Key Endpoints Used:
 * - GET /v3/vote/house/{congress}/{year} - List House roll call votes
 * - GET /v3/vote/senate/{congress}/{year} - List Senate roll call votes
 * - GET /v3/vote/house/{congress}/{year}/{rollNumber} - Specific House vote details
 * - GET /v3/vote/senate/{congress}/{year}/{rollNumber} - Specific Senate vote details
 * - GET /v3/member - Member information (for additional politician data)
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

interface VoteDetailResponse {
  vote: {
    congress: number;
    chamber: string;
    session: number;
    number: number;
    date: string;
    updateDate: string;
    question: string;
    questionText?: string;
    description?: string;
    voteType: string;
    result: string;
    bill?: {
      congress: number;
      type: string;
      number: number;
      title?: string;
    };
    amendment?: {
      congress: number;
      type: string;
      number: string;
    };
    url: string;
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
    // Get list of votes for the current year
    const year = new Date().getFullYear();
    const voteList = await fetchVoteList(config.congressApiKey, chamber, congress, year);

    logger.info(`Found ${voteList.length} ${chamber} votes for ${year}`);

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
          year,
          vote.number
        );

        if (voteData) {
          extractedVotes.push(voteData);
          logger.debug(
            `Extracted ${chamber} vote #${vote.number}: ${voteData.vote.question}`
          );
        }

        // Small delay between requests to be nice to the API
        await sleep(100);
      } catch (error) {
        logger.error(`Failed to extract ${chamber} vote #${vote.number}`, error);
        // Continue with other votes
      }
    }
  } catch (error) {
    logger.error(`Failed to extract ${chamber} votes`, error);
  }

  return extractedVotes;
}

/**
 * Fetches the list of roll call votes for a chamber/congress/year.
 */
async function fetchVoteList(
  apiKey: string,
  chamber: 'house' | 'senate',
  congress: number,
  year: number
): Promise<Array<{ number: number; date: string; url: string }>> {
  const allVotes: Array<{ number: number; date: string; url: string }> = [];
  let offset = 0;
  const limit = 250;

  while (true) {
    const response = await retry(() =>
      fetchCongressApi<VoteListResponse>(
        `/vote/${chamber}/${congress}/${year}`,
        apiKey,
        { offset, limit }
      )
    );

    if (!response.votes || response.votes.length === 0) {
      break;
    }

    allVotes.push(
      ...response.votes.map((v) => ({
        number: v.number,
        date: v.date,
        url: v.url,
      }))
    );

    // Check if there are more pages
    if (!response.pagination?.next || response.votes.length < limit) {
      break;
    }

    offset += limit;
    await sleep(100);
  }

  return allVotes;
}

/**
 * Extracts a single vote with all member positions.
 */
async function extractSingleVote(
  apiKey: string,
  chamber: 'house' | 'senate',
  congress: number,
  year: number,
  rollNumber: number
): Promise<ExtractedVoteData | null> {
  // Fetch vote details
  const detailResponse = await retry(() =>
    fetchCongressApi<VoteDetailResponse>(
      `/vote/${chamber}/${congress}/${year}/${rollNumber}`,
      apiKey
    )
  );

  if (!detailResponse.vote) {
    logger.warn(`No vote details found for ${chamber} #${rollNumber}`);
    return null;
  }

  // Fetch member positions
  const memberVotes = await fetchVotePositions(
    apiKey,
    chamber,
    congress,
    year,
    rollNumber
  );

  if (memberVotes.length === 0) {
    logger.warn(`No member votes found for ${chamber} #${rollNumber}`);
    return null;
  }

  // Convert to our internal format
  const voteDetail: CongressVoteDetail = {
    congress: detailResponse.vote.congress,
    chamber: detailResponse.vote.chamber,
    session: detailResponse.vote.session,
    rollNumber: detailResponse.vote.number,
    date: detailResponse.vote.date,
    updateDate: detailResponse.vote.updateDate,
    question: detailResponse.vote.question || detailResponse.vote.questionText || '',
    description: detailResponse.vote.description || '',
    voteType: detailResponse.vote.voteType,
    result: detailResponse.vote.result,
    bill: detailResponse.vote.bill,
    amendment: detailResponse.vote.amendment
      ? {
          congress: detailResponse.vote.amendment.congress,
          type: detailResponse.vote.amendment.type,
          number: parseInt(detailResponse.vote.amendment.number, 10),
        }
      : undefined,
    votes: memberVotes,
  };

  return {
    vote: voteDetail,
    memberVotes,
    rawResponse: detailResponse,
  };
}

/**
 * Fetches all member vote positions for a specific roll call vote.
 */
async function fetchVotePositions(
  apiKey: string,
  chamber: 'house' | 'senate',
  congress: number,
  year: number,
  rollNumber: number
): Promise<CongressMemberVote[]> {
  const allPositions: CongressMemberVote[] = [];
  let offset = 0;
  const limit = 250;

  while (true) {
    const response = await retry(() =>
      fetchCongressApi<VotePositionsResponse>(
        `/vote/${chamber}/${congress}/${year}/${rollNumber}/positions`,
        apiKey,
        { offset, limit }
      )
    );

    if (!response.positions || response.positions.length === 0) {
      break;
    }

    allPositions.push(
      ...response.positions.map((p) => ({
        member: {
          bioguideId: p.member.bioguideId,
          name: p.member.name,
          party: p.member.party,
          state: p.member.state,
          district: p.member.district,
        },
        votePosition: p.votePosition,
      }))
    );

    // Check if there are more pages
    if (!response.pagination?.next || response.positions.length < limit) {
      break;
    }

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
