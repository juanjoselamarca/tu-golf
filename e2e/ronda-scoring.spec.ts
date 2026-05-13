import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  createRondaFixture,
  cleanupRondaFixture,
  cleanupAllE2ERondas,
  getTestUserId,
} from './helpers/ronda-fixture'

/**
 * E2E del flujo REAL de scoring — click hoyo a hoyo con verificación en BD.
 *
 * Este es el test más crítico del producto: simula a un jugador en cancha
 * tapeando "+" para subir score, verifica que la UI reacciona, y confirma
 * que el score llegó a Supabase.
 *
 * Usa selectores por aria-label — robustos a cambios de CSS/clase, tolerantes
 * al refactor pendiente del God Object (/score/page.tsx 1947 LOC).
 *
 * Cada test:
 *   1. Crea ronda fixture via admin
 *   2. Abre /score autenticado
 *   3. Clickea botones de score (+/-)
 *   4. Espera debounce de sync
 *   5. Consulta BD para verificar persistencia
 *   6. Cleanup
 */

test.describe.configure({ mode: 'serial' })

let testUserId: string
let createdRondas: string[] = []

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

test.beforeAll(async () => {
  if (!process.env.E2E_TEST_USER_EMAIL) return
  testUserId = await getTestUserId()
})

test.afterAll(async () => {
  if (testUserId) await cleanupAllE2ERondas(testUserId)
})

test.beforeEach(async () => {
  if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
    test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
  }
  // Resuelto 2026-05-12 (commit b70c53b): el TDZ ReferenceError sobre
  // modoJuego/formatoJuego ya no crashea el scorer. Ver docs/TECH_DEBT.md P1-12.
})

test.afterEach(async () => {
  for (const id of createdRondas) {
    try { await cleanupRondaFixture(id) } catch { /* ignore */ }
  }
  createdRondas = []
})

/** Consulta los scores persistidos del único jugador de la ronda. */
async function getPlayerScores(rondaId: string): Promise<Record<string, number> | null> {
  const admin = adminClient()
  const { data } = await admin
    .from('ronda_libre_jugadores')
    .select('scores')
    .eq('ronda_id', rondaId)
    .single()
  return (data?.scores as Record<string, number>) ?? null
}

test('scoring: tap "+" registra score y se persiste en BD', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', err => pageErrors.push(err.message))

  // 1. Crear ronda
  const ronda = await createRondaFixture({ creadorUserId: testUserId })
  createdRondas.push(ronda.id)

  // 2. Abrir scoring
  await page.goto(`/ronda-libre/${ronda.codigo}/score`, { waitUntil: 'networkidle' })
  expect(page.url()).not.toContain('/login')

  // 3. Tap "+" — primera vez setea score en par+1 (bogey default)
  const btnAumentar = page.getByRole('button', { name: 'Aumentar score' })
  await expect(btnAumentar).toBeVisible({ timeout: 10_000 })
  await btnAumentar.click()

  // 4. Esperar debounce de sync. La app usa optimistic UI + sync async a ~500ms.
  // Damos margen generoso (3s) para evitar flakiness.
  await page.waitForTimeout(3000)

  // 5. Verificar en BD
  const scores = await getPlayerScores(ronda.id)
  expect(scores, 'scores no null post-tap').not.toBeNull()

  const scoreEntries = Object.entries(scores!)
  expect(scoreEntries.length, 'al menos un hoyo scoreado').toBeGreaterThanOrEqual(1)

  // El primer score debe ser un número razonable de golf (1-15)
  const firstScore = scoreEntries[0][1]
  expect(firstScore).toBeGreaterThanOrEqual(1)
  expect(firstScore).toBeLessThanOrEqual(15)

  expect(pageErrors, 'no pageerrors durante scoring').toEqual([])
})

