// The plain-English explanation of a bill, from GET /api/explain. The server
// writes it once from the bill's official text (shared/billExplainer.js) and
// stores it, so the first reader of a bill may wait a few seconds.
//
// Returns { status: 'ok', explanation } | { status: 'no_source' } |
// { status: 'unavailable' }, never throws.
export async function getPlainEnglishExplanation({ congress, billType, number }) {
  if (!congress || !billType || !number) return { status: 'unavailable' }
  const bill = `${congress}-${String(billType).toLowerCase()}-${number}`
  try {
    const res = await fetch(`/api/explain?bill=${encodeURIComponent(bill)}`, { headers: { Accept: 'application/json' } })
    if (!/json/.test(res.headers.get('content-type') || '')) return { status: 'unavailable' }
    const body = await res.json()
    if (body?.status === 'ok' && body.explanation?.summary) return { status: 'ok', explanation: body.explanation }
    return { status: body?.status === 'no_source' ? 'no_source' : 'unavailable' }
  } catch {
    return { status: 'unavailable' }
  }
}
