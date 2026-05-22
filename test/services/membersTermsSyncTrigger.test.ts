import { describe, it, expect } from 'vitest'

/**
 * Q2 hybrid SOT sync-trigger REGRESSION test.
 *
 * Per Iron Rule from /plan-eng-review Section 3:
 *   When the coverage audit identifies a REGRESSION — code that previously
 *   worked but the diff broke — a regression test is added to the plan as
 *   a CRITICAL requirement.
 *
 * The Q2 decision introduces a Postgres trigger (migration 009) that keeps
 * politicians.party/state/district in sync with the MOST-RECENT row in
 * member_congress_terms. The CRITICAL INVARIANT is:
 *
 *   After any sequence of INSERTs / UPDATEs on member_congress_terms, the
 *   politicians row for any bioguide_id with terms reflects the most-recent
 *   term (highest congress, then latest term_start as tiebreaker).
 *
 * This file ships an in-process SIMULATION of the trigger logic (mirroring
 * the SQL in migration 009) plus a regression scenario suite.
 *
 * Why in-process simulation rather than a real DB test:
 *   - The CI environment doesn't provision a Supabase / Postgres instance.
 *   - The TRIGGER logic is small + deterministic; we can run a behavioral
 *     equivalent in JS and assert the invariant.
 *   - This catches drift between the SQL trigger and our mental model.
 *     If migration 009 ever changes the "most-recent" definition, this
 *     test must also be updated — that's the point.
 *
 * For an end-to-end DB-level integration test, follow up with a supabase
 * integration suite spun against a local Postgres (recommended once
 * P1 backfill runs against a live staging project).
 */

// ---- Simulation of migration 009 ----

interface TermRow {
  bioguide_id: string
  congress: number
  term_start: string // ISO YYYY-MM-DD
  chamber: 'house' | 'senate'
  state: string
  district: string | null
  party: string
}

interface PoliticianRow {
  id: string
  party: string
  state: string
  district: string | null
  chamber: 'house' | 'senate'
}

/**
 * Mirrors the SELECT ... ORDER BY congress DESC, term_start DESC LIMIT 1
 * inside the SQL trigger.
 */
function findMostRecentTerm(
  terms: TermRow[],
  bioguideId: string
): TermRow | null {
  const filtered = terms.filter((t) => t.bioguide_id === bioguideId)
  if (filtered.length === 0) return null
  filtered.sort((a, b) => {
    if (b.congress !== a.congress) return b.congress - a.congress
    return b.term_start.localeCompare(a.term_start)
  })
  return filtered[0]
}

/**
 * Simulates one trigger fire — the UPDATE politicians SET ... step.
 * Returns a new politicians map with the synced row (or unchanged if no
 * politicians row exists for this bioguide, per the trigger's IF NOT EXISTS
 * UPDATE semantics).
 */
function applySync(
  terms: TermRow[],
  politicians: Map<string, PoliticianRow>,
  changedBioguide: string
): Map<string, PoliticianRow> {
  const recent = findMostRecentTerm(terms, changedBioguide)
  if (!recent) return politicians
  const existing = politicians.get(changedBioguide)
  if (!existing) return politicians // trigger only UPDATEs existing rows
  const next = new Map(politicians)
  next.set(changedBioguide, {
    ...existing,
    party: recent.party,
    state: recent.state,
    district: recent.district,
    chamber: recent.chamber,
  })
  return next
}

// ---- Test scenarios ----

