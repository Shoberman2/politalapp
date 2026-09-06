import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '../fixtures/supabaseChain.js'

const db = makeSupabaseMock()
const geo = vi.hoisted(() => ({ geocodeAddress: vi.fn(), geocodeZip: vi.fn() }))
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: (t) => db.from(t) } }))
vi.mock('../../api/_lib/geocode.js', () => ({ geocodeAddress: geo.geocodeAddress, geocodeZip: geo.geocodeZip }))

import { findRepresentatives, currentCongress } from '../../api/_lib/mcpTools.js'

describe('findRepresentatives', () => {
  beforeEach(() => { db.reset(); geo.geocodeAddress.mockReset(); geo.geocodeZip.mockReset() })

  it('resolves an address to two senators and the House member for that district, with canonical URLs', async () => {
    geo.geocodeAddress.mockResolvedValue({ state: 'CA', district: '11', precision: 'address', matchedAddress: '1 DR CARLTON B GOODLETT PL, SAN FRANCISCO, CA, 94102' })
    db.responses.member_congress_terms = { data: [
      { bioguide_id: 'P000197', chamber: 'house', state: 'CA', district: '11', party: 'D' },
      { bioguide_id: 'K000389', chamber: 'house', state: 'CA', district: '17', party: 'D' },
      { bioguide_id: 'P000145', chamber: 'senate', state: 'CA', district: null, party: 'D' },
      { bioguide_id: 'S001150', chamber: 'senate', state: 'CA', district: null, party: 'D' },
    ] }
    db.responses.politicians = { data: [
      { id: 'P000197', name: 'Nancy Pelosi', chamber: 'house', party: 'Democratic', state: 'CA', district: null },
      { id: 'P000145', name: 'Alex Padilla', chamber: 'senate', party: 'Democratic', state: 'CA', district: null },
    ] }
    db.responses.etl_metadata = { data: { value: '2026-09-05T10:25:32Z' } }

    const out = await findRepresentatives({ address: '  1 Dr Carlton B Goodlett Pl, San Francisco, CA  ' })
    expect(geo.geocodeAddress).toHaveBeenCalledWith('1 Dr Carlton B Goodlett Pl, San Francisco, CA')
    expect(geo.geocodeZip).not.toHaveBeenCalled()
    expect(out.location).toEqual({ state: 'CA', district: '11', precision: 'address', matched_address: '1 DR CARLTON B GOODLETT PL, SAN FRANCISCO, CA, 94102', note: null })
    expect(out.congress).toBe(currentCongress())
    expect(out.representatives).toEqual([{
      bioguide_id: 'P000197', name: 'Nancy Pelosi', chamber: 'house', party: 'Democratic', state: 'CA', district: '11',
      canonical: 'https://www.ballotwatch.io/politician/P000197', source_url: 'https://www.congress.gov/member/P000197',
    }])
    expect(out.senators.map((s) => s.bioguide_id)).toEqual(['P000145', 'S001150'])
    expect(out.senators[0].name).toBe('Alex Padilla')
    // A term without a politicians row still yields a citable stub rather than a crash.
    expect(out.senators[1]).toMatchObject({ name: 'S001150', party: 'D', canonical: 'https://www.ballotwatch.io/politician/S001150' })
    expect(out.data_updated_at).toBe('2026-09-05T10:25:32Z')
    expect(db.calls[0].ops).toEqual([
      ['select', 'bioguide_id, chamber, state, district, party'],
      ['eq', 'congress', currentCongress()],
      ['eq', 'state', 'CA'],
      ['is', 'term_end', null],
    ])
    expect(db.ops('politicians', 'in')[0]).toEqual(['in', 'id', ['P000145', 'S001150', 'P000197']])

    // A ZIP in an at-large state matches the seat stored with a null district.
    db.reset()
    geo.geocodeZip.mockResolvedValue({ state: 'VT', district: '0', precision: 'zip', city: 'Burlington', note: 'ZIP centroid; ZIP codes can span more than one district' })
    db.responses.member_congress_terms = { data: [{ bioguide_id: 'B001318', chamber: 'house', state: 'VT', district: null, party: 'D' }] }
    db.responses.politicians = { data: [{ id: 'B001318', name: 'Becca Balint', chamber: 'house', party: 'Democratic', state: 'VT', district: '0' }] }
    const vt = await findRepresentatives({ zip: '05401' })
    expect(geo.geocodeZip).toHaveBeenCalledWith('05401')
    expect(vt.location.note).toContain('ZIP centroid')
    expect(vt.representatives).toHaveLength(1)
    expect(vt.representatives[0]).toMatchObject({ bioguide_id: 'B001318', name: 'Becca Balint', district: '0' })
    expect(vt.senators).toEqual([])

    // Nothing resolvable: a tool error, and the database is never consulted.
    db.reset()
    geo.geocodeAddress.mockResolvedValue(null)
    const unresolved = { error: 'Could not resolve that location to a state and district.' }
    expect(await findRepresentatives({ address: 'nowhere' })).toEqual(unresolved)
    expect(await findRepresentatives({})).toEqual(unresolved)
    expect(await findRepresentatives({ address: '   ' })).toEqual(unresolved)
    expect(db.calls).toHaveLength(0)
  })
})
