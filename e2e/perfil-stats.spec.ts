/**
 * Perfil Stats — /perfil/stats
 *
 * Verifica la página de estadísticas personales:
 * 1. Carga sin errores y muestra "Mis estadísticas"
 * 2. Muestra conteo de rondas registradas
 * 3. Rango (Últimas 5/10/20, Todas) con aria-pressed, y recorta las rondas del promedio
 * 4. Un solo gráfico ("Tu score vs par"), sin GWI, y resumen cards
 * 5. Datos numéricos reales (no solo "carga")
 *
 * Fixture: reutiliza la ronda creada por historial-handicap-thursday
 * o crea una propia si no existe.
 */
import { test, expect } from '@playwright/test'
import { adminClient, getTestUserId } from './helpers/ronda-fixture'
import { esperarStreaming } from './helpers/streaming'

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
    await esperarStreaming(page)
    const roundCountText = page.getByText(/\d+ rondas? registradas?/)
    await expect(roundCountText).toBeVisible({ timeout: 10_000 })

    // No client errors
    expect(pageErrors, `errores de cliente en /perfil/stats: ${pageErrors.join(' | ')}`).toEqual([])
  })

  test('range toggles visibles y funcionales', async ({ page }) => {
    await page.goto('/perfil/stats', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Mis estadísticas' })).toBeVisible({ timeout: 15_000 })
    // Con la suite completa en paralelo el título ya se ve mientras el resto del segmento sigue llegando: por un
    // instante hay dos copias del mismo texto y getByText corta por strict mode (06-nov-2026, un test distinto
    // en cada corrida). Se espera a que la página se asiente antes de buscar por texto.
    await esperarStreaming(page)

    // Desde #802 el rango es un control segmentado con nombre ("Rondas a considerar") y estado aria-pressed.
    const rango = page.getByRole('group', { name: 'Rondas a considerar' })
    await expect(rango).toBeVisible({ timeout: 10_000 })
    await expect(rango.getByRole('button')).toHaveText(['Últimas 5', 'Últimas 10', 'Últimas 20', 'Todas'])
    const todas = rango.getByRole('button', { name: 'Todas', exact: true })
    const ultimas5 = rango.getByRole('button', { name: 'Últimas 5', exact: true })
    // Por defecto se ven todas las rondas.
    await expect(todas).toHaveAttribute('aria-pressed', 'true')
    await expect(ultimas5).toHaveAttribute('aria-pressed', 'false')

    // El héroe dice cuántas rondas promedia: "Promedio vs par · 18 hoyos · N rondas" (sin cifras no trae N).
    const heroe = page.getByText(/^Promedio vs par/)
    const rondasDelHeroe = async (): Promise<number | null> => {
      const m = (await heroe.innerText()).match(/· (\d+) rondas?\s*$/)
      return m ? Number(m[1]) : null
    }
    const conTodas = await rondasDelHeroe()

    await ultimas5.click()
    await expect(ultimas5).toHaveAttribute('aria-pressed', 'true')
    await expect(todas).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByText('Algo salió mal')).toBeHidden()
    if (conTodas != null) {
      // El rango recorta: nunca más de 5 rondas, ni más que con "Todas".
      await expect.poll(rondasDelHeroe).toBeLessThanOrEqual(Math.min(5, conTodas))
    }

    // Volver a "Todas" repone el número original.
    await todas.click()
    await expect(todas).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByText('Algo salió mal')).toBeHidden()
    if (conTodas != null) await expect.poll(rondasDelHeroe).toBe(conTodas)
  })

  test('un solo gráfico "Tu score vs par" y sin GWI', async ({ page }) => {
    await page.goto('/perfil/stats', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Mis estadísticas' })).toBeVisible({ timeout: 15_000 })
    await esperarStreaming(page)

    await expect(page.getByText('Tu score vs par')).toHaveCount(1, { timeout: 10_000 })
    // El Golf Wellness Index y los dos gráficos duplicados ya no existen (ola 1, 16-nov-2026).
    await expect(page.getByText('GWI', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Evolución de score')).toHaveCount(0)
    await expect(page.getByText('Tendencia de scoring')).toHaveCount(0)
  })

  test('resumen cards muestran datos reales (no --)', async ({ page }) => {
    await page.goto('/perfil/stats', { waitUntil: 'domcontentloaded' })
    await expect(page.getByRole('heading', { name: 'Mis estadísticas' })).toBeVisible({ timeout: 15_000 })
    await esperarStreaming(page)

    // Wait for data to load
    await page.waitForTimeout(2000)

    // "Promedio vs par" card
    const promedioCard = page.getByText('Promedio vs par', { exact: false }).first()
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
    await esperarStreaming(page)

    const backLink = page.getByText('← Perfil')
    await expect(backLink).toBeVisible({ timeout: 5_000 })
    await backLink.click()

    await page.waitForURL('**/perfil', { timeout: 10_000 })
    expect(page.url()).toContain('/perfil')
    expect(page.url()).not.toContain('/stats')
  })
})
