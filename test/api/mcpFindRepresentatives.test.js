import { describe, it, expect, vi, beforeEach } from 'vitest'
import { makeSupabaseMock } from '../fixtures/supabaseChain.js'
import { makeRoster } from '../fixtures/roster.js'

const db = makeSupabaseMock()
const geo = vi.hoisted(() => ({ geocodeAddress: vi.fn(), geocodeZip: vi.fn(), zipDistricts: vi.fn(), zipDistrictsCongress: vi.fn(), territoryForZip: vi.fn(), getRoster: vi.fn() }))
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: (t) => db.from(t) } }))
vi.mock('../../api/_lib/geocode.js', () => ({ geocodeAddress: geo.geocodeAddress, geocodeZip: geo.geocodeZip }))
vi.mock('../../api/_lib/zipDistricts.js', () => ({ zipDistricts: geo.zipDistricts, zipDistrictsCongress: geo.zipDistrictsCongress, territoryForZip: geo.territoryForZip }))
vi.mock('../../api/_lib/roster.js', async (original) => ({ ...(await original()), getRoster: geo.getRoster }))

import { findRepresentatives, currentCongress } from '../../api/_lib/mcpTools.js'
import { _resetEtlMetaCache } from '../../api/_lib/etlMeta.js'

const ROSTER = makeRoster([
  { id: 'P000197', name: 'Nancy Pelosi', chamber: 'house', state: 'CA', district: '11', party: 'Democrat' },
  { id: 'K000389', name: 'Ro Khanna', chamber: 'house', state: 'CA', district: '17', party: 'Democrat' },
  { id: 'P000145', name: 'Alex Padilla', chamber: 'senate', state: 'CA', party: 'Democrat' },
  // A term without a politicians row: the roster names it by its id.
  { id: 'S001150', name: 'S001150', chamber: 'senate', state: 'CA', party: 'Democrat' },
  { id: 'M001242', name: 'Bernie Moreno', chamber: 'senate', state: 'OH', party: 'Republican' },
  { id: 'H001104', name: 'Jon Husted', chamber: 'senate', state: 'OH', party: 'Republican' },
  // Left the Senate; still has a term row for this Congress.
  { id: 'V000137', name: 'J. Vance', chamber: 'senate', state: 'OH', party: 'Republican', serving: false },
  { id: 'C001126', name: 'Mike Carey', chamber: 'house', state: 'OH', district: '15', party: 'Republican' },
  { id: 'B001281', name: 'Joyce Beatty', chamber: 'house', state: 'OH', district: '3', party: 'Democrat' },
  { id: 'T000489', name: 'Sylvester Turner', chamber: 'house', state: 'TX', district: '18', party: 'Democrat', serving: false },
  { id: 'B001318', name: 'Becca Balint', chamber: 'house', state: 'VT', district: '0', party: 'Democrat' },
  { id: 'S000033', name: 'Bernie Sanders', chamber: 'senate', state: 'VT', party: 'Independent' },
  { id: 'M001219', name: 'James Moylan', chamber: 'house', state: 'GU', district: '0', party: 'Republican' },
  { id: 'N000147', name: 'Eleanor Norton', chamber: 'house', state: 'DC', district: '0', party: 'Democrat' },
])

