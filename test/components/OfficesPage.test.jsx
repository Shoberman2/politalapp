import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { HelmetProvider } from 'react-helmet-async'
import { MemoryRouter } from 'react-router-dom'
import OfficesPage from '../../src/components/OfficesPage'

// Compliance research (2026-10): House rules require a technology vendor to be
// authorized before marketing or selling to offices, and offices can't accept
// free in-kind services for official work. The page may describe the product
// and ask for sponsorship of a review; it must never offer a trial, pilot or
// price.

afterEach(cleanup)

function renderPage() {
  return render(
    <HelmetProvider>
      <MemoryRouter>
        <OfficesPage />
      </MemoryRouter>
    </HelmetProvider>
  )
}

describe('OfficesPage', () => {
  it('states its status plainly', () => {
    const { container } = renderPage()
    const status = container.querySelector('.op-status')
    expect(status.textContent).toMatch(/not yet authorized/i)
    expect(status.textContent).toMatch(/not selling it or offering trials/i)
  })

  it('never offers a trial, a pilot, or a price', () => {
    const { container } = renderPage()
    const text = container.textContent
    expect(text).not.toMatch(/free trial|start (a|your) (trial|pilot)|request a pilot|\$\d|per month|pricing/i)
  })

  it('cites the CAO testimony it quotes', () => {
    const { container } = renderPage()
    const source = container.querySelector('blockquote footer a')
    expect(source.getAttribute('href')).toMatch(/^https:\/\/www\.congress\.gov\//)
  })

  it('disclaims affiliation with Congress', () => {
    const { container } = renderPage()
    expect(container.textContent).toMatch(/not affiliated with the U\.S\. Congress/i)
  })
})
