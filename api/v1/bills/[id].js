import { validateApiKey } from '../../_lib/auth.js'
import { supabaseAdmin } from '../../_lib/supabase.js'
import { handleCors, jsonResponse, errorResponse } from '../../_lib/response.js'
import { logUsage } from '../../_lib/usage.js'

export default async function handler(req) {
  const cors = handleCors(req)
  if (cors) return cors

  const start = Date.now()
  const auth = await validateApiKey(req)
  if (auth.error) return auth.error

  const url = new URL(req.url, 'http://localhost')
  const billId = decodeURIComponent(url.pathname.split('/').pop())

  const { data: bill, error } = await supabaseAdmin
    .from('bills')
    .select('*')
    .eq('id', billId)
    .single()

  if (error || !bill) {
    logUsage(auth.key.id, `/v1/bills/${billId}`, 'GET', 404, Date.now() - start)
    return errorResponse(`Bill not found: ${billId}`, 404, 'NOT_FOUND')
  }

  // Also fetch related articles
  const { data: articles } = await supabaseAdmin
    .from('bill_articles')
    .select('url, publisher, headline, published_at')
    .eq('bill_id', billId)
    .order('published_at', { ascending: false })
    .limit(10)

  logUsage(auth.key.id, `/v1/bills/${billId}`, 'GET', 200, Date.now() - start)

  return jsonResponse({
    data: { ...bill, articles: articles || [] },
    meta: { api_version: 'v1' },
  })
}

export const config = { runtime: 'nodejs' }
