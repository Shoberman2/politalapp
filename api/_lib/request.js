export function getHeader(req, name) {
  if (req.headers?.get) return req.headers.get(name) || req.headers.get(name.toLowerCase()) || ''
  const value = req.headers?.[name.toLowerCase()] || req.headers?.[name]
  return Array.isArray(value) ? value[0] || '' : value || ''
}

export function getRequestUrl(req) {
  if (req.url && /^https?:\/\//i.test(req.url)) return req.url
  const proto = getHeader(req, 'x-forwarded-proto') || 'http'
  const host = getHeader(req, 'x-forwarded-host') || getHeader(req, 'host') || 'localhost'
  return `${proto}://${host}${req.url || '/'}`
}

async function readStream(req) {
  const chunks = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

export async function readJsonBody(req) {
  if (typeof req.json === 'function') return req.json()
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body
  if (Buffer.isBuffer(req.body)) return JSON.parse(req.body.toString('utf8') || '{}')
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}')
  const body = await readStream(req)
  return body ? JSON.parse(body) : {}
}

export async function readTextBody(req) {
  if (typeof req.text === 'function') return req.text()
  if (Buffer.isBuffer(req.body)) return req.body.toString('utf8')
  if (typeof req.body === 'string') return req.body
  if (req.body != null) return JSON.stringify(req.body)
  return readStream(req)
}

export async function sendResponse(res, response) {
  if (!res || typeof res.setHeader !== 'function') return response

  res.statusCode = response.status || 200
  response.headers?.forEach((value, key) => {
    res.setHeader(key, value)
  })
  const body = await response.text()
  res.end(body)
  return undefined
}
