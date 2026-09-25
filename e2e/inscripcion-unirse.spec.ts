/**
 * E2E — Inscripción a torneo: /torneo/[slug]/unirse + /torneo/unirme
 *
 * Cubre:
 *   1. /torneo/unirme — página de búsqueda por código de torneo
 *   2. /torneo/[slug]/unirse — página de inscripción (autenticado)
 *      - Carga info del torneo (nombre, formato, cancha)
 *      - Muestra perfil del jugador con índice
 *      - Botón "Inscribirme" visible o estado ya inscrito
 *      - Torneo inexistente muestra error
 *   3. Validaciones de estado (cerrado, completo, etc.)
 *
 * Los tests NO crean datos — usan torneos existentes en prod.
 * Requiere E2E_TEST_USER_EMAIL/PASSWORD para tests autenticados.
 */

import { test, expect } from '@playwright/test'

/** Helper: navega a una ruta y detecta bloqueo de Vercel BotID. */
async function safeGoto(page: import('@playwright/test').Page, path: string): Promise<boolean> {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
  const bodyText = await page.locator('body').innerText()
  if (bodyText.includes('Failed to verify your browser') || bodyText.includes('Security Checkpoint')) {
    return false
  }
  return true
}

// ─── /torneo/unirme (código de torneo) ──────────────────────────────────

test.describe('Torneo — Búsqueda por código (/torneo/unirme)', () => {
  test.beforeEach(async () => {
    if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
      test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
    }
  })

  test('muestra formulario de búsqueda con input y botón', async ({ page }) => {
    const loaded = await safeGoto(page, '/torneo/unirme')
    test.fixme(!loaded, 'Vercel BotID bloqueó el headless browser')

    // Título
    await expect(page.getByText(/unirme a un torneo/i)).toBeVisible({ timeout: 10_000 })

    // Input de código
    const codeInput = page.locator('input').first()
    await expect(codeInput).toBeVisible()

    // Botón de búsqueda
    const searchBtn = page.getByRole('button', { name: /buscar torneo/i })
    await expect(searchBtn).toBeVisible()
  })

  test('código inexistente muestra error', async ({ page }) => {
    const loaded = await safeGoto(page, '/torneo/unirme')
    test.fixme(!loaded, 'Vercel BotID bloqueó el headless browser')

    const codeInput = page.locator('input').first()
    await codeInput.fill('ZZZZZZ')

    const searchBtn = page.getByRole('button', { name: /buscar torneo/i })
    await searchBtn.click()

    // Debe mostrar error de "no encontrado"
    await expect(page.getByText(/no se encontr/i)).toBeVisible({ timeout: 10_000 })
  })
})

// ─── /torneo/[slug]/unirse (autenticado) ────────────────────────────────

