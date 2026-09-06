import { describe, it, expect, vi } from 'vitest'

// billCard.js builds its own anon client; script the tables it reads.
const tables = vi.hoisted(() => ({}))
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({
    from: (name) => {
      const rows = tables[name]
      const q = {
        select: () => q, eq: () => q, order: () => q, limit: () => q,
        maybeSingle: async () => ({ data: Array.isArray(rows) ? rows[0] ?? null : rows ?? null, error: null }),
      }
      return q
    },
  }),
}))

import { fetchCardData } from '../../api/_lib/billCard.js'

describe('fetchCardData explanation gate', () => {
  it('discards an explanation cached under a stale title and falls back to the official summary', async () => {
    tables.bills = { id: '119-hr-1', title: 'An act to provide for reconciliation pursuant to title II of H. Con. Res. 14.', introduced_at: '2025-07-04', summary: 'older summary', crs_summary: 'Official CRS text.', policy_area: null, source_url: 'https://www.congress.gov/bill/119th-congress/house-bill/1' }
    tables.votes = null
    tables.bill_explanations = { paragraphs: ['The For the People Act of 2025 is a piece of legislation aimed at voting.'], bill_title: 'For the People Act of 2025' }
    const card = await fetchCardData('119-hr-1')
    expect(card.aiOneLiner).toBe('Official CRS text.')
  })

  it('keeps an explanation generated for the current title', async () => {
    tables.bills = { id: '119-hr-4795', title: 'Water Resources Development Act of 2026', crs_summary: null, summary: null, source_url: 'https://example.gov' }
    tables.votes = null
    tables.bill_explanations = { paragraphs: ['The Water Resources Development Act of 2026 authorizes projects.'], bill_title: 'Water Resources Development Act of 2026' }
    const card = await fetchCardData('119-hr-4795')
    expect(card.aiOneLiner).toBe('The Water Resources Development Act of 2026 authorizes projects.')
  })
})
