import { test, expect } from '@playwright/test'

/**
 * REGRESSION (CRITICAL per eng-review D10):
 * BillDetail's existing sections (AI explanation, vote tallies, actions)
 * MUST continue to render alongside the new routing panel. The diff
 * touches BillDetail.jsx; this guard catches accidental layout regression.
 */

test.describe('BillDetail regression — existing sections still render', () => {
  test('AI explanation card + masthead + actions all present', async ({ page }) => {
    // H.R. 1 of the current Congress is a reliable seed; pick any bill that
    // exists in the seeded test fixtures.
    await page.goto('/bill/119/hr/1')

    // Masthead.
    await expect(page.locator('.bill-masthead-title')).toBeVisible()
    await expect(page.locator('.bill-masthead-id')).toBeVisible()

    // Existing AI explanation card (must not be displaced by routing panel).
    await expect(page.locator('.bill-ai-card')).toBeVisible()
    await expect(page.locator('.bill-ai-headline')).toContainText(/what this bill/i)

    // Actions (Read full text / Congress.gov / Share).
    await expect(page.locator('.bill-action-btn').first()).toBeVisible()
  })
})
