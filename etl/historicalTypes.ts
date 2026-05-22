/**
 * ETL types for the historical-chamber backfill pipeline.
 *
 * Mirrors the schema in supabase/migrations/008_historical_chamber_schema.sql
 * and the FidelityTier enum in shared/fidelity.ts.
 *
 * Separate from etl/types.ts so historical-only types don't pollute the
 * daily-ETL surface that runs in production every day.
 */

import type { FidelityTier } from '../shared/fidelity.js';

// =============================================================================
// DATABASE SCHEMA TYPES (mirrors migration 008)
// =============================================================================

export interface MemberCongressTerm {
  bioguide_id: string;
  congress: number;
  term_start: string; // ISO date
  chamber: 'house' | 'senate';
  state: string;
  district: string | null;
  party: string;
  caucus: string | null;
  term_end: string | null;
  reason_for_end: string | null;
  source: string; // 'congress_gov' | 'voteview' | 'hand_curated' | etc.
}

export interface MemberIdAlias {
  canonical_bioguide: string;
  alias_source: string; // 'voteview_icpsr'
  alias_id: string;
  notes: string | null;
}

export interface SenateDesk {
  desk_id: number;
  famous_name: string | null;
  description: string | null;
  side: 'D' | 'R' | 'aisle';
  arc: 1 | 2 | 3 | 4;
  position: number;
}

export interface SenateDeskAssignment {
  congress: number;
  desk_id: number;
  assigned_at: string; // ISO date
  bioguide_id: string | null;
  vacated_at: string | null;
  reason: string | null;
  source: string;
  confidence: 'high' | 'medium' | 'low' | null;
}

export interface SenateDeskLineageRow {
  desk_id: number;
  year_start: number;
  year_end: number | null;
  bioguide_id: string | null;
  occupant_name: string | null;
  party: string | null;
  state: string | null;
  notes: string | null;
  source: string;
}

export interface CongressMetadata {
  congress: number;
  start_date: string;
  end_date: string;
  majority_party_senate: string | null;
  majority_party_house: string | null;
  fidelity_tier: FidelityTier;
  senate_xml_url_pattern: string | null;
  notes: string | null;
}

// =============================================================================
// BACKFILL ORCHESTRATION TYPES
// =============================================================================

/**
 * Persisted in backfill_state.name. Stable string the daily ETL checks
 * before deciding whether to skip itself (sentinel pattern).
 */
export const HISTORICAL_BACKFILL_NAME = 'historical_chamber_backfill';

export interface BackfillCheckpoint {
  name: string;
  status: 'running' | 'complete' | 'failed' | 'paused';
  /** Highest Congress fully completed (so backfill resumes at this + 1). */
  last_completed_congress: number | null;
  /** Source currently being processed within the active Congress. */
  current_source: BackfillSource | null;
  started_at: string;
  updated_at: string;
}

export type BackfillSource =
  | 'voteview_aliases'
  | 'congress_gov_members'
  | 'senate_historical_office_desks'
  | 'senate_gov_roll_calls'
  | 'congress_gov_bills'
  | 'house_clerk_roll_calls';

/**
 * Halt-or-continue policy for a Congress that returns errors mid-fetch.
 *
 * MAX_CONSECUTIVE_5XX is per Section 9 of the eng-review (3 strikes halts).
 * Per-record JSON parse failures don't count toward the budget — they
 * skip + log to backfill_errors and continue.
 */
export const MAX_CONSECUTIVE_5XX = 3;

export interface ErrorBudget {
  consecutive_5xx: number;
  last_error_at: string | null;
  last_error_message: string | null;
}

/**
 * Result of fetching one source for one Congress. Returned by source
 * modules; consumed by the orchestrator to update fidelity_tier and
 * decide whether to continue.
 */
export interface SourceFetchResult {
  source: BackfillSource;
  congress: number;
  status: 'success' | 'partial' | 'unavailable' | 'failed';
  records_loaded: number;
  records_skipped: number;
  errors: string[];
  /** If the source unavailable / partial, the suggested fidelity tier downgrade. */
  suggested_tier_downgrade?: FidelityTier;
}

/**
 * Aggregate result of backfilling one Congress across all its sources.
 */
export interface CongressBackfillResult {
  congress: number;
  start_time: string;
  end_time: string;
  results_by_source: Record<BackfillSource, SourceFetchResult | null>;
  final_fidelity_tier: FidelityTier;
  halted_early: boolean;
  reason: string | null;
}
