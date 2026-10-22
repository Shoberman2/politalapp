// Plain-English bill explanations written from what the bill actually says.
//
// The model reads the bill's official text from Congress.gov (the newest
// published version), plus the Congressional Research Service summary when
// the text is too long to read whole or has not been published. With neither
// source there is no explanation: nothing is ever written from the title.
//
// One module, three callers: api/_lib/explanations.js (on demand, for the
// website, the iOS app and MCP), and etl/explainBills.ts (daily and backfill).
// Plain fetch, no dependencies, so it runs in Node functions and under tsx.
//
// Rows land in bill_explanations under (EXPLAINER_MODEL,
// EXPLAINER_PROMPT_VERSION). Bump the version when the prompt or the output
// shape changes; readers then ignore the old rows.

export const EXPLAINER_MODEL = 'gpt-5.4-mini'
export const EXPLAINER_PROMPT_VERSION = 3

const CONGRESS_API = 'https://api.congress.gov/v3'
const USER_AGENT = 'BallotWatch/1.0 (+https://www.ballotwatch.io)'

// About 30k tokens. Longer bills are sent as their outline plus the opening,
// and the model is told it is reading part of the bill.
const MAX_TEXT_CHARS = 120_000
const OPENING_CHARS = 80_000
const MAX_OUTLINE_CHARS = 30_000
const FETCH_TIMEOUT_MS = 20_000
const MODEL_TIMEOUT_MS = 90_000

// Words that mean the model is guessing rather than reading. An explanation
// that uses them is rejected and retried once, then dropped.
export const GUESS_RE = /\b(likely|presumably|probably|appears to|seems to|it is unclear|not specified in the (?:provided )?text|given (?:the|its) (?:title|name)|based on (?:the|its) (?:title|name)|the title suggests)\b/i

export { explanationSourceLine } from './explanationSource.js'

const BILL_TYPES = new Set(['hr', 's', 'hjres', 'sjres', 'hconres', 'sconres', 'hres', 'sres'])

export function parseBillKey(key) {
  const m = /^(\d{2,3})-([a-z]+)-(\d+)$/.exec(String(key || '').trim().toLowerCase())
  if (!m || !BILL_TYPES.has(m[2])) return null
  return { congress: Number(m[1]), type: m[2], number: Number(m[3]) }
}

export function isResolution(type) {
  return type !== 'hr' && type !== 's'
}

const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
function decodeEntities(s) {
  return s
    .replace(/&([a-z]+);/gi, (e, n) => ENTITIES[n.toLowerCase()] ?? e)
    .replace(/&#(\d+);/g, (e, c) => { const v = Number(c); return v > 0 && v <= 0x10ffff ? String.fromCodePoint(v) : e })
    .replace(/&#x([0-9a-f]+);/gi, (e, c) => { const v = parseInt(c, 16); return v > 0 && v <= 0x10ffff ? String.fromCodePoint(v) : e })
}

// GPO "Formatted Text" is a <pre> block. Keep line breaks (section headings
// are found by line), drop tags and the print-layout blank runs.
export function billHtmlToText(html) {
  return decodeEntities(String(html || '').replace(/<[^>]+>/g, ''))
    .replace(/\r/g, '')
    .replace(/<DOC>/gi, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function summaryHtmlToText(html) {
  return decodeEntities(String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|h[1-6])>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' '))
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n')
}

// Division, title, subtitle and section headings, in order.
export function billOutline(text) {
  const out = []
  let size = 0
  for (const line of text.split('\n')) {
    const l = line.trim()
    if (!/^(DIVISION [A-Z]+|TITLE [IVXLC]+|Subtitle [A-Z]+|CHAPTER \d+|SEC\. \d+[A-Z]?\.|Sec\. \d+[A-Z]?\.)/.test(l)) continue
    const entry = l.length > 200 ? l.slice(0, 200) + '…' : l
    size += entry.length + 1
    if (size > MAX_OUTLINE_CHARS) { out.push('[outline cut short]'); break }
    out.push(entry)
  }
  return out.join('\n')
}

async function fetchWithTimeout(url, opts = {}, ms = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal })
  } finally {
    clearTimeout(t)
  }
}

