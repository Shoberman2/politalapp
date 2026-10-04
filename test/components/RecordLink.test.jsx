import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RecordLink from '../../src/components/RecordLink'

afterEach(cleanup)

function renderLink(props, onParentClick = () => {}) {
  return render(
    <MemoryRouter>
      <div onClick={onParentClick}><RecordLink {...props} /></div>
    </MemoryRouter>
  )
}

describe('RecordLink', () => {
  it('links a lower-case id to the upper-cased record path with a named accessible label', () => {
    renderLink({ bioguideId: 'p000197', name: 'Nancy Pelosi', className: 'extra' })
    const link = screen.getByRole('link', { name: 'Record in 60 seconds: Nancy Pelosi' })
    expect(link.getAttribute('href')).toBe('/politician/P000197/record')
    expect(link.className).toBe('record-link extra')
  })

  it('falls back to the visible text when no name is given', () => {
    renderLink({ bioguideId: 'P000197' })
    const link = screen.getByRole('link', { name: /Record in 60 seconds/ })
    expect(link.hasAttribute('aria-label')).toBe(false)
    expect(link.className).toBe('record-link')
  })

  it('renders nothing for a missing or malformed id', () => {
    const { container } = renderLink({ bioguideId: 'bad' })
    expect(container.querySelector('a')).toBeNull()
    cleanup()
    const r2 = renderLink({})
    expect(r2.container.querySelector('a')).toBeNull()
  })

  it('does not let a click bubble to a clickable parent card', () => {
    const parent = vi.fn()
    renderLink({ bioguideId: 'P000197', name: 'Nancy Pelosi' }, parent)
    fireEvent.click(screen.getByRole('link'))
    expect(parent).not.toHaveBeenCalled()
  })
})
