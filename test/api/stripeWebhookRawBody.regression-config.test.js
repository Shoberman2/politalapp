import Stripe from 'stripe'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Regression: Vercel's legacy Node handler parses JSON before invocation,
// which changes the byte sequence Stripe signs. This endpoint uses Vercel's
// Web Request signature so request.text() returns the untouched payload.

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
  it('accepts a valid signature over the exact Web Request body', async () => {
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

    const response = await handler.fetch(new Request('http://localhost/api/webhooks/stripe', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'stripe-signature': signature,
      },
      body: payload,
    }))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ received: true })
  })
})
