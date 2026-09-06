import { sendResponse, getHeader } from './request.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

// Anonymous GET responses carry no Authorization header, so the CDN may cache
// them. Keyed responses stay private to the caller.
export const ANON_CACHE_CONTROL = 'public, s-maxage=300, stale-while-revalidate=3600'

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  })
}

export function errorResponse(message, status = 400, code = 'BAD_REQUEST') {
  return new Response(JSON.stringify({ error: { message, code } }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

export function paginatedResponse(data, offset, limit, total, meta = {}) {
  return jsonResponse({
    data,
    pagination: { offset, limit, total },
    meta: {
      api_version: 'v1',
      ...meta,
    },
  })
}

export function handleCors(req, { methods = corsHeaders['Access-Control-Allow-Methods'] } = {}) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: { ...corsHeaders, 'Access-Control-Allow-Methods': methods } })
  }
  return null
}

export function nodeHandler(route) {
  return async function handler(req, res) {
    const response = await route(req)
    const method = String(req.method || '').toUpperCase()
    if (response && response.status === 200 && (method === 'GET' || method === 'HEAD') && !getHeader(req, 'authorization') && !response.headers.has('Cache-Control')) {
      response.headers.set('Cache-Control', ANON_CACHE_CONTROL)
      response.headers.set('Vary', 'Authorization')
    }
    return sendResponse(res, response)
  }
}

export function parsePagination(url) {
  const params = new URL(url, 'http://localhost').searchParams
  const offset = Math.max(0, parseInt(params.get('offset') || '0', 10) || 0)
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '20', 10) || 20))
  return { offset, limit }
}
