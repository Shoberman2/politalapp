import { test, expect } from '@playwright/test'

/**
 * E2E: sponsor filter pill end-to-end flow.
 *
 * Auth: BallotWatch requires login. CI must seed a test cookie
 * via a setup project or fixture. See test/e2e/README.md.
 *
 * Pre-req env on the preview build:
 *   VITE_BILLS_SHOW_SPONSOR_FILTER=true
 *   Phase A backfill must have populated bills.sponsor_bioguide_id
 *   for at least one current-Congress bill.
 */

test.describe('Sponsor filter pill', () => {
  test('opens dropdown, filters bills by selected sponsor', async ({ page }) => {
    await page.goto('/bills')

    // Wait for the initial bills grid to render so we know the page is ready.
    await expect(page.locator('.bill-list')).toBeVisible()

    // Open the "Sponsored by" pill. (When the feature flag is off, this
    // selector won't exist — the test will fail with a clear message.)
    const sponsorPill = page.getByRole('button', { name: /sponsored by/i })
    await sponsorPill.click()

    // Type into the dropdown input.
    const input = page.getByPlaceholder('Type a name…')
    await input.fill('warren')

    // Wait for at least one matching politician row.
    await expect(page.locator('.sponsor-pill-row-name')).toHaveCount(1, { timeout: 3000 })

    // Pick the first match.
    await page.locator('.sponsor-pill-row').first().click()

    // The pill should now show the selected name + ×, and the count line
    // should reflect the active filter.
    await expect(page.locator('.sponsor-pill-name')).toBeVisible()
    await expect(page.locator('.results-filter')).toContainText(/sponsored by/i)

    // Bills list should re-render. We don't assert a specific count (depends
    // on data), but it should still be a list.
    await expect(page.locator('.bill-list')).toBeVisible()
  })

  test('Esc dismisses dropdown without applying a filter', async ({ page }) => {
    await page.goto('/bills')
    await page.getByRole('button', { name: /sponsored by/i }).click()
    await page.getByPlaceholder('Type a name…').press('Escape')
    // Dropdown gone; pill still says "Sponsored by" not a name.
    await expect(page.locator('.sponsor-pill-name')).toHaveCount(0)
  })
})
