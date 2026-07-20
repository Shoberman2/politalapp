import Stripe from 'stripe'
import { supabaseAdmin } from '../_lib/supabase.js'
import { getHeader, readTextBody } from '../_lib/request.js'

async function route(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const signature = getHeader(req, 'stripe-signature')
  if (!signature) {
    return new Response('Missing signature', { status: 400 })
  }

  const stripeSecret = process.env.STRIPE_SECRET_KEY
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET
  if (!stripeSecret || !webhookSecret) {
    return new Response('Stripe webhook is not configured', { status: 500 })
  }

  const stripe = new Stripe(stripeSecret, {
    apiVersion: '2023-10-16',
  })

  const body = await readTextBody(req)

  let event
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret)
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  console.log(`Processing Stripe event: ${event.type}`)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        const userId = session.metadata?.supabase_user_id
        const orgId = session.metadata?.org_id

        if (!userId && !orgId) break

        const subscription = await stripe.subscriptions.retrieve(session.subscription)

        if (orgId) {
          // B2B org subscription
          const plan = session.metadata?.plan || 'starter'
          const limits = { starter: 10000, pro: 100000, enterprise: 0 } // 0 = unlimited
          await supabaseAdmin
            .from('organizations')
            .update({
              stripe_customer_id: session.customer,
              subscription_id: subscription.id,
              subscription_status: 'active',
              plan,
              monthly_limit: limits[plan] || 10000,
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', orgId)

          console.log(`Activated B2B subscription for org ${orgId} (${plan})`)
        } else if (userId) {
          // Consumer subscription (existing flow)
          await supabaseAdmin
            .from('profiles')
            .update({
              stripe_customer_id: session.customer,
              subscription_id: subscription.id,
              subscription_status: 'active',
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', userId)

          console.log(`Activated consumer subscription for user ${userId}`)
        }
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object
        const customerId = subscription.customer

        // Try B2B org first
        const { data: org } = await supabaseAdmin
          .from('organizations')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (org) {
          await supabaseAdmin
            .from('organizations')
            .update({
              subscription_status: subscription.status === 'active' ? 'active' : subscription.status,
              current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', org.id)
          console.log(`Updated B2B subscription for org ${org.id}: ${subscription.status}`)
        } else {
          // Fall back to consumer profile
          const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .single()

          if (profile) {
            await supabaseAdmin
              .from('profiles')
              .update({
                subscription_status: subscription.status === 'active' ? 'active' : subscription.status,
                current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq('id', profile.id)
            console.log(`Updated consumer subscription for user ${profile.id}: ${subscription.status}`)
          }
        }
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object
        const customerId = subscription.customer

        const { data: org } = await supabaseAdmin
          .from('organizations')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (org) {
          await supabaseAdmin
            .from('organizations')
            .update({ subscription_status: 'canceled', updated_at: new Date().toISOString() })
            .eq('id', org.id)
          console.log(`Canceled B2B subscription for org ${org.id}`)
        } else {
          const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .single()

          if (profile) {
            await supabaseAdmin
              .from('profiles')
              .update({ subscription_status: 'canceled', updated_at: new Date().toISOString() })
              .eq('id', profile.id)
            console.log(`Canceled consumer subscription for user ${profile.id}`)
          }
        }
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const customerId = invoice.customer

        const { data: org } = await supabaseAdmin
          .from('organizations')
          .select('id')
          .eq('stripe_customer_id', customerId)
          .single()

        if (org) {
          await supabaseAdmin
            .from('organizations')
            .update({ subscription_status: 'past_due', updated_at: new Date().toISOString() })
            .eq('id', org.id)
        } else {
          const { data: profile } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .eq('stripe_customer_id', customerId)
            .single()

          if (profile) {
            await supabaseAdmin
              .from('profiles')
              .update({ subscription_status: 'past_due', updated_at: new Date().toISOString() })
              .eq('id', profile.id)
          }
        }
        break
      }
    }
  } catch (err) {
    console.error('Error processing webhook:', err)
    return new Response(`Webhook handler error: ${err.message}`, { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
  })
}

export default {
  fetch(request) {
    return route(request)
  },
}
