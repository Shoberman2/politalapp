import { describe, it, expect } from 'vitest'
import { memberSlug, memberPath, parseMemberSegment, bioguideFromSegment, parseGivenFamily } from '../../shared/memberSlug.js'
import { recordPath, recordOgImagePath } from '../../shared/memberRecord.js'

describe('memberSlug', () => {
  it('is lowercase ASCII, first plus last name, hyphenated', () => {
    expect(memberSlug('Nancy Pelosi')).toBe('nancy-pelosi')
    expect(memberSlug('Charles Schumer')).toBe('charles-schumer')
    expect(memberSlug('  Alexandria  Ocasio-Cortez ')).toBe('alexandria-ocasio-cortez')
  })

  it('strips diacritics and drops punctuation', () => {
    expect(memberSlug('Nydia Velázquez')).toBe('nydia-velazquez')
    expect(memberSlug('Tony Cárdenas')).toBe('tony-cardenas')
    expect(memberSlug("Beto O'Rourke")).toBe('beto-orourke')
    expect(memberSlug('Beto O’Rourke')).toBe('beto-orourke')
    expect(memberSlug('Eleanor Holmes Norton')).toBe('eleanor-norton')
    expect(memberSlug('Robert C. "Bobby" Scott')).toBe('robert-scott')
  })

  it('drops suffixes', () => {
    expect(memberSlug('Hank Johnson Jr.')).toBe('hank-johnson')
    expect(memberSlug('James E. Clyburn III')).toBe('james-clyburn')
  })

  it('handles one-word, empty and stub names', () => {
    expect(memberSlug('Cher')).toBe('cher')
    expect(memberSlug('')).toBe('')
    expect(memberSlug(null)).toBe('')
    expect(memberSlug('P000197')).toBe('')     // a stub row named after its id
    expect(memberSlug('!!!')).toBe('')
  })
})

describe('memberPath and segments', () => {
  it('builds the slugged path, uppercasing the id', () => {
    expect(memberPath('p000197', 'Nancy Pelosi')).toBe('/politician/P000197-nancy-pelosi')
    expect(memberPath('P000197', 'Nancy Pelosi', '/record')).toBe('/politician/P000197-nancy-pelosi/record')
    expect(recordPath('P000197', 'Nancy Pelosi')).toBe('/politician/P000197-nancy-pelosi/record')
  })

  it('falls back to the bare id without a name', () => {
    expect(memberPath('P000197')).toBe('/politician/P000197')
    expect(recordPath('P000197')).toBe('/politician/P000197/record')
  })

  it('parses the id as the part before the first hyphen', () => {
    expect(parseMemberSegment('P000197-nancy-pelosi')).toEqual({ id: 'P000197', slug: 'nancy-pelosi', idWasUpper: true })
    expect(parseMemberSegment('P000197')).toEqual({ id: 'P000197', slug: '', idWasUpper: true })
    expect(parseMemberSegment('p000197-nancy-pelosi')).toMatchObject({ id: 'P000197', idWasUpper: false })
    expect(parseMemberSegment('nancy-pelosi')).toBeNull()
    expect(parseMemberSegment('P00019')).toBeNull()
    expect(parseMemberSegment('P0001977')).toBeNull()
    expect(parseMemberSegment('')).toBeNull()
  })

  it('gives React pages the bioguide id from any form of the segment', () => {
    expect(bioguideFromSegment('P000197-nancy-pelosi')).toBe('P000197')
    expect(bioguideFromSegment('p000197')).toBe('P000197')
    expect(bioguideFromSegment(undefined)).toBe('')
  })

  it('parses given and family names only when unambiguous', () => {
    expect(parseGivenFamily('Nancy Pelosi')).toEqual({ givenName: 'Nancy', familyName: 'Pelosi' })
    expect(parseGivenFamily('Hank Johnson Jr.')).toEqual({ givenName: 'Hank', familyName: 'Johnson' })
    expect(parseGivenFamily('Mary Gay Scanlon')).toBeNull()
    expect(parseGivenFamily('Cher')).toBeNull()
  })
})

describe('recordOgImagePath', () => {
  it('points at the per-member card for a bare or slugged id', () => {
    expect(recordOgImagePath('P000197')).toBe('/api/og?kind=record&id=P000197')
    expect(recordOgImagePath('p000197-nancy-pelosi')).toBe('/api/og?kind=record&id=P000197')
  })
})