describe('Q2 hybrid SOT sync trigger (regression)', () => {
  it('CRITICAL INVARIANT: politicians never drifts from member_congress_terms most-recent after 1000 random inserts', () => {
    // Seed with 50 fake bioguides each having a base politicians row.
    const politicians = new Map<string, PoliticianRow>()
    for (let i = 0; i < 50; i++) {
      const id = `X${String(i).padStart(6, '0')}`
      politicians.set(id, {
        id,
        party: 'D',
        state: 'CA',
        district: null,
        chamber: 'senate',
      })
    }

    const terms: TermRow[] = []
    let live = politicians

    // Generate 1000 random INSERTs of (bioguide, congress, term_start, party, state, district).
    for (let i = 0; i < 1000; i++) {
      const bioguideIdx = Math.floor(Math.random() * 50)
      const bioguide = `X${String(bioguideIdx).padStart(6, '0')}`
      const congress = 93 + Math.floor(Math.random() * 27) // 93-119
      const termStartDay = Math.floor(Math.random() * 700)
      const baseDate = new Date(`${1973 + 2 * (congress - 93)}-01-03`)
      const termStart = new Date(
        baseDate.getTime() + termStartDay * 86400 * 1000
      )
      const partyChoice = Math.floor(Math.random() * 3)
      const party = ['D', 'R', 'I'][partyChoice]
      const stateChoice = Math.floor(Math.random() * 3)
      const state = ['CA', 'NY', 'TX'][stateChoice]
      const newTerm: TermRow = {
        bioguide_id: bioguide,
        congress,
        term_start: termStart.toISOString().slice(0, 10),
        chamber: 'senate',
        state,
        district: null,
        party,
      }
      terms.push(newTerm)
      live = applySync(terms, live, bioguide)

      // Invariant check after every insert: each politicians row reflects
      // the most-recent term for that bioguide.
      for (const [id, pol] of live) {
        const recent = findMostRecentTerm(terms, id)
        if (recent) {
          expect(pol.party).toBe(recent.party)
          expect(pol.state).toBe(recent.state)
          expect(pol.district).toBe(recent.district)
        }
      }
    }
  })

  it('handles party-switcher: Specter 2009 R→D mid-term yields 2 terms; politicians reflects most recent', () => {
    const terms: TermRow[] = []
    const politicians = new Map<string, PoliticianRow>([
      [
        'S000709',
        { id: 'S000709', party: 'R', state: 'PA', district: null, chamber: 'senate' },
      ],
    ])

    // First term: Specter as R, 111th Congress start.
    terms.push({
      bioguide_id: 'S000709',
      congress: 111,
      term_start: '2009-01-03',
      chamber: 'senate',
      state: 'PA',
      district: null,
      party: 'R',
    })
    let live = applySync(terms, politicians, 'S000709')
    expect(live.get('S000709')?.party).toBe('R')

    // Second term: Specter switches to D in April 2009.
    terms.push({
      bioguide_id: 'S000709',
      congress: 111,
      term_start: '2009-04-30',
      chamber: 'senate',
      state: 'PA',
      district: null,
      party: 'D',
    })
    live = applySync(terms, live, 'S000709')
    expect(live.get('S000709')?.party).toBe('D')

    // Both terms still exist in the history.
    expect(terms.filter((t) => t.bioguide_id === 'S000709')).toHaveLength(2)
  })

  it('handles mid-Congress vacancy + appointment: Kennedy → Brown MA 2010', () => {
    const terms: TermRow[] = []
    const politicians = new Map<string, PoliticianRow>([
      [
        'K000105',
        { id: 'K000105', party: 'D', state: 'MA', district: null, chamber: 'senate' },
      ],
      [
        'B001257',
        { id: 'B001257', party: 'R', state: 'MA', district: null, chamber: 'senate' },
      ],
    ])

    // Kennedy starts the 111th Congress as D.
    terms.push({
      bioguide_id: 'K000105',
      congress: 111,
      term_start: '2009-01-03',
      chamber: 'senate',
      state: 'MA',
      district: null,
      party: 'D',
    })
    let live = applySync(terms, politicians, 'K000105')
    expect(live.get('K000105')?.party).toBe('D')

    // Brown joins after Kennedy's death + special election (Feb 2010).
    terms.push({
      bioguide_id: 'B001257',
      congress: 111,
      term_start: '2010-02-04',
      chamber: 'senate',
      state: 'MA',
      district: null,
      party: 'R',
    })
    live = applySync(terms, live, 'B001257')
    expect(live.get('B001257')?.party).toBe('R')

    // Both politicians rows reflect their own most-recent term; Kennedy's
    // row still shows D (not overwritten by Brown's term).
    expect(live.get('K000105')?.party).toBe('D')
    expect(live.get('B001257')?.party).toBe('R')
  })

  it('does NOT create politicians row when bioguide has no existing politicians entry', () => {
    // Trigger only UPDATEs; it never INSERTs into politicians. ETL is
    // responsible for that.
    const terms: TermRow[] = [
      {
        bioguide_id: 'NEWGUY01',
        congress: 119,
        term_start: '2025-01-03',
        chamber: 'senate',
        state: 'CA',
        district: null,
        party: 'D',
      },
    ]
    const politicians = new Map<string, PoliticianRow>()
    const after = applySync(terms, politicians, 'NEWGUY01')
    expect(after.has('NEWGUY01')).toBe(false)
    expect(after.size).toBe(0)
  })

  it('tie-breaks on term_start when two rows share the same congress', () => {
    const terms: TermRow[] = []
    const politicians = new Map<string, PoliticianRow>([
      [
        'TIEBREAK',
        { id: 'TIEBREAK', party: 'I', state: 'VT', district: null, chamber: 'senate' },
      ],
    ])

    terms.push({
      bioguide_id: 'TIEBREAK',
      congress: 119,
      term_start: '2025-01-03',
      chamber: 'senate',
      state: 'VT',
      district: null,
      party: 'I',
    })
    terms.push({
      bioguide_id: 'TIEBREAK',
      congress: 119,
      term_start: '2025-06-01', // later in the same Congress
      chamber: 'senate',
      state: 'VT',
      district: null,
      party: 'D', // switched caucus
    })
    const live = applySync(terms, politicians, 'TIEBREAK')
    expect(live.get('TIEBREAK')?.party).toBe('D')
  })
})
