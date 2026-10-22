import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  explainBill, parseModelOutput, buildPrompt, billHtmlToText, billOutline, parseBillKey,
  explanationSourceLine, EXPLAINER_MODEL, EXPLAINER_PROMPT_VERSION,
} from '../../shared/billExplainer.js'

afterEach(() => vi.unstubAllGlobals())

const good = {
  summary: 'This bill would require the Postal Service to publish delivery times each month.',
  paragraphs: ['The Postal Service delivers mail. This bill would make it post how long deliveries take.'],
  key_points: ['Monthly delivery-time reports', 'Reports posted online'],
}

// Congress.gov, the GPO text file and OpenAI, keyed by URL.
function stubFetch({ versions = [], html = '', summaries = [], answers = [JSON.stringify(good)] } = {}) {
  const seen = []
  const queue = [...answers]
  vi.stubGlobal('fetch', vi.fn(async (input, init) => {
    const url = String(input)
    seen.push({ url, body: init?.body ? JSON.parse(init.body) : null })
    const json = (obj) => new Response(JSON.stringify(obj), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.includes('/text?')) return json({ textVersions: versions })
    if (url.includes('/summaries?')) return json({ summaries })
    if (url.includes('openai.com')) return json({ choices: [{ message: { content: queue.length > 1 ? queue.shift() : queue[0] } }], usage: { prompt_tokens: 1000, completion_tokens: 200 } })
    if (url.endsWith('.htm')) return new Response(html, { status: 200 })
    return new Response('not found', { status: 404 })
  }))
  return seen
}

const keys = { congressApiKey: 'c', openaiApiKey: 'o' }
const billText = `<html><body><pre>H. R. 12\n\nA BILL\n\nTo require delivery reports.\n\nSECTION 1. SHORT TITLE.\n\nThis Act may be cited as the "Delivery Times Act".\n\nSEC. 2. REPORTS.\n\nThe Postal Service shall publish, each month, the average time to deliver mail &amp; packages.${' More text.'.repeat(30)}</pre></body></html>`

