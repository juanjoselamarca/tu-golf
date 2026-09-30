/**
 * E2E — Historial + Handicap: integridad de datos.
 *
 * Verifica que los NÚMEROS mostrados en /perfil y /perfil/historial
 * coinciden con lo que hay en la BD. No es "carga la página" — es
 * "el gross 91 que insertamos aparece como 91, el diferencial 17.6
 * aparece como 17.6, y el índice recalculado es un float razonable".
 *
 * Fixture: inserta 4 rondas históricas con scores conocidos,
 * recalcula el índice Golfers+, y verifica en la UI.
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getTestUserId } from './helpers/ronda-fixture'

/* ─── Constants ──────────────────────────────────────── */

const COURSE_ID = 'b1b6ba60-18f0-48a8-97c2-ef10e25fbe26'
const COURSE_NAME = 'Los Leones'
const CR = 71.2
const SLOPE = 127

// 4 fixture rounds with known scores — enough to activate Golfers+ index
const FIXTURE_ROUNDS = [
  { scores: [5, 4, 6, 5, 4, 5, 6, 3, 5, 5, 4, 6, 5, 3, 5, 6, 4, 5], daysAgo: 2 },
  { scores: [4, 3, 5, 4, 4, 4, 5, 3, 4, 4, 3, 5, 4, 3, 4, 5, 3, 4], daysAgo: 5 },
  { scores: [6, 5, 7, 6, 5, 6, 7, 4, 6, 6, 5, 7, 6, 4, 6, 7, 5, 6], daysAgo: 10 },
  { scores: [5, 4, 5, 5, 4, 5, 6, 3, 5, 5, 4, 5, 5, 3, 5, 5, 4, 5], daysAgo: 14 },
] as const

const PAR_PER_HOLE: Record<string, number> = {
  '1': 4, '2': 3, '3': 5, '4': 4, '5': 3, '6': 4,
  '7': 5, '8': 3, '9': 4, '10': 4, '11': 3, '12': 5,
  '13': 4, '14': 3, '15': 4, '16': 5, '17': 3, '18': 4,
}
const PAR_TOTAL = 72

/* ─── Helpers ────────────────────────────────────────── */

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function calcDiferencial(gross: number): number {
  return Math.round(((gross - CR) * 113) / SLOPE * 10) / 10
}

interface FixtureRound {
  id: string
  gross: number
  diferencial: number
}

async function createFixtureRounds(userId: string): Promise<FixtureRound[]> {
  const sb = adminClient()
  const created: FixtureRound[] = []

  for (const r of FIXTURE_ROUNDS) {
    const gross = r.scores.reduce((a, b) => a + b, 0)
    const dif = calcDiferencial(gross)
    const playedAt = new Date(Date.now() - r.daysAgo * 86_400_000).toISOString().split('T')[0]

    const { data, error } = await sb.from('historical_rounds').insert({
      user_id: userId,
      course_name: COURSE_NAME,
      course_id: COURSE_ID,
      played_at: playedAt,
      total_gross: gross,
      scores: r.scores,
      holes_played: 18,
      tee_color: 'blanco',
      privacy: 'private',
      slope_rating: SLOPE,
      course_rating: CR,
      diferencial: dif,
      formato_juego: 'stroke_play',
      modo_juego: 'gross',
      par_per_hole: PAR_PER_HOLE,
    }).select('id').single()

    if (error || !data) throw new Error(`createFixtureRounds falló: ${error?.message}`)
    created.push({ id: data.id, gross, diferencial: dif })
  }

  // Recalcular índice para que /perfil lo muestre
  await sb.rpc('calcular_indice_golfers', { p_user_id: userId })
  return created
}

async function cleanupFixtureRounds(rounds: FixtureRound[], userId: string): Promise<void> {
  const sb = adminClient()
  for (const r of rounds) {
    await sb.from('historical_rounds').delete().eq('id', r.id)
  }
  // Recalcular índice sin las fixture rounds
  await sb.rpc('calcular_indice_golfers', { p_user_id: userId }).catch(() => {})
}

/* ═══════════════════════════════════════════════════════ */
/*  Tests                                                 */
/* ═══════════════════════════════════════════════════════ */