async function congressJson(path, apiKey) {
  const url = new URL(`${CONGRESS_API}${path}`)
  url.searchParams.set('format', 'json')
  url.searchParams.set('api_key', apiKey)
  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': USER_AGENT } })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Congress.gov ${path.split('?')[0]} returned ${res.status}`)
  return res.json()
}

// Newest text version first. The enrolled bill and public law carry no date;
// they are the final versions, so they sort first.
function newestVersion(versions) {
  const withHtml = (versions || [])
    .map((v) => ({ ...v, html: (v.formats || []).find((f) => f.type === 'Formatted Text')?.url }))
    .filter((v) => v.html)
  const rank = (v) => (/public law/i.test(v.type || '') ? 3 : v.date ? 1 : 2)
  withHtml.sort((a, b) => rank(b) - rank(a) || (Date.parse(b.date || 0) - Date.parse(a.date || 0)))
  return withHtml[0] || null
}

/**
 * Everything the model may read about one bill. `crsSummary` is optional
 * input (the bills table carries it for some bills); when the text is long
 * or missing and no summary was passed, it is fetched.
 */
export async function fetchBillSources({ congress, type, number }, { apiKey, crsSummary } = {}) {
  if (!apiKey) throw new Error('Congress.gov key not configured')
  const base = `/bill/${congress}/${type}/${number}`
  const textData = await congressJson(`${base}/text`, apiKey)
  const version = newestVersion(textData?.textVersions)

  let text = null
  if (version) {
    const res = await fetchWithTimeout(version.html, { headers: { 'User-Agent': USER_AGENT } })
    if (res.ok) text = billHtmlToText(await res.text())
    else if (res.status !== 404) throw new Error(`Bill text download returned ${res.status}`)
  }

  let summary = crsSummary ? summaryHtmlToText(crsSummary) : null
  if (!summary && (!text || text.length > MAX_TEXT_CHARS)) {
    const data = await congressJson(`${base}/summaries`, apiKey)
    const latest = [...(data?.summaries || [])]
      .sort((a, b) => (Date.parse(a?.updateDate || 0) || 0) - (Date.parse(b?.updateDate || 0) || 0))
      .at(-1)
    summary = latest?.text ? summaryHtmlToText(latest.text) : null
  }

  return {
    text: text && text.length > 200 ? text : null,
    version: version && text ? { label: version.type || 'Bill text', date: version.date || null, url: version.html } : null,
    summary: summary || null,
  }
}

const SYSTEM_PROMPT = `You explain United States federal bills and resolutions to people who know nothing about politics or government.

Rules:
- Use ONLY the official material you are given. Never use outside knowledge about the bill, its sponsors, its politics, or what happened to it.
- Never guess. Do not write "likely", "probably", "appears to", "seems to", or anything inferred from the title. If the material does not say something, leave it out.
- Write for a 12-year-old: short sentences, everyday words. When a legal or government word cannot be avoided, explain it in a few words the first time.
- Be neutral. No opinions, no praise or criticism, no guesses about who supports it or why.
- Describe what it "would" do (it may not be law). For a simple or concurrent resolution that only states an opinion or sets rules for Congress, say so plainly.
- Keep exact numbers, dollar amounts, dates, and names of programs and agencies as written.
- If you were given only part of a long bill, describe the parts you were given and do not claim to cover everything.

Return JSON with exactly these keys:
{"summary": "one sentence, at most 35 words, starting with 'This bill would' or 'This resolution would'",
 "paragraphs": ["one to three short paragraphs (each at most 70 words) explaining what it does and who it affects"],
 "key_points": ["three to six short, concrete points, each one thing it does, at most 25 words each"]}`

