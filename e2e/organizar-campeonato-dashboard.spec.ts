import { test, expect } from '@playwright/test'

/**
 * E2E — Dashboard del organizador: /organizador
 *
 * Cubre:
 *   - Carga autenticada sin errores 5xx ni page errors
 *   - Header "Mis Torneos" visible
 *   - Botón "Crear torneo" lleva a /organizador/nuevo
 *   - Tarjetas de torneo muestran datos reales (nombre, formato, jugadores)
 *   - Cada tarjeta es un link a /organizador/[slug]/jugadores
 *   - Sección "Borradores sin publicar" aparece si hay drafts
 *
 * Requiere E2E_TEST_USER_EMAIL/PASSWORD — ruta protegida.
 */

test.beforeEach(async () => {
  if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
    test.skip(
      true,
      'E2E_TEST_USER_EMAIL/PASSWORD no configuradas — correr scripts/setup-e2e-user.mjs',
    )
  }
})

test.describe('Organizador Dashboard — /organizador', () => {
  test('carga el dashboard con header y CTA de crear torneo', async ({ page }) => {
    const pageErrors: string[] = []
    const serverErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))
    page.on('response', (res) => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
    })

    await page.goto('/organizador', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // No debe redirigir a login
    expect(page.url(), 'No debería redirigir a /login').not.toContain('/login')

    // Header visible
    await expect(page.getByRole('heading', { name: /Mis Torneos/i })).toBeVisible({
      timeout: 10_000,
    })

    // Botón "Crear torneo" visible y funcional
    const crearBtn = page.getByRole('link', { name: /Crear torneo/i })
    await expect(crearBtn).toBeVisible()
    await expect(crearBtn).toHaveAttribute('href', '/organizador/nuevo')

    // Sin errores fatales
    expect(pageErrors, 'page errors durante carga').toEqual([])
    expect(serverErrors, '5xx durante carga').toEqual([])
  })

  test('muestra tarjetas de torneo con datos reales o empty state', async ({ page }) => {
    const serverErrors: string[] = []
    page.on('response', (res) => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
    })

    await page.goto('/organizador', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Esperar a que el contenido cargue
    await expect(page.getByRole('heading', { name: /Mis Torneos/i })).toBeVisible({
      timeout: 10_000,
    })

    // La página muestra tarjetas de torneo O el empty state
    const emptyState = page.getByText(/Sin torneos todavía/i)
    // Las tarjetas de torneo son links a /organizador/[slug]/jugadores (no /nuevo ni /draft)
    const tournamentCards = page.locator('a[href*="/jugadores"]')

    const hasEmpty = await emptyState.isVisible().catch(() => false)

    if (hasEmpty) {
      // Empty state muestra CTA
      await expect(page.getByRole('link', { name: /Crear torneo/i }).last()).toBeVisible()
    } else {
      // Hay al menos una tarjeta de torneo
      const cardCount = await tournamentCards.count()
      expect(cardCount, 'Debe haber al menos 1 tarjeta de torneo').toBeGreaterThanOrEqual(1)

      // Primera tarjeta: tiene nombre (no vacío), formato, y contador de jugadores
      const firstCard = tournamentCards.first()
      const cardText = await firstCard.textContent()
      expect(cardText, 'La tarjeta no debe estar vacía').toBeTruthy()
      expect(cardText!.length, 'La tarjeta debe tener contenido sustancial').toBeGreaterThan(5)

      // El link lleva a la vista de jugadores del torneo
      const href = await firstCard.getAttribute('href')
      expect(href, 'Cada tarjeta lleva a /organizador/[slug]/jugadores').toMatch(
        /\/organizador\/.+\/jugadores/,
      )

      // Debe mostrar algún indicador de jugadores (ej: "3 jugadores")
      // El patrón es: \d+ jugador(es)?
      const jugadoresPattern = /\d+ jugador/i
      expect(cardText, 'La tarjeta debe mostrar cantidad de jugadores').toMatch(jugadoresPattern)
    }

    expect(serverErrors, '5xx durante carga').toEqual([])
  })

  test('sección borradores muestra drafts con link a retomar edición', async ({ page }) => {
    await page.goto('/organizador', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    await expect(page.getByRole('heading', { name: /Mis Torneos/i })).toBeVisible({
      timeout: 10_000,
    })

    // Si hay borradores, se muestra la sección
    const draftLabel = page.getByText(/Borradores sin publicar/i)
    const hasDrafts = await draftLabel.isVisible().catch(() => false)

    if (hasDrafts) {
      // Los borradores son links a /organizador/nuevo?draft=<id>
      const draftLinks = page.locator('a[href*="organizador/nuevo?draft="]')
      const count = await draftLinks.count()
      expect(count, 'Debe haber al menos 1 borrador').toBeGreaterThanOrEqual(1)

      // Cada borrador muestra nombre o "Borrador sin nombre" y una fecha
      const firstDraft = draftLinks.first()
      const draftText = await firstDraft.textContent()
      expect(draftText, 'El borrador debe tener texto').toBeTruthy()
      // Contiene una fecha en formato "dd mmm yyyy" o "Borrador sin nombre"
      expect(draftText).toMatch(/\d{1,2}\s\w+\s\d{4}|Borrador/i)
    }
    // Si no hay borradores, el test pasa igualmente — solo verifica estructura cuando existen
  })

  test('navegar a crear torneo desde el dashboard', async ({ page }) => {
    await page.goto('/organizador', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    await expect(page.getByRole('heading', { name: /Mis Torneos/i })).toBeVisible({
      timeout: 10_000,
    })

    // Click en "Crear torneo"
    await page.getByRole('link', { name: /Crear torneo/i }).first().click()

    // Debe navegar a /organizador/nuevo
    await page.waitForURL('**/organizador/nuevo', { timeout: 10_000 })
    expect(page.url()).toContain('/organizador/nuevo')

    // La página de nuevo torneo debe cargar (modal o formulario)
    await expect(
      page.getByRole('heading', { name: /Nuevo torneo/i }),
    ).toBeVisible({ timeout: 10_000 })
  })
})