describe('billExplainer', () => {
  it('explains from the newest full text and records what it read', async () => {
    const seen = stubFetch({
      versions: [
        { date: '2026-01-02T05:00:00Z', type: 'Introduced in House', formats: [{ type: 'Formatted Text', url: 'https://www.congress.gov/119/bills/hr12/BILLS-119hr12ih.htm' }] },
        { date: '2026-03-02T05:00:00Z', type: 'Reported in House', formats: [{ type: 'PDF', url: 'x.pdf' }, { type: 'Formatted Text', url: 'https://www.congress.gov/119/bills/hr12/BILLS-119hr12rh.htm' }] },
      ],
      html: billText,
    })
    const out = await explainBill({ key: parseBillKey('119-hr-12'), title: 'Delivery Times Act' }, keys)
    expect(out.status).toBe('ok')
    expect(out.row).toMatchObject({
      bill_key: '119-hr-12', model: EXPLAINER_MODEL, prompt_version: EXPLAINER_PROMPT_VERSION,
      explanation: good.summary, paragraphs: [good.summary, ...good.paragraphs], key_points: good.key_points,
      source_kind: 'bill-text', source_label: 'Reported in House', source_url: 'https://www.congress.gov/119/bills/hr12/BILLS-119hr12rh.htm',
    })
    const prompt = seen.find((s) => s.url.includes('openai.com')).body.messages[1].content
    expect(prompt).toContain('average time to deliver mail & packages')   // the text itself, entities decoded
    expect(prompt).toContain('Full official text (Reported in House)')
    expect(seen.some((s) => s.url.includes('/summaries'))).toBe(false)     // short text: no summary lookup
  })

  it('returns no_source, with no model call, when there is neither text nor a summary', async () => {
    const seen = stubFetch({ versions: [], summaries: [] })
    const out = await explainBill({ key: parseBillKey('119-s-9'), title: 'A bill to do something.' }, keys)
    expect(out).toEqual({ status: 'no_source' })
    expect(seen.some((s) => s.url.includes('openai.com'))).toBe(false)
  })

  it('falls back to the CRS summary when no text is published', async () => {
    stubFetch({ summaries: [{ updateDate: '2026-02-01', text: '<p>Requires monthly delivery reports.</p>' }] })
    const out = await explainBill({ key: parseBillKey('119-hr-12'), title: 'Delivery Times Act' }, keys)
    expect(out.row).toMatchObject({ source_kind: 'crs-summary', source_url: null })
  })

  it('retries once when the model guesses, then gives up', async () => {
    const guess = JSON.stringify({ ...good, paragraphs: ['Given the title, this bill is likely about mail.'] })
    stubFetch({ versions: [{ date: '2026-01-02', type: 'Introduced in House', formats: [{ type: 'Formatted Text', url: 'https://x/b.htm' }] }], html: billText, answers: [guess, JSON.stringify(good)] })
    const retried = await explainBill({ key: parseBillKey('119-hr-12'), title: 't' }, keys)
    expect(retried.status).toBe('ok')
    expect(retried.usage).toHaveLength(2)

    stubFetch({ versions: [{ date: '2026-01-02', type: 'Introduced in House', formats: [{ type: 'Formatted Text', url: 'https://x/b.htm' }] }], html: billText, answers: [guess] })
    const out = await explainBill({ key: parseBillKey('119-hr-12'), title: 't' }, keys)
    expect(out.status).toBe('rejected')
    expect(out.reason).toMatch(/Guessing language/)
  })

  it('rejects malformed or guessing output', () => {
    expect(parseModelOutput('nope').error).toBeTruthy()
    expect(parseModelOutput(JSON.stringify({ ...good, summary: 'Mail stuff.' })).error).toMatch(/format/)
    expect(parseModelOutput(JSON.stringify({ ...good, key_points: ['It probably helps.'] })).error).toMatch(/probably/)
    expect(parseModelOutput(JSON.stringify(good))).toEqual({ summary: good.summary, paragraphs: good.paragraphs, keyPoints: good.key_points })
  })

  it('sends a long bill as its outline plus its opening, and says so', () => {
    const sections = Array.from({ length: 4000 }, (_, i) => `SEC. ${i + 1}. SECTION NUMBER ${i + 1}.\n${'Words of law. '.repeat(3)}`).join('\n')
    const text = `DIVISION A--AGRICULTURE\nTITLE I--FARMS\n${sections}`
    expect(text.length).toBeGreaterThan(120_000)
    expect(billOutline(text).split('\n').slice(0, 3)).toEqual(['DIVISION A--AGRICULTURE', 'TITLE I--FARMS', 'SEC. 1. SECTION NUMBER 1.'])
    const prompt = buildPrompt({ key: parseBillKey('119-hr-7147'), title: 'Omnibus', sources: { text, version: { label: 'Enrolled Bill' }, summary: null } })
    expect(prompt).toContain('You are given its outline and its opening, not all of it.')
    expect(prompt.length).toBeLessThan(120_000)
  })

  it('cleans GPO formatted text and parses bill keys', () => {
    expect(billHtmlToText('<pre>A&nbsp;&amp;\n\n\n\n  B</pre>')).toBe('A &\n\nB')
    expect(parseBillKey('119-HJRES-5')).toEqual({ congress: 119, type: 'hjres', number: 5 })
    expect(parseBillKey('119-xx-5')).toBeNull()
  })

  it('writes the byline every surface shows', () => {
    expect(explanationSourceLine({ kind: 'bill-text', label: 'Introduced in House', date: '2026-01-20T05:00:00+00:00' }))
      .toBe('Written by AI from the bill’s official text (Introduced in House, Jan 20, 2026). Nothing is guessed from the title.')
    expect(explanationSourceLine({ kind: 'crs-summary' })).toMatch(/Congressional Research Service summary/)
    expect(explanationSourceLine({ kind: 'bill-text-partial', label: 'Enrolled Bill' })).toMatch(/outline and opening/)
  })
})
