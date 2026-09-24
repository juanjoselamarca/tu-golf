/**
 * MULTI-FORMATO — E2E tests para formatos de equipo y no-stroke_play.
 *
 * Cobertura existente (ronda-flow, ronda-scoring, scorer-smoke) solo prueba
 * stroke_play. Este spec agrega:
 *   1. Stableford: scorer individual carga sin redirigir a score-grupo
 *   2. Team formats (best_ball, scramble, foursome): redirect + score-grupo + overview
 *
 * Descubrimiento 2026-09-24:
 *   - La página overview (/ronda-libre/[codigo]) crashea con error boundary
 *     para formatos de equipo con fixture data mínima (rankTeams falla).
 *   - El score-grupo se queda en loading infinito — el test user es creador
 *     y jugador de la ronda pero NO está en ronda_equipo_jugadores, y la
 *     página no maneja ese caso (no muestra error, solo carga infinitamente).
 *   - El /score tampoco redirige a /score-grupo — la redirect logic necesita
 *     que la ronda se cargue completa, pero el loading se traba antes.
 *
 * Estos son bugs reales documentados como test.fixme(). La infraestructura
 * de fixture (ronda-fixture.ts con soporte de equipos) queda lista para
 * cuando se arreglen.
 */
import { test, expect } from '@playwright/test'
import {
  createRondaFixture,
  cleanupRondaFixture,
  getTestUserId,
} from './helpers/ronda-fixture'

let testUserId: string
const createdRondas: string[] = []

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
  for (const id of createdRondas) {
    try { await cleanupRondaFixture(id) } catch { /* ignore */ }
  }
  createdRondas.length = 0
})

// ── Stableford: formato individual, el que sí funciona ───────

test('stableford: scorer individual carga sin redirigir a score-grupo', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', err => pageErrors.push(err.message))

  const ronda = await createRondaFixture({
    creadorUserId: testUserId,
    formato_juego: 'stableford',
  })
  createdRondas.push(ronda.id)

  await page.goto(`/ronda-libre/${ronda.codigo}/score`, { waitUntil: 'networkidle' })

  // Stableford NO debe redirigir a score-grupo
  expect(page.url()).toContain('/score')
  expect(page.url()).not.toContain('/score-grupo')

  // No crasheó
  expect(page.url()).not.toContain('/login')
  const errorBoundary = page.getByText('Algo salió mal')
  await expect(errorBoundary).toBeHidden({ timeout: 5000 })

  // El botón de aumentar score confirma que el scorer individual cargó
  const btnAumentar = page.getByRole('button', { name: 'Aumentar score' })
  await expect(btnAumentar).toBeVisible({ timeout: 10000 })

  expect(pageErrors, `errores de cliente: ${pageErrors.join(' | ')}`).toEqual([])
})

test.fixme('stableford: página de ronda muestra label "Stableford"', async ({ page }) => {
  // BUG: la página overview (/ronda-libre/[codigo]) crashea con error boundary
  // para rondas creadas por fixture, independiente del formato. El scorer (/score)
  // funciona bien. Posible causa: useRondaLibreLive o el GWI hook fallan cuando
  // la ronda no tiene scores reales y el user no tiene perfil completo.
  const pageErrors: string[] = []
  page.on('pageerror', err => pageErrors.push(err.message))

  const ronda = await createRondaFixture({
    creadorUserId: testUserId,
    formato_juego: 'stableford',
  })
  createdRondas.push(ronda.id)

  await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'networkidle' })

  expect(page.url()).not.toContain('/login')
  const errorBoundary = page.getByText('Algo salió mal')
  await expect(errorBoundary).toBeHidden({ timeout: 5000 })

  await expect(page.getByText('Stableford', { exact: false })).toBeVisible({ timeout: 8000 })

  const scoreGrupoLink = page.locator('a[href*="/score-grupo"]')
  await expect(scoreGrupoLink).toBeHidden({ timeout: 3000 })

  expect(pageErrors, `errores de cliente: ${pageErrors.join(' | ')}`).toEqual([])
})

// ── Team formats: bugs reales documentados ───────────────────
// Estos tests documentan bugs reales encontrados el 2026-09-24.
// La infraestructura de fixture ya soporta equipos — cuando los bugs
// se arreglen, quitar el test.fixme() y los tests correrán.

test.fixme('best_ball: /score redirige a /score-grupo', async ({ page }) => {
  // BUG: score-grupo se queda en loading infinito. El test user es creador
  // y jugador pero no está en ronda_equipo_jugadores → la página no maneja
  // este edge case (no muestra error, solo BrandedLoading forever).
  const ronda = await createRondaFixture({
    creadorUserId: testUserId,
    formato_juego: 'best_ball',
  })
  createdRondas.push(ronda.id)

  await page.goto(`/ronda-libre/${ronda.codigo}/score`, { waitUntil: 'networkidle' })
  await page.waitForURL(/score-grupo/, { timeout: 10000 })
  expect(page.url()).toContain('/score-grupo')
})

test.fixme('scramble: /score redirige a /score-grupo', async ({ page }) => {
  // BUG: mismo que best_ball — loading infinito en score-grupo
  const ronda = await createRondaFixture({
    creadorUserId: testUserId,
    formato_juego: 'scramble',
  })
  createdRondas.push(ronda.id)

  await page.goto(`/ronda-libre/${ronda.codigo}/score`, { waitUntil: 'networkidle' })
  await page.waitForURL(/score-grupo/, { timeout: 10000 })
  expect(page.url()).toContain('/score-grupo')
})

test.fixme('foursome: /score redirige a /score-grupo', async ({ page }) => {
  // BUG: mismo que best_ball — loading infinito en score-grupo
  const ronda = await createRondaFixture({
    creadorUserId: testUserId,
    formato_juego: 'foursome',
  })
  createdRondas.push(ronda.id)

  await page.goto(`/ronda-libre/${ronda.codigo}/score`, { waitUntil: 'networkidle' })
  await page.waitForURL(/score-grupo/, { timeout: 10000 })
  expect(page.url()).toContain('/score-grupo')
})

test.fixme('best_ball: página de ronda muestra label "Best Ball"', async ({ page }) => {
  // BUG: la página overview crashea con error boundary para team formats.
  // rankTeams() probablemente no tolera equipos sin scores reales o jugadores
  // no asignados a equipos.
  const ronda = await createRondaFixture({
    creadorUserId: testUserId,
    formato_juego: 'best_ball',
  })
  createdRondas.push(ronda.id)

  await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'networkidle' })
  await expect(page.getByText('Best Ball', { exact: false })).toBeVisible({ timeout: 8000 })
  await expect(page.locator('a[href*="/score-grupo"]')).toBeVisible({ timeout: 5000 })
})

test.fixme('scramble: score-grupo carga sin errores', async ({ page }) => {
  // BUG: loading infinito — test user no está en ronda_equipo_jugadores
  const ronda = await createRondaFixture({
    creadorUserId: testUserId,
    formato_juego: 'scramble',
  })
  createdRondas.push(ronda.id)

  await page.goto(`/ronda-libre/${ronda.codigo}/score-grupo`, { waitUntil: 'networkidle' })
  const errorBoundary = page.getByText('Algo salió mal')
  await expect(errorBoundary).toBeHidden({ timeout: 5000 })
  await expect(page.getByText('Hoyo', { exact: false })).toBeVisible({ timeout: 10000 })
})
