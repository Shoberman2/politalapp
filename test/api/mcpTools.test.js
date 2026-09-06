import { describe, it, expect, vi } from 'vitest'

vi.mock('../../api/_lib/supabase.js', () => ({ supabaseAdmin: { from: vi.fn() } }))

import { normalizeBillId, currentCongress } from '../../api/_lib/mcpTools.js'
import { districtFromGeographies } from '../../api/_lib/geocode.js'

describe('mcpTools helpers', () => {
  it('normalizes bill ids in the forms agents actually type', () => {
    expect(normalizeBillId('119-hr-1')).toBe('119-hr-1')
    expect(normalizeBillId('H.R. 1', 119)).toBe('119-hr-1')
    expect(normalizeBillId('hr1', 119)).toBe('119-hr-1')
    expect(normalizeBillId('S. 5051', 119)).toBe('119-s-5051')
    expect(normalizeBillId('H.J.Res. 4', 119)).toBe('119-hjres-4')
    expect(normalizeBillId('not a bill')).toBeNull()
  })

  it('knows which Congress it is', () => {
    expect(currentCongress(new Date('2026-09-05T00:00:00Z'))).toBe(119)
    expect(currentCongress(new Date('2027-01-04T00:00:00Z'))).toBe(120)
  })

  it('reads a district out of a Census geographies object regardless of the Congress label', () => {
    const geo = { '119th Congressional Districts': [{ CD119: '08', STATE: '12', NAME: 'Congressional District 8' }] }
    expect(districtFromGeographies(geo)).toEqual({ state: 'FL', district: '8', congressLabel: '119th Congressional Districts' })
    const atLarge = { '120th Congressional Districts': [{ CD120: '00', STATE: '50' }] }
    expect(districtFromGeographies(atLarge)).toMatchObject({ state: 'VT', district: '0' })
    const delegate = { '119th Congressional Districts': [{ CD119: '98', STATE: '11' }] }
    expect(districtFromGeographies(delegate)).toMatchObject({ state: 'DC', district: '0' })
    expect(districtFromGeographies({})).toBeNull()
  })
})
