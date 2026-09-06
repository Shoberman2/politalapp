import { describe, it, expect, vi, beforeEach } from 'vitest'

const m = vi.hoisted(() => ({ maybeSingle: vi.fn() }))
vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: m.maybeSingle }) }) }) } }))

import { getDataUpdatedAt, _resetEtlMetaCache } from '../../api/_lib/etlMeta.js'

describe('getDataUpdatedAt', () => {
  beforeEach(() => { _resetEtlMetaCache(); m.maybeSingle.mockReset() })

  it('reads the last successful run and caches it', async () => {
    m.maybeSingle.mockResolvedValue({ data: { value: '2026-09-05T10:25:32.028Z' } })
    expect(await getDataUpdatedAt()).toBe('2026-09-05T10:25:32.028Z')
    expect(await getDataUpdatedAt()).toBe('2026-09-05T10:25:32.028Z')
    expect(m.maybeSingle).toHaveBeenCalledTimes(1)
  })

  it('returns null when the lookup fails instead of throwing', async () => {
    m.maybeSingle.mockRejectedValue(new Error('db down'))
    expect(await getDataUpdatedAt()).toBeNull()
  })
})