test.describe('Torneo — Inscripción autenticada (/torneo/[slug]/unirse)', () => {
  // Usamos un torneo gate existente en prod (status: in_progress)
  const TOURNAMENT_SLUG = 'gate-scorer-18h-mixto'

  test.beforeEach(async () => {
    if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
      test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
    }
  })

  test('carga info del torneo sin errores 5xx', async ({ page }) => {
    const pageErrors: string[] = []
    const serverErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))
    page.on('response', res => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
    })

    const loaded = await safeGoto(page, `/torneo/${TOURNAMENT_SLUG}/unirse`)
    test.fixme(!loaded, 'Vercel BotID bloqueó el headless browser')

    // No debe redirigir a /login (sesión válida)
    expect(page.url()).not.toContain('/login')

    // Esperar a que cargue contenido real (nombre del torneo, formato, o cualquier info)
    await page.waitForTimeout(3000)
    const bodyText = await page.locator('body').innerText()

    // Debe tener contenido sustancial (no solo loading spinner)
    expect(bodyText.length, 'Página debe tener contenido cargado').toBeGreaterThan(50)

    // Debe mostrar algo del torneo: nombre, formato, inscripción, o estado
    const hasTournamentInfo = /individual|stroke|inscribirme|inscrit|torneo|gate/i.test(bodyText)
    expect(
      hasTournamentInfo,
      `Debe mostrar info del torneo. Body: ${bodyText.slice(0, 300)}`,
    ).toBeTruthy()

    // Sin errores 5xx
    expect(serverErrors, 'No debe haber errores 5xx').toHaveLength(0)

    // Filtrar errores benignos
    const appErrors = pageErrors.filter(
      e => !e.includes('Lock broken by another request') && !e.includes('ResizeObserver'),
    )
    expect(appErrors, 'No debe haber errores JS de la app').toHaveLength(0)
  })

  test('muestra botón Inscribirme o estado ya inscrito', async ({ page }) => {
    const loaded = await safeGoto(page, `/torneo/${TOURNAMENT_SLUG}/unirse`)
    test.fixme(!loaded, 'Vercel BotID bloqueó el headless browser')

    // Esperar a que cargue
    await page.waitForTimeout(3000)
    const bodyText = await page.locator('body').innerText()

    // Debe mostrar un estado válido de inscripción
    const hasInscribirme = /inscribirme/i.test(bodyText)
    const hasAlreadyRegistered = /ya.*inscrit|ya.*registrad/i.test(bodyText)
    const hasClosed = /inscripciones.*cerradas|cerrado/i.test(bodyText)
    const hasFull = /torneo completo|cupo/i.test(bodyText)
    const hasSuccess = /inscripción.*exitosa|éxito/i.test(bodyText)

    const hasValidState = hasInscribirme || hasAlreadyRegistered || hasClosed || hasFull || hasSuccess
    expect(
      hasValidState,
      `Debe mostrar estado de inscripción. Body: ${bodyText.slice(0, 300)}`,
    ).toBeTruthy()
  })

  test('torneo inexistente muestra error o 404', async ({ page }) => {
    const loaded = await safeGoto(page, '/torneo/slug-que-no-existe-jkl999/unirse')
    test.fixme(!loaded, 'Vercel BotID bloqueó el headless browser')

    await page.waitForTimeout(3000)
    const bodyText = await page.locator('body').innerText()

    // Debe mostrar error, 404, o "no encontrado"
    const hasError = /no se encontr|no existe|error|reintentar/i.test(bodyText)
    const is404 = page.url().includes('404') || /404/.test(bodyText)

    expect(
      hasError || is404,
      `Torneo inexistente debe mostrar error. Body: ${bodyText.slice(0, 200)}`,
    ).toBeTruthy()
  })

  test('join-info API responde con datos del torneo', async ({ page }) => {
    // Navegar primero para pasar Vercel BotID, luego evaluar fetch desde la página
    const loaded = await safeGoto(page, `/torneo/${TOURNAMENT_SLUG}/unirse`)
    test.fixme(!loaded, 'Vercel BotID bloqueó el headless browser')

    // Ejecutar fetch desde el contexto de la página (hereda cookies/headers anti-bot)
    const data = await page.evaluate(async (slug) => {
      const res = await fetch(`/api/torneos/${slug}/join-info`)
      if (!res.ok) return { error: res.status }
      return res.json()
    }, TOURNAMENT_SLUG)

    if ('error' in data) {
      // 403 = Vercel bot protection en API, no es bug de la app
      test.fixme(data.error === 403, 'Vercel BotID bloqueó la API join-info')
      expect.fail(`API join-info respondió con error ${data.error}`)
    }

    expect(data.tournament, 'Debe incluir datos del torneo').toBeTruthy()
    expect(data.tournament.name, 'Torneo debe tener nombre').toBeTruthy()
    expect(data.tournament.status, 'Torneo debe tener status').toBeTruthy()
    expect(data.tournament.format, 'Torneo debe tener formato').toBeTruthy()
  })
})
