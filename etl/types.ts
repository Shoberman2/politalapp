/**
 * ETL Type Definitions
 *
 * These types define the data structures used throughout the ETL pipeline,
 * mapping Congress.gov API responses to our Supabase schema.
 */

// =============================================================================
// DATABASE SCHEMA TYPES (Target)
// =============================================================================

export interface Politician {
  id: string;              // BioGuide ID (e.g., "A000360")
  name: string;
  chamber: 'house' | 'senate';
  state: string;           // Two-letter state code
  district: string | null; // null for senators
  party: string;
  photo_url: string | null;
}

export interface Bill {
  id: string;              // Format: "{congress}-{type}-{number}" e.g., "118-hr-1"
  title: string;
  introduced_at: string;   // ISO date string
  summary: string | null;  // AI-generated, cached
  crs_summary: string | null; // Official CRS summary from Congress.gov
  policy_area: string | null; // e.g., "Healthcare", "Defense", from Congress.gov policyArea
  source_url: string;
}

export interface Vote {
  id?: number;             // Auto-generated
  politician_id: string;   // References politicians.id (BioGuide ID)
  bill_id: string | null;  // References bills.id (can be null for procedural votes)
  roll_call_id: string;    // Format: "{chamber}-{congress}-{session}-{rollNumber}"
  position: VotePosition;
  voted_at: string;        // ISO date string
  source_url: string;
}

export interface MemberStats {
  politician_id: string;
  congress: number;
  total_votes: number;
  yea_count: number;
  nay_count: number;
  present_count: number;
  not_voting_count: number;
  party_loyalty_pct: number;
  updated_at: string;
}

export type VotePosition = 'Yea' | 'Nay' | 'Present' | 'Not Voting';

export interface BillArticle {
  bill_id: string;
  url: string;
  publisher: string;
  headline: string;
  published_at: string;
}

// =============================================================================
// CONGRESS.GOV API RESPONSE TYPES (Source)
// =============================================================================

// House Vote List Response
export interface CongressVoteListResponse {
  votes: CongressVoteListItem[];
  pagination: {
    count: number;
    next?: string;
  };
}

export interface CongressVoteListItem {
  congress: number;
  chamber: string;
  rollNumber: number;
  date: string;
  url: string;
}

// House Vote Detail Response
export interface CongressVoteDetailResponse {
  vote: CongressVoteDetail;
}

export interface CongressVoteDetail {
  congress: number;
  chamber: string;
  session: number;
  rollNumber: number;
  date: string;
  updateDate: string;
  question: string;
  description: string;
  voteType: string;
  result: string;
  bill?: {
    congress: number;
    type: string;
    number: number;
    title?: string;
    url?: string;
  };
  amendment?: {
    congress: number;
    type: string;
    number: number;
  };
  votes: CongressMemberVote[];
}

export interface CongressMemberVote {
  member: {
    bioguideId: string;
    name: string;
    party: string;
    state: string;
    district?: number;
  };
  votePosition: string;
}

// Member/Politician Response
export interface CongressMemberResponse {
  members: CongressMember[];
  pagination: {
    count: number;
    next?: string;
  };
}

export interface CongressMember {
  bioguideId: string;
  name: string;
  partyName: string;
  state: string;
  district?: number;
  depiction?: {
    imageUrl?: string;
  };
  terms: {
    item: CongressMemberTerm[];
  };
  url: string;
}

export interface CongressMemberTerm {
  chamber: string;
  startYear: number;
  endYear?: number;
}

// Bill Response
export interface CongressBillResponse {
  bill: CongressBill;
}

export interface CongressBill {
  congress: number;
  type: string;
  number: number;
  title: string;
  introducedDate: string;
  updateDate: string;
  latestAction?: {
    actionDate: string;
    text: string;
  };
  summaries?: {
    summary: Array<{
      text: string;
      versionCode: string;
    }>;
  };
  url: string;
}

// =============================================================================
// INTERNAL PIPELINE TYPES
// =============================================================================

export interface ExtractedVoteData {
  vote: CongressVoteDetail;
  memberVotes: CongressMemberVote[];
  rawResponse: unknown; // For debugging/logging
}

export interface TransformedData {
  politicians: Map<string, Politician>;
  bills: Map<string, Bill>;
  votes: Vote[];
}

export interface LoadResult {
  politiciansUpserted: number;
  billsUpserted: number;
  votesInserted: number;
  errors: string[];
}

export interface ETLConfig {
  congressApiKey: string;
  supabaseUrl: string;
  supabaseServiceKey: string;
  openaiApiKey?: string;
  daysBack: number;        // How many days of votes to fetch
  maxVotesPerRun: number;  // Limit to prevent runaway API calls
  dryRun: boolean;         // If true, don't write to DB
}

export interface ETLRunResult {
  success: boolean;
  extractedVotes: number;
  transformedRecords: {
    politicians: number;
    bills: number;
    votes: number;
  };
  loadResult?: LoadResult;
  errors: string[];
  startTime: Date;
  endTime: Date;
}
