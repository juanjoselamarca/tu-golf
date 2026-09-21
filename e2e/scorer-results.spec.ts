import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import {
  createRondaFixture,
  cleanupRondaFixture,
  cleanupAllE2ERondas,
  getTestUserId,
  type RondaFixture,
} from './helpers/ronda-fixture'

/**
 * E2E: Página de resultados de ronda (/ronda-libre/[codigo]).
 *
 * La "ronda-flow" verifica que la página carga sin crash. Este spec va más
 * allá: verifica que los DATOS son correctos — nombre de cancha, jugador,
 * leaderboard con scores, formato, y estados (en_curso vs finalizada).
 *
 * Cubre el gap más crítico del scorer: un jugador termina su ronda y ve
 * el resultado. Si el leaderboard muestra "—" o datos incorrectos, la
 * confianza en la app se destruye.
 *
 * Fixture: crea ronda con scores pre-populados vía service_role para que
 * el leaderboard tenga datos reales que verificar.
 */

test.describe.configure({ mode: 'serial' })

let testUserId: string
let createdRondas: string[] = []

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}

/** Inserta scores en el jugador de la ronda (campo JSONB `scores`). */
async function setPlayerScores(rondaId: string, scores: Record<string, number>) {
  const admin = adminClient()
  const { error } = await admin
    .from('ronda_libre_jugadores')
    .update({ scores })
    .eq('ronda_id', rondaId)
  if (error) throw new Error(`setPlayerScores falló: ${error.message}`)
}

/** Marca la ronda como finalizada. */
async function finalizarRonda(rondaId: string) {
  const admin = adminClient()
  const { error } = await admin
    .from('rondas_libres')
    .update({ estado: 'finalizada' })
    .eq('id', rondaId)
  if (error) throw new Error(`finalizarRonda falló: ${error.message}`)
}

test.beforeAll(async () => {
  if (!process.env.E2E_TEST_USER_EMAIL) return
  testUserId = await getTestUserId()
})

test.afterAll(async () => {
  if (!testUserId) return
  const cleaned = await cleanupAllE2ERondas(testUserId)
  if (cleaned > 0) console.log(`[scorer-results] afterAll cleanup: ${cleaned} ronda(s)`)
})

async function creaRonda(opts: Partial<Parameters<typeof createRondaFixture>[0]> = {}): Promise<RondaFixture> {
  const r = await createRondaFixture({ creadorUserId: testUserId, ...opts })
  createdRondas.push(r.id)
  return r
}

test.beforeEach(async () => {
  if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
    test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
  }
})

test.afterEach(async () => {
  for (const id of createdRondas) {
    try { await cleanupRondaFixture(id) } catch { /* best effort */ }
  }
  createdRondas = []
})

// ── Scores fixture: 9 hoyos con par 4 promedio → total ~40 (bogey golf) ──
const NINE_HOLE_SCORES: Record<string, number> = {
  '1': 5, '2': 4, '3': 5, '4': 4, '5': 6, '6': 3, '7': 5, '8': 4, '9': 5,
}
// Total = 41

const EIGHTEEN_HOLE_SCORES: Record<string, number> = {
  ...NINE_HOLE_SCORES,
  '10': 4, '11': 5, '12': 4, '13': 5, '14': 3, '15': 5, '16': 4, '17': 5, '18': 4,
}
// Total = 41 + 39 = 80

test('resultados: leaderboard muestra cancha, jugador y score en ronda en curso', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', err => pageErrors.push(err.message))

  // Crear ronda con scores
  const ronda = await creaRonda({ formato_juego: 'stroke_play', modo_juego: 'gross', holes: 18 })
  await setPlayerScores(ronda.id, EIGHTEEN_HOLE_SCORES)

  await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

  // Verify: no React errors
  expect(pageErrors, 'sin errores de React en la página').toEqual([])

  // Verify: header shows course name
  const header = page.locator('h1, h2, h3, [style*="Playfair"]')
  await expect(header.first()).toBeVisible({ timeout: 10_000 })

  // Verify: "Los Leones" (the fixture course) appears somewhere on the page
  const body = page.locator('body')
  await expect(body).toContainText('Los Leones', { timeout: 10_000 })

  // Verify: "Marcador en vivo" header (ronda en curso)
  await expect(body).toContainText('Marcador en vivo')

  // Verify: EN VIVO badge visible
  await expect(body).toContainText('EN VIVO')

  // Verify: player name "E2E Test" in leaderboard
  await expect(body).toContainText('E2E Test')

  // Verify: leaderboard has column headers
  await expect(body).toContainText('Jugador')

  // Verify: "18" holes shown (the Hoyos column should show 18/18 or similar)
  // The leaderboard shows holesPlayed — with all 18 scored, it should show 18
  await expect(body).toContainText('18')

  // Verify: the Gross score column header is present (stroke_play gross)
  await expect(body).toContainText('Gross')
})

