import { Readable } from 'node:stream'
import Stripe from 'stripe'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Regression: Vercel's Node request exposes JSON through a lazy parsed body
// getter, but Stripe verifies signatures against the untouched request bytes.
// Found during the final full-stack configuration audit on 2026-07-12.

vi.mock('../../api/_lib/supabase.js', () => ({
  supabaseAdmin: { from: vi.fn() },
}))

import handler from '../../api/webhooks/stripe.js'

const originalStripeSecret = process.env.STRIPE_SECRET_KEY
const originalWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET

afterEach(() => {
  if (originalStripeSecret === undefined) delete process.env.STRIPE_SECRET_KEY
  else process.env.STRIPE_SECRET_KEY = originalStripeSecret

  if (originalWebhookSecret === undefined) delete process.env.STRIPE_WEBHOOK_SECRET
  else process.env.STRIPE_WEBHOOK_SECRET = originalWebhookSecret
})

describe('Stripe webhook raw-body verification', () => {
  it('accepts a valid signature without reading Vercel\'s parsed body getter', async () => {
    const stripeSecret = 'sk_test_ballotwatch_config'
    const webhookSecret = 'whsec_ballotwatch_config'
    const payload = '{\n  "id": "evt_config_test",\n  "type": "ballotwatch.config.test",\n  "data": { "object": {} }\n}'
    const stripe = new Stripe(stripeSecret)
    const signature = stripe.webhooks.generateTestHeaderString({
      payload,
      secret: webhookSecret,
    })

    process.env.STRIPE_SECRET_KEY = stripeSecret
    process.env.STRIPE_WEBHOOK_SECRET = webhookSecret

    const req = Readable.from([Buffer.from(payload)])
    req.method = 'POST'
    req.headers = {
      'content-type': 'application/json',
      'stripe-signature': signature,
    }
    Object.defineProperty(req, 'body', {
      get() {
        throw new Error('parsed body getter must not be accessed')
      },
    })

    const headers = new Map()
    const res = {
      statusCode: 0,
      setHeader: vi.fn((key, value) => headers.set(key.toLowerCase(), value)),
      end: vi.fn(),
    }

    await handler(req, res)

    expect(res.statusCode).toBe(200)
    expect(headers.get('content-type')).toContain('application/json')
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ received: true }))
  })
})
