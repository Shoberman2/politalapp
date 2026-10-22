import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import Term, { InfoDot } from '../../src/components/Term'
import GlossaryPage from '../../src/components/GlossaryPage'
import { GLOSSARY, GLOSSARY_GROUPS, termForQuestion } from '../../shared/glossary.js'
import { CIVICS_PRIMER } from '../../src/data/civicsPrimer'
import { STATIC_PAGES } from '../../api/_lib/staticPages.js'

afterEach(cleanup)

const wrap = (ui) => render(<HelmetProvider><MemoryRouter>{ui}</MemoryRouter></HelmetProvider>)

describe('glossary', () => {
  it('every entry has a name, a known group and a short plain definition', () => {
    const groups = new Set(GLOSSARY_GROUPS.map((g) => g.id))
    for (const [id, e] of Object.entries(GLOSSARY)) {
      expect(e.term, id).toBeTruthy()
      expect(groups.has(e.group), id).toBe(true)
      expect(e.def.length, id).toBeGreaterThan(20)
      expect(e.def.length, `${id} is too long for a popover`).toBeLessThanOrEqual(260)
    }
  })

  it('every primer point links to a real entry', () => {
    for (const p of CIVICS_PRIMER) expect(GLOSSARY[p.term], p.title).toBeTruthy()
  })

  it('maps procedural vote questions to their term', () => {
    expect(termForQuestion('On Cloture on the Motion to Proceed')).toBe('cloture')
    expect(termForQuestion('On Motion to Suspend the Rules and Pass, as Amended')).toBe('suspension')
    expect(termForQuestion('On the Nomination PN123')).toBe('nomination')
    expect(termForQuestion('On Passage')).toBeNull()
    expect(termForQuestion(null)).toBeNull()
  })
})

describe('Term', () => {
  it('shows the word and an ⓘ button that opens and closes the definition', () => {
    wrap(<p><Term id="cloture">cloture</Term></p>)
    expect(screen.getByText('cloture')).toBeTruthy()
    const btn = screen.getByRole('button', { name: 'What does “Cloture” mean?' })
    expect(btn.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(btn)
    expect(btn.getAttribute('aria-expanded')).toBe('true')
    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toContain(GLOSSARY.cloture.def)
    expect(tip.querySelector('a[href="/glossary#cloture"]')).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('closes on a press outside', () => {
    wrap(<div><Term id="yea" /><span data-testid="away">away</span></div>)
    fireEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('tooltip')).toBeTruthy()
    fireEvent.pointerDown(screen.getByTestId('away'))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('takes a one-off definition and renders nothing for an unknown id', () => {
    const { container } = wrap(<p><InfoDot def="A one-off." label="FY2027" /><InfoDot id="nope" /></p>)
    expect(container.querySelectorAll('button')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'What does “FY2027” mean?' }))
    expect(screen.getByRole('tooltip').textContent).toContain('A one-off.')
    expect(screen.getByRole('tooltip').querySelector('a')).toBeNull()
  })
})

describe('/glossary', () => {
  it('lists every term with an anchor and is a static page', () => {
    const { container } = wrap(<GlossaryPage />)
    for (const id of Object.keys(GLOSSARY)) expect(container.querySelector(`#${id}`), id).not.toBeNull()
    expect(container.querySelector('h1').textContent).toBe(STATIC_PAGES['/glossary'].h1)
  })
})

describe('iOS glossary copy', () => {
  it('ios/BallotWatch/Resources/glossary.json matches shared/glossary.js (run node scripts/sync-glossary.mjs)', async () => {
    const { execFileSync } = await import('node:child_process')
    expect(() => execFileSync('node', ['scripts/sync-glossary.mjs', '--check'], { stdio: 'pipe' })).not.toThrow()
  })
})