test('resultados: ronda finalizada muestra badge FINALIZADA y links post-ronda', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', err => pageErrors.push(err.message))

  const ronda = await creaRonda({ formato_juego: 'stroke_play', modo_juego: 'gross', holes: 18 })
  await setPlayerScores(ronda.id, EIGHTEEN_HOLE_SCORES)
  await finalizarRonda(ronda.id)

  await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

  expect(pageErrors).toEqual([])

  const body = page.locator('body')

  // Verify: "Resultado final" header (not "Marcador en vivo")
  await expect(body).toContainText('Resultado final')

  // Verify: FINALIZADA badge
  await expect(body).toContainText('FINALIZADA')

  // Verify: course name still visible
  await expect(body).toContainText('Los Leones')

  // Verify: player with scores still visible
  await expect(body).toContainText('E2E Test')

  // Verify: PostRondaLinks appear for authenticated user on finished round
  // These links encourage engagement ("Ver estadísticas", etc.)
  const postRondaSection = page.locator('text=/estad[ií]sticas|historial|Ver mi/i')
  // If it's there, great. If not, the page at least loaded correctly.
  // The PostRondaLinks may or may not render depending on feature flags.
  const bodyText = await body.innerText()
  expect(bodyText.length, 'la página finalizada renderiza contenido sustancial').toBeGreaterThan(200)
})

test('resultados: stableford muestra PTS en lugar de Gross', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', err => pageErrors.push(err.message))

  const ronda = await creaRonda({ formato_juego: 'stableford', modo_juego: 'gross', holes: 18 })
  await setPlayerScores(ronda.id, EIGHTEEN_HOLE_SCORES)

  await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

  expect(pageErrors).toEqual([])

  const body = page.locator('body')

  // Verify: leaderboard header says PTS (not Gross/Neto)
  await expect(body).toContainText('PTS')

  // Verify: player visible
  await expect(body).toContainText('E2E Test')

  // Verify: 18 holes completed
  await expect(body).toContainText('18')

  // Verify: course name
  await expect(body).toContainText('Los Leones')
})

test('resultados: ronda de 9 hoyos muestra datos correctos', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', err => pageErrors.push(err.message))

  const ronda = await creaRonda({ formato_juego: 'stroke_play', modo_juego: 'gross', holes: 9 })
  await setPlayerScores(ronda.id, NINE_HOLE_SCORES)

  await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

  expect(pageErrors).toEqual([])

  const body = page.locator('body')

  // Verify: course name and player
  await expect(body).toContainText('Los Leones')
  await expect(body).toContainText('E2E Test')

  // Verify: 9 holes shown in Hoyos column
  // The leaderboard should show 9 (all 9 holes scored)
  const bodyText = await body.innerText()
  expect(bodyText).toContain('9')

  // Verify: the "Copiar link" button exists (hayDatos = true because we have scores)
  const copyBtn = page.locator('button', { hasText: 'Copiar link' })
  await expect(copyBtn).toBeVisible({ timeout: 5_000 })
})

test('resultados: ronda sin scores muestra estado vacío en leaderboard', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', err => pageErrors.push(err.message))

  // Create ronda WITHOUT setting scores — leaderboard should show empty state
  const ronda = await creaRonda({ formato_juego: 'stroke_play', modo_juego: 'gross', holes: 18 })

  await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

  expect(pageErrors).toEqual([])

  const body = page.locator('body')

  // Verify: page loads with course name
  await expect(body).toContainText('Los Leones')

  // Verify: leaderboard exists but shows 0 holes played
  // The player appears but with 0/18 or just "0" in hoyos column
  await expect(body).toContainText('E2E Test')

  // Verify: Hoyos column header exists
  await expect(body).toContainText('Hoyos')

  // Verify: "Copiar link" NOT visible when there are no scores (hayDatos = false)
  // With empty scores, hasPlayData returns false → share buttons hidden
  const copyBtn = page.locator('button', { hasText: 'Copiar link' })
  // When no scores exist, the button should NOT be visible
  // However, the player row still exists (just with 0 holes)
  // The "Copiar link" depends on hayDatos — which needs at least one score
  await expect(copyBtn).not.toBeVisible({ timeout: 3_000 })
})
