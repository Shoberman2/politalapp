import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

// Regression: the configuration audit correctly rejected known server-secret
// names, but did not explain that direct browser API keys are bundled by Vite.

const root = process.cwd()
const baseEnv = {
  ...process.env,
  VITE_SUPABASE_URL: 'https://config-test.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'public-anon-config-test',
  VITE_STRIPE_PUBLISHABLE_KEY: 'pk_test_public-stripe-config-test',
  CONGRESS_API_KEY: 'private-congress-config-test',
  FEC_API_KEY: 'private-fec-config-test',
  VITE_CONGRESS_API_KEY: '',
  VITE_FEC_API_KEY: '',
  SUPABASE_URL: 'https://config-test.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'private-service-role-config-test',
  VITE_PUBLIC_ORIGIN: 'http://localhost:3000',
}

function runConfig(extraEnv = {}) {
  return spawnSync(process.execPath, ['scripts/check-config.mjs', '--offline'], {
    cwd: root,
    env: { ...baseEnv, ...extraEnv },
    encoding: 'utf8',
  })
}

describe('browser credential classification', () => {
  it('labels allowlisted Vite credentials as public without printing values', () => {
    const result = runConfig()
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(0)
    expect(output).toContain('Browser client credentials: bundled by Vite and treated as public')
    expect(output).toContain('VITE_STRIPE_PUBLISHABLE_KEY')
    expect(output).not.toContain(baseEnv.VITE_STRIPE_PUBLISHABLE_KEY)
    expect(output).not.toContain(baseEnv.CONGRESS_API_KEY)
    expect(output).not.toContain(baseEnv.FEC_API_KEY)
  })

  it('requires the server-side proxy keys', () => {
    const result = runConfig({ CONGRESS_API_KEY: '', FEC_API_KEY: '' })
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('Server data-source proxy: missing CONGRESS_API_KEY, FEC_API_KEY')
  })

  it('accepts legacy VITE_ proxy key names with a warning, without printing values', () => {
    const result = runConfig({
      CONGRESS_API_KEY: '',
      FEC_API_KEY: '',
      VITE_CONGRESS_API_KEY: 'legacy-congress-config-test',
      VITE_FEC_API_KEY: 'legacy-fec-config-test',
    })
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(0)
    expect(output).toContain('rename it to CONGRESS_API_KEY')
    expect(output).toContain('rename it to FEC_API_KEY')
    expect(output).not.toContain('Private credentials use a public VITE_ prefix')
    expect(output).not.toContain('legacy-congress-config-test')
    expect(output).not.toContain('legacy-fec-config-test')
  })

  it('rejects an unknown Vite API key as a private credential', () => {
    const result = runConfig({ VITE_INTERNAL_API_KEY: 'private-internal-config-test' })
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('Private credentials use a public VITE_ prefix: VITE_INTERNAL_API_KEY')
    expect(output).not.toContain('private-internal-config-test')
  })

  it('reports browser and server configuration gaps in the same run', () => {
    const result = runConfig({
      VITE_SUPABASE_URL: '',
      VITE_SUPABASE_ANON_KEY: '',
      SUPABASE_URL: '',
      SUPABASE_SERVICE_ROLE_KEY: '',
      VITE_PUBLIC_ORIGIN: '',
    })
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('Core browser data: missing')
    expect(output).toContain('Core server/API data: missing')
  })
})
