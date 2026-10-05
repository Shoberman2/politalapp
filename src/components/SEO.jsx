import { useEffect } from 'react'
import { Helmet } from 'react-helmet-async'

const SITE_NAME = 'BallotWatch'
const BASE_URL = 'https://www.ballotwatch.io'
const DEFAULT_IMAGE = `${BASE_URL}/congress.jpg`
const DEFAULT_DESCRIPTION = 'Look up your senators and representative, review congressional voting records, browse bills with source-linked explanations, and inspect public methodology.'

// Server-rendered pages (api/prerender.js) put their JSON-LD in <head> tagged
// data-bw-ssr="<path>". On the page they describe, rendering our own copy
// would duplicate every block (Search Console flags a second FAQPage, for
// example), so skip it. After client navigation those blocks describe a
// different page, so remove them.
function hasServerJsonLd(path) {
  if (typeof document === 'undefined' || typeof window === 'undefined') return false
  if (window.location.pathname !== path) return false
  return Boolean(document.querySelector(`script[data-bw-ssr=${JSON.stringify(path)}]`))
}

function useDropStaleServerJsonLd(path) {
  useEffect(() => {
    if (typeof document === 'undefined') return
    for (const el of document.querySelectorAll('script[data-bw-ssr]')) {
      if (el.getAttribute('data-bw-ssr') !== window.location.pathname) el.remove()
    }
  }, [path])
}

// `fullTitle` sets the whole <title> (for the homepage, whose title already
// names the site); `title` gets " | BallotWatch" appended.
function SEO({ title, fullTitle: fullTitleProp, description, path = '/', type = 'website', image, article, schema }) {
  useDropStaleServerJsonLd(path)
  const fullTitle = fullTitleProp || (title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Congressional Voting Records, Bill Tracker & Representative Lookup`)
  const desc = description || DEFAULT_DESCRIPTION
  const url = `${BASE_URL}${path}`
  const img = image || DEFAULT_IMAGE
  const serverLd = hasServerJsonLd(path)

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={url} />

      <meta property="og:type" content={type} />
      <meta property="og:url" content={url} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:image" content={img} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:locale" content="en_US" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={img} />

      {article && !serverLd && (
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Article',
            headline: article.headline,
            datePublished: article.datePublished,
            author: {
              '@type': 'Organization',
              name: article.author
            },
            description: article.description,
            publisher: {
              '@type': 'Organization',
              name: SITE_NAME
            },
            mainEntityOfPage: {
              '@type': 'WebPage',
              '@id': url
            }
          })}
        </script>
      )}

      {schema && !serverLd && (
        <script type="application/ld+json">
          {JSON.stringify({ '@context': 'https://schema.org', ...schema })}
        </script>
      )}
    </Helmet>
  )
}

export default SEO
