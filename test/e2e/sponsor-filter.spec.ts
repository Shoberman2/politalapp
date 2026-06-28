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

const sponsorFilterEnabled = process.env.VITE_BILLS_SHOW_SPONSOR_FILTER === 'true'

test.describe('Sponsor filter pill', () => {
  test.skip(
    !sponsorFilterEnabled,
    'requires VITE_BILLS_SHOW_SPONSOR_FILTER=true on both the app build and Playwright process'
  )

  test('opens dropdown, filters bills by selected sponsor', async ({ page }) => {
    await page.goto('/bills')

    // Wait for the initial bills grid to render so we know the page is ready.
    await expect(page.locator('.bill-list')).toBeVisible()

    // Open the sponsor filter pill by its component class. Bill rows also
    // include "Sponsored by" in their accessible names, so a global role/name
    // selector is too broad for strict Playwright mode.
    const sponsorPill = page.locator('.sponsor-pill').filter({ hasText: /^Sponsored by$/ })
    await sponsorPill.click()

    // Type into the dropdown input.
    const input = page.getByPlaceholder('Type a name…')
    await input.fill('warren')

    // Wait for at least one matching politician row. The number of matches
    // depends on current member data.
    await expect(page.locator('.sponsor-pill-row-name').first()).toBeVisible({ timeout: 3000 })

    // Pick the first match.
    await page.locator('.sponsor-pill-row').first().click()

    // The pill should now show the selected name + ×, and the count line
    // should reflect the active filter.
    await expect(page.locator('.sponsor-pill-name')).toBeVisible()
    await expect(page.locator('.results-filter').filter({ hasText: /sponsored by/i })).toBeVisible()

    // Bills list should re-render. We don't assert a specific count (depends
    // on data), but it should still be a list.
    await expect(page.locator('.bill-list')).toBeVisible()
  })

  test('Esc dismisses dropdown without applying a filter', async ({ page }) => {
    await page.goto('/bills')
    await page.locator('.sponsor-pill').filter({ hasText: /^Sponsored by$/ }).click()
    await page.getByPlaceholder('Type a name…').press('Escape')
    // Dropdown gone; pill still says "Sponsored by" not a name.
    await expect(page.locator('.sponsor-pill-name')).toHaveCount(0)
  })
})
