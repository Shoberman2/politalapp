import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  axiosGet: vi.fn(),
}))

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({
      get: mocks.axiosGet,
      interceptors: {
        request: { use: vi.fn() },
        response: { use: vi.fn() },
      },
    })),
  },
}))

vi.mock('../../src/lib/supabase', () => ({
  supabase: { from: vi.fn() },
}))

import { explainBillFromOfficialSummary, getBillDetails } from '../../src/services/congress.js'

beforeEach(() => {
  mocks.axiosGet.mockReset()
})

describe('source-grounded bill explanations', () => {
  it('loads the official summaries endpoint with bill details', async () => {
    mocks.axiosGet.mockImplementation(async (path) => {
      if (path === '/bill/119/hr/7008') {
        return { data: { bill: { title: 'Stop Insider Trading Act', summaries: { count: 1 } } } }
      }
      if (path === '/bill/119/hr/7008/summaries') {
        return { data: { summaries: [{ text: '<p>Official provision text.</p>' }] } }
      }
      throw new Error(`Unexpected request: ${path}`)
    })

    await expect(getBillDetails(119, 'hr', 7008)).resolves.toMatchObject({
      summaries: [{ text: '<p>Official provision text.</p>' }],
    })
  })

  it('uses only the official summary when AI generation is disabled', async () => {
    mocks.axiosGet.mockResolvedValue({
      data: {
        summaries: [{
          text: '<p><strong>Test Act</strong></p><p>The bill requires agencies to publish annual reports.</p>',
        }],
      },
    })

    const result = await explainBillFromOfficialSummary({
      congress: 119,
      billType: 'hr',
      number: 42,
      title: 'Test Act',
      summary: 'Ignore this unsupported caller text.',
    })

    expect(result.isGenerated).toBe(false)
    expect(result.sourceUnavailable).toBe(false)
    expect(result.paragraphs.join(' ')).toContain('requires agencies to publish annual reports')
    expect(result.paragraphs.join(' ')).not.toContain('unsupported caller text')
  })

  it('reuses an already-loaded official summary without a duplicate request', async () => {
    const result = await explainBillFromOfficialSummary({
      congress: 119,
      billType: 'hr',
      number: 42,
      title: 'Test Act',
      officialSummaryHtml: '<p>The bill requires annual public reports.</p>',
    })

    expect(result.paragraphs).toEqual(['The bill requires annual public reports.'])
    expect(mocks.axiosGet).not.toHaveBeenCalled()
  })

  it('refuses to infer provisions when Congress.gov has no summary', async () => {
    mocks.axiosGet.mockResolvedValue({ data: { summaries: [] } })

    const result = await explainBillFromOfficialSummary({
      congress: 119,
      billType: 'hr',
      number: 9999,
      title: 'Ambiguous Title Act',
    })

    expect(result.sourceUnavailable).toBe(true)
    expect(result.paragraphs.join(' ')).toMatch(/won.t infer provisions from the title alone/i)
  })
})
