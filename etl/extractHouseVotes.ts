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
 * House: uses Congress.gov API /house-vote/{congress}
 * Senate: uses senate.gov XML feeds (Congress.gov API lacks Senate vote endpoints)
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
    if (chamber === 'senate') {
      return await extractSenateVotesFromXML(config, congress, fromDate, toDate);
    }

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
 * Extract Senate votes from senate.gov XML feeds.
 * Congress.gov API doesn't have a /senate-vote endpoint,
 * so we use the official senate.gov roll call XML instead.
 */
async function extractSenateVotesFromXML(
  config: ETLConfig,
  congress: number,
  fromDate: string,
  toDate: string
): Promise<ExtractedVoteData[]> {
  const extractedVotes: ExtractedVoteData[] = [];

  // Build a lastName-stateAbbr → bioguideId map from Congress.gov member API
  // Congress.gov returns full state names ("Oklahoma"), senate.gov XML uses abbreviations ("OK")
  const STATE_TO_ABBR: Record<string, string> = {
    'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
    'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
    'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA','kansas':'KS',
    'kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD','massachusetts':'MA',
    'michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO','montana':'MT',
    'nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ','new mexico':'NM',
    'new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH','oklahoma':'OK',
    'oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
    'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
    'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
    'district of columbia':'DC','american samoa':'AS','guam':'GU',
    'northern mariana islands':'MP','puerto rico':'PR','u.s. virgin islands':'VI',
  };

  // Congress.gov caps /member at 250 per page; ~537 members means 3 pages.
  // MEMBER_FETCH_MAX is a runaway guard, not an expected bound.
  const MEMBER_PAGE_SIZE = 250;
  const MEMBER_FETCH_MAX = 2000;
  const MIN_EXPECTED_SENATORS = 90;

  const senatorBioguideMap = new Map<string, string>();
  try {
    logger.info('Building senator bioguideId lookup from Congress.gov...');
    // /member returns ~537 current members across several pages, and it is NOT
    // ordered by chamber — as of July 2026 the first 250 records are all House,
    // so the old single-page fetch built an EMPTY senator map and every Senate
    // member position was silently dropped for want of a bioguideId. Page
    // through the whole list.
    const members: any[] = [];
    for (let offset = 0; offset < MEMBER_FETCH_MAX; offset += MEMBER_PAGE_SIZE) {
      const page = await retry(() =>
        fetchCongressApi<any>('/member', config.congressApiKey, {
          limit: MEMBER_PAGE_SIZE,
          offset,
          currentMember: 'true',
        })
      );
      const batch = page.members || [];
      members.push(...batch);
      if (batch.length < MEMBER_PAGE_SIZE) break;
    }
    logger.info(`Fetched ${members.length} current members across all pages`);

    for (const m of members) {
      const terms = m.terms?.item || [];
      const currentTerm = terms[terms.length - 1];
      if (currentTerm?.chamber?.toLowerCase().includes('senate')) {
        const lastName = (m.name || '').split(',')[0].trim().toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, ''); // strip accents (Luján → lujan)
        const stateAbbr = STATE_TO_ABBR[(m.state || '').toLowerCase()] || (m.state || '').toUpperCase();
        if (lastName && stateAbbr) {
          senatorBioguideMap.set(`${lastName}-${stateAbbr.toLowerCase()}`, m.bioguideId);
        }
      }
    }
    // Add former senators who voted during this congress but are no longer current members
    // (e.g., resigned to take cabinet positions). Congress.gov currentMember=true excludes them.
    if (!senatorBioguideMap.has('mullin-ok')) senatorBioguideMap.set('mullin-ok', 'M001190');

    logger.info(`Built lookup for ${senatorBioguideMap.size} senators`);
    // A short map means /member changed shape or ordering again. Say so loudly:
    // this failure is otherwise silent (Senate roll calls still land, they just
    // arrive with zero member positions), which is how it went unnoticed.
    if (senatorBioguideMap.size < MIN_EXPECTED_SENATORS) {
      logger.error(
        `Senator lookup resolved only ${senatorBioguideMap.size} senators (expected ~100). ` +
        'Senate member positions will be dropped — check the /member response shape.'
      );
    }
  } catch (error) {
    logger.error('Failed to build senator lookup, Senate votes will have missing bioguideIds', error);
  }

  // Check both sessions (1 = odd year, 2 = even year)
  for (const session of [1, 2]) {
    try {
      const listUrl = `https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_${congress}_${session}.xml`;
      logger.info(`Fetching Senate vote list: ${listUrl}`);

      const listResponse = await fetch(listUrl);
      if (!listResponse.ok) {
        logger.warn(`Senate session ${session} vote list returned ${listResponse.status}`);
        continue;
      }
      const listXml = await listResponse.text();

      // Parse vote entries from the list XML
      const entryRegex = /<vote>\s*<vote_number>(\d+)<\/vote_number>\s*<vote_date>([^<]*)<\/vote_date>\s*<issue>([^<]*)<\/issue>\s*<question>([^<]*)<\/question>\s*<result>([^<]*)<\/result>[^]*?<title>([^<]*)<\/title>\s*<\/vote>/g;
      const entries: Array<{ number: string; date: string; issue: string; question: string; result: string; title: string }> = [];
      let match;
      while ((match = entryRegex.exec(listXml)) !== null) {
        entries.push({
          number: match[1],
          date: match[2].trim(),
          issue: match[3].trim(),
          question: match[4].trim(),
          result: match[5].trim(),
          title: match[6].trim(),
        });
      }

      logger.info(`Found ${entries.length} Senate votes in session ${session}`);

      // Filter by date range - senate dates are like "26-Mar" so we need the year from the session
      const sessionYear = congress === 119 ? (session === 1 ? 2025 : 2026) : 0;
      const months: Record<string, string> = {
        'Jan': '01', 'Feb': '02', 'Mar': '03', 'Apr': '04', 'May': '05', 'Jun': '06',
        'Jul': '07', 'Aug': '08', 'Sep': '09', 'Oct': '10', 'Nov': '11', 'Dec': '12'
      };

      const filteredEntries = entries.filter((entry) => {
        const parts = entry.date.split('-');
        if (parts.length !== 2) return false;
        const month = months[parts[1]] || '01';
        const day = parts[0].padStart(2, '0');
        const isoDate = `${sessionYear}-${month}-${day}`;
        return isoDate >= fromDate && isoDate <= toDate;
      });

      logger.info(`${filteredEntries.length} Senate votes in date range`);

      // Fetch individual vote XMLs for member positions
      for (const entry of filteredEntries) {
        try {
          const voteNum = entry.number;
          const voteUrl = `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${voteNum}.xml`;
          const response = await fetch(voteUrl);
          if (!response.ok) continue;
          const xml = await response.text();

          // Parse vote date
          const dateMatch = xml.match(/<vote_date>([^<]+)<\/vote_date>/);
          const rawDate = dateMatch ? dateMatch[1].trim() : '';
          let voteDate = '';
          try {
            const parsed = new Date(rawDate.replace(/,\s*\d{2}:\d{2}\s*(AM|PM)/, ''));
            if (!isNaN(parsed.getTime())) {
              voteDate = parsed.toISOString().split('T')[0];
            }
          } catch (e) { /* skip */ }

          // Parse all member positions
          const memberVotes: CongressMemberVote[] = [];
          const memberRegex = /<member>\s*<member_full>[^<]*<\/member_full>\s*<last_name>([^<]+)<\/last_name>\s*<first_name>([^<]+)<\/first_name>\s*<party>([^<]+)<\/party>\s*<state>([^<]+)<\/state>\s*<vote_cast>([^<]+)<\/vote_cast>\s*<lis_member_id>([^<]+)<\/lis_member_id>/g;
          let memberMatch;
          while ((memberMatch = memberRegex.exec(xml)) !== null) {
            const voteCast = memberMatch[5].trim();
            const position = voteCast === 'Yea' ? 'Yea'
              : voteCast === 'Nay' ? 'Nay'
              : voteCast === 'Present' ? 'Present'
              : 'Not Voting';

            const lastName = memberMatch[1].trim();
            const firstName = memberMatch[2].trim();
            const state = memberMatch[4].trim();

            // Look up bioguideId from the senator name/state map
            const lookupKey = `${lastName.toLowerCase()}-${state.toLowerCase()}`;
            const bioguideId = senatorBioguideMap.get(lookupKey) || '';

            memberVotes.push({
              member: {
                bioguideId,
                name: `${firstName} ${lastName}`,
                party: memberMatch[3].trim(),
                state,
              },
              votePosition: position,
            });
          }

          // Parse bill info from issue field (e.g., "H.R. 7147", "S. 5", "PN373")
          let bill: CongressVoteDetail['bill'] = undefined;
          const billMatch = entry.issue.match(/^(H\.?R\.?|S\.?|H\.?J\.?Res\.?|S\.?J\.?Res\.?)\s*(\d+)$/i);
          if (billMatch) {
            const type = billMatch[1].replace(/\./g, '').toLowerCase();
            bill = {
              congress,
              type,
              number: parseInt(billMatch[2], 10),
            };
          }

          const voteDetail: CongressVoteDetail = {
            congress,
            chamber: 'Senate',
            session,
            rollNumber: parseInt(voteNum, 10),
            date: voteDate,
            updateDate: voteDate,
            question: entry.question,
            description: entry.title,
            voteType: '',
            result: entry.result,
            bill,
            votes: memberVotes,
          };

          extractedVotes.push({
            vote: voteDetail,
            memberVotes,
            rawResponse: xml,
          });

          logger.debug(`Extracted senate vote #${voteNum}: ${entry.question}`);
          await sleep(200); // Be polite to senate.gov
        } catch (error) {
          logger.error(`Failed to extract senate vote #${entry.number}`, error);
        }
      }
    } catch (error) {
      logger.error(`Failed to extract senate session ${session} votes`, error);
    }
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
