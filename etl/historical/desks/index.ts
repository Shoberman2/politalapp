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

export interface DeskDataForCongress {
  congress: number;
  assignments: HandCuratedAssignment[];
  lineageRows?: HandCuratedLineageRow[];
  notes?: string;
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
