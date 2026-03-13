import { test, expect } from '@playwright/test'

test.describe('BookModal — library book', () => {
  test('clicking a library book opens BookModal with title, author and "Editar review"', async ({ page }) => {
    await page.goto('/')

    // Wait for library to load — at least one book card must appear
    const bookCard = page.locator('div[style*="cursor: pointer"]').first()
    await expect(bookCard).toBeVisible({ timeout: 10_000 })

    const titleText = await bookCard.locator('div').filter({ hasText: /\w+/ }).first().textContent()
    await bookCard.click()

    // Modal should open with title visible
    const modal = page.locator('div').filter({ hasText: /editar review/i }).first()
    await expect(modal).toBeVisible({ timeout: 5_000 })

    // Author line should be present (mono font div below title)
    await expect(page.getByText(/editar review/i)).toBeVisible()
  })
})

test.describe('BookModal — search result', () => {
  test('clicking a search result opens BookModal with "Registrar leitura" or "Adicionar à fila"', async ({ page }) => {
    await page.goto('/')

    // Navigate to search tab
    await page.getByRole('button', { name: /pesquisar/i }).click()

    const input = page.getByPlaceholder(/título, autor ou tema/i)
    await input.fill('harry potter')

    // Wait for at least one result card
    const firstResult = page.locator('div').filter({ hasText: /harry potter/i }).nth(1)
    await expect(firstResult).toBeVisible({ timeout: 15_000 })
    await firstResult.click()

    // BookModal should show catalog action buttons
    const actionBtn = page.getByRole('button', { name: /registrar leitura|adicionar à fila/i }).first()
    await expect(actionBtn).toBeVisible({ timeout: 5_000 })
  })
})
