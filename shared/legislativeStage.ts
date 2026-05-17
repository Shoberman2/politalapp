/**
 * Legislative stage classifier — single source of truth.
 *
 * Imported by:
 *   - Frontend (Vite/.ts): src/components/BillsPage.jsx + BillDetail.jsx
 *   - ETL (tsx/Node): etl/extractIntroducedBills.ts + load.ts + backfill
 *
 * Lives at repo root /shared/ so both runtimes can resolve via relative path
 * without cross-boundary tsconfig friction (per eng-review D21).
 *
 * Returns {stage, label} only. CSS class derived per-component via a small
 * local map (per eng-review D8) — keeps presentation out of utils.
 */

export type LegislativeStage =
  | 'introduced'
  | 'referred'
  | 'subcommittee'
  | 'committee'
  | 'floor'
  | 'passed_one'
  | 'passed_both'
  | 'enacted'
  | 'dead'
  | 'unknown';

export interface StageInfo {
  stage: LegislativeStage;
  label: string;
}

// Table-driven matcher (per eng-review D6). Ordered most-specific first;
// the first matching regex wins. Order matters — patterns like
// "motion to table" must be checked BEFORE the more general
// "agreed to in (chamber)" pattern, because the text often includes both.
const STAGE_PATTERNS: Array<{ regex: RegExp; stage: LegislativeStage }> = [
  // Enacted — became law or signed
  { regex: /\bbecame public law\b/i, stage: 'enacted' },
  { regex: /\bsigned by president\b/i, stage: 'enacted' },
  { regex: /\bpresented to president\b/i, stage: 'enacted' },

  // Passed both chambers
  { regex: /\bpassed (the )?house\b.*\bpassed (the )?senate\b/i, stage: 'passed_both' },
  { regex: /\bpassed (the )?senate\b.*\bpassed (the )?house\b/i, stage: 'passed_both' },

  // Dead — explicit non-action terminal states. MUST come before the
  // generic "agreed to in (chamber)" passed_one pattern, because the
  // canonical action text is "Motion to table agreed to in House" — the
  // bill is dead, not passed.
  { regex: /\bpocket vetoed\b/i, stage: 'dead' },
  { regex: /\bvetoed\b/i, stage: 'dead' },
  { regex: /\bfailed of passage\b/i, stage: 'dead' },
  { regex: /\bmotion to table agreed to\b/i, stage: 'dead' },
  { regex: /\bobjected to\b/i, stage: 'dead' },

  // Floor consideration — also must precede generic "agreed to" so that
  // "Motion to proceed agreed to in Senate" classifies as floor.
  { regex: /\bmotion to proceed\b/i, stage: 'floor' },
  { regex: /\bmotion to recommit\b/i, stage: 'floor' },
  { regex: /\bplaced on (the )?calendar\b/i, stage: 'floor' },
  { regex: /\bcloture\b/i, stage: 'floor' },

  // Passed one chamber
  { regex: /\bpassed (the )?house\b/i, stage: 'passed_one' },
  { regex: /\bpassed (the )?senate\b/i, stage: 'passed_one' },
  { regex: /\bagreed to in (the )?house\b/i, stage: 'passed_one' },
  { regex: /\bagreed to in (the )?senate\b/i, stage: 'passed_one' },

  // Committee — reported out, markup, ordered reported
  { regex: /\breported by\b/i, stage: 'committee' },
  { regex: /\bordered to be reported\b/i, stage: 'committee' },
  { regex: /\bcommittee on .* discharged\b/i, stage: 'committee' },
  { regex: /\bcommittee consideration\b/i, stage: 'committee' },
  { regex: /\bmarkup\b/i, stage: 'committee' },

  // Subcommittee
  { regex: /\breferred to (the )?subcommittee\b/i, stage: 'subcommittee' },
  { regex: /\bsubcommittee\b/i, stage: 'subcommittee' },

  // Referred — in committee but no further action yet
  { regex: /\breferred to (the )?house committee\b/i, stage: 'referred' },
  { regex: /\breferred to (the )?senate committee\b/i, stage: 'referred' },
  { regex: /\breferred to (the )?committee\b/i, stage: 'referred' },

  // Introduced — the baseline state
  { regex: /\bintroduced in (the )?house\b/i, stage: 'introduced' },
  { regex: /\bintroduced in (the )?senate\b/i, stage: 'introduced' },
  { regex: /\bintroduced\b/i, stage: 'introduced' },
];

const STAGE_LABELS: Record<LegislativeStage, string> = {
  introduced: 'Introduced',
  referred: 'In Committee',
  subcommittee: 'In Subcommittee',
  committee: 'Committee Markup',
  floor: 'Awaiting Floor Vote',
  passed_one: 'Passed One Chamber',
  passed_both: 'Passed Both Chambers',
  enacted: 'Became Law',
  dead: 'Failed / Vetoed',
  unknown: 'In Progress',
};

/**
 * Derive a legislative stage from a Congress.gov latestAction.text string.
 * Returns 'unknown' for unrecognized text rather than throwing.
 */
export function deriveLegislativeStage(latestActionText: string | null | undefined): LegislativeStage {
  if (!latestActionText || typeof latestActionText !== 'string') {
    return 'unknown';
  }
  for (const { regex, stage } of STAGE_PATTERNS) {
    if (regex.test(latestActionText)) {
      return stage;
    }
  }
  return 'unknown';
}

/**
 * Translate a stage enum into UI display info. Components add their own
 * CSS class via a small local map (one per call site) so presentation
 * stays out of this shared util.
 */
export function stageToLabel(stage: LegislativeStage): StageInfo {
  return {
    stage,
    label: STAGE_LABELS[stage] || STAGE_LABELS.unknown,
  };
}

/**
 * Convenience: derive + label in one call.
 */
export function classifyLatestAction(latestActionText: string | null | undefined): StageInfo {
  return stageToLabel(deriveLegislativeStage(latestActionText));
}
