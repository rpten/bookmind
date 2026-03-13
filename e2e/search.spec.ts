import { test, expect } from '@playwright/test'

// Helper: navigate to the Search tab
async function goToSearch(page: import('@playwright/test').Page) {
  await page.goto('/')
  // Click the "Pesquisar" tab (nav icon at bottom)
  await page.getByRole('button', { name: /pesquisar/i }).click()
}

test.describe('Search — by title', () => {
  test('searching "clube da luta" returns a relevant result', async ({ page }) => {
    await goToSearch(page)

    const input = page.getByPlaceholder(/título, autor ou tema/i)
    await input.fill('clube da luta')

    // Wait for results to appear (debounce 400ms + network)
    await expect(page.locator('[data-testid="search-result"], div').filter({
      hasText: /clube da luta|fight club/i,
    }).first()).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('Search — by author', () => {
  test('searching "matt haig" returns a result with author "Matt Haig"', async ({ page }) => {
    await goToSearch(page)

    const input = page.getByPlaceholder(/título, autor ou tema/i)
    await input.fill('matt haig')

    await expect(page.locator('div').filter({
      hasText: /matt haig/i,
    }).first()).toBeVisible({ timeout: 15_000 })
  })
})