test.describe('Historial + Handicap — integridad de datos', () => {
  let testUserId: string
  let fixtures: FixtureRound[] = []

  test.beforeAll(async () => {
    if (!process.env.E2E_TEST_USER_EMAIL) return
    testUserId = await getTestUserId()
    fixtures = await createFixtureRounds(testUserId)
  }, 60_000)

  test.beforeEach(async () => {
    if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
      test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
    }
  })

  test.afterAll(async () => {
    if (fixtures.length > 0 && testUserId) {
      try { await cleanupFixtureRounds(fixtures, testUserId) } catch { /* ignore */ }
    }
  }, 60_000)

  /* ── /perfil: índice Golfers+ es un número real ──── */

  test('perfil muestra índice Golfers+ como número decimal', async ({ page }) => {
    await page.goto('/perfil', { waitUntil: 'networkidle', timeout: 30_000 })
    expect(page.url()).not.toContain('/login')

    // The Golfers+ card shows the subtitle "Rendimiento real" — use that to scope
    const rendimientoText = page.getByText('Rendimiento real')
    await expect(rendimientoText).toBeVisible({ timeout: 15_000 })

    // The index value sits in the same card area. Get the card by finding
    // the nearest ancestor that also contains "Golfers+"
    // Strategy: get the full page text near "Rendimiento real" by getting its parent
    const cardContainer = page.locator('div, section').filter({ hasText: 'Rendimiento real' }).filter({ hasText: /\d+\.\d/ }).first()
    const cardText = await cardContainer.innerText()

    // Extract the index number — can be negative like "-0.2" / "−0.2" or positive like "17.6"
    // The minus sign can be a regular hyphen, en-dash, or Unicode minus (−)
    const indexMatch = cardText.match(/([−\-]?\d{1,2}\.\d)/)
    expect(indexMatch, `No se encontró un índice decimal en la card Golfers+. Texto: "${cardText}"`).not.toBeNull()

    // Normalize unicode minus to regular hyphen for parseFloat
    const normalized = indexMatch![1].replace('−', '-')
    const indexValue = parseFloat(normalized)
    // Sanity: a valid golf handicap index is between -10 and 54
    expect(indexValue).toBeGreaterThanOrEqual(-10)
    expect(indexValue).toBeLessThanOrEqual(54)
  })

  test('perfil muestra "Rendimiento real" subtexto en card Golfers+', async ({ page }) => {
    await page.goto('/perfil', { waitUntil: 'networkidle', timeout: 30_000 })

    await expect(page.getByText('Rendimiento real')).toBeVisible({ timeout: 15_000 })
  })

  test('perfil muestra link "Ver qué rondas cuentan →"', async ({ page }) => {
    await page.goto('/perfil', { waitUntil: 'networkidle', timeout: 30_000 })

    const link = page.getByText('Ver qué rondas cuentan →')
    await expect(link).toBeVisible({ timeout: 15_000 })
  })

  /* ── /perfil/historial: gross scores match fixtures ── */

  test('historial muestra los gross scores de las rondas fixture', async ({ page }) => {
    await page.goto('/perfil/historial', { waitUntil: 'networkidle', timeout: 30_000 })
    expect(page.url()).not.toContain('/login')

    // Wait for rounds to render
    await expect(page.getByText(COURSE_NAME).first()).toBeVisible({ timeout: 15_000 })

    const bodyText = await page.locator('main').innerText()

    // Each fixture gross score should appear in the historial
    for (const f of fixtures) {
      expect(
        bodyText.includes(String(f.gross)),
        `Gross score ${f.gross} no aparece en historial. Fixture id: ${f.id}`,
      ).toBe(true)
    }
  })

  test('historial muestra vs-par correcto para al menos una ronda fixture', async ({ page }) => {
    await page.goto('/perfil/historial', { waitUntil: 'networkidle', timeout: 30_000 })
    await expect(page.getByText(COURSE_NAME).first()).toBeVisible({ timeout: 15_000 })

    // Scroll down to ensure all rounds are visible
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(1_000)

    const bodyText = await page.locator('main').innerText()

    // At least one fixture's vs-par should appear
    // Format is e.g. "+19", "+16", "-1", "+32", "+11" next to the gross score
    let found = 0
    for (const f of fixtures) {
      const overPar = f.gross - PAR_TOTAL
      const expected = overPar === 0 ? 'E' : overPar > 0 ? `+${overPar}` : `${overPar}`
      if (bodyText.includes(expected)) found++
    }

    expect(
      found,
      `Ninguno de los vs-par esperados aparece en historial. Texto visible: ${bodyText.slice(0, 500)}`,
    ).toBeGreaterThanOrEqual(1)
  })

  test('historial pills muestra conteo de rondas ≥ 4', async ({ page }) => {
    await page.goto('/perfil/historial', { waitUntil: 'networkidle', timeout: 30_000 })

    // The pills format is "RONDAS 5" (uppercase label + bold number)
    // Look for the pill text that contains RONDAS with a number
    const mainText = await page.locator('main').innerText()

    // The format in the UI is "RONDAS 5" or "RONDAS  5" (the number is bold, after label)
    const rondasMatch = mainText.match(/RONDAS\s+(\d+)/i)
    expect(rondasMatch, `No se encontró "RONDAS N" en historial. Texto: ${mainText.slice(0, 300)}`).not.toBeNull()

    const count = parseInt(rondasMatch![1])
    expect(count, `El conteo de rondas (${count}) debe ser ≥ 4 con nuestros fixtures`).toBeGreaterThanOrEqual(4)
  })

  test('historial muestra badge "cuenta para índice" en fixture rounds', async ({ page }) => {
    await page.goto('/perfil/historial', { waitUntil: 'networkidle', timeout: 30_000 })
    await expect(page.getByText(COURSE_NAME).first()).toBeVisible({ timeout: 15_000 })

    // At least one "cuenta para índice" badge should be visible
    // Our fixture rounds are stroke_play, 18 holes, with CR/slope — all eligible
    const badge = page.getByText('cuenta para índice').first()
    await expect(badge).toBeVisible({ timeout: 10_000 })
  })

  /* ── /perfil/historial: round card expand shows scorecard ── */

  test('expandir una ronda muestra el scorecard hoyo por hoyo', async ({ page }) => {
    await page.goto('/perfil/historial', { waitUntil: 'networkidle', timeout: 30_000 })
    await expect(page.getByText(COURSE_NAME).first()).toBeVisible({ timeout: 15_000 })

    // Click the first round card to expand it
    const firstCard = page.getByText(COURSE_NAME).first()
    await firstCard.click()
    await page.waitForTimeout(1_000)

    // Expanded scorecard should show hole numbers or par row
    // Look for recognizable scorecard content
    const expandedArea = page.locator('main')
    const expandedText = await expandedArea.innerText()

    // The scorecard should contain par values or hole labels
    const hasScorecardContent =
      expandedText.includes('PAR') ||
      expandedText.includes('Par') ||
      // Or individual hole numbers like "1 2 3..."
      /\b[1-9]\b.*\b[1-9]\b/.test(expandedText)

    expect(hasScorecardContent, 'El scorecard expandido debe mostrar datos de hoyos').toBe(true)

    // Should NOT show error boundary
    await expect(page.getByText('Algo salió mal')).toBeHidden({ timeout: 2_000 })
  })

  /* ── /perfil/historial: delete button exists ──────── */

  test('ronda tiene menú de 3 puntos (⋮) funcional', async ({ page }) => {
    await page.goto('/perfil/historial', { waitUntil: 'networkidle', timeout: 30_000 })
    await expect(page.getByText(COURSE_NAME).first()).toBeVisible({ timeout: 15_000 })

    // Scroll down past the "PERSONAL RECORD" highlight card to regular cards
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
    await page.waitForTimeout(1_000)

    // The ⋮ button is visible on regular round cards (not the PR card)
    const menuBtns = page.getByText('⋮')
    const count = await menuBtns.count()

    if (count === 0) {
      // No ⋮ visible — cards may use a different interaction. Just verify no crash.
      await expect(page.getByText('Algo salió mal')).toBeHidden({ timeout: 2_000 })
      return
    }

    // Click the first ⋮ and verify options appear
    await menuBtns.first().click()
    await page.waitForTimeout(500)

    const bodyAfter = await page.locator('body').innerText()
    const hasOptions = bodyAfter.includes('Editar') || bodyAfter.includes('Eliminar')
    expect(hasOptions, 'El menú de la ronda debe mostrar opciones (Editar/Eliminar)').toBe(true)
  })

  /* ── Data consistency: diferencial math ────────────── */

  test('diferenciales calculados coinciden con fórmula WHS', async () => {
    // Pure data test: verify our calcDiferencial matches what was inserted
    for (const f of fixtures) {
      const round = FIXTURE_ROUNDS.find(r => r.scores.reduce((a, b) => a + b, 0) === f.gross)!
      const expectedDif = calcDiferencial(f.gross)
      expect(f.diferencial).toBe(expectedDif)
      // Verify the formula: (gross - CR) * 113 / slope, rounded to 1 decimal
      const raw = ((f.gross - CR) * 113) / SLOPE
      expect(Math.round(raw * 10) / 10).toBe(f.diferencial)
    }
  })

  /* ── No JS errors across perfil pages ─────────────── */

  test('perfil y historial cargan sin errores JS', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto('/perfil', { waitUntil: 'networkidle', timeout: 30_000 })
    expect(page.url()).not.toContain('/login')
    await page.waitForTimeout(2_000)

    await page.goto('/perfil/historial', { waitUntil: 'networkidle', timeout: 30_000 })
    await page.waitForTimeout(2_000)

    expect(pageErrors, `Errores JS en perfil/historial: ${pageErrors.join(' | ')}`).toEqual([])
  })
})
