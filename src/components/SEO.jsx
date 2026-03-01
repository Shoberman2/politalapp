import { Helmet } from 'react-helmet-async'

const SITE_NAME = 'BallotWatch'
const BASE_URL = 'https://politicalapp.vercel.app'
const DEFAULT_IMAGE = `${BASE_URL}/congress.jpg`
const DEFAULT_DESCRIPTION = 'Track how your senators and house representatives vote on congressional bills. Look up your elected officials by address, browse 10,000+ bills with AI-powered explanations, and monitor government shutdown status.'

function SEO({ title, description, path = '/', type = 'website', image, article, schema }) {
  const fullTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Congressional Voting Records, Bill Tracker & Representative Lookup`
  const desc = description || DEFAULT_DESCRIPTION
  const url = `${BASE_URL}${path}`
  const img = image || DEFAULT_IMAGE

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

      {article && (
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

      {schema && (
        <script type="application/ld+json">
          {JSON.stringify({ '@context': 'https://schema.org', ...schema })}
        </script>
      )}
    </Helmet>
  )
}

export default SEO
