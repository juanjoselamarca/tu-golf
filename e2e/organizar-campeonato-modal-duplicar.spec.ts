import { test, expect } from '@playwright/test'

/**
 * E2E — Mejora A: modal "¿Por dónde empezamos?" muestra torneos previos
 * del usuario para duplicar.
 *
 * Verifica que:
 *   1. Si el usuario tiene torneos previos creados, la sección "Duplicar
 *      desde un torneo previo" aparece en el modal con la lista de torneos.
 *   2. Click sobre un torneo previo dispara POST a
 *      /api/torneos/draft/duplicate-from/[tournamentId].
 *   3. Después del duplicate-from el usuario aterriza en el editor con
 *      el draft nuevo cargado (sale del modal).
 *
 * Si el test user no tiene torneos previos, el test se skipea limpio.
 * Esto evita falsos positivos en entornos recién creados.
 */

test.beforeEach(async () => {
  if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
    test.skip(
      true,
      'E2E_TEST_USER_EMAIL/PASSWORD no configuradas — correr scripts/setup-e2e-user.mjs',
    )
  }
})

test.describe('Organizar Campeonato — modal duplicar torneo previo', () => {
  test('lista torneos previos y duplicar dispara el endpoint correcto', async ({ page }) => {
    await page.goto('/organizador/nuevo', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    expect(page.url()).not.toContain('/login')

    // Esperar a que el modal renderice
    await expect(page.getByRole('heading', { name: /Nuevo torneo/i })).toBeVisible({
      timeout: 10_000,
    })

    // ¿Existe la sección "Duplicar desde un torneo previo"?
    // Sólo se renderiza si recentTournaments.length > 0
    const duplicarHeading = page.getByRole('heading', {
      name: /Duplicar desde un torneo previo/i,
    })
    const tieneTorneosPrevios = await duplicarHeading.isVisible().catch(() => false)

    if (!tieneTorneosPrevios) {
      test.skip(
        true,
        'El test user no tiene torneos previos creados — no hay nada que duplicar. ' +
          'Crear un torneo manualmente para que este test aplique.',
      )
    }

    // Capturar el request de duplicate-from antes de hacer click
    const duplicatePromise = page.waitForRequest(
      (req) =>
        req.url().includes('/api/torneos/draft/duplicate-from/') &&
        req.method() === 'POST',
      { timeout: 10_000 },
    )

    // El primer botón debajo del heading "Duplicar..." es la primera fila de torneo.
    // Estructura del DOM: <h2>Duplicar...</h2> <ul> <li> <button>NombreTorneo · formato · fecha</button> </li>...
    // Tomamos el primer <button> dentro del <ul> que sigue al heading.
    const seccionDuplicar = page.locator('section', { has: duplicarHeading })
    const primerTorneo = seccionDuplicar.getByRole('button').first()
    await expect(primerTorneo).toBeVisible()

    // Capturamos el nombre/formato visible para asserts post-duplicado si querés
    // expandir el test — por ahora alcanza con verificar el round-trip.
    await primerTorneo.click()

    // Verificar que la request al endpoint duplicate-from se disparó
    const req = await duplicatePromise
    expect(req.url()).toMatch(/\/api\/torneos\/draft\/duplicate-from\/[^/]+$/)

    // Tras la duplicación, debería renderizar el editor (modal desaparece).
    // El header "Configuración" aparece dentro del TournamentDraftEditor.
    await expect(page.getByText(/Configuración/i).first()).toBeVisible({
      timeout: 15_000,
    })

    // El modal "¿Por dónde empezamos?" ya no debe estar visible
    await expect(page.getByText(/¿Por dónde empezamos\?/i)).not.toBeVisible()
  })
})
