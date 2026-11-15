import { Link, Navigate, useParams } from 'react-router-dom'
import SEO from './SEO'
import InfoIndex from './InfoIndex'
import { BRAND } from '../config/brand'
import { METHODOLOGY_PAGES } from '../data/openSource'
import { titleCase } from '../data/infoPages'
import '../styles/InfoPage.css'

const REPO_BLOB = 'https://github.com/Shoberman2/politalapp/blob/main/'

function MethodologyIndex() {
  const items = METHODOLOGY_PAGES.map((page) => ({
    to: `/methodology/${page.slug}`,
    title: page.title,
    dek: page.dek,
  }))

  return (
    <div className="bw info-page methodology-page">
      <SEO
        title="Methodology"
        description={`Source, cadence, caveat, and code-reference notes for every ${BRAND.name} feature that computes or explains something.`}
        path="/methodology"
      />

      <section className="ip-hero">
        <div className="ip-inner">
          <h1 className="ip-title">How Each Number Is Made</h1>
          <p className="ip-lede">
            For every feature that computes or explains something: the source behind it, how often it updates, and
            the caveat that belongs beside it.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <InfoIndex items={items} />
          <div className="ip-links">
            <Link className="btn-text" to="/data-sources">How we get our data</Link>
          </div>
        </div>
      </section>
    </div>
  )
}

function MethodologyDetail({ page }) {
  return (
    <div className="bw info-page methodology-page">
      <SEO
        title={`${page.title} Methodology`}
        description={page.dek}
        path={`/methodology/${page.slug}`}
      />

      <section className="ip-hero">
        <div className="ip-inner">
          <h1 className="ip-title">{titleCase(page.title)}</h1>
          <p className="ip-lede">{page.dek}</p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <dl className="ip-facts">
            <div>
              <dt>Source</dt>
              <dd>{page.source}</dd>
            </div>
            <div>
              <dt>Cadence</dt>
              <dd>{page.cadence}</dd>
            </div>
            <div>
              <dt>Caveat</dt>
              <dd>{page.caveat}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <ul className="ip-list">
            {page.sections.map((section) => (
              <li key={section.heading}>
                <h2>{titleCase(section.heading)}</h2>
                <p>{section.body}</p>
              </li>
            ))}
          </ul>
          {page.related && (
            <div className="ip-links">
              <Link className="btn-text" to={page.related.to}>{page.related.label}</Link>
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>In The Code</h2>
          <ul className="ip-list ip-code-list">
            {page.codeRefs.map((ref) => (
              <li key={ref}>
                <a href={`${REPO_BLOB}${ref}`} target="_blank" rel="noopener noreferrer"><code>{ref}</code></a>
              </li>
            ))}
          </ul>
          <div className="ip-links">
            <Link className="btn-text" to="/methodology">Back to methodology</Link>
          </div>
        </div>
      </section>
    </div>
  )
}

function MethodologyPage() {
  const { slug } = useParams()

  if (!slug) return <MethodologyIndex />

  const page = METHODOLOGY_PAGES.find((item) => item.slug === slug)
  if (!page) return <Navigate to="/methodology" replace />

  return <MethodologyDetail page={page} />
}

export default MethodologyPage
