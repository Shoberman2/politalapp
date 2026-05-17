import { describe, it, expect } from 'vitest'
import { COMMITTEE_GLOSSARY, lookupCommittee } from '../../etl/data/committees'

describe('COMMITTEE_GLOSSARY', () => {
  it('covers all 20 House standing committees', () => {
    const houseCodes = [
      'HSAG', 'HSAP', 'HSAS', 'HSBA', 'HSED', 'HSIF', 'HSSO', 'HSBU',
      'HSFA', 'HSHM', 'HSHA', 'HSJU', 'HSII', 'HSGO', 'HSRU', 'HSSY',
      'HSSM', 'HSPW', 'HSVR', 'HSWM',
    ]
    for (const code of houseCodes) {
      expect(COMMITTEE_GLOSSARY[code], `missing House committee ${code}`).toBeDefined()
      expect(COMMITTEE_GLOSSARY[code].chamber).toBe('house')
    }
  })

  it('covers all 16 Senate standing committees', () => {
    const senateCodes = [
      'SSAF', 'SSAP', 'SSAS', 'SSBK', 'SSBU', 'SSCM', 'SSEG', 'SSEV',
      'SSFI', 'SSFR', 'SSGA', 'SSHR', 'SSJU', 'SSRA', 'SSSB', 'SSVA',
    ]
    for (const code of senateCodes) {
      expect(COMMITTEE_GLOSSARY[code], `missing Senate committee ${code}`).toBeDefined()
      expect(COMMITTEE_GLOSSARY[code].chamber).toBe('senate')
    }
  })

  it('every entry has a name + gloss', () => {
    for (const [code, entry] of Object.entries(COMMITTEE_GLOSSARY)) {
      expect(entry.name, `${code} missing name`).toBeTruthy()
      expect(entry.gloss, `${code} missing gloss`).toBeTruthy()
      expect(entry.gloss.length, `${code} gloss too long`).toBeLessThanOrEqual(200)
    }
  })

  it('subcommittees reference a parent', () => {
    for (const [code, entry] of Object.entries(COMMITTEE_GLOSSARY)) {
      if (entry.isSubcommittee) {
        expect(entry.parentCode, `subcommittee ${code} missing parentCode`).toBeTruthy()
        expect(
          COMMITTEE_GLOSSARY[entry.parentCode],
          `subcommittee ${code} references unknown parent ${entry.parentCode}`
        ).toBeDefined()
      }
    }
  })
})

describe('lookupCommittee', () => {
  it('returns the entry for a known code', () => {
    expect(lookupCommittee('HSIF')?.name).toContain('Energy and Commerce')
  })
  it('is case-insensitive', () => {
    expect(lookupCommittee('hsif')?.name).toContain('Energy and Commerce')
    expect(lookupCommittee('HsIf')?.name).toContain('Energy and Commerce')
  })
  it('returns null for unknown codes', () => {
    expect(lookupCommittee('ZZZZ')).toBeNull()
    expect(lookupCommittee('')).toBeNull()
    expect(lookupCommittee(null)).toBeNull()
    expect(lookupCommittee(undefined)).toBeNull()
  })
})
