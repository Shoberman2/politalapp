import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'

// Regression: the configuration audit correctly rejected known server-secret
// names, but did not explain that direct browser API keys are bundled by Vite.

const root = process.cwd()
const baseEnv = {
  ...process.env,
  VITE_SUPABASE_URL: 'https://config-test.supabase.co',
  VITE_SUPABASE_ANON_KEY: 'public-anon-config-test',
  VITE_CONGRESS_API_KEY: 'public-congress-config-test',
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
    expect(output).toContain('VITE_CONGRESS_API_KEY')
    expect(output).not.toContain(baseEnv.VITE_CONGRESS_API_KEY)
  })

  it('rejects an unknown Vite API key as a private credential', () => {
    const result = runConfig({ VITE_INTERNAL_API_KEY: 'private-internal-config-test' })
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).toBe(1)
    expect(output).toContain('Private credentials use a public VITE_ prefix: VITE_INTERNAL_API_KEY')
    expect(output).not.toContain('private-internal-config-test')
  })
})
