import { describe, it, expect } from 'vitest'
import { classifyIndustry, getIndustryBreakdown, formatCurrency } from '../../src/data/industryMap'

describe('classifyIndustry', () => {
  it('classifies known companies to correct sectors', () => {
    expect(classifyIndustry('PFIZER INC')).toBe('Healthcare')
    expect(classifyIndustry('Goldman Sachs & Co')).toBe('Finance')
    expect(classifyIndustry('Google LLC')).toBe('Technology')
    expect(classifyIndustry('Exxon Mobil')).toBe('Energy')
    expect(classifyIndustry('Lockheed Martin')).toBe('Defense')
    expect(classifyIndustry('Walmart Inc')).toBe('Retail')
  })

  it('classifies RETIRED as Retired', () => {
    expect(classifyIndustry('RETIRED')).toBe('Retired')
    expect(classifyIndustry('Retired Person')).toBe('Retired')
    expect(classifyIndustry('HOMEMAKER')).toBe('Retired')
  })

  it('classifies SELF-EMPLOYED as Self-Employed', () => {
    expect(classifyIndustry('SELF-EMPLOYED')).toBe('Self-Employed')
    expect(classifyIndustry('Self Employed')).toBe('Self-Employed')
    expect(classifyIndustry('Consultant')).toBe('Self-Employed')
  })

  it('classifies missing/empty employer as Not Disclosed', () => {
    expect(classifyIndustry('')).toBe('Not Disclosed')
    expect(classifyIndustry('INFORMATION REQUESTED')).toBe('Not Disclosed')
    expect(classifyIndustry('N/A')).toBe('Not Disclosed')
    expect(classifyIndustry(null)).toBe('Not Disclosed')
    expect(classifyIndustry(undefined)).toBe('Not Disclosed')
  })

  it('uses occupation as fallback for classification', () => {
    expect(classifyIndustry('ACME INC', 'software engineer')).toBe('Technology')
    expect(classifyIndustry('ACME INC', 'attorney')).toBe('Legal')
  })

  it('returns Other for unrecognized employers', () => {
    expect(classifyIndustry('JOE BLOGGS PLUMBING LLC')).toBe('Other')
  })
})

describe('getIndustryBreakdown', () => {
  it('aggregates donors by industry with percentages', () => {
    const donors = [
      { employer: 'PFIZER INC', totalAmount: 1000 },
      { employer: 'MERCK & CO', totalAmount: 500 },
      { employer: 'GOLDMAN SACHS', totalAmount: 800 },
    ]

    const result = getIndustryBreakdown(donors)
    expect(result.length).toBe(2) // Healthcare, Finance
    expect(result[0].industry).toBe('Healthcare')
    expect(result[0].totalAmount).toBe(1500)
    expect(result[0].donorCount).toBe(2)
    expect(result[1].industry).toBe('Finance')
    expect(result[1].totalAmount).toBe(800)
  })

  it('returns empty array for empty donors', () => {
    expect(getIndustryBreakdown([])).toEqual([])
    expect(getIndustryBreakdown(null)).toEqual([])
  })

  it('handles all-Other donors', () => {
    const donors = [
      { employer: 'JOES PLUMBING LLC', totalAmount: 100 },
    ]
    const result = getIndustryBreakdown(donors)
    expect(result.length).toBe(1)
    expect(result[0].industry).toBe('Other')
    expect(result[0].percentage).toBe(100)
  })
})

describe('formatCurrency', () => {
  it('formats millions', () => {
    expect(formatCurrency(2300000)).toBe('$2.3M')
  })

  it('formats thousands', () => {
    expect(formatCurrency(450000)).toBe('$450K')
  })

  it('formats small amounts', () => {
    expect(formatCurrency(500)).toBe('$500')
  })
})
