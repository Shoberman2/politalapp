/**
 * Fidelity tier — single source of truth for per-Congress data coverage.
 *
 * Imported by:
 *   - Frontend (Vite): chamber UI components for disclosure banners + UI gating
 *   - ETL (tsx/Node): backfill orchestrator marks Congresses as it processes them
 *   - Edge Functions (Deno): future moments edge function, if any
 *
 * Lives at repo root /shared/ so all three runtimes resolve via relative path
 * without cross-boundary tsconfig friction.
 *
 * Mirrors the `fidelity_tier` column in congress_metadata (migration 008).
 */

export type FidelityTier = 'full' | 'partial' | 'composition_only';

export interface FidelityInfo {
  tier: FidelityTier;
  label: string;
  caveat: string | null;
  /** True if the per-desk chamber chart can be rendered for this Congress. */
  hasDeskData: boolean;
  /** True if individual roll-call votes are available for this Congress. */
  hasVoteData: boolean;
}

const FIDELITY_TABLE: Record<FidelityTier, FidelityInfo> = {
  full: {
    tier: 'full',
    label: 'Full record',
    caveat: null,
    hasDeskData: true,
    hasVoteData: true,
  },
  partial: {
    tier: 'partial',
    label: 'Partial record',
    caveat:
      'Some senators or roll-call votes are missing for this Congress. ' +
      'Methodology page explains gaps.',
    hasDeskData: true,
    hasVoteData: true,
  },
  composition_only: {
    tier: 'composition_only',
    label: 'Composition only',
    caveat:
      'Desk assignments are not available for this Congress. ' +
      'The chart shows party composition; positions are illustrative.',
    hasDeskData: false,
    hasVoteData: false,
  },
};

export function getFidelityInfo(tier: FidelityTier): FidelityInfo {
  return FIDELITY_TABLE[tier];
}

export function isFidelityTier(value: unknown): value is FidelityTier {
  return value === 'full' || value === 'partial' || value === 'composition_only';
}

/** Dot color (hex) per DESIGN.md semantic palette. */
export function fidelityDotColor(tier: FidelityTier): string {
  switch (tier) {
    case 'full':
      return '#16A34A';
    case 'partial':
      return '#D97706';
    case 'composition_only':
      return '#9C9789';
  }
}
