import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const full = process.argv.includes('--full')
const offline = process.argv.includes('--offline')

function parseEnvFile(path) {
  if (!existsSync(path)) return {}
  const parsed = {}
  for (const sourceLine of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = sourceLine.trim().replace(/^export\s+/, '')
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator < 1) continue
    const key = line.slice(0, separator).trim()
    let value = line.slice(separator + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    parsed[key] = value
  }
  return parsed
}

const config = {
  ...parseEnvFile(resolve('.env')),
  ...parseEnvFile(resolve('.env.local')),
  ...process.env,
}

const checks = []
const warnings = []
const errors = []

function configured(value) {
  if (!value || !String(value).trim()) return false
  const normalized = String(value).trim().toLowerCase()
  return !(
    normalized.startsWith('your_') ||
    normalized.startsWith('your-') ||
    normalized.includes('your-project') ||
    normalized.includes('...') ||
    normalized.startsWith('<')
  )
}

function requireKeys(label, keys, target = errors) {
  const missing = keys.filter((key) => !configured(config[key]))
  if (missing.length === 0) {
    checks.push(`${label}: configured`)
    return true
  }
  target.push(`${label}: missing ${missing.join(', ')}`)
  return false
}

const coreReady = requireKeys('Core browser data', [
  'VITE_SUPABASE_URL',
  'VITE_SUPABASE_ANON_KEY',
  'VITE_CONGRESS_API_KEY',
]) && requireKeys('Core server/API data', [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'VITE_PUBLIC_ORIGIN',
])

if (configured(config.VITE_SUPABASE_URL) && configured(config.SUPABASE_URL)) {
  const browserUrl = config.VITE_SUPABASE_URL.replace(/\/$/, '')
  const serverUrl = config.SUPABASE_URL.replace(/\/$/, '')
  if (browserUrl === serverUrl) checks.push('Supabase project URLs: consistent')
  else errors.push('Supabase project URLs: VITE_SUPABASE_URL and SUPABASE_URL point to different projects')
}

const publicSecretKeys = Object.keys(config).filter((key) =>
  key.startsWith('VITE_') && /(OPENAI|SECRET|SERVICE_ROLE|PRIVATE|TOKEN_ENCRYPTION)/.test(key)
)
if (publicSecretKeys.length > 0) {
  errors.push(`Server secrets use a public VITE_ prefix: ${publicSecretKeys.join(', ')}`)
} else {
  checks.push('Public-prefix safety: no server secrets exposed')
}

if (full) {
  requireKeys('OpenAI bill explanations', ['OPENAI_API_KEY'])
  requireKeys('Stripe subscriptions', [
    'VITE_STRIPE_PUBLISHABLE_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'STRIPE_PRICE_ID',
  ])
  requireKeys('Gmail briefing delivery', [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GMAIL_REDIRECT_URI',
    'GMAIL_TOKEN_ENCRYPTION_KEY',
    'CRON_SECRET',
  ])
} else {
  const optionalGroups = [
    ['Stripe subscriptions', ['VITE_STRIPE_PUBLISHABLE_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'STRIPE_PRICE_ID']],
    ['Gmail briefing delivery', ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GMAIL_REDIRECT_URI', 'GMAIL_TOKEN_ENCRYPTION_KEY', 'CRON_SECRET']],
  ]
  for (const [label, keys] of optionalGroups) {
    const present = keys.filter((key) => configured(config[key]))
    if (present.length > 0 && present.length < keys.length) {
      warnings.push(`${label}: partially configured; missing ${keys.filter((key) => !configured(config[key])).join(', ')}`)
    }
  }
}

if (!offline && coreReady && configured(config.VITE_SUPABASE_URL) && configured(config.VITE_SUPABASE_ANON_KEY)) {
  try {
    const response = await fetch(`${config.VITE_SUPABASE_URL.replace(/\/$/, '')}/auth/v1/settings`, {
      headers: { apikey: config.VITE_SUPABASE_ANON_KEY },
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const settings = await response.json()
    if (settings.external?.google === true) {
      checks.push('Supabase Google sign-in: enabled')
    } else {
      const message = 'Supabase Google sign-in: disabled; configure Auth > Providers > Google before exposing the sign-in button'
      ;(full ? errors : warnings).push(message)
    }
  } catch (error) {
    warnings.push(`Supabase Auth settings: unable to verify (${error.message})`)
  }
}

console.log(`BallotWatch configuration check (${full ? 'full' : 'core'})`)
for (const check of checks) console.log(`  ✓ ${check}`)
for (const warning of warnings) console.warn(`  ! ${warning}`)
for (const error of errors) console.error(`  ✗ ${error}`)

if (errors.length > 0) {
  console.error(`\nConfiguration failed with ${errors.length} error${errors.length === 1 ? '' : 's'}.`)
  process.exitCode = 1
} else {
  console.log(`\nConfiguration passed${warnings.length ? ` with ${warnings.length} warning${warnings.length === 1 ? '' : 's'}` : ''}.`)
}
