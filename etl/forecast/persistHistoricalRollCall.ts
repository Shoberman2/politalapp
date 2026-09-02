import type { SupabaseClient } from '@supabase/supabase-js';
import type { AcquiredLease } from '../advisoryLock.js';
import type { TargetParse } from './targetParser.js';

export type HistoricalVotePosition = 'Yea' | 'Nay' | 'Present' | 'Not Voting';

export interface HistoricalMemberVote {
  politicianId: string;
  position: HistoricalVotePosition;
}

export interface HistoricalRollCallTally {
  yea: number;
  nay: number;
  present: number;
  notVoting: number;
}

export interface HistoricalRollCallPersistenceInput {
  leaseKey: string;
  lease: Pick<AcquiredLease, 'holder' | 'fenceToken'>;
  rollCallId: string;
  billId: string | null;
  question: string | null;
  description: string | null;
  votedAt: string;
  sourceUrl: string;
  targetParse: TargetParse;
  memberVotes: HistoricalMemberVote[];
  sourceTally: HistoricalRollCallTally;
  backfillName: string;
  expectedPreviousRollCallId: string | null;
  checkpoint: Record<string, unknown>;
}

export interface PersistedHistoricalRollCall {
  rollCallId: string;
  voteCount: number;
  completedAt: string;
}

interface PersistenceRpcRow {
  persisted_roll_call_id: string;
  persisted_vote_count: number;
  completed_at: string;
}

/**
 * Calls the sole approved historical roll-call write path. Validation and the
 * cursor advance happen inside Postgres so a process crash cannot expose a
 * partially written roll call or move the resume point past one.
 */
export async function persistHistoricalRollCall(
  supabase: SupabaseClient,
  input: HistoricalRollCallPersistenceInput,
): Promise<PersistedHistoricalRollCall> {
  const { data, error } = await supabase.rpc('persist_historical_roll_call', {
    p_lease_key: input.leaseKey,
    p_holder: input.lease.holder,
    p_fence_token: input.lease.fenceToken,
    p_roll_call_id: input.rollCallId,
    p_bill_id: input.billId,
    p_question: input.question,
    p_description: input.description,
    p_voted_at: input.votedAt,
    p_source_url: input.sourceUrl,
    p_parser_version: input.targetParse.parserVersion,
    p_raw_target_text: input.targetParse.rawText,
    p_normalized_target_text: input.targetParse.normalizedText,
    p_forecast_target: input.targetParse.forecastTarget,
    p_threshold_rule: input.targetParse.thresholdRule,
    p_parse_confidence: input.targetParse.confidence,
    p_unsupported_reason: input.targetParse.unsupportedReason,
    p_member_votes: input.memberVotes.map((vote) => ({
      politician_id: vote.politicianId,
      position: vote.position,
    })),
    p_expected_yea: input.sourceTally.yea,
    p_expected_nay: input.sourceTally.nay,
    p_expected_present: input.sourceTally.present,
    p_expected_not_voting: input.sourceTally.notVoting,
    p_backfill_name: input.backfillName,
    p_expected_previous_roll_call_id: input.expectedPreviousRollCallId,
    p_checkpoint: input.checkpoint,
  });

  if (error) {
    throw new Error(`Unable to persist historical roll call ${input.rollCallId}: ${error.message}`);
  }

  const row = (Array.isArray(data) ? data[0] : data) as PersistenceRpcRow | null;
  if (!row?.persisted_roll_call_id || !row.completed_at) {
    throw new Error(`Historical roll call ${input.rollCallId} returned no completion receipt`);
  }
  const voteCount = Number(row.persisted_vote_count);
  if (!Number.isInteger(voteCount) || voteCount < 0) {
    throw new Error(`Historical roll call ${input.rollCallId} returned an invalid vote count`);
  }

  return {
    rollCallId: row.persisted_roll_call_id,
    voteCount,
    completedAt: row.completed_at,
  };
}
