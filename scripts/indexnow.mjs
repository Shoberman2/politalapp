// Tells IndexNow (Bing, Yandex, Seznam, Naver and others that share it) which
// pages changed, so they re-crawl without waiting. Google does not take part.
//
// Submits the homepage, every public info page from the pages sitemap, and
// the roll calls and bills whose sitemap entry changed in the last week. Run by
// .github/workflows/indexnow.yml after each deploy and after the daily ETL.
//
//   node scripts/indexnow.mjs            submit
//   node scripts/indexnow.mjs --dry-run  print the URLs only
//
// The key is public by design: IndexNow checks that the same value is served
// at https://www.ballotwatch.io/<key>.txt (public/<key>.txt).

const SITE = 'https://www.ballotwatch.io'
export const INDEXNOW_KEY = 'cdc099eb5476bee9b4ba83ce27a862fa'

export function locsFromSitemap(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
}

// The record pages whose sitemap `lastmod` falls inside the last `days` days.
export function recentLocs(xml, days = 7, now = new Date()) {
  const since = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10)
  return [...xml.matchAll(/<url><loc>([^<]+)<\/loc><lastmod>([^<]+)<\/lastmod>/g)]
    .filter((m) => m[2] >= since)
    .map((m) => m[1].trim())
}

export async function collectUrls(fetchImpl = fetch) {
  const text = (path) => fetchImpl(SITE + path).then((r) => (r.ok ? r.text() : ''))
  const [pages, votes, bills] = await Promise.all([text('/sitemap-pages.xml'), text('/sitemap-votes.xml'), text('/sitemap-bills.xml')])
  const urls = new Set([SITE + '/', ...locsFromSitemap(pages), ...recentLocs(votes), ...recentLocs(bills)])
  return [...urls].filter((u) => u.startsWith(SITE + '/'))
}

export async function submit(urlList, fetchImpl = fetch) {
  const res = await fetchImpl('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: 'www.ballotwatch.io', key: INDEXNOW_KEY, keyLocation: SITE + '/' + INDEXNOW_KEY + '.txt', urlList }),
  })
  return res.status
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const urls = await collectUrls()
  if (process.argv.includes('--dry-run')) {
    console.log(urls.join('\n'))
  } else {
    const status = await submit(urls)
    console.log('IndexNow: submitted ' + urls.length + ' URLs, HTTP ' + status)
    // 200 and 202 are both success; anything else fails the job so it is seen.
    if (status !== 200 && status !== 202) process.exit(1)
  }
}
