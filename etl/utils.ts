/**
 * ETL Utility Functions
 *
 * Common helpers for API requests, logging, date handling, and data validation.
 */

import type { VotePosition, ETLConfig } from './types.js';

// =============================================================================
// LOGGING
// =============================================================================

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
}

let currentLogLevel = LogLevel.INFO;

export function setLogLevel(level: LogLevel): void {
  currentLogLevel = level;
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

export function log(level: LogLevel, message: string, data?: unknown): void {
  if (level < currentLogLevel) return;

  const prefix = {
    [LogLevel.DEBUG]: '[DEBUG]',
    [LogLevel.INFO]: '[INFO]',
    [LogLevel.WARN]: '[WARN]',
    [LogLevel.ERROR]: '[ERROR]',
  }[level];

  const timestamp = formatTimestamp();
  const logLine = `${timestamp} ${prefix} ${message}`;

  if (level === LogLevel.ERROR) {
    console.error(logLine);
    if (data) console.error(JSON.stringify(data, null, 2));
  } else if (level === LogLevel.WARN) {
    console.warn(logLine);
    if (data) console.warn(JSON.stringify(data, null, 2));
  } else {
    console.log(logLine);
    if (data && level === LogLevel.DEBUG) {
      console.log(JSON.stringify(data, null, 2));
    }
  }
}

export const logger = {
  debug: (msg: string, data?: unknown) => log(LogLevel.DEBUG, msg, data),
  info: (msg: string, data?: unknown) => log(LogLevel.INFO, msg, data),
  warn: (msg: string, data?: unknown) => log(LogLevel.WARN, msg, data),
  error: (msg: string, data?: unknown) => log(LogLevel.ERROR, msg, data),
};

// =============================================================================
// API REQUEST HELPERS
// =============================================================================

const CONGRESS_API_BASE = 'https://api.congress.gov/v3';

interface RateLimitState {
  lastRequest: number;
  minInterval: number; // ms between requests
}

const rateLimitState: RateLimitState = {
  lastRequest: 0,
  minInterval: 200, // 5 requests per second max
};

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - rateLimitState.lastRequest;

  if (elapsed < rateLimitState.minInterval) {
    const waitTime = rateLimitState.minInterval - elapsed;
    await sleep(waitTime);
  }

  rateLimitState.lastRequest = Date.now();
}

export async function fetchCongressApi<T>(
  endpoint: string,
  apiKey: string,
  params: Record<string, string | number> = {}
): Promise<T> {
  await waitForRateLimit();

  const url = new URL(`${CONGRESS_API_BASE}${endpoint}`);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('format', 'json');

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  logger.debug(`Fetching: ${url.pathname}${url.search.replace(apiKey, 'REDACTED')}`);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Congress API error: ${response.status} ${response.statusText}\n` +
      `Endpoint: ${endpoint}\n` +
      `Response: ${errorText}`
    );
  }

  const data = await response.json();
  return data as T;
}

// =============================================================================
// DATE UTILITIES
// =============================================================================

export function getDateRange(daysBack: number): { fromDate: string; toDate: string } {
  const now = new Date();
  const toDate = formatDate(now);

  const from = new Date(now);
  from.setDate(from.getDate() - daysBack);
  const fromDate = formatDate(from);

  return { fromDate, toDate };
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function parseDate(dateString: string): Date {
  // Handle various date formats from the API
  // "2024-01-15", "2024-01-15T10:30:00Z", etc.
  return new Date(dateString);
}

export function isValidDate(dateString: string): boolean {
  const date = parseDate(dateString);
  return !isNaN(date.getTime());
}

// =============================================================================
// VOTE POSITION NORMALIZATION
// =============================================================================

/**
 * Normalizes raw vote position strings from Congress.gov API to our schema.
 *
 * The API returns various strings like "Yea", "Aye", "Nay", "No", "Present",
 * "Not Voting", "NV", etc. We normalize to exactly four values.
 */
export function normalizeVotePosition(rawPosition: string): VotePosition {
  const normalized = rawPosition.toLowerCase().trim();

  // Affirmative votes
  if (normalized === 'yea' || normalized === 'aye' || normalized === 'yes') {
    return 'Yea';
  }

  // Negative votes
  if (normalized === 'nay' || normalized === 'no') {
    return 'Nay';
  }

  // Present but not voting for/against
  if (normalized === 'present' || normalized === 'p') {
    return 'Present';
  }

  // Did not vote
  if (
    normalized === 'not voting' ||
    normalized === 'nv' ||
    normalized === 'absent' ||
    normalized === ''
  ) {
    return 'Not Voting';
  }

  // Log unexpected values for debugging
  logger.warn(`Unknown vote position: "${rawPosition}", defaulting to "Not Voting"`);
  return 'Not Voting';
}

// =============================================================================
// BILL ID GENERATION
// =============================================================================

/**
 * Generates a stable, deterministic bill ID from Congress.gov bill data.
 *
 * Format: "{congress}-{type}-{number}"
 * Example: "118-hr-1234"
 *
 * This ensures the same bill always gets the same ID, enabling proper deduplication.
 */
export function generateBillId(congress: number, type: string, number: number): string {
  // Normalize type to lowercase
  const normalizedType = type.toLowerCase().replace(/\./g, '');
  return `${congress}-${normalizedType}-${number}`;
}

/**
 * Canonical formatter for roll_call_id and roll_calls.id.
 *
 * Format: "{chamber}-{congress}-{session}-{rollNumber}"
 * Example: "house-119-1-247"
 *
 * Single source of truth — every site that constructs a roll_call_id (extract,
 * transform, load, browser query, classifier, narration) must use this. One
 * character of format drift breaks the join chain silently between votes,
 * roll_calls, and roll_call_stats.
 */
export function formatRollCallId(
  chamber: string,
  congress: number,
  session: number,
  rollNumber: number
): string {
  return `${chamber.toLowerCase()}-${congress}-${session}-${rollNumber}`;
}

/**
 * @deprecated Use formatRollCallId. Kept as alias to avoid touching every call site.
 */
export const generateVoteKey = formatRollCallId;

// =============================================================================
// DATA VALIDATION
// =============================================================================

export function isValidBioguideId(id: string): boolean {
  // BioGuide IDs follow the pattern: one letter followed by 6 digits
  // Example: "A000360", "P000197"
  return /^[A-Z]\d{6}$/.test(id);
}

export function isValidStateCode(state: string): boolean {
  const validStates = [
    'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
    'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
    'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
    'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
    'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
    'DC', 'PR', 'GU', 'VI', 'AS', 'MP' // Include territories
  ];
  return validStates.includes(state.toUpperCase());
}

// =============================================================================
// PHOTO URL CONSTRUCTION
// =============================================================================

/**
 * Constructs the official Congressional photo URL from a BioGuide ID.
 *
 * These photos are hosted on bioguide.congress.gov and are public.
 */
export function getCongressionalPhotoUrl(bioguideId: string): string {
  // Official Congressional photos are available at this URL pattern
  return `https://bioguide.congress.gov/bioguide/photo/${bioguideId[0]}/${bioguideId}.jpg`;
}

