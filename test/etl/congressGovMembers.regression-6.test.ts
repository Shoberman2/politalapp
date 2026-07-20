import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchMembersForCongress } from '../../etl/sources/congressGovMembers'

// Regression: ISSUE-006 — the historical importer selected the first chamber
// in a member's full career, labeling Sanders's Senate years as House service
// and former House members' service as Senate service.
// Found by /qa on 2026-07-10.

function congressResponse(members: unknown[]): Response {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    json: vi.fn().mockResolvedValue({ members, pagination: {} }),
  } as unknown as Response
}

const sandersCareer = {
  item: [
    { chamber: 'House of Representatives', startYear: 1991, endYear: 2007 },
    { chamber: 'Senate', startYear: 2007 },
  ],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('Congress.gov historical chamber regression', () => {
  it('uses the Congress-scoped district instead of the first career term', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(congressResponse([{
        bioguideId: 'S000033',
        name: 'Sanders, Bernard',
        partyName: 'Independent',
        state: 'Vermont',
        district: 0,
        terms: sandersCareer,
      }]))
      .mockResolvedValueOnce(congressResponse([{
        bioguideId: 'S000033',
        name: 'Sanders, Bernard',
        partyName: 'Independent',
        state: 'Vermont',
        terms: sandersCareer,
      }]))
      .mockResolvedValueOnce(congressResponse([{
        bioguideId: 'P000218',
        name: 'Pepper, Claude',
        partyName: 'Democratic',
        state: 'Florida',
        district: 14,
        terms: {
          item: [
            { chamber: 'Senate', startYear: 1936, endYear: 1951 },
            { chamber: 'House of Representatives', startYear: 1963, endYear: 1989 },
          ],
        },
      }]))
    vi.stubGlobal('fetch', fetchMock)

    const sandersHouse = await fetchMembersForCongress(109, '2005-01-03', 'test-key')
    const sandersSenate = await fetchMembersForCongress(110, '2007-01-03', 'test-key')
    const pepperHouse = await fetchMembersForCongress(93, '1973-01-03', 'test-key')

    expect(sandersHouse.terms[0]).toMatchObject({ chamber: 'house', district: '0' })
    expect(sandersSenate.terms[0]).toMatchObject({ chamber: 'senate', district: null })
    expect(pepperHouse.terms[0]).toMatchObject({ chamber: 'house', district: '14' })
  })
})
