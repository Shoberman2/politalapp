import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { getHeader, readJsonBody, sendResponse } from './_lib/civicBriefing.js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// B2B plan price IDs — set these in Vercel env vars
const PLAN_PRICES = {
  starter: process.env.STRIPE_PRICE_STARTER,
  pro: process.env.STRIPE_PRICE_PRO,
  enterprise: process.env.STRIPE_PRICE_ENTERPRISE,
  consumer: process.env.STRIPE_PRICE_ID, // Existing $2/mo consumer plan
}

async function route(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  try {
    // Create a Supabase client with the user's auth token
    const supabase = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
      process.env.VITE_SUPABASE_ANON_KEY || '',
      { global: { headers: { Authorization: getHeader(req, 'authorization') } } }
    )

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { returnUrl, plan, orgId } = await readJsonBody(req)
    const selectedPlan = plan || 'consumer'
    const priceId = PLAN_PRICES[selectedPlan]

    if (!priceId) {
      return new Response(JSON.stringify({ error: `Stripe price is not configured for plan: ${selectedPlan}` }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!process.env.STRIPE_SECRET_KEY) {
      return new Response(JSON.stringify({ error: 'Stripe secret key is not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    })

    // Admin client for profile/org lookups
    const supabaseAdmin = createClient(
      process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    // Look up existing Stripe customer
    let customerId = null

    if (orgId) {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('stripe_customer_id')
        .eq('id', orgId)
        .single()
      customerId = org?.stripe_customer_id
    } else {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('stripe_customer_id')
        .eq('id', user.id)
        .single()
      customerId = profile?.stripe_customer_id
    }

    // Create Stripe customer if needed
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id, org_id: orgId || '' },
      })
      customerId = customer.id

      // Save customer ID
      if (orgId) {
        await supabaseAdmin
          .from('organizations')
          .update({ stripe_customer_id: customerId })
          .eq('id', orgId)
      } else {
        await supabaseAdmin
          .from('profiles')
          .update({ stripe_customer_id: customerId })
          .eq('id', user.id)
      }
    }

    const metadata = orgId
      ? { org_id: orgId, plan: selectedPlan }
      : { supabase_user_id: user.id }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${returnUrl}?session_id={CHECKOUT_SESSION_ID}&success=true`,
      cancel_url: `${returnUrl}?canceled=true`,
      metadata,
    })

    return new Response(JSON.stringify({ url: session.url }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Checkout error:', err)
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
}

export default async function handler(req, res) {
  return sendResponse(res, await route(req))
}

export const config = { runtime: 'nodejs' }
