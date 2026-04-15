import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('[API] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
}

// Server-side admin client — uses service role key for full access.
// NEVER expose this client or key to the frontend.
export const supabaseAdmin = createClient(
  supabaseUrl || '',
  supabaseServiceKey || '',
  { auth: { persistSession: false } }
)
