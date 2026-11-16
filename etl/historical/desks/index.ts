/**
 * Hand-curated Senate desk assignment registry.
 *
 * For each Congress where we have desk-level data, we register a module here
 * that exports DeskDataForCongress: the list of (desk_id, bioguide_id)
 * assignments + any lineage rows we have for famous desks.
 *
 * v1 ships with 119th only. As we curate older Congresses from Senate
 * Historical Office PDFs, more modules get registered here.
 *
 * Pre-119th Congresses fall back to fidelity_tier='composition_only' until
 * their data is curated — the chamber UI renders party-block hemicycle
 * instead of individual desks for those Congresses (per [editorial-chamber-
 * honest-mobile-fallback] principle: never silently fake data).
 */

import { deskData119th } from './119th.js';

export interface HandCuratedAssignment {
  deskId: number;
  bioguideId: string | null;
  assignedAt?: string;
  vacatedAt?: string;
  reason?: string;
  confidence?: 'high' | 'medium' | 'low';
}

// Nullable fields are intentional: hand-curated rows often have explicit
// null values where data is known-absent (vs undefined which signals "we
// haven't recorded this yet"). The senateHistoricalOfficeDesks ingester
// converts both null and undefined to null at the DB boundary.
export interface HandCuratedLineageRow {
  deskId: number;
  yearStart: number;
  yearEnd?: number | null;
  bioguideId?: string | null;
  occupantName?: string | null;
  party?: string | null;
  state?: string | null;
  notes?: string | null;
  source?: string | null;
}

// Where a desk stands on the floor. Desks are moved between the two sides at
// the start of a Congress, so this is per floor plan, not a fixed fact about
// the desk. The loader writes the newest plan's layout to senate_desks.
export interface DeskLayoutRow {
  deskId: number;
  side: 'D' | 'R' | 'aisle';
  arc: number;
  position: number;
  famousName?: string | null;
  description?: string | null;
}

export interface DeskDataForCongress {
  congress: number;
  assignments: HandCuratedAssignment[];
  lineageRows?: HandCuratedLineageRow[];
  notes?: string;
  /** Written to senate_desk_assignments.source. Defaults to 'hand_curated_sho'. */
  source?: string;
  /** All 100 desks' positions for this Congress's current floor plan. */
  desks?: DeskLayoutRow[];
  /**
   * Desk ids an earlier version of this file wrongly called famous. The loader
   * deletes their lineage rows; `desks` then rewrites their name to null.
   */
  retiredFamousDeskIds?: number[];
}

const REGISTRY: Record<number, DeskDataForCongress> = {
  119: deskData119th,
};

export function getDeskDataForCongress(
  congress: number
): DeskDataForCongress | null {
  return REGISTRY[congress] ?? null;
}

export function listCuratedCongresses(): number[] {
  return Object.keys(REGISTRY)
    .map((s) => parseInt(s, 10))
    .sort((a, b) => a - b);
}
