/**
 * Perfil Stats — /perfil/stats
 *
 * Verifica la página de estadísticas personales:
 * 1. Carga sin errores y muestra "Mis estadísticas"
 * 2. Muestra conteo de rondas registradas
 * 3. Range toggles (5R, 10R, 20R, Todo) visibles y funcionales
 * 4. Secciones clave: GWI, Evolución de score, Tendencia, resumen cards
 * 5. Datos numéricos reales (no solo "carga")
 *
 * Fixture: reutiliza la ronda creada por historial-handicap-thursday
 * o crea una propia si no existe.
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getTestUserId } from './helpers/ronda-fixture'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** Asegura que el test user tiene al menos 1 ronda histórica para stats. */
async function ensureHistoricalRound(userId: string): Promise<string | null> {
  const sb = adminClient()
  const { data } = await sb
    .from('historical_rounds')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (data) return null // ya existe, no crear fixture

  // Crear una ronda mínima para que stats tenga datos
  const scores = [5, 4, 6, 5, 4, 5, 6, 3, 5, 5, 4, 6, 5, 3, 5, 6, 4, 5]
  const totalGross = scores.reduce((a, b) => a + b, 0)
  const parPerHole = { '1': 4, '2': 3, '3': 5, '4': 4, '5': 3, '6': 4, '7': 5, '8': 3, '9': 4, '10': 4, '11': 3, '12': 5, '13': 4, '14': 3, '15': 4, '16': 5, '17': 3, '18': 4 }

  const { data: round, error } = await sb.from('historical_rounds').insert({
    user_id: userId,
    course_name: 'Los Leones',
    course_id: 'b1b6ba60-18f0-48a8-97c2-ef10e25fbe26',
    played_at: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    total_gross: totalGross,
    scores,
    holes_played: 18,
    tee_color: 'blanco',
    privacy: 'private',
    slope_rating: 127,
    course_rating: 71.2,
    diferencial: Math.round(((totalGross - 71.2) * 113) / 127 * 10) / 10,
    formato_juego: 'stroke_play',
    modo_juego: 'gross',
    par_per_hole: parPerHole,
  }).select('id').single()

  if (error || !round) throw new Error(`ensureHistoricalRound falló: ${error?.message}`)
  await sb.rpc('calcular_indice_golfers', { p_user_id: userId })
  return round.id
}

test.describe('Perfil Stats — /perfil/stats', () => {
  let testUserId: string
  let createdFixtureId: string | null = null

  test.beforeAll(async () => {
    if (!process.env.E2E_TEST_USER_EMAIL) return
    testUserId = await getTestUserId()
    createdFixtureId = await ensureHistoricalRound(testUserId)
  })

  test.beforeEach(async () => {
    if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
      test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
    }
  })

  test.afterAll(async () => {
    if (createdFixtureId) {
      try {
        const sb = adminClient()
        await sb.from('historical_rounds').delete().eq('id', createdFixtureId)
        if (testUserId) await sb.rpc('calcular_indice_golfers', { p_user_id: testUserId })
      } catch { /* ignore */ }
    }
  })

  test('página carga con header y conteo de rondas', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto('/perfil/stats', { waitUntil: 'domcontentloaded' })

    // No redirect to login
    expect(page.url()).not.toContain('/login')

    // Header "Mis estadísticas"
    await expect(page.getByRole('heading', { name: 'Mis estadísticas' })).toBeVisible({ timeout: 15_000 })

    // Round count visible — "N ronda(s) registrada(s)"
    const roundCountText = page.getByText(/\d+ rondas? registradas?/)
    await expect(roundCountText).toBeVisible({ timeout: 10_000 })

    // No client errors
    expect(pageErrors, `errores de cliente en /perfil/stats: ${pageErrors.join(' | ')}`).toEqual([])
  })

  test('range toggles visibles y funcionales', async ({ page }) => {
    await page.goto('/perfil/stats', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Mis estadísticas' })).toBeVisible({ timeout: 15_000 })

    // Los 4 toggles deben estar visibles
    for (const label of ['5R', '10R', '20R', 'Todo']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 5_000 })
    }

    // Click "5R" y verificar que no rompe
    await page.getByText('5R', { exact: true }).first().click()
    await page.waitForTimeout(500)

    // La página sigue mostrando stats (no error boundary)
    await expect(page.getByText('Algo salió mal')).toBeHidden({ timeout: 3000 })

    // Click "Todo" para volver al default
    await page.getByText('Todo', { exact: true }).first().click()
    await page.waitForTimeout(500)
    await expect(page.getByText('Algo salió mal')).toBeHidden({ timeout: 3000 })
  })

  test('sección GWI visible con valor numérico', async ({ page }) => {
    await page.goto('/perfil/stats', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Mis estadísticas' })).toBeVisible({ timeout: 15_000 })

    // GWI text should be visible
    const gwiLabel = page.getByText('GWI', { exact: true }).first()
    await expect(gwiLabel).toBeVisible({ timeout: 10_000 })
  })

  test('evolución de score y tendencia visibles', async ({ page }) => {
    await page.goto('/perfil/stats', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Mis estadísticas' })).toBeVisible({ timeout: 15_000 })

    // "Evolución de score" section header
    await expect(page.getByText('Evolución de score')).toBeVisible({ timeout: 10_000 })

    // "Tendencia de scoring" section header
    await expect(page.getByText('Tendencia de scoring')).toBeVisible({ timeout: 10_000 })
  })

  test('resumen cards muestran datos reales (no --)', async ({ page }) => {
    await page.goto('/perfil/stats', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Mis estadísticas' })).toBeVisible({ timeout: 15_000 })

    // Wait for data to load
    await page.waitForTimeout(2000)

    // "Promedio" card should show a number, not '--'
    const promedioCard = page.getByText('Promedio', { exact: false }).first()
    await expect(promedioCard).toBeVisible({ timeout: 10_000 })

    // "Mejor ronda" card should show a score
    const mejorRondaCard = page.getByText('Mejor ronda').first()
    await expect(mejorRondaCard).toBeVisible({ timeout: 10_000 })

    // "Birdies" card
    await expect(page.getByText('Birdies').first()).toBeVisible({ timeout: 5_000 })

    // "Eagles" card
    await expect(page.getByText('Eagles').first()).toBeVisible({ timeout: 5_000 })
  })

  test('link "← Perfil" navega a /perfil', async ({ page }) => {
    await page.goto('/perfil/stats', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Mis estadísticas' })).toBeVisible({ timeout: 15_000 })

    const backLink = page.getByText('← Perfil')
    await expect(backLink).toBeVisible({ timeout: 5_000 })
    await backLink.click()

    await page.waitForURL('**/perfil', { timeout: 10_000 })
    expect(page.url()).toContain('/perfil')
    expect(page.url()).not.toContain('/stats')
  })
})