export function buildPrompt({ key, title, sources }) {
  const kind = isResolution(key.type) ? 'resolution' : 'bill'
  const parts = [`Official title: ${title || '(none on file)'}`, `Type: ${kind}`]
  if (sources.text) {
    if (sources.text.length <= MAX_TEXT_CHARS) {
      parts.push(`Full official text (${sources.version?.label || 'latest version'}):\n"""\n${sources.text}\n"""`)
    } else {
      parts.push(`This ${kind} is long (${Math.round(sources.text.length / 1000)}k characters). You are given its outline and its opening, not all of it.`)
      const outline = billOutline(sources.text)
      if (outline) parts.push(`Outline of every division, title and section:\n"""\n${outline}\n"""`)
      parts.push(`Opening of the official text (${sources.version?.label || 'latest version'}):\n"""\n${sources.text.slice(0, OPENING_CHARS)}\n"""`)
    }
  }
  if (sources.summary) parts.push(`Official summary by the Congressional Research Service:\n"""\n${sources.summary.slice(0, 20_000)}\n"""`)
  return parts.join('\n\n')
}

function clean(s, max) {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t
}

export function parseModelOutput(raw) {
  let obj
  try { obj = JSON.parse(raw) } catch { return { error: 'Model returned invalid JSON' } }
  const summary = clean(obj?.summary, 400)
  const paragraphs = (Array.isArray(obj?.paragraphs) ? obj.paragraphs : []).map((p) => clean(p, 900)).filter(Boolean).slice(0, 3)
  const keyPoints = (Array.isArray(obj?.key_points) ? obj.key_points : []).map((p) => clean(p, 300)).filter(Boolean).slice(0, 6)
  if (!summary || !/^this (bill|resolution|joint resolution|concurrent resolution)\b/i.test(summary)) return { error: 'Summary missing or off format' }
  if (paragraphs.length === 0) return { error: 'No paragraphs' }
  const all = [summary, ...paragraphs, ...keyPoints].join(' ')
  const guess = GUESS_RE.exec(all)
  if (guess) return { error: `Guessing language: "${guess[0]}"` }
  return { summary, paragraphs, keyPoints }
}

async function callModel({ apiKey, prompt, strict }) {
  const res = await fetchWithTimeout('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: EXPLAINER_MODEL,
      reasoning_effort: 'low',
      response_format: { type: 'json_object' },
      max_completion_tokens: 4000,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT + (strict ? '\n\nYour last answer guessed or broke the format. Use only what the material states.' : '') },
        { role: 'user', content: prompt },
      ],
    }),
  }, MODEL_TIMEOUT_MS)
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  return { raw: data.choices?.[0]?.message?.content || '', usage: data.usage || null }
}

/**
 * Explain one bill. Returns `{ status: 'ok', row, usage }` with a row ready
 * for bill_explanations, `{ status: 'no_source' }` when Congress.gov has
 * neither text nor a summary yet, or `{ status: 'rejected', reason }` when
 * the model guessed twice.
 */
export async function explainBill({ key, title, crsSummary }, { congressApiKey, openaiApiKey }) {
  if (!openaiApiKey) throw new Error('OpenAI key not configured')
  const sources = await fetchBillSources(key, { apiKey: congressApiKey, crsSummary })
  if (!sources.text && !sources.summary) return { status: 'no_source' }

  const prompt = buildPrompt({ key, title, sources })
  const usage = []
  let parsed = null
  for (const strict of [false, true]) {
    const out = await callModel({ apiKey: openaiApiKey, prompt, strict })
    if (out.usage) usage.push(out.usage)
    parsed = parseModelOutput(out.raw)
    if (!parsed.error) break
  }
  if (parsed.error) return { status: 'rejected', reason: parsed.error, usage }

  const partial = Boolean(sources.text && sources.text.length > MAX_TEXT_CHARS)
  const source = sources.text
    ? { kind: partial ? 'bill-text-partial' : 'bill-text', label: sources.version.label, date: sources.version.date, url: sources.version.url }
    : { kind: 'crs-summary', label: 'Congressional Research Service summary', date: null, url: null }

  return {
    status: 'ok',
    usage,
    row: {
      bill_key: `${key.congress}-${key.type}-${key.number}`,
      model: EXPLAINER_MODEL,
      prompt_version: EXPLAINER_PROMPT_VERSION,
      bill_title: title || null,
      explanation: parsed.summary,
      paragraphs: [parsed.summary, ...parsed.paragraphs],
      key_points: parsed.keyPoints,
      source_kind: source.kind,
      source_label: source.label,
      source_date: source.date,
      source_url: source.url,
    },
  }
}