describe('findRepresentatives', () => {
  beforeEach(() => {
    db.reset()
    _resetEtlMetaCache()
    for (const f of Object.values(geo)) f.mockReset()
    geo.getRoster.mockResolvedValue(ROSTER)
    geo.zipDistrictsCongress.mockResolvedValue(119)
    geo.territoryForZip.mockReturnValue(null)
    db.responses.etl_metadata = { data: { value: '2026-09-05T10:25:32Z' } }
  })

  it('resolves an address to two senators and the House member for that district, with canonical URLs', async () => {
    geo.geocodeAddress.mockResolvedValue({ state: 'CA', district: '11', precision: 'address', matchedAddress: '1 DR CARLTON B GOODLETT PL, SAN FRANCISCO, CA, 94102' })

    const out = await findRepresentatives({ address: '  1 Dr Carlton B Goodlett Pl, San Francisco, CA  ' })
    expect(geo.geocodeAddress).toHaveBeenCalledWith('1 Dr Carlton B Goodlett Pl, San Francisco, CA')
    expect(geo.geocodeZip).not.toHaveBeenCalled()
    expect(geo.zipDistricts).not.toHaveBeenCalled()
    expect(geo.getRoster).toHaveBeenCalledWith(currentCongress())
    expect(out.location).toEqual({ state: 'CA', district: '11', precision: 'address', matched_address: '1 DR CARLTON B GOODLETT PL, SAN FRANCISCO, CA, 94102', note: null })
    // The Congress the members were read from (the roster's), not the clock's.
    expect(out.congress).toBe(ROSTER.congress)
    expect(out.serving_as_of).toEqual({ house: '2026-11-19', senate: '2026-11-20' })
    expect(out.representatives).toEqual([{
      bioguide_id: 'P000197', name: 'Nancy Pelosi', chamber: 'house', party: 'Democrat', state: 'CA', district: '11',
      canonical: 'https://www.ballotwatch.io/politician/P000197-nancy-pelosi', source_url: 'https://www.congress.gov/member/P000197',
    }])
    expect(out.senators.map((s) => s.bioguide_id)).toEqual(['P000145', 'S001150'])
    expect(out.senators[0].name).toBe('Alex Padilla')
    // A term without a politicians row still yields a citable stub rather than a crash.
    expect(out.senators[1]).toMatchObject({ name: 'S001150', party: 'Democrat', canonical: 'https://www.ballotwatch.io/politician/S001150' })
    expect(out.data_updated_at).toBe('2026-09-05T10:25:32Z')
  })

  it('never lists a member who has left office as someone\'s senator', async () => {
    geo.zipDistricts.mockResolvedValue([{ state: 'OH', district: '15', land_share_pct: 100 }])
    const out = await findRepresentatives({ zip: '43026' })
    expect(out.senators.map((s) => s.name)).toEqual(['Bernie Moreno', 'Jon Husted'])
    expect(out.representatives.map((r) => r.name)).toEqual(['Mike Carey'])
    // A ZIP wholly inside one district is exact: no centroid lookup, no caveat.
    expect(geo.geocodeZip).not.toHaveBeenCalled()
    expect(out.location).toEqual({ state: 'OH', district: '15', precision: 'zip', matched_address: null, note: null })
  })

  it('returns both main ZIP districts and reports the minor overlap separately', async () => {
    geo.zipDistricts.mockResolvedValue([{ state: 'OH', district: '15', land_share_pct: 54 }, { state: 'OH', district: '3', land_share_pct: 45 }, { state: 'TX', district: '18', land_share_pct: 0 }])
    const out = await findRepresentatives({ zip: '43215-1001' })
    expect(geo.zipDistricts).toHaveBeenCalledWith('43215')
    expect(out.location.district).toBeNull()
    expect(out.location.state).toBe('OH')
    expect(out.location.districts).toEqual([{ state: 'OH', district: '15', land_share_pct: 54 }, { state: 'OH', district: '3', land_share_pct: 45 }])
    expect(out.location.minor_overlaps).toEqual([{ state: 'TX', district: '18' }])
    expect(out.location.note).toBe("ZIP 43215 spans 2 congressional districts (OH-15, OH-3). A street address gives the exact one. land_share_pct is each district's share of the ZIP's land area, not of its residents. Under 1% of ZIP 43215's land also lies in TX-18; its members are not listed. Someone living there should give a street address.")
    expect(out.representatives.map((r) => `${r.name} ${r.district}`)).toEqual(['Mike Carey 15', 'Joyce Beatty 3'])
    expect(out.senators).toHaveLength(2)
  })

  it('says so when the seat has no sitting member', async () => {
    geo.zipDistricts.mockResolvedValue([{ state: 'TX', district: '18', land_share_pct: 100 }])
    const out = await findRepresentatives({ zip: '77002' })
    expect(out.representatives).toEqual([])
    expect(out.location.note).toBe('No sitting House member is recorded for TX-18; the seat may be vacant.')
  })

  it('falls back to the ZIP centroid when the ZIP has no Census area, and handles at-large and delegate seats', async () => {
    geo.zipDistricts.mockResolvedValue(null)
    geo.geocodeZip.mockResolvedValue({ state: 'VT', district: '0', precision: 'zip', city: 'Burlington', note: 'ZIP centroid; ZIP codes can span more than one district' })
    const vt = await findRepresentatives({ zip: '05401' })
    expect(geo.geocodeZip).toHaveBeenCalledWith('05401')
    expect(vt.location.note).toContain('ZIP centroid')
    expect(vt.representatives).toHaveLength(1)
    expect(vt.representatives[0]).toMatchObject({ bioguide_id: 'B001318', name: 'Becca Balint', district: '0' })
    expect(vt.senators.map((s) => s.name)).toEqual(['Bernie Sanders'])

    // DC: one delegate, no senators.
    geo.zipDistricts.mockResolvedValue([{ state: 'DC', district: '0', land_share_pct: 100 }])
    const dc = await findRepresentatives({ zip: '20001' })
    expect(dc.representatives.map((r) => r.name)).toEqual(['Eleanor Norton'])
    expect(dc.senators).toEqual([])
    expect(dc.location.note).toBeNull()
  })

  it('uses the ZIP when the address cannot be matched', async () => {
    geo.geocodeAddress.mockRejectedValue(new Error('500 from geocoding.geo.census.gov'))
    geo.zipDistricts.mockResolvedValue([{ state: 'CA', district: '17', land_share_pct: 100 }])
    const out = await findRepresentatives({ address: '1 Unmatched Way', zip: '95014' })
    expect(out.representatives.map((r) => r.name)).toEqual(['Ro Khanna'])
    expect(out.location.precision).toBe('zip')
  })

  it('keeps a single main district alongside a cross-state minor overlap', async () => {
    geo.zipDistricts.mockResolvedValue([{ state: 'OH', district: '15', land_share_pct: 99 }, { state: 'VT', district: '0', land_share_pct: 0 }])
    const out = await findRepresentatives({ zip: '43026' })
    expect(out.location).toEqual({
      state: 'OH', district: '15', precision: 'zip', matched_address: null,
      minor_overlaps: [{ state: 'VT', district: '0' }],
      note: "Under 1% of ZIP 43026's land also lies in VT-at large; its members are not listed. Someone living there should give a street address.",
    })
    expect(out.representatives.map((m) => m.bioguide_id)).toEqual(['C001126'])
    expect(out.senators.map((m) => m.bioguide_id)).toEqual(['M001242', 'H001104'])
  })

  it('skips district lines from a different Congress and dates roster verification by chamber', async () => {
    geo.getRoster.mockResolvedValue({ ...ROSTER, congress: 118, servingAsOf: { house: '2024-12-19', senate: null } })
    geo.geocodeZip.mockResolvedValue({ state: 'VT', district: '0', precision: 'zip' })
    const out = await findRepresentatives({ zip: '05401' })
    expect(geo.getRoster.mock.invocationCallOrder[0]).toBeLessThan(geo.zipDistrictsCongress.mock.invocationCallOrder[0])
    expect(geo.zipDistricts).not.toHaveBeenCalled()
    expect(geo.geocodeZip).toHaveBeenCalledWith('05401')
    expect(out.congress).toBe(118)
    expect(out.serving_as_of).toEqual({ house: '2024-12-19', senate: null })
    expect(out.representatives.map((m) => m.bioguide_id)).toEqual(['B001318'])
    expect(out.location.note).toBe('The Senate membership could not be checked against a recent roll call, so "serving" here means holding a term in the 118th Congress; a member who has since left may still be listed.')
  })

  it('resolves a territory ZIP without a Census area directly to its delegate', async () => {
    geo.zipDistricts.mockResolvedValue(null)
    geo.territoryForZip.mockReturnValue('GU')
    const out = await findRepresentatives({ zip: '96932' })
    expect(geo.territoryForZip).toHaveBeenCalledWith('96932')
    expect(geo.geocodeZip).not.toHaveBeenCalled()
    expect(out.location).toEqual({ state: 'GU', district: '0', precision: 'zip', matched_address: null, note: null })
    expect(out.representatives.map((m) => m.bioguide_id)).toEqual(['M001219'])
    expect(out.senators).toEqual([])
  })

  it('reads the roster and gives location-specific errors when geocoding fails', async () => {
    geo.geocodeAddress.mockResolvedValue(null)
    geo.zipDistricts.mockResolvedValue(null)
    geo.geocodeZip.mockRejectedValue(new Error('centroid unavailable'))
    expect(await findRepresentatives({ address: 'nowhere' })).toEqual({
      error: 'Could not resolve that location to a state and district. Check the address, or give a 5-digit ZIP code.',
    })
    expect(await findRepresentatives({ zip: '99999' })).toEqual({
      error: 'ZIP 99999 could not be matched to a congressional district (it may be a PO-box, military or new ZIP). Give a street address.',
    })
    expect(geo.getRoster.mock.calls).toEqual([[currentCongress()], [currentCongress()]])
    expect(geo.geocodeZip).toHaveBeenCalledExactlyOnceWith('99999')
  })

  it('rejects missing or malformed standalone input before reading the roster', async () => {
    expect(await findRepresentatives({ zip: 'abc' })).toEqual({
      error: '"abc" is not a 5-digit ZIP code. Give a 5-digit ZIP code or a street address.',
    })
    const missing = { error: 'Give a street address or a 5-digit ZIP code.' }
    expect(await findRepresentatives({})).toEqual(missing)
    expect(await findRepresentatives({ address: '   ' })).toEqual(missing)
    expect(geo.getRoster).not.toHaveBeenCalled()
    expect(db.calls).toHaveLength(0)
  })
})
