import { test, expect } from '@playwright/test'

test.describe('Add book flow', () => {
  test('search → click result → "Registrar leitura" → book appears in library', async ({ page }) => {
    await page.goto('/')

    // Go to search
    await page.getByRole('button', { name: /pesquisar/i }).click()

    const input = page.getByPlaceholder(/título, autor ou tema/i)
    await input.fill('o alquimista')

    // Wait for results
    const result = page.locator('div').filter({ hasText: /alquimista/i }).nth(1)
    await expect(result).toBeVisible({ timeout: 15_000 })

    // Capture title for later verification
    const titleEl = result.locator('div').filter({ hasText: /alquimista/i }).first()
    const bookTitle = (await titleEl.textContent())?.trim() ?? 'O Alquimista'

    await result.click()

    // Click "Registrar leitura" in the modal
    const registerBtn = page.getByRole('button', { name: /registrar leitura/i })
    await expect(registerBtn).toBeVisible({ timeout: 5_000 })
    await registerBtn.click()

    // Step 1: "Próximo →" button
    const nextBtn = page.getByRole('button', { name: /próximo/i })
    if (await nextBtn.isVisible()) {
      await nextBtn.click()
    }

    // Step 2: "Salvar"
    const saveBtn = page.getByRole('button', { name: /salvar/i })
    await expect(saveBtn).toBeVisible({ timeout: 3_000 })
    await saveBtn.click()

    // Navigate to library (home tab)
    await page.getByRole('button', { name: /biblioteca|início/i }).first().click()

    // The book should now appear in the library
    await expect(page.locator('div').filter({ hasText: /alquimista/i }).first()).toBeVisible({ timeout: 8_000 })
  })
})
