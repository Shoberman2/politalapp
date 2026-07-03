import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { fromMock, updateMock, eqMock } = vi.hoisted(() => {
  const eq = vi.fn(() => Promise.resolve({ data: null, error: null }))
  const update = vi.fn(() => ({ eq }))
  const from = vi.fn(() => ({ update }))
  return { fromMock: from, updateMock: update, eqMock: eq }
})

vi.mock('../../api/_lib/supabase.js', () => ({
  supabaseAdmin: { from: fromMock },
}))

describe('civic briefing Gmail helpers', () => {
  beforeEach(() => {
    vi.resetModules()
    fromMock.mockClear()
    updateMock.mockClear()
    eqMock.mockClear()
    process.env.GOOGLE_CLIENT_ID = 'client-id.apps.googleusercontent.com'
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret'
    process.env.GMAIL_TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64')
    global.fetch = vi.fn()
  })

  afterEach(() => {
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    delete process.env.GMAIL_TOKEN_ENCRYPTION_KEY
    vi.restoreAllMocks()
  })

  it('builds a Google consent URL with Gmail send scope and offline access', async () => {
    const { buildGoogleAuthUrl, GMAIL_SEND_SCOPE } = await import('../../api/_lib/civicBriefing.js')

    const url = new URL(buildGoogleAuthUrl({
      state: 'state-123',
      redirectUri: 'https://www.ballotwatch.io/api/briefings/gmail/callback',
    }))

    expect(url.origin).toBe('https://accounts.google.com')
    expect(url.searchParams.get('access_type')).toBe('offline')
    expect(url.searchParams.get('prompt')).toBe('consent')
    expect(url.searchParams.get('scope')).toContain(GMAIL_SEND_SCOPE)
    expect(url.searchParams.get('state')).toBe('state-123')
  })

  it('encrypts Gmail tokens before storing them', async () => {
    const { decryptSecret, encryptSecret } = await import('../../api/_lib/civicBriefing.js')

    const encrypted = encryptSecret('refresh-token')

    expect(encrypted).toMatch(/^enc:v1:/)
    expect(encrypted).not.toContain('refresh-token')
    expect(decryptSecret(encrypted)).toBe('refresh-token')
  })

  it('refreshes expired access tokens before sending Gmail messages', async () => {
    const { encryptSecret, sendGmailMessage } = await import('../../api/_lib/civicBriefing.js')
    global.fetch
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'fresh-access-token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'https://www.googleapis.com/auth/gmail.send',
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'gmail-message-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

    const sent = await sendGmailMessage({
      connection: {
        user_id: 'user-1',
        gmail_email: 'sender@example.com',
        access_token_ciphertext: null,
        refresh_token_ciphertext: encryptSecret('refresh-token'),
        token_type: 'Bearer',
        scope: '',
        expiry_date: new Date(Date.now() - 60_000).toISOString(),
      },
      to: 'recipient@example.com',
      subject: 'BallotWatch Civic Briefing',
      html: '<p>Hello</p>',
      text: 'Hello',
    })

    expect(sent).toEqual({ id: 'gmail-message-1' })
    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      'https://oauth2.googleapis.com/token',
      expect.objectContaining({ method: 'POST' })
    )
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      access_token_ciphertext: expect.stringMatching(/^enc:v1:/),
      token_type: 'Bearer',
      revoked_at: null,
    }))
    expect(eqMock).toHaveBeenCalledWith('user_id', 'user-1')
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer fresh-access-token',
          'Content-Type': 'application/json',
        }),
      })
    )
  })

  it('rejects Gmail sends without a destination email before calling Gmail', async () => {
    const { encryptSecret, sendGmailMessage } = await import('../../api/_lib/civicBriefing.js')

    await expect(sendGmailMessage({
      connection: {
        gmail_email: 'sender@example.com',
        access_token_ciphertext: encryptSecret('access-token'),
        refresh_token_ciphertext: encryptSecret('refresh-token'),
        expiry_date: new Date(Date.now() + 60_000).toISOString(),
      },
      to: '',
      subject: 'Missing recipient',
      html: '<p>Hello</p>',
      text: 'Hello',
    })).rejects.toThrow('A valid destination email is required')

    expect(global.fetch).not.toHaveBeenCalled()
  })
})
