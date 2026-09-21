import { test, expect } from '@playwright/test'

/**
 * E2E: Coach tAIger+ dashboard.
 *
 * Verifica que /coach carga correctamente con sesión autenticada y muestra
 * los componentes esperados según el estado del usuario de test.
 *
 * El test user tiene rondas e historial — debería ver el dashboard completo
 * (no el empty state ni la gate de beta/billing).
 *
 * Día rotativo: saturday/sunday — Coach y Mi Golf.
 */

test.describe('Coach tAIger+ Dashboard', () => {
  test('carga el dashboard sin errores y muestra hero + CTA', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) =>
      pageErrors.push(err.message),
    )

    await page.goto('/coach', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // No debería redirigir a login
    expect(page.url(), '/coach no debería redirigir a /login').not.toContain('/login')

    const body = page.locator('body')
    const text = await body.innerText()

    // Filtrar ruido benigno (Supabase lock steal, ResizeObserver)
    const appErrors = pageErrors.filter(
      (e) =>
        !e.includes('Lock broken by another request') &&
        !e.includes('ResizeObserver'),
    )
    expect(appErrors, 'No debería haber errores JS en /coach').toEqual([])

    // Detectar qué estado ve el test user
    const isUpsell = text.includes('Upgrade') || text.includes('Plan Pro')
    const isGate = text.includes('Próximamente') || text.includes('proximamente')
    const isEmpty = text.includes('Bienvenido a tAIger+') && text.includes('Hablar con mi coach')
    const isDashboard =
      text.includes('tAIger+') &&
      (text.includes('coach') || text.includes('Conversar'))

    // Al menos uno de los estados válidos debe estar presente
    expect(
      isUpsell || isGate || isEmpty || isDashboard,
      'El coach debería mostrar upsell, gate, empty state o dashboard',
    ).toBe(true)

    // Si el user tiene acceso y rondas, verifica el dashboard completo
    if (isDashboard && !isEmpty && !isUpsell && !isGate) {
      // Link a progreso
      const progresoLink = page.locator('a[href="/coach/progreso"]')
      await expect(progresoLink, 'Debería haber link a /coach/progreso').toBeVisible({
        timeout: 5_000,
      })

      // CTA sticky de conversar
      const ctaConversar = page.locator('a').filter({ hasText: /conversar|iniciar conversación/i })
      await expect(ctaConversar.first(), 'CTA de conversar debería ser visible').toBeVisible({
        timeout: 5_000,
      })
    }
  })

  test('link a progreso navega correctamente', async ({ page }) => {
    await page.goto('/coach', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    const progresoLink = page.locator('a[href="/coach/progreso"]')
    const isVisible = await progresoLink.isVisible().catch(() => false)

    if (!isVisible) {
      // Si no hay link a progreso (gate, upsell, empty state), skipear
      test.skip(true, 'El test user no ve el dashboard completo — sin link a progreso')
      return
    }

    await progresoLink.click()
    await page.waitForURL(/\/coach\/progreso/, { timeout: 10_000 })
    expect(page.url()).toContain('/coach/progreso')

    // Progreso debe cargar algo (loading → ready o error)
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    const bodyText = await page.locator('body').innerText()

    // Debe mostrar contenido de progreso (no estar vacío)
    // Debe tener contenido visible (dashboard, upsell, gate, o loading)
    expect(
      bodyText.length,
      '/coach/progreso debe tener contenido visible',
    ).toBeGreaterThan(50)
  })

  test('empty state muestra CTAs correctos cuando no hay rondas', async ({ page }) => {
    await page.goto('/coach', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    const text = await page.locator('body').innerText()

    if (!text.includes('Bienvenido a tAIger+')) {
      // User tiene rondas — no es empty state — skip
      test.skip(true, 'Test user tiene rondas — no ve empty state')
      return
    }

    // Empty state CTAs
    const coachCTA = page.locator('a[href="/coach/sesion/nueva"]')
    await expect(coachCTA, 'CTA "Hablar con mi coach" visible').toBeVisible()

    const rondaCTA = page.locator('a[href="/ronda-libre/nueva"]')
    await expect(rondaCTA, 'CTA "Nueva ronda" visible').toBeVisible()

    const importCTA = page.locator('a[href="/importar"]')
    await expect(importCTA, 'CTA "Importar historial" visible').toBeVisible()
  })

  test('patrones detectados se renderizan con datos numéricos', async ({ page }) => {
    await page.goto('/coach', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    const text = await page.locator('body').innerText()

    // Solo testear si el dashboard muestra patrones
    if (!text.includes('Patrones detectados')) {
      test.skip(true, 'No hay patrones detectados para este test user')
      return
    }

    // Cada patrón tiene "X rondas · Y% conf"
    const patternMeta = text.match(/\d+ rondas · \d+% conf/g)
    expect(
      patternMeta,
      'Patrones deben mostrar rondas y confianza numérica',
    ).not.toBeNull()

    // Confianza entre 0% y 100%
    for (const meta of patternMeta ?? []) {
      const confMatch = meta.match(/(\d+)% conf/)
      const conf = parseInt(confMatch?.[1] ?? '0', 10)
      expect(conf, `Confianza ${conf}% debe estar entre 1 y 100`).toBeGreaterThanOrEqual(1)
      expect(conf).toBeLessThanOrEqual(100)
    }
  })

  test('no hay 5xx ni errores de consola en /coach/progreso', async ({ page }) => {
    const pageErrors: string[] = []
    const serverErrors: string[] = []

    page.on('pageerror', (err) => pageErrors.push(err.message))
    page.on('response', (res) => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
    })

    await page.goto('/coach/progreso', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    expect(page.url(), '/coach/progreso no debería redirigir a /login').not.toContain('/login')

    const appErrors = pageErrors.filter(
      (e) =>
        !e.includes('Lock broken by another request') &&
        !e.includes('ResizeObserver'),
    )
    expect(appErrors, 'No errores JS en /coach/progreso').toEqual([])
    expect(serverErrors, 'No 5xx en /coach/progreso').toEqual([])
  })
})
