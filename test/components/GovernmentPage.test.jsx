import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import GovernmentPage, { leaderLine } from '../../src/components/GovernmentPage'
import { rungAt } from '../../src/components/GovernmentLadder'
import { DEPARTMENTS, GOV_LADDER, GOV_AS_OF, INDEPENDENT_AGENCIES } from '../../src/data/government'
import { STATIC_PAGES } from '../../api/_lib/staticPages.js'
import { isGatedPath } from '../../shared/access.js'

// /government: the executive branch in plain English. Fifteen departments,
// each shown as its real headquarters; pressing one opens a sheet that says
// who runs it and what it does, with a source.

function renderPage(path = '/government') {
  return render(<HelmetProvider><MemoryRouter initialEntries={[path]}><GovernmentPage /></MemoryRouter></HelmetProvider>)
}

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() })
})
afterEach(cleanup)

describe('government data', () => {
  it('lists the 15 departments, each with a leader, a source and a photo', () => {
    expect(DEPARTMENTS).toHaveLength(15)
    expect(new Set(DEPARTMENTS.map((d) => d.id)).size).toBe(15)
    for (const d of DEPARTMENTS) {
      expect(d.headName, d.id).toBeTruthy()
      expect(d.headTitle, d.id).toMatch(/^(Secretary of|Attorney General)/)
      expect(d.headSource, d.id).toMatch(/^https:\/\/[a-z.]+\.gov\//)
      expect(d.website, d.id).toMatch(/^https:\/\/[a-z.]+\.gov$/)
      expect(d.photo, d.id).toBe(`/gov/${d.id}.jpg`)
      expect(d.does.length, d.id).toBeGreaterThan(40)
      expect(d.agencies.length, d.id).toBeGreaterThanOrEqual(4)
      expect(d.employees.count, d.id).toBeGreaterThan(1000)
      expect(d.oversight.house.length && d.oversight.senate.length, d.id).toBeTruthy()
    }
    expect(GOV_AS_OF).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(INDEPENDENT_AGENCIES.length).toBeGreaterThanOrEqual(3)
  })

  it('has no em dashes, arrows or exclamation marks in its copy', () => {
    const copy = JSON.stringify({ DEPARTMENTS, GOV_LADDER, INDEPENDENT_AGENCIES })
    expect(copy).not.toMatch(/[—→!]/)
  })

  it('says "Acting" plainly, and "vacant" when nobody holds the job', () => {
    expect(leaderLine({ headName: 'A. Person', headTitle: 'Secretary of State', acting: false })).toBe('A. Person, Secretary of State')
    expect(leaderLine({ headName: 'A. Person', headTitle: 'Secretary of State', acting: true })).toBe('A. Person, Acting Secretary of State')
    expect(leaderLine({ headName: null, headTitle: 'Secretary of State' })).toBe('Secretary of State: vacant')
  })

  it('lights the rungs top to bottom as the film plays', () => {
    expect(rungAt(0)).toBe(0)
    expect(rungAt(GOV_LADDER[1].at)).toBe(1)
    expect(rungAt(7.9)).toBe(GOV_LADDER.length - 1)
  })
})

describe('GovernmentPage', () => {
  it('has one h1 and a building button for every department', () => {
    const { container } = renderPage()
    expect(container.querySelectorAll('h1')).toHaveLength(1)
    expect(container.querySelector('h1').textContent).toBe('Who Runs The Government')
    const buttons = [...container.querySelectorAll('button.gov-dept')]
    expect(buttons).toHaveLength(15)
    buttons.forEach((b, i) => {
      expect(b.querySelector('img').getAttribute('src')).toBe(DEPARTMENTS[i].photo)
      expect(b.textContent).toContain(DEPARTMENTS[i].headName)
    })
    expect(container.querySelector('dialog')).toBeNull()
  })

  it('opens a sheet that explains the department, then closes it', () => {
    const { container } = renderPage()
    const treasury = DEPARTMENTS.find((d) => d.id === 'treasury')
    fireEvent.click(container.querySelectorAll('button.gov-dept')[DEPARTMENTS.indexOf(treasury)])
    const sheet = container.querySelector('dialog.gov-sheet')
    expect(sheet).not.toBeNull()
    expect(sheet.querySelector('h2').textContent).toBe('Department of the Treasury')
    expect(sheet.textContent).toContain(leaderLine(treasury))
    expect(sheet.textContent).toContain('confirmed by a vote of the Senate')
    expect(sheet.textContent).toContain('Internal Revenue Service')
    expect(sheet.querySelector(`a[href="${treasury.headSource}"]`)).not.toBeNull()
    expect(sheet.querySelector(`a[href="${treasury.website}"]`)).not.toBeNull()
    fireEvent.click(sheet.querySelector('.gov-sheet-close'))
    expect(container.querySelector('dialog')).toBeNull()
  })

  it('opens the department named in the address', () => {
    const { container } = renderPage('/government#dhs')
    expect(container.querySelector('dialog.gov-sheet h2').textContent).toBe('Department of Homeland Security')
  })

  it('is a public page with server-rendered copy', () => {
    expect(isGatedPath('/government')).toBe(false)
    expect(STATIC_PAGES['/government'].h1).toBe('Who Runs The Government')
  })
})
