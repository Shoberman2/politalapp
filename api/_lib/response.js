const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
}

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
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

export function handleCors(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }
  return null
}

export function parsePagination(url) {
  const params = new URL(url).searchParams
  const offset = Math.max(0, parseInt(params.get('offset') || '0', 10) || 0)
  const limit = Math.min(100, Math.max(1, parseInt(params.get('limit') || '20', 10) || 20))
  return { offset, limit }
}
