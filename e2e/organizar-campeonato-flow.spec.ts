import { test, expect } from '@playwright/test'

/**
 * E2E — Organizar Campeonato: happy path "Empezar desde cero".
 *
 * Cubre el flow primario del editor:
 *   /organizador/nuevo  →  modal "¿Por dónde empezamos?"
 *   click "+ Empezar desde cero"  →  POST /api/torneos/draft
 *   espera a que el editor (TournamentDraftEditor) renderice
 *   verifica que las secciones canónicas aparecen
 *   verifica que "Crear torneo →" arranca disabled (validación incompleta)
 *
 * Requiere E2E_TEST_USER_EMAIL/PASSWORD configuradas — la ruta es protegida.
 * Sin credenciales el test se skipea (mismo patrón que authenticated-flow.spec.ts).
 */

test.beforeEach(async () => {
  if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
    test.skip(
      true,
      'E2E_TEST_USER_EMAIL/PASSWORD no configuradas — correr scripts/setup-e2e-user.mjs',
    )
  }
})

test.describe('Organizar Campeonato — flow happy path', () => {
  test('crear torneo desde cero muestra el editor con todas las secciones', async ({ page }) => {
    const pageErrors: string[] = []
    const serverErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))
    page.on('response', (res) => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
    })

    await page.goto('/organizador/nuevo', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Sanity: no redirect a /login (sesión válida)
    expect(page.url(), 'No debería redirigir a /login con sesión válida').not.toContain('/login')

    // El modal "Nuevo torneo" debe estar visible
    await expect(page.getByRole('heading', { name: /Nuevo torneo/i })).toBeVisible({
      timeout: 10_000,
    })
    await expect(page.getByText(/¿Por dónde empezamos\?/i)).toBeVisible()

    // Click en "+ Empezar desde cero"
    const startButton = page.getByRole('button', { name: /Empezar desde cero/i })
    await expect(startButton).toBeVisible()
    await startButton.click()

    // Esperar a que el editor renderice — el header dice "Configuración"
    await expect(page.getByText(/Configuración/i).first()).toBeVisible({ timeout: 15_000 })

    // Verificar que las 4 secciones canónicas aparecen
    // (h2 dentro de cada Section component)
    await expect(page.getByRole('heading', { name: /Qué torneo/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Cómo juegan/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Categorías/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: /Rondas/i })).toBeVisible()

    // Botón "Crear torneo →" arranca disabled (faltan campos requeridos)
    const createBtn = page.getByRole('button', { name: /Crear torneo/i })
    await expect(createBtn).toBeVisible()
    await expect(createBtn).toBeDisabled()

    // Sin errores fatales en la sesión
    expect(pageErrors, 'pageerrors durante el flow').toEqual([])
    expect(serverErrors, '5xx durante el flow').toEqual([])
  })
})
