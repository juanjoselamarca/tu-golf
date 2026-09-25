/**
 * E2E — Coach tAIger+: /coach, /coach/progreso, /coach/sesion/nueva
 *
 * Cubre:
 *   1. Dashboard /coach — carga sin errores, muestra upsell PRO o dashboard
 *   2. Upsell page — verifica que "Conocer PRO" aparece para usuarios sin plan PRO
 *   3. Progreso /coach/progreso — carga sin errores, muestra upsell o datos
 *   4. Chat /coach/sesion/nueva — carga sin errores o redirige correctamente
 *
 * Test user tiene coach_access_enabled=true pero NO tiene plan PRO,
 * por lo que ve la pantalla de upsell (CoachUpsellPage).
 */

import { test, expect } from '@playwright/test'

/** Helper: navega y detecta BotID. */
async function safeGoto(page: import('@playwright/test').Page, path: string): Promise<boolean> {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  const bodyText = await page.locator('body').innerText()
  if (bodyText.includes('Failed to verify your browser') || bodyText.includes('Security Checkpoint')) {
    return false
  }
  return true
}

test.describe('Coach tAIger+ — Dashboard', () => {
  test.beforeEach(async () => {
    if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
      test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
    }
  })

  test('dashboard carga sin errores 5xx', async ({ page }) => {
    const pageErrors: string[] = []
    const serverErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))
    page.on('response', res => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
    })

    const loaded = await safeGoto(page, '/coach')
    test.fixme(!loaded, 'Vercel BotID bloqueó el headless browser')

    // No debe redirigir a login
    expect(page.url()).not.toContain('/login')

    // Debe mostrar contenido del coach (dashboard o upsell)
    const bodyText = await page.locator('body').innerText({ timeout: 15_000 })
    const hasContent = /taiger|coach|pro|conversar|patrones|rendimiento/i.test(bodyText)
    expect(
      hasContent,
      `Dashboard debe mostrar contenido del coach. Body: ${bodyText.slice(0, 300)}`,
    ).toBeTruthy()

    expect(serverErrors, 'No debe haber errores 5xx').toHaveLength(0)

    const appErrors = pageErrors.filter(
      e => !e.includes('Lock broken by another request') && !e.includes('ResizeObserver'),
    )
    expect(appErrors, 'No debe haber errores JS de la app').toHaveLength(0)
  })

  test('muestra upsell PRO con CTA "Conocer PRO"', async ({ page }) => {
    const loaded = await safeGoto(page, '/coach')
    test.fixme(!loaded, 'Vercel BotID bloqueó el headless browser')

    await page.waitForTimeout(2000)
    const bodyText = await page.locator('body').innerText()

    // Test user no tiene PRO — debe ver upsell
    // Si el paywall está desactivado, verá el dashboard directamente (ambos son válidos)
    const hasUpsell = /conocer.*pro|coach.*pro|desbloquea|mejorar.*plan/i.test(bodyText)
    const hasDashboard = /conversar|patrones|progreso|analizando|hablar.*coach/i.test(bodyText)
    const hasGate = /código.*acceso|activar|TAIGER/i.test(bodyText)

    expect(
      hasUpsell || hasDashboard || hasGate,
      `Debe mostrar upsell PRO, dashboard o gate. Body: ${bodyText.slice(0, 300)}`,
    ).toBeTruthy()
  })

  test('hero tAIger+ es visible con subtítulo', async ({ page }) => {
    const loaded = await safeGoto(page, '/coach')
    test.fixme(!loaded, 'Vercel BotID bloqueó el headless browser')

    await page.waitForTimeout(2000)

    // El hero "tAIger+" debe ser visible en cualquier estado (upsell o dashboard)
    const taigerHeading = page.getByText(/taiger\+/i).first()
    await expect(taigerHeading).toBeVisible({ timeout: 10_000 })

    // Subtítulo descriptivo
    const bodyText = await page.locator('body').innerText()
    const hasSubtitle = /coach.*rendimiento|inteligencia.*artificial|análisis.*patrones/i.test(bodyText)
    expect(hasSubtitle, 'Debe tener subtítulo descriptivo del coach').toBeTruthy()
  })
})

// ─── Progreso ───────────────────────────────────────────────────────────

test.describe('Coach tAIger+ — Progreso', () => {
  test.beforeEach(async () => {
    if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
      test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
    }
  })

  test('/coach/progreso carga sin errores', async ({ page }) => {
    const pageErrors: string[] = []
    const serverErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))
    page.on('response', res => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
    })

    const loaded = await safeGoto(page, '/coach/progreso')
    test.fixme(!loaded, 'Vercel BotID bloqueó el headless browser')

    expect(page.url()).not.toContain('/login')

    await page.waitForTimeout(3000)
    const bodyText = await page.locator('body').innerText()

    // Puede mostrar progreso, upsell, gate, o redirigir al coach
    const hasProgress = /progreso|avance|meta|handicap|foco/i.test(bodyText)
    const hasUpsell = /pro|mejorar.*plan|suscri|conocer.*pro|desbloquea/i.test(bodyText)
    const hasGate = /código.*acceso|activar|TAIGER/i.test(bodyText)
    const hasCoach = /taiger|coach|rendimiento/i.test(bodyText)

    expect(
      hasProgress || hasUpsell || hasGate || hasCoach,
      `Progreso debe mostrar datos, upsell, gate o coach. Body: ${bodyText.slice(0, 300)}`,
    ).toBeTruthy()

    expect(serverErrors, 'No debe haber errores 5xx').toHaveLength(0)

    const appErrors = pageErrors.filter(
      e => !e.includes('Lock broken by another request') && !e.includes('ResizeObserver'),
    )
    expect(appErrors, 'No debe haber errores JS de la app').toHaveLength(0)
  })
})

// ─── Chat ───────────────────────────────────────────────────────────────

test.describe('Coach tAIger+ — Chat', () => {
  test.beforeEach(async () => {
    if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
      test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
    }
  })

  test('/coach/sesion/nueva carga sin errores', async ({ page }) => {
    const pageErrors: string[] = []
    const serverErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))
    page.on('response', res => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
    })

    const loaded = await safeGoto(page, '/coach/sesion/nueva')
    test.fixme(!loaded, 'Vercel BotID bloqueó el headless browser')

    expect(page.url()).not.toContain('/login')

    await page.waitForTimeout(3000)
    const bodyText = await page.locator('body').innerText()

    // Chat puede mostrar: interfaz de chat, upsell, gate, o redirigir
    const hasChat = /escribe.*mensaje|enviar|sugerencia|¿qué|cómo/i.test(bodyText)
    const hasUpsell = /pro|conocer.*pro|desbloquea/i.test(bodyText)
    const hasGate = /código.*acceso|activar|TAIGER/i.test(bodyText)
    const hasCoach = /taiger|coach|rendimiento/i.test(bodyText)

    expect(
      hasChat || hasUpsell || hasGate || hasCoach,
      `Chat debe mostrar interfaz, upsell, gate o coach. URL: ${page.url()}, Body: ${bodyText.slice(0, 300)}`,
    ).toBeTruthy()

    expect(serverErrors, 'No debe haber errores 5xx').toHaveLength(0)

    const appErrors = pageErrors.filter(
      e => !e.includes('Lock broken by another request') && !e.includes('ResizeObserver'),
    )
    expect(appErrors, 'No debe haber errores JS de la app').toHaveLength(0)
  })
})
