/**
 * SCORER SMOKE — el test más importante de toda la suite.
 *
 * Razón de existir: el bug del 12-may-2026 en cancha (Juanjo, Los Leones).
 * Un TDZ ReferenceError en /ronda-libre/[codigo]/score dejaba la pantalla
 * en blanco para CUALQUIER ronda recién creada. Compilaba clean, build OK,
 * tests unitarios pasaban — pero la pantalla más crítica de la app estaba
 * rota. La detección fue: un humano en cancha. Tardó 28 días.
 *
 * Este test cierra ese hueco. Corre:
 *   - En cada push a main (CI bloqueante) → atrapa el bug antes de que llegue a prod
 *   - En schedule cada 15 min vs prod → atrapa corrupción operacional post-deploy
 *
 * Filosofía: NO testea interacción, NO testea negocio. Sólo: "el scorer
 * renderiza algo útil en lugar de pantalla blanca o error boundary". Mantenerlo
 * AGRESIVAMENTE simple — entre menos asserts más robusto. Si necesitas
 * verificar lógica de scoring, va en ronda-scoring.spec.ts.
 */
import { test, expect } from '@playwright/test'
import { createRondaFixture, cleanupRondaFixture, getTestUserId } from './helpers/ronda-fixture'

test.describe('scorer smoke — la página crítica renderiza', () => {
  let testUserId: string
  let createdRondaId: string | null = null

  test.beforeAll(async () => {
    if (!process.env.E2E_TEST_USER_EMAIL) return
    testUserId = await getTestUserId()
  })

  test.beforeEach(async () => {
    if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
      test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
    }
  })

  test.afterEach(async () => {
    if (createdRondaId) {
      try { await cleanupRondaFixture(createdRondaId) } catch { /* ignore */ }
      createdRondaId = null
    }
  })

  test('ronda recién creada abre el scorer sin pantalla blanca', async ({ page }) => {
    // Capturamos cualquier error de cliente — el síntoma del bug 12-may era
    // exactamente un ReferenceError no manejado que disparaba error.tsx.
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    // 1. Fixture: ronda fresca, scores={}, formato stroke_play (el caso que rompía).
    const ronda = await createRondaFixture({ creadorUserId: testUserId })
    createdRondaId = ronda.id

    // 2. Navegar al scorer.
    await page.goto(`/ronda-libre/${ronda.codigo}/score`, { waitUntil: 'networkidle' })

    // 3. Verificaciones críticas — fallar acá = scorer roto en prod.
    // 3a. No fuimos redirigidos a /login (auth OK) ni a /dashboard (ronda existe).
    expect(page.url(), 'redirige a login → auth broken').not.toContain('/login')
    expect(page.url(), 'redirige a dashboard → ronda no se cargó').not.toContain('/dashboard')

    // 3b. La página NO mostró el error boundary ("Algo salió mal").
    // El bug 12-may renderizaba este texto via /error.tsx — lo que el usuario
    // describió como "pantalla en blanco" en cancha.
    const errorBoundaryText = page.getByText('Algo salió mal')
    await expect(errorBoundaryText, 'error boundary se renderizó — scorer crasheó').toBeHidden({ timeout: 5000 })

    // 3c. Hay un control de scoring visible. Si NADA se ve, está roto.
    // Usamos el botón de aumentar — es el elemento más estable de la UI del scorer.
    const btnAumentar = page.getByRole('button', { name: 'Aumentar score' })
    await expect(btnAumentar, 'botón Aumentar score no visible — scorer no terminó de cargar').toBeVisible({ timeout: 10_000 })

    // 3d. Cero errores de cliente. El bug 12-may era exactamente un TDZ
    // ReferenceError no atrapado. Si esto pasa en prod, queremos enterarnos.
    expect(pageErrors, `errores de cliente en el scorer: ${pageErrors.join(' | ')}`).toEqual([])
  })
})
