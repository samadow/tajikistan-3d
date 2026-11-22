import { expect, test, type Page } from '@playwright/test'

/** The scene phase is mirrored on <body data-mode>. */
const waitForMode = (page: Page, mode: string) =>
  page.waitForFunction((m) => document.body.dataset.mode === m, mode, { timeout: 150_000 })

test.describe('3D experience', () => {
  test('intro ends on the map with every landmark listed', async ({ page }) => {
    await page.goto('/?quality=low')
    await waitForMode(page, 'map')
    const rail = page.getByRole('navigation', { name: /Харита|Explore|Карта/ }).first()
    await expect(rail.getByRole('button')).toHaveCount(15)
    await expect(page.locator('canvas')).toBeVisible()
  })

  test('skip intro goes straight to the map', async ({ page }) => {
    await page.goto('/?quality=low')
    const skip = page.getByRole('button', { name: /Гузаштан|Пропустить|Skip/ })
    await expect(skip).toBeVisible()
    await skip.click()
    await waitForMode(page, 'map')
  })

  test('language switch translates content from the API', async ({ page }) => {
    await page.goto('/?quality=low')
    await waitForMode(page, 'map')
    await page.getByRole('button', { name: 'English' }).first().click()
    await expect(page.getByRole('button', { name: /Hisor Fortress/ }).first()).toBeVisible()
    await page.getByRole('button', { name: 'Русский' }).first().click()
    await expect(page.getByRole('button', { name: /Гиссарская крепость/ }).first()).toBeVisible()
  })

  test('flying to a landmark opens its stage, hotspot and back to map', async ({ page }) => {
    await page.goto('/?quality=low')
    await waitForMode(page, 'map')
    await page.getByRole('button', { name: /Қалъаи Ҳисор/ }).first().click()
    await waitForMode(page, 'detail')
    await expect(page.locator('#landmark-title')).toHaveText('Қалъаи Ҳисор')
    // The in-scene pins orbit with the model; use the list of hotspots, which is also the keyboard route.
    await page.getByRole('navigation', { name: 'Нуқтаҳо' }).getByRole('button', { name: /Дарвоза/ }).click()
    await expect(page.locator('#hotspot-title')).toHaveText('Дарвоза')
    await page.keyboard.press('Escape') // closes the hotspot
    await expect(page.locator('#hotspot-title')).toHaveCount(0)
    await page.getByRole('link', { name: /Ба харита/ }).click()
    await waitForMode(page, 'map')
  })

  test('deep link with time machine and before/after compare', async ({ page }) => {
    await page.goto('/place/sarazm?quality=low&lang=en')
    await waitForMode(page, 'detail')
    const slider = page.getByRole('slider')
    await expect(slider).toBeVisible()
    await expect(page.getByText('UNESCO World Heritage Centre', { exact: false }).first()).toBeVisible()
    await page.getByRole('button', { name: /Муқоиса|Compare|Сравнить/ }).click()
    await expect(page.getByRole('button', { name: /Як давра|Single era|Одна эпоха/ })).toBeVisible()
  })

  test('story mode follows scrolling', async ({ page }) => {
    await page.goto('/story?quality=low')
    await waitForMode(page, 'story')
    await page.mouse.wheel(0, 2500)
    await expect(page.locator('[aria-current="step"]')).toHaveCount(1, { timeout: 30_000 })
  })
})

test.describe('pages and fallback', () => {
  test('discover search hits the paginated API', async ({ page }) => {
    await page.goto('/discover?quality=low')
    await page.getByRole('searchbox').fill('Karakul')
    await expect(page.getByRole('link', { name: /Қаракӯл|Karakul|Каракуль/ })).toHaveCount(1)
  })

  test('history timeline lists dated eras', async ({ page }) => {
    await page.goto('/history?quality=low')
    await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
    await expect(page.getByText(/4000/).first()).toBeVisible()
  })

  test('2D fallback without WebGL', async ({ page }) => {
    await page.goto('/?webgl=0')
    await expect(page.locator('canvas')).toHaveCount(0)
    await page.getByRole('button', { name: /Искандаркӯл/ }).click()
    await expect(page.locator('#landmark-title')).toHaveText('Искандаркӯл')
  })

  test('search palette (Ctrl+K)', async ({ page }) => {
    await page.goto('/?webgl=0')
    // Wait until the app has mounted (and registered its shortcut) before pressing it.
    await expect(page.getByRole('button', { name: /Искандаркӯл/ })).toBeVisible()
    await page.keyboard.press('Control+k')
    await page.getByRole('dialog').getByRole('textbox').fill('сомони')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/place\/ismoil-somoni-peak/)
  })
})
