import { beforeEach, describe, expect, it, vi } from 'vitest'

const axiosMock = vi.hoisted(() => {
  const get = vi.fn()
  return {
    get,
    client: {
      get,
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    },
  }
})

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => axiosMock.client),
  },
}))

import {
  getCandidateDonors,
  getCurrentFecCycle,
} from '../../src/services/donations.js'

describe('FEC campaign finance service', () => {
  beforeEach(() => {
    axiosMock.get.mockReset()
    localStorage.clear()
  })

  it('derives the active two-year FEC cycle instead of freezing the query to 2024', () => {
    expect(getCurrentFecCycle(new Date('2025-01-01T00:00:00Z'))).toBe(2026)
    expect(getCurrentFecCycle(new Date('2026-08-15T00:00:00Z'))).toBe(2026)
    expect(getCurrentFecCycle(new Date('2027-01-01T00:00:00Z'))).toBe(2028)
  })

  it('uses candidate totals for the selected cycle and requests de-duplicated current receipts', async () => {
    axiosMock.get.mockImplementation(async (url, config = {}) => {
      if (url === '/candidate/H8NY15148/committees/') {
        return {
          data: {
            results: [{
              committee_id: 'C00639591',
              name: 'ALEXANDRIA OCASIO-CORTEZ FOR CONGRESS',
              designation: 'P',
              cycles: [2024, 2026],
            }],
          },
        }
      }

      if (url === '/candidate/H8NY15148/totals/') {
        return {
          data: {
            results: [{
              cycle: 2026,
              receipts: 32_607_753.66,
              disbursements: 20_381_468.84,
              individual_contributions: 29_500_000,
              other_political_committee_contributions: 525_000,
              coverage_end_date: '2026-06-30',
            }],
          },
        }
      }

      if (url === '/schedules/schedule_a/' && config.params?.is_individual === true) {
        return {
          data: {
            results: [{
              contributor_name: 'CURRENT CYCLE DONOR',
              contributor_employer: 'ACME HEALTH',
              entity_type: 'IND',
              contribution_receipt_amount: 3_500,
            }],
          },
        }
      }

      if (url === '/schedules/schedule_a/' && config.params?.contributor_type === 'committee') {
        return {
          data: {
            results: [{
              contributor_name: 'CURRENT CYCLE PAC',
              entity_type: 'COM',
              contribution_receipt_amount: 5_000,
            }],
          },
        }
      }

      return { data: { results: [] } }
    })

    const result = await getCandidateDonors('H8NY15148', 2026)

    expect(result.totalRaised).toBe(32_607_753.66)
    expect(result.totalSpent).toBe(20_381_468.84)
    expect(result.individualTotal).toBe(29_500_000)
    expect(result.pacTotal).toBe(525_000)
    expect(result.cycle).toBe(2026)
    expect(result.coverageEndDate).toBe('2026-06-30')
    expect(result.donors.map((donor) => donor.name)).toEqual([
      'CURRENT CYCLE PAC',
      'CURRENT CYCLE DONOR',
    ])

    expect(axiosMock.get).toHaveBeenCalledWith(
      '/candidate/H8NY15148/totals/',
      { params: { cycle: 2026, per_page: 1 } },
    )
    expect(axiosMock.get).toHaveBeenCalledWith(
      '/schedules/schedule_a/',
      expect.objectContaining({
        params: expect.objectContaining({
          committee_id: 'C00639591',
          is_individual: true,
          two_year_transaction_period: 2026,
        }),
      }),
    )
  })
})
