import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'
import SEO from './SEO'
import { BRAND } from '../config/brand'
import { InfoDot } from './Term'
import { GLOSSARY, GLOSSARY_GROUPS } from '../../shared/glossary.js'
import { CIVICS_PRIMER } from '../data/civicsPrimer'
import '../styles/InfoPage.css'

// Every term the site marks with an ⓘ, in plain English, for a reader with no
// background in politics or government. The list is shared/glossary.js.

const ENTRIES = Object.entries(GLOSSARY)

function GlossaryPage() {
  const { hash } = useLocation()

  // Land on the term a popover's "All terms, explained" link pointed at.
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(decodeURIComponent(hash.slice(1)))
    if (el) {
      el.scrollIntoView({ block: 'start' })
      el.classList.add('is-target')
      const t = setTimeout(() => el.classList.remove('is-target'), 2000)
      return () => clearTimeout(t)
    }
    return undefined
  }, [hash])

  return (
    <div className="bw info-page glossary-page">
      <SEO
        title="Congress, Explained in Plain English"
        description="A plain-English glossary of the words Congress uses, from roll call and cloture to cosponsor and continuing resolution. No background in politics needed."
        path="/glossary"
      />

      <section className="ip-hero">
        <div className="ip-inner">
          <span className="ip-kicker">Glossary</span>
          <h1 className="ip-title">Congress, explained in plain English.</h1>
          <p className="ip-lede">
            No background in politics needed. Here is what every term on this site means. Anywhere you see
            the <InfoDot def="Like this. Tap or click any ⓘ on the site to see what the word next to it means." label="ⓘ" glossaryLink={false} /> icon,
            you can tap it for the same explanation.
          </p>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <h2>Congress in one minute</h2>
          <ol className="ip-steps gl-primer">
            {CIVICS_PRIMER.map((p) => (
              <li key={p.title}>
                <h3>{p.title}</h3>
                <p>{p.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section>
        <div className="ip-inner">
          <nav className="gl-jump" aria-label="Glossary sections">
            {GLOSSARY_GROUPS.map((g) => <a key={g.id} href={`#group-${g.id}`}>{g.title}</a>)}
          </nav>
          {GLOSSARY_GROUPS.map((g) => (
            <div className="gl-group" key={g.id} id={`group-${g.id}`}>
              <h2>{g.title}</h2>
              <dl className="gl-list">
                {ENTRIES.filter(([, e]) => e.group === g.id).map(([id, e]) => (
                  <div className="gl-entry" id={id} key={id}>
                    <dt>{e.term}</dt>
                    <dd>{e.def}</dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}
          <div className="ip-links">
            <Link className="btn-text btn-go" to="/this-week">See this week’s votes</Link>
            <Link className="btn-text btn-go" to="/how-it-works">How {BRAND.name} works</Link>
          </div>
        </div>
      </section>
    </div>
  )
}

export default GlossaryPage
