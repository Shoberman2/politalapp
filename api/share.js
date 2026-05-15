import {
  fetchCardData,
  formatBillNumber,
  congressOrdinal,
  formatDate,
  clamp,
} from './_lib/billCard.js'

function escapeHtml(s) {
  if (s == null) return ''
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function originFrom(req) {
  const proto = req.headers['x-forwarded-proto'] || 'https'
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'politicalapp.vercel.app'
  return `${proto}://${host}`
}

function renderNotFound(origin) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Bill not found — BallotWatch</title>
<meta name="robots" content="noindex" />
<style>
  body { font-family: system-ui, sans-serif; background: #FAFAF7; color: #1A1A18; max-width: 640px; margin: 96px auto; padding: 24px; }
  a { color: #1D4ED8; }
</style>
</head>
<body>
  <h1>Bill not found</h1>
  <p>We couldn't find that bill. <a href="${origin}/bills">Browse all bills on BallotWatch</a>.</p>
</body>
</html>`
}

function renderHtml(data, origin) {
  const { bill, parsed, tally, question, aiOneLiner } = data
  const billNumber = formatBillNumber(parsed)
  const congress = congressOrdinal(parsed.congress)
  const cardDate = tally?.date || formatDate(bill.introduced_at)
  const oneLiner = aiOneLiner || ''
  const title = bill.title || billNumber
  const yea = tally?.yea || 0
  const nay = tally?.nay || 0
  const total = yea + nay
  const yeaPct = total > 0 ? (yea / total) * 100 : 0
  const tallyHeadline = tally
    ? [question ? clamp(question, 60) : 'Vote', tally.chamber ? tally.chamber.charAt(0) + tally.chamber.slice(1).toLowerCase() : null]
        .filter(Boolean)
        .join(' · ')
    : null

  const canonical = `${origin}/s/bill/${parsed.congress}/${parsed.billType}/${parsed.number}`
  const ogImage = `${origin}/api/og?bill=${encodeURIComponent(bill.id)}`
  const appUrl = `${origin}/bill/${parsed.congress}/${parsed.billType}/${parsed.number}`
  const sourceUrl = bill.source_url || `https://www.congress.gov/bill/${parsed.congress}th-congress/${parsed.billType === 'hr' ? 'house-bill' : parsed.billType === 's' ? 'senate-bill' : `${parsed.billType}-bill`}/${parsed.number}`

  const metaDescription = clamp(oneLiner || `${billNumber}: ${title}`, 200)
  const socialTitle = clamp(`${billNumber} — ${title}`, 110)

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(socialTitle)} — BallotWatch</title>
<meta name="description" content="${escapeHtml(metaDescription)}" />
<link rel="canonical" href="${escapeHtml(canonical)}" />

<meta property="og:type" content="article" />
<meta property="og:url" content="${escapeHtml(canonical)}" />
<meta property="og:title" content="${escapeHtml(socialTitle)}" />
<meta property="og:description" content="${escapeHtml(metaDescription)}" />
<meta property="og:image" content="${escapeHtml(ogImage)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:site_name" content="BallotWatch" />

<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escapeHtml(socialTitle)}" />
<meta name="twitter:description" content="${escapeHtml(metaDescription)}" />
<meta name="twitter:image" content="${escapeHtml(ogImage)}" />

<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;600&family=JetBrains+Mono:wght@500&display=swap" />

<style>
  :root {
    --bg: #FAFAF7;
    --surface: #FFFFFF;
    --text: #1A1A18;
    --secondary: #6B6861;
    --muted: #9C9789;
    --accent: #1D4ED8;
    --accent-hover: #1E40AF;
    --border: #E8E6E1;
    --yea: #16A34A;
    --nay: #DC2626;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--text);
    font-family: 'Inter', system-ui, sans-serif;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  .wrap { max-width: 880px; margin: 0 auto; padding: 48px 24px 96px; }
  .masthead {
    display: flex; justify-content: space-between; align-items: center;
    border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 48px;
  }
  .brand { font-weight: 600; font-size: 14px; letter-spacing: 4px; text-decoration: none; color: var(--text); }
  .date { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: var(--muted); letter-spacing: 1px; }
  .card {
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 48px;
  }
  .bill-no { font-family: 'JetBrains Mono', monospace; font-size: 13px; color: var(--accent); letter-spacing: 2px; text-transform: uppercase; }
  h1 {
    font-family: 'Instrument Serif', Georgia, serif;
    font-style: italic;
    font-weight: 400;
    font-size: 44px;
    line-height: 1.1;
    letter-spacing: -0.5px;
    margin: 12px 0 0;
  }
  .one-liner { color: var(--secondary); font-size: 17px; margin-top: 20px; }
  .tally-block { margin-top: 36px; border-top: 2px solid var(--text); padding-top: 18px; }
  .tally-head { display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 12px; }
  .tally-label { font-weight: 600; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; }
  .tally-numbers { font-family: 'JetBrains Mono', monospace; font-size: 17px; }
  .tally-numbers .yea { color: var(--yea); }
  .tally-numbers .nay { color: var(--nay); }
  .tally-numbers .sep { color: var(--muted); margin: 0 10px; }
  .tally-bar { display: flex; margin-top: 14px; height: 8px; background: var(--border); border-radius: 2px; overflow: hidden; }
  .tally-bar .yea-fill { background: var(--yea); }
  .tally-bar .nay-fill { background: var(--nay); }
  .no-vote { color: var(--muted); font-weight: 600; font-size: 13px; letter-spacing: 2px; text-transform: uppercase; }
  .actions {
    margin-top: 36px; display: flex; gap: 16px; flex-wrap: wrap;
  }
  .btn {
    display: inline-block; padding: 12px 20px; border-radius: 4px;
    font-weight: 600; font-size: 14px; letter-spacing: 0.3px; text-decoration: none;
  }
  .btn-primary { background: var(--accent); color: white; }
  .btn-primary:hover { background: var(--accent-hover); }
  .btn-secondary { background: transparent; color: var(--text); border: 1px solid var(--border); }
  .footer { margin-top: 64px; padding-top: 24px; border-top: 1px solid var(--border); color: var(--muted); font-size: 13px; text-align: center; }
  .footer a { color: var(--secondary); }
</style>
</head>
<body>
  <div class="wrap">
    <header class="masthead">
      <a class="brand" href="${escapeHtml(origin)}/">BALLOTWATCH</a>
      ${cardDate ? `<span class="date">${escapeHtml(cardDate)}</span>` : ''}
    </header>

    <article class="card">
      <div class="bill-no">${escapeHtml(billNumber)} · ${escapeHtml(congress)} Congress</div>
      <h1>${escapeHtml(title)}</h1>
      ${oneLiner ? `<p class="one-liner">${escapeHtml(oneLiner)}</p>` : ''}

      <div class="tally-block">
        ${
          tally
            ? `
        <div class="tally-head">
          <span class="tally-label">${escapeHtml(tallyHeadline)}</span>
          <span class="tally-numbers">
            <span class="yea">${yea} Yea</span>
            <span class="sep">·</span>
            <span class="nay">${nay} Nay</span>
          </span>
        </div>
        <div class="tally-bar" aria-hidden="true">
          <span class="yea-fill" style="width: ${yeaPct.toFixed(2)}%"></span>
          <span class="nay-fill" style="width: ${(100 - yeaPct).toFixed(2)}%"></span>
        </div>
        `
            : `<div class="no-vote">${bill.policy_area ? `${escapeHtml(bill.policy_area)} · ` : ''}${bill.introduced_at ? `Introduced ${escapeHtml(formatDate(bill.introduced_at))}` : 'No votes yet'}</div>`
        }
      </div>

      <div class="actions">
        <a class="btn btn-primary" href="${escapeHtml(appUrl)}">View full details on BallotWatch</a>
        <a class="btn btn-secondary" href="${escapeHtml(sourceUrl)}" rel="noopener" target="_blank">Source: Congress.gov</a>
      </div>
    </article>

    <footer class="footer">
      Vote data from Congress.gov · AI explanations are summaries, not legal advice ·
      <a href="${escapeHtml(origin)}/">BallotWatch</a>
    </footer>
  </div>
</body>
</html>`
}

export default async function handler(req, res) {
  try {
    const origin = originFrom(req)
    const billId = (req.query && req.query.bill) || null

    if (!billId) {
      res.setHeader('Cache-Control', 'public, max-age=300')
      res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(renderNotFound(origin))
      return
    }

    const data = await fetchCardData(billId)
    if (!data) {
      res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
      res.status(404).setHeader('Content-Type', 'text/html; charset=utf-8').send(renderNotFound(origin))
      return
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400')
    res.status(200).send(renderHtml(data, origin))
  } catch (err) {
    res.status(500).setHeader('Content-Type', 'text/plain').send(`share render error: ${err.message}`)
  }
}
