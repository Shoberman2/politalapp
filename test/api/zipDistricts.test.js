// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { buildZipDistricts, renderModule, CONGRESS, SOURCE_URL, MIN_SHARE_PCT } from '../../scripts/build-zip-districts.mjs'
import { zipDistricts, parseZipParts } from '../../api/_lib/zipDistricts.js'
import { ZIP_DISTRICTS, ZIP_DISTRICTS_CONGRESS, ZIP_DISTRICTS_SOURCE } from '../../api/_lib/data/zipDistricts.js'

const HEAD = 'OID_CD119_20|GEOID_CD119_20|NAMELSAD_CD119_20|AREALAND_CD119_20|AREAWATER_CD119_20|MTFCC_CD119_20|FUNCSTAT_CD119_20|OID_ZCTA5_20|GEOID_ZCTA5_20|NAMELSAD_ZCTA5_20|AREALAND_ZCTA5_20|AREAWATER_ZCTA5_20|MTFCC_ZCTA5_20|CLASSFP_ZCTA5_20|FUNCSTAT_ZCTA5_20|AREALAND_PART|AREAWATER_PART'
const row = (cd, zcta, land, water = 0) => `1|${cd}|Congressional District|1|1|G5200|N|2|${zcta}|ZCTA5 ${zcta}|1|1|G6350|B5|S|${land}|${water}`

describe('Census ZIP-area-to-district table', () => {
  it('builds every district a ZIP touches, largest land share first, and drops slivers', () => {
    const text = '﻿' + [
      HEAD,
      row('3612', '10001', 1615692),
      row('3915', '43215', 540),
      row('3903', '43215', 460),
      // 0.4% of the ZIP: a boundary sliver.
      row('3904', '43215', 4),
      // At-large, delegate, and a two-state ZIP.
      row('0200', '99501', 1000),
      row('1198', '20001', 1000),
      row('4707', '42223', 550),
      row('2101', '42223', 450),
      // Water with no district, and a district row with no ZIP: both skipped.
      row('36ZZ', '10001', 0, 500),
      row('3612', '', 999),
      // All water: shared by total area instead.
      row('1201', '33999', 0, 300),
      row('1202', '33999', 0, 100),
    ].join('\n')
    expect(buildZipDistricts(text)).toEqual({
      10001: 'NY12',
      20001: 'DC0',
      33999: 'FL1:75,FL2:25',
      42223: 'TN7:55,KY1:45',
      43215: 'OH15:54,OH3:46',
      99501: 'AK0',
    })
    expect(MIN_SHARE_PCT).toBe(1)
  })

  it('fails loudly when the file is for another Congress', () => {
    expect(() => buildZipDistricts(HEAD.replaceAll('CD119', 'CD120') + '\n')).toThrow(/GEOID_CD119_20/)
  })

  it('renders a module the lookup can read', () => {
    const src = renderModule({ 10001: 'NY12', 43215: 'OH15:54,OH3:46' })
    expect(src).toContain('export const ZIP_DISTRICTS = "10001=NY12;43215=OH15:54,OH3:46"')
    expect(src).toContain(`export const ZIP_DISTRICTS_CONGRESS = ${CONGRESS}`)
    expect(parseZipParts('OH15:54,OH3:46')).toEqual([
      { state: 'OH', district: '15', land_share_pct: 54 },
      { state: 'OH', district: '3', land_share_pct: 46 },
    ])
    expect(parseZipParts('AK0')).toEqual([{ state: 'AK', district: '0', land_share_pct: 100 }])
    expect(parseZipParts('')).toEqual([])
  })

  it('ships a table for the current districts that answers real ZIP codes', async () => {
    expect(ZIP_DISTRICTS_CONGRESS).toBe(CONGRESS)
    expect(ZIP_DISTRICTS_SOURCE).toBe(SOURCE_URL)
    expect(ZIP_DISTRICTS.split(';').length).toBeGreaterThan(30000)
    // Every entry is "zip=STATEdistrict" or a comma list with shares.
    expect(ZIP_DISTRICTS).toMatch(/^(\d{5}=[A-Z]{2}\d+(:\d+)?(,[A-Z]{2}\d+:\d+)*;)*\d{5}=[A-Z]{2}\d+(:\d+)?(,[A-Z]{2}\d+:\d+)*$/)

    expect(await zipDistricts('10001')).toEqual([{ state: 'NY', district: '12', land_share_pct: 100 }])
    expect(await zipDistricts('99501')).toEqual([{ state: 'AK', district: '0', land_share_pct: 100 }])
    const columbus = await zipDistricts('43215-1234')
    expect(columbus.map((p) => `${p.state}-${p.district}`)).toEqual(['OH-15', 'OH-3'])
    expect(columbus.reduce((n, p) => n + p.land_share_pct, 0)).toBeGreaterThanOrEqual(99)
    // Montana has two districts; a ZIP there must not come back at-large.
    expect((await zipDistricts('59801'))[0]).toMatchObject({ state: 'MT', district: '1' })
    // No Census area (a single building) and malformed input.
    expect(await zipDistricts('20500')).toBeNull()
    expect(await zipDistricts('abc')).toBeNull()
    expect(await zipDistricts('')).toBeNull()
  })
})
