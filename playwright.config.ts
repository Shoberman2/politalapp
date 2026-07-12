/**
 * Playwright config for E2E tests (per eng-review D9).
 *
 * Runs against the Vercel preview URL on every PR. Pass via env:
 *   PLAYWRIGHT_BASE_URL=https://politicalapp-pr-123.vercel.app npx playwright test
 *
 * Local dev:
 *   npm run dev:fullstack (in one terminal)
 *   npm run test:e2e (in another terminal; defaults to http://localhost:3000)
 *
 * NOTE: `@playwright/test` is a dev dependency. Run
 * `npx playwright install chromium` once to install the browser binary.
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
