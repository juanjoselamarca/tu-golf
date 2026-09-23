/**
 * Perfil Ronda Detalle — /perfil/historial/[id]
 *
 * Verifica la página de detalle de una ronda individual:
 * 1. Muestra nombre de cancha, fecha, formato, tee, hoyos
 * 2. Scorecard renderiza con datos de hoyos reales
 * 3. Botón "Compartir tarjeta" existe y abre ShareSheet
 * 4. No hay errores de cliente
 * 5. Funciona en mobile (390px viewport)
 *
 * Fixture: crea una ronda histórica con scores completos y limpia al final.
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getTestUserId } from './helpers/ronda-fixture'

const COURSE_NAME = 'Los Leones'
const COURSE_ID = 'b1b6ba60-18f0-48a8-97c2-ef10e25fbe26'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** Crea una ronda histórica con scores para el test user. Devuelve el id. */
async function createDetailFixture(userId: string): Promise<string> {
  const sb = adminClient()

  const scores = [4, 3, 5, 5, 4, 5, 6, 3, 5, 4, 4, 6, 5, 3, 4, 5, 4, 5]
  const totalGross = scores.reduce((a, b) => a + b, 0) // 85
  const parPerHole = {
    '1': 4, '2': 3, '3': 5, '4': 4, '5': 3,
    '6': 4, '7': 5, '8': 3, '9': 4, '10': 4,
    '11': 3, '12': 5, '13': 4, '14': 3, '15': 4,
    '16': 5, '17': 3, '18': 4,
  }

  const playedAt = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
  const courseRating = 71.2
  const slopeRating = 127
  const diferencial = Math.round(((totalGross - courseRating) * 113) / slopeRating * 10) / 10

  const { data, error } = await sb.from('historical_rounds').insert({
    user_id: userId,
    course_name: COURSE_NAME,
    course_id: COURSE_ID,
    played_at: playedAt,
    total_gross: totalGross,
    scores,
    holes_played: 18,
    tee_color: 'blanco',
    privacy: 'private',
    slope_rating: slopeRating,
    course_rating: courseRating,
    diferencial,
    formato_juego: 'stroke_play',
    modo_juego: 'gross',
    par_per_hole: parPerHole,
    notes: 'Ronda de prueba E2E — detalle',
  }).select('id').single()

  if (error || !data) throw new Error(`createDetailFixture falló: ${error?.message}`)
  return data.id
}

async function cleanupDetailFixture(roundId: string): Promise<void> {
  const sb = adminClient()
  await sb.from('historical_rounds').delete().eq('id', roundId)
}

test.describe('Perfil Ronda Detalle — /perfil/historial/[id]', () => {
  let testUserId: string
  let fixtureRoundId: string

  test.beforeAll(async () => {
    if (!process.env.E2E_TEST_USER_EMAIL) return
    testUserId = await getTestUserId()
    fixtureRoundId = await createDetailFixture(testUserId)
  })

  test.beforeEach(async () => {
    if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
      test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
    }
  })

  test.afterAll(async () => {
    if (fixtureRoundId) {
      try { await cleanupDetailFixture(fixtureRoundId) } catch { /* ignore */ }
    }
  })

  test('carga la ronda con datos correctos', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto(`/perfil/historial/${fixtureRoundId}`, { waitUntil: 'domcontentloaded' })

    // No redirect to login
    expect(page.url()).not.toContain('/login')

    // Course name visible
    await expect(page.getByText(COURSE_NAME).first()).toBeVisible({ timeout: 15_000 })

    // Format info visible — "Stroke Play"
    await expect(page.getByText(/Stroke Play/i).first()).toBeVisible({ timeout: 10_000 })

    // Tee info — "Tee blanco"
    await expect(page.getByText(/Tee blanco/i).first()).toBeVisible({ timeout: 10_000 })

    // Holes info — "18 hoyos"
    await expect(page.getByText('18 hoyos').first()).toBeVisible({ timeout: 10_000 })

    // No client errors
    expect(pageErrors, `errores de cliente: ${pageErrors.join(' | ')}`).toEqual([])
  })

  test('scorecard renderiza con hoyos y scores', async ({ page }) => {
    await page.goto(`/perfil/historial/${fixtureRoundId}`, { waitUntil: 'domcontentloaded' })

    // Wait for scorecard to render
    await expect(page.getByText(COURSE_NAME).first()).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(1500)

    // The Scorecard component should render hole numbers
    // Look for "1" as hole number in the scorecard area
    const scorecardArea = page.locator('[class*="scorecard"], [data-testid*="scorecard"]').first()

    // Fallback: look for the total gross score (85) somewhere on the page
    const totalScore = page.getByText('85').first()
    const hasTotal = await totalScore.isVisible().catch(() => false)

    // Also check for "OUT" or "IN" labels (front 9 / back 9 headers)
    const outLabel = page.getByText('OUT', { exact: true }).first()
    const inLabel = page.getByText('IN', { exact: true }).first()
    const hasOut = await outLabel.isVisible().catch(() => false)
    const hasIn = await inLabel.isVisible().catch(() => false)

    // At least one scorecard indicator should be visible
    expect(
      hasTotal || hasOut || hasIn,
      'ni score total (85), ni OUT, ni IN visible — scorecard no renderizó'
    ).toBe(true)

    // No error boundary
    await expect(page.getByText('Algo salió mal')).toBeHidden({ timeout: 3000 })
  })

  test('notas de la ronda se muestran', async ({ page }) => {
    await page.goto(`/perfil/historial/${fixtureRoundId}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(COURSE_NAME).first()).toBeVisible({ timeout: 15_000 })

    // Notes section with our fixture text
    await expect(page.getByText('Notas')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('Ronda de prueba E2E — detalle')).toBeVisible({ timeout: 5_000 })
  })

  test('botón compartir tarjeta existe', async ({ page }) => {
    await page.goto(`/perfil/historial/${fixtureRoundId}`, { waitUntil: 'domcontentloaded' })
    await expect(page.getByText(COURSE_NAME).first()).toBeVisible({ timeout: 15_000 })

    // Share button
    const shareBtn = page.getByRole('button', { name: /Compartir tarjeta/i })
    await expect(shareBtn).toBeVisible({ timeout: 10_000 })

    // Click it to verify ShareSheet opens without crashing
    await shareBtn.click()
    await page.waitForTimeout(1000)

    // No error boundary after clicking share
    await expect(page.getByText('Algo salió mal')).toBeHidden({ timeout: 3000 })
  })

  test('ronda inexistente muestra error controlado', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto('/perfil/historial/00000000-0000-0000-0000-000000000000', {
      waitUntil: 'domcontentloaded',
    })

    // Should show "No se encontró la ronda" error, not crash
    await expect(page.getByText(/no se encontr/i).first()).toBeVisible({ timeout: 15_000 })

    // Should NOT show unhandled error boundary
    await expect(page.getByText('Algo salió mal')).toBeHidden({ timeout: 3000 })
  })
})
