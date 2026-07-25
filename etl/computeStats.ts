/**
 * Compute Stats Module — Per-Member Voting Statistics
 *
 * Runs as a second pass AFTER the main ETL cycle completes.
 * Queries all votes for the current congress from Supabase,
 * computes party loyalty and vote breakdowns, and upserts
 * into the member_stats table.
 * The ETL runner owns last_successful_run metadata after all critical
 * phases are known to have passed.
 *
 * Party loyalty = % of roll calls where member voted with
 * their party's majority position (CQ Roll Call methodology).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { ETLConfig, MemberStats } from './types.js';
import { logger, chunk } from './utils.js';

// Independents who caucus with a party.
// Updated rarely — hardcode is acceptable.
const INDEPENDENT_CAUCUS: Record<string, string> = {
  'S000033': 'Democratic',  // Bernie Sanders (I-VT)
  'K000383': 'Democratic',  // Angus King (I-ME)
};

interface VoteRow {
  politician_id: string;
  roll_call_id: string;
  position: string;
}

interface PoliticianRow {
  id: string;
  party: string;
}

interface RollCallStatsRow {
  roll_call_id: string;
  dem_yea: number;
  dem_nay: number;
  rep_yea: number;
  rep_nay: number;
  ind_yea: number;
  ind_nay: number;
  updated_at: string;
}

/**
 * Get the effective party for loyalty calculation.
 * Maps party codes to full names and handles Independent caucusing.
 */
function getEffectiveParty(politicianId: string, partyCode: string): string {
  if (INDEPENDENT_CAUCUS[politicianId]) {
    return INDEPENDENT_CAUCUS[politicianId];
  }
  if (partyCode === 'D') return 'Democratic';
  if (partyCode === 'R') return 'Republican';
  return partyCode; // Independents not caucusing stay as-is
}

/**
 * Determine the majority position for a party on a given roll call.
 * Returns the position that the most members of that party voted for,
 * considering only Yea and Nay votes (Present/Not Voting are excluded).
 */
export function getPartyMajorityPosition(
  partyVotes: Array<{ position: string }>
): string | null {
  let yeaCount = 0;
  let nayCount = 0;

  for (const v of partyVotes) {
    if (v.position === 'Yea') yeaCount++;
    else if (v.position === 'Nay') nayCount++;
  }

  if (yeaCount === 0 && nayCount === 0) return null; // No substantive votes
  return yeaCount >= nayCount ? 'Yea' : 'Nay';
}

export interface ComputeStatsResult {
  membersProcessed: number;
  errors: string[];
}

/**
 * Main entry point: compute and upsert member_stats for the current congress.
 */