// =============================================================================
// GENERAL UTILITIES
// =============================================================================

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Gets the session number (1 or 2) for a given year within a Congress.
 */
export function getSessionNumber(year: number): 1 | 2 {
  // Odd years are Session 1, even years are Session 2
  return year % 2 === 1 ? 1 : 2;
}

export function chunk<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Retry a function with exponential backoff.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  baseDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;
      logger.warn(`Attempt ${attempt}/${maxAttempts} failed: ${lastError.message}`);

      if (attempt < maxAttempts) {
        const delay = baseDelayMs * Math.pow(2, attempt - 1);
        logger.debug(`Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw lastError;
}

/**
 * Loads configuration from environment variables with validation.
 */
export function loadConfig(): ETLConfig {
  const congressApiKey = process.env.CONGRESS_API_KEY;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const openaiApiKey = process.env.OPENAI_API_KEY;

  const errors: string[] = [];

  if (!congressApiKey) {
    errors.push('CONGRESS_API_KEY is required');
  }
  if (!supabaseUrl) {
    errors.push('SUPABASE_URL is required');
  }
  if (!supabaseServiceKey) {
    errors.push('SUPABASE_SERVICE_ROLE_KEY is required');
  }

  if (errors.length > 0) {
    throw new Error(`Configuration errors:\n${errors.join('\n')}`);
  }

  return {
    congressApiKey: congressApiKey!,
    supabaseUrl: supabaseUrl!,
    supabaseServiceKey: supabaseServiceKey!,
    openaiApiKey,
    daysBack: parseInt(process.env.ETL_DAYS_BACK || '7', 10),
    maxVotesPerRun: parseInt(process.env.ETL_MAX_VOTES || '100', 10),
    dryRun: process.env.ETL_DRY_RUN === 'true',
  };
}

/**
 * Constructs the official Congress.gov URL for a vote.
 */
export function getVoteSourceUrl(
  chamber: 'house' | 'senate',
  congress: number,
  session: number,
  rollNumber: number
): string {
  if (chamber === 'house') {
    return `https://clerk.house.gov/Votes/${new Date().getFullYear()}${rollNumber}`;
  } else {
    return `https://www.senate.gov/legislative/LIS/roll_call_votes/vote${congress}${session}/vote_${congress}_${session}_${String(rollNumber).padStart(5, '0')}.htm`;
  }
}

/**
 * Constructs the official Congress.gov URL for a bill.
 */
export function getBillSourceUrl(congress: number, type: string, number: number): string {
  const typeMap: Record<string, string> = {
    hr: 'house-bill',
    s: 'senate-bill',
    hres: 'house-resolution',
    sres: 'senate-resolution',
    hjres: 'house-joint-resolution',
    sjres: 'senate-joint-resolution',
    hconres: 'house-concurrent-resolution',
    sconres: 'senate-concurrent-resolution',
  };

  const urlType = typeMap[type.toLowerCase()] || type.toLowerCase();
  return `https://www.congress.gov/bill/${congress}th-congress/${urlType}/${number}`;
}
