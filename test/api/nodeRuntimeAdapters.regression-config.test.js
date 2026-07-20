import { describe, expect, it, vi } from 'vitest'

// Regression: the full-stack Vercel runtime supplies Node request headers and
// response objects, while the API helpers previously assumed Fetch Request.
// Found by local full-stack smoke testing on 2026-07-10.

vi.mock('../../api/_lib/supabase.js', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

import { validateApiKey } from '../../api/_lib/auth.js'
import { errorResponse, nodeHandler, parsePagination } from '../../api/_lib/response.js'
import { getHeader, getRequestUrl, readJsonBody } from '../../api/_lib/request.js'

describe('Vercel Node runtime adapters', () => {
  it('reads headers from Fetch and Node request shapes', () => {
    const fetchRequest = new Request('http://localhost/test', {
      headers: { Authorization: 'Bearer fetch-token' },
    })
    const nodeRequest = {
      url: '/test',
      headers: { authorization: 'Bearer node-token', host: 'localhost:3000' },
    }

    expect(getHeader(fetchRequest, 'authorization')).toBe('Bearer fetch-token')
    expect(getHeader(nodeRequest, 'authorization')).toBe('Bearer node-token')
    expect(getRequestUrl(nodeRequest)).toBe('http://localhost:3000/test')
  })

  it('parses JSON bodies from Node buffers', async () => {
    await expect(readJsonBody({ body: Buffer.from('{"ok":true}') })).resolves.toEqual({ ok: true })
  })

  it('returns a 401 for a Node request without an API key', async () => {
    const result = await validateApiKey({ headers: {} })

    expect(result.error).toBeInstanceOf(Response)
    expect(result.error.status).toBe(401)
    await expect(result.error.json()).resolves.toMatchObject({
      error: { code: 'UNAUTHORIZED' },
    })
  })

  it('writes Fetch responses through a Node response object', async () => {
    const headers = new Map()
    const res = {
      statusCode: 0,
      setHeader: vi.fn((key, value) => headers.set(key.toLowerCase(), value)),
      end: vi.fn(),
    }
    const handler = nodeHandler(async () => errorResponse('No key', 401, 'UNAUTHORIZED'))

    await handler({ method: 'GET', headers: {} }, res)

    expect(res.statusCode).toBe(401)
    expect(headers.get('content-type')).toContain('application/json')
    expect(res.end).toHaveBeenCalledWith(expect.stringContaining('UNAUTHORIZED'))
  })

  it('accepts relative Node request URLs when parsing pagination', () => {
    expect(parsePagination('/api/v1/bills?offset=5&limit=200')).toEqual({
      offset: 5,
      limit: 100,
    })
  })
})