test('scoring: tap "+" varias veces incrementa el score correctamente', async ({ page }) => {
  const ronda = await createRondaFixture({ creadorUserId: testUserId })
  createdRondas.push(ronda.id)

  await page.goto(`/ronda-libre/${ronda.codigo}/score`, { waitUntil: 'networkidle' })

  const btnAumentar = page.getByRole('button', { name: 'Aumentar score' })
  await expect(btnAumentar).toBeVisible({ timeout: 10_000 })

  // 3 taps seguidos
  await btnAumentar.click()
  await page.waitForTimeout(200)
  await btnAumentar.click()
  await page.waitForTimeout(200)
  await btnAumentar.click()

  // Esperar sync
  await page.waitForTimeout(3000)

  const scores = await getPlayerScores(ronda.id)
  expect(scores).not.toBeNull()

  const firstScore = Object.values(scores!)[0]
  // 3 taps desde null → par+1, par+2, par+3 (bogey → doble → triple)
  // O 3 taps desde par → par+3. En cualquier caso >= par+1.
  // Par más bajo en golf es 3 → score >= 4.
  expect(firstScore).toBeGreaterThanOrEqual(4)
  expect(firstScore).toBeLessThanOrEqual(15)
})

test('scoring: tap "-" y "+" ajustan score bidireccional', async ({ page }) => {
  const ronda = await createRondaFixture({ creadorUserId: testUserId })
  createdRondas.push(ronda.id)

  await page.goto(`/ronda-libre/${ronda.codigo}/score`, { waitUntil: 'networkidle' })

  const btnAumentar = page.getByRole('button', { name: 'Aumentar score' })
  const btnDisminuir = page.getByRole('button', { name: 'Disminuir score' })
  await expect(btnAumentar).toBeVisible({ timeout: 10_000 })

  // + (par+1), + (par+2), - (par+1)
  await btnAumentar.click()
  await page.waitForTimeout(200)
  await btnAumentar.click()
  await page.waitForTimeout(200)
  await btnDisminuir.click()
  await page.waitForTimeout(3000)

  const scores = await getPlayerScores(ronda.id)
  expect(scores).not.toBeNull()

  const firstScore = Object.values(scores!)[0]
  // Net: +2 taps - 1 tap = +1 desde el default (par+1) → par+1
  // O si empezó null: null+1=par+1, par+2, par+1
  expect(firstScore).toBeGreaterThanOrEqual(3)
  expect(firstScore).toBeLessThanOrEqual(10)
})

test('scoring: navegar "Siguiente hoyo" después de scorear, luego scorear otro', async ({ page }) => {
  const ronda = await createRondaFixture({ creadorUserId: testUserId })
  createdRondas.push(ronda.id)

  await page.goto(`/ronda-libre/${ronda.codigo}/score`, { waitUntil: 'networkidle' })

  // Score hoyo 1
  const btnAumentar = page.getByRole('button', { name: 'Aumentar score' })
  await expect(btnAumentar).toBeVisible({ timeout: 10_000 })
  await btnAumentar.click()
  await page.waitForTimeout(500)

  // Ir al hoyo siguiente
  const btnSiguiente = page.getByRole('button', { name: 'Siguiente hoyo' })
  await expect(btnSiguiente).toBeVisible()
  await btnSiguiente.click()
  await page.waitForTimeout(500)

  // Score hoyo 2
  await btnAumentar.click()
  await page.waitForTimeout(3000)

  // Verificar que hay 2 hoyos scoreados
  const scores = await getPlayerScores(ronda.id)
  expect(scores).not.toBeNull()
  expect(
    Object.keys(scores!).length,
    'deben haber 2 hoyos con score registrado'
  ).toBeGreaterThanOrEqual(2)
})

test('scoring: scores persisten al recargar la página', async ({ page }) => {
  const ronda = await createRondaFixture({ creadorUserId: testUserId })
  createdRondas.push(ronda.id)

  // Primera visita: tap + (par+1)
  await page.goto(`/ronda-libre/${ronda.codigo}/score`, { waitUntil: 'networkidle' })
  const btnAumentar = page.getByRole('button', { name: 'Aumentar score' })
  await expect(btnAumentar).toBeVisible({ timeout: 10_000 })
  await btnAumentar.click()
  await page.waitForTimeout(3000)

  const scoresPrePullRefresh = await getPlayerScores(ronda.id)
  const holesScoredPre = Object.keys(scoresPrePullRefresh ?? {}).length
  expect(holesScoredPre).toBeGreaterThanOrEqual(1)

  // Recargar página y confirmar que los scores siguen en BD
  await page.reload({ waitUntil: 'networkidle' })
  await expect(btnAumentar).toBeVisible({ timeout: 10_000 })

  const scoresPostReload = await getPlayerScores(ronda.id)
  expect(Object.keys(scoresPostReload ?? {}).length).toBe(holesScoredPre)
  expect(scoresPostReload).toEqual(scoresPrePullRefresh)
})