export async function computeMemberStats(
  config: ETLConfig,
  congress: number = 119
): Promise<ComputeStatsResult> {
  const result: ComputeStatsResult = { membersProcessed: 0, errors: [] };

  const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    // 1. Fetch all politicians
    logger.info('Fetching politicians for stats computation...');
    const { data: politicians, error: polError } = await supabase
      .from('politicians')
      .select('id, party');

    if (polError || !politicians) {
      result.errors.push(`Failed to fetch politicians: ${polError?.message}`);
      return result;
    }

    const politicianMap = new Map<string, string>(); // id -> party code
    for (const p of politicians as PoliticianRow[]) {
      politicianMap.set(p.id, p.party);
    }

    // 2. Fetch all votes with roll_call_id
    logger.info('Fetching votes for stats computation...');
    const allVotes: VoteRow[] = [];
    let offset = 0;
    const pageSize = 1000;

    while (true) {
      const { data: voteBatch, error: voteError } = await supabase
        .from('votes')
        .select('politician_id, roll_call_id, position')
        // Order is REQUIRED for correctness, not tidiness: Postgres gives no
        // stable row order without it, so paging 200k+ rows by offset can
        // silently repeat some rows and skip others — and a skipped roll call
        // just never gets a stats row.
        .order('id', { ascending: true })
        .range(offset, offset + pageSize - 1);

      if (voteError) {
        result.errors.push(`Failed to fetch votes at offset ${offset}: ${voteError.message}`);
        break;
      }

      if (!voteBatch || voteBatch.length === 0) break;
      allVotes.push(...(voteBatch as VoteRow[]));
      offset += voteBatch.length;

      if (voteBatch.length < pageSize) break;
    }

    logger.info(`Loaded ${allVotes.length} votes for ${politicianMap.size} politicians`);

    if (allVotes.length === 0) {
      logger.warn('No votes found, skipping stats computation');
      return result;
    }

    // 3. Group votes by roll_call_id
    const rollCalls = new Map<string, VoteRow[]>();
    for (const vote of allVotes) {
      const existing = rollCalls.get(vote.roll_call_id);
      if (existing) {
        existing.push(vote);
      } else {
        rollCalls.set(vote.roll_call_id, [vote]);
      }
    }

    logger.info(`Found ${rollCalls.size} roll calls`);

    // 4. For each roll call, determine party majority positions AND
    //    collect per-party vote counts for the roll_call_stats table.
    //    Map: roll_call_id -> { party -> majority position }
    const rollCallPartyMajority = new Map<string, Map<string, string>>();
    const rollCallStatsRows: RollCallStatsRow[] = [];
    const nowIso = new Date().toISOString();

    for (const [rollCallId, votes] of rollCalls) {
      // Group votes by effective party
      const partyVotes = new Map<string, Array<{ position: string }>>();

      for (const vote of votes) {
        const partyCode = politicianMap.get(vote.politician_id);
        if (!partyCode) continue;
        const effectiveParty = getEffectiveParty(vote.politician_id, partyCode);
        const existing = partyVotes.get(effectiveParty);
        if (existing) {
          existing.push({ position: vote.position });
        } else {
          partyVotes.set(effectiveParty, [{ position: vote.position }]);
        }
      }

      // Determine majority position per party
      const majorityMap = new Map<string, string>();
      for (const [party, votes] of partyVotes) {
        const majority = getPartyMajorityPosition(votes);
        if (majority) {
          majorityMap.set(party, majority);
        }
      }

      rollCallPartyMajority.set(rollCallId, majorityMap);

      // Per-party Yea/Nay counts for roll_call_stats table.
      // "Independent" bucket holds non-caucusing independents only
      // (getEffectiveParty remaps caucusing I's to 'Democratic' string).
      //
      // Aliases: the ETL's normalizeParty() stores 'Democrat'/'Republican'
      // (singular nouns), but getEffectiveParty returns 'Democratic'/'Republican'
      // (adjectives) for caucus overrides. Match all forms to avoid undercounting.
      const countPositions = (positions: Array<{ position: string }>) => {
        let yea = 0;
        let nay = 0;
        for (const p of positions) {
          if (p.position === 'Yea') yea++;
          else if (p.position === 'Nay') nay++;
        }
        return { yea, nay };
      };
      const DEM_ALIASES = new Set(['Democrat', 'Democratic', 'D']);
      const REP_ALIASES = new Set(['Republican', 'R']);
      let demYea = 0, demNay = 0, repYea = 0, repNay = 0, indYea = 0, indNay = 0;
      for (const [party, positions] of partyVotes) {
        const counts = countPositions(positions);
        if (DEM_ALIASES.has(party)) {
          demYea += counts.yea;
          demNay += counts.nay;
        } else if (REP_ALIASES.has(party)) {
          repYea += counts.yea;
          repNay += counts.nay;
        } else {
          indYea += counts.yea;
          indNay += counts.nay;
        }
      }
      rollCallStatsRows.push({
        roll_call_id: rollCallId,
        dem_yea: demYea,
        dem_nay: demNay,
        rep_yea: repYea,
        rep_nay: repNay,
        ind_yea: indYea,
        ind_nay: indNay,
        updated_at: nowIso,
      });
    }

    // 4b. Upsert roll_call_stats. Table may not exist yet in older deploys —
    // if the upsert fails with a "relation does not exist" error, log a warning
    // and continue (the feature degrades to a 2-signal classifier client-side).
    logger.info(`Upserting roll_call_stats for ${rollCallStatsRows.length} roll calls...`);
    const rcsBatches = chunk(rollCallStatsRows, 500);
    for (const batch of rcsBatches) {
      const { error } = await supabase
        .from('roll_call_stats')
        .upsert(batch, { onConflict: 'roll_call_id' });

      if (error) {
        if (error.message.includes('does not exist')) {
          logger.warn(
            'roll_call_stats table not found. Run migration ' +
            'supabase/migrations/002_add_roll_call_stats.sql in Supabase SQL Editor, ' +
            'then re-run this ETL to backfill.'
          );
          break;
        }
        result.errors.push(`roll_call_stats upsert error: ${error.message}`);
        logger.error('roll_call_stats upsert error', error);
      }
    }

    // 5. For each politician, compute stats
    const memberStats: MemberStats[] = [];

    for (const [politicianId, partyCode] of politicianMap) {
      const effectiveParty = getEffectiveParty(politicianId, partyCode);

      // Get this member's votes
      const memberVotes = allVotes.filter(v => v.politician_id === politicianId);
      if (memberVotes.length === 0) continue;

      let yeaCount = 0;
      let nayCount = 0;
      let presentCount = 0;
      let notVotingCount = 0;
      let loyalVotes = 0;
      let substantiveVotes = 0; // Yea or Nay only

      for (const vote of memberVotes) {
        switch (vote.position) {
          case 'Yea': yeaCount++; break;
          case 'Nay': nayCount++; break;
          case 'Present': presentCount++; break;
          case 'Not Voting': notVotingCount++; break;
        }

        // Party loyalty: only count Yea/Nay votes
        if (vote.position === 'Yea' || vote.position === 'Nay') {
          substantiveVotes++;
          const majorityMap = rollCallPartyMajority.get(vote.roll_call_id);
          if (majorityMap) {
            const partyMajority = majorityMap.get(effectiveParty);
            if (partyMajority && vote.position === partyMajority) {
              loyalVotes++;
            }
          }
        }
      }

      const loyaltyPct = substantiveVotes > 0
        ? Math.round((loyalVotes / substantiveVotes) * 100)
        : 0;

      memberStats.push({
        politician_id: politicianId,
        congress,
        total_votes: memberVotes.length,
        yea_count: yeaCount,
        nay_count: nayCount,
        present_count: presentCount,
        not_voting_count: notVotingCount,
        party_loyalty_pct: loyaltyPct,
        updated_at: new Date().toISOString(),
      });
    }

    // 6. Upsert to Supabase
    logger.info(`Upserting stats for ${memberStats.length} members...`);
    const batches = chunk(memberStats, 100);

    for (const batch of batches) {
      const { error } = await supabase
        .from('member_stats')
        .upsert(batch, { onConflict: 'politician_id,congress' });

      if (error) {
        result.errors.push(`member_stats upsert error: ${error.message}`);
        logger.error('member_stats upsert error', error);
      } else {
        result.membersProcessed += batch.length;
      }
    }

    logger.info(`Stats computation complete: ${result.membersProcessed} members processed`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    result.errors.push(message);
    logger.error('computeMemberStats failed', error);
  }

  return result;
}
