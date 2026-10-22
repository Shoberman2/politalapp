// POST /functions/v1/delete-account
//
// Permanently deletes the signed-in user. App Store guideline 5.1.1(v)
// requires any app that lets people create an account to let them delete it
// from inside the app; the iOS client calls this from More > Account.
//
// Every user-owned table references auth.users or profiles ON DELETE CASCADE
// (profiles, organizations -> api_keys, watchlists, briefings, alerts), so
// deleting the auth user removes all of it. An active Stripe subscription is
// cancelled first: if that fails the account is left intact, so nobody is
// billed for an account that no longer exists.
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@14?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const LIVE_SUBSCRIPTION = new Set(['active', 'past_due', 'trialing'])

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) return json({ error: 'Unauthorized' }, 401)

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return json({ error: 'Unauthorized' }, 401)

    const admin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const subscriptionIds = new Set<string>()
    const { data: profile } = await admin
      .from('profiles')
      .select('subscription_id, subscription_status')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.subscription_id && LIVE_SUBSCRIPTION.has(profile.subscription_status ?? '')) {
      subscriptionIds.add(profile.subscription_id)
    }
    const { data: orgs } = await admin
      .from('organizations')
      .select('subscription_id, subscription_status')
      .eq('owner_id', user.id)
    for (const org of orgs ?? []) {
      if (org.subscription_id && LIVE_SUBSCRIPTION.has(org.subscription_status ?? '')) {
        subscriptionIds.add(org.subscription_id)
      }
    }

    if (subscriptionIds.size > 0) {
      const stripeKey = Deno.env.get('STRIPE_SECRET_KEY')
      if (!stripeKey) {
        return json({ error: 'Your subscription could not be cancelled. Your account was not deleted.' }, 500)
      }
      const stripe = new Stripe(stripeKey, { apiVersion: '2023-10-16' })
      for (const id of subscriptionIds) {
        try {
          await stripe.subscriptions.cancel(id)
        } catch (err) {
          // Already cancelled upstream is fine; anything else stops the delete.
          if ((err as { code?: string })?.code !== 'resource_missing') throw err
        }
      }
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(user.id)
    if (deleteError) throw deleteError

    return json({ deleted: true })
  } catch (error) {
    console.error('delete-account failed', (error as Error)?.message)
    return json({ error: 'Your account could not be deleted. Please try again.' }, 500)
  }
})
