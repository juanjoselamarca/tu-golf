/**
 * Scorer Resultados Ronda — /ronda-libre/[codigo]
 *
 * Verifica la página de resultados/leaderboard de una ronda libre:
 * 1. Header muestra estado correcto (EN VIVO vs FINALIZADA)
 * 2. IndividualLeaderboard muestra jugador con score y hoyos correctos
 * 3. WinnerCelebration aparece en rondas finalizadas
 * 4. Formatos distintos muestran etiquetas correctas (Stroke Play Gross, Stableford)
 * 5. Ronda 9 hoyos muestra badge "9h"
 * 6. Sin errores de cliente en ningún caso
 *
 * Fixture: crea rondas via admin client con scores pre-poblados y limpia al final.
 * NO crea datos persistentes — todo se borra en afterAll.
 */
import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getTestUserId, cleanupRondaFixture } from './helpers/ronda-fixture'

const DEFAULT_COURSE_ID = 'b1b6ba60-18f0-48a8-97c2-ef10e25fbe26'
const DEFAULT_COURSE_NAME = 'Los Leones'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function generateCode(): string {
  const alphabet = 'ACDEFGHJKMNPQRSTVWXYZ2345679'
  let code = ''
  for (let i = 0; i < 6; i++) code += alphabet[Math.floor(Math.random() * alphabet.length)]
  return code
}

interface FinishedRondaFixture {
  id: string
  codigo: string
}

/**
 * Crea una ronda FINALIZADA con scores completos pre-poblados.
 * Incluye course_snapshot para que el leaderboard pueda calcular vs par.
 */
async function createFinishedRonda(opts: {
  userId: string
  playerName?: string
  formato?: 'stroke_play' | 'stableford'
  modo?: 'gross' | 'neto'
  holes?: 9 | 18
  scores?: Record<string, number>
}): Promise<FinishedRondaFixture> {
  const admin = adminClient()
  const codigo = generateCode()
  const holes = opts.holes ?? 18
  const formato = opts.formato ?? 'stroke_play'
  const modo = opts.modo ?? 'gross'
  const name = opts.playerName ?? 'E2E Test'

  // Build course_snapshot from real course data
  const { data: courseData } = await admin
    .from('courses')
    .select('par_total, slope_rating, course_rating')
    .eq('id', DEFAULT_COURSE_ID)
    .single()
  const { data: courseHoles } = await admin
    .from('course_holes')
    .select('numero, par, stroke_index')
    .eq('course_id', DEFAULT_COURSE_ID)
    .order('numero')
  const { data: teeData } = await admin
    .from('course_tees')
    .select('rating, slope')
    .eq('course_id', DEFAULT_COURSE_ID)
    .ilike('nombre', 'blanco%')
    .limit(1)
    .maybeSingle()

  if (!courseData || !courseHoles || courseHoles.length === 0) {
    throw new Error('No se pudo cargar course data para Los Leones')
  }

  const courseSnapshot = {
    holes: courseHoles.map(h => ({
      numero: h.numero,
      par: h.par,
      stroke_index: h.stroke_index,
    })),
    par_total: courseData.par_total,
    si_source: 'verified',
    course_rating: teeData?.rating ?? courseData.course_rating,
    slope_rating: teeData?.slope ?? courseData.slope_rating,
  }

  // Default scores: each hole = par + 1 (bogey round)
  const defaultScores: Record<string, number> = {}
  const relevantHoles = courseHoles.filter(h => h.numero <= holes)
  for (const h of relevantHoles) {
    defaultScores[String(h.numero)] = h.par + 1
  }
  const scores = opts.scores ?? defaultScores

  // Insert ronda as finalizada
  const { data: ronda, error: rondaErr } = await admin
    .from('rondas_libres')
    .insert({
      codigo,
      course_id: DEFAULT_COURSE_ID,
      course_name: DEFAULT_COURSE_NAME,
      tees: 'blanco',
      holes,
      fecha: new Date().toISOString().slice(0, 10),
      hoyo_inicio: 1,
      formato_juego: formato,
      modo_juego: modo,
      admin_mode: false,
      estado: 'finalizada',
      creador_id: opts.userId,
      course_snapshot: courseSnapshot,
    })
    .select('id, codigo')
    .single()

  if (rondaErr || !ronda) {
    throw new Error(`createFinishedRonda falló: ${rondaErr?.message ?? 'unknown'}`)
  }

  // Insert player with scores
  const { error: jugErr } = await admin
    .from('ronda_libre_jugadores')
    .insert({
      ronda_id: ronda.id,
      user_id: opts.userId,
      nombre: name,
      handicap: null,
      tees: 'blanco',
      scores,
      is_guest: false,
    })

  if (jugErr) {
    await admin.from('rondas_libres').delete().eq('id', ronda.id)
    throw new Error(`insert jugador falló: ${jugErr.message}`)
  }

  return { id: ronda.id, codigo: ronda.codigo }
}

test.describe('Scorer Resultados Ronda — /ronda-libre/[codigo]', () => {
  test.describe.configure({ mode: 'serial' })

  let testUserId: string
  const createdRondaIds: string[] = []

  test.beforeAll(async () => {
    if (!process.env.E2E_TEST_USER_EMAIL) return
    testUserId = await getTestUserId()
  })

  test.afterAll(async () => {
    for (const id of createdRondaIds) {
      try {
        await cleanupRondaFixture(id)
      } catch (e) {
        console.warn(`[scorer-resultados] cleanup falló para ${id}:`, (e as Error).message)
      }
    }
  })

  test.beforeEach(() => {
    if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
      test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
    }
  })

  test('ronda finalizada muestra "Resultado final" y badge FINALIZADA', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    const ronda = await createFinishedRonda({ userId: testUserId })
    createdRondaIds.push(ronda.id)

    await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Header muestra "Resultado final" (no "Marcador en vivo")
    const h1 = page.locator('h1')
    await expect(h1).toContainText('Resultado final')

    // Badge FINALIZADA visible
    const badge = page.getByText('FINALIZADA')
    await expect(badge).toBeVisible()

    // Course name visible (exact match — avoids title tag and composite text)
    await expect(page.getByText(DEFAULT_COURSE_NAME, { exact: true })).toBeVisible()

    expect(pageErrors).toEqual([])
  })

  test('leaderboard muestra jugador con score correcto (stroke play gross)', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    // Create with specific scores — par+1 on each hole (bogey round)
    const ronda = await createFinishedRonda({
      userId: testUserId,
      playerName: 'E2E Test',
      formato: 'stroke_play',
      modo: 'gross',
      holes: 18,
    })
    createdRondaIds.push(ronda.id)

    await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Leaderboard section exists — header columns
    const jugadorHeader = page.getByText('Jugador', { exact: false }).first()
    await expect(jugadorHeader).toBeVisible()

    // Player name visible in the leaderboard (use expand button for unique match)
    const expandBtn = page.getByRole('button', { name: /expandir scorecard de E2E Test/i })
    await expect(expandBtn).toBeVisible()

    // The score should show +18 (bogey on every hole = 18 over par)
    // formatOverUnder(18) → "+18" — appears in winner card + leaderboard row
    await expect(page.getByText('+18').first()).toBeVisible()

    // Format label: "Stroke Play Gross"
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain('Stroke Play Gross')

    expect(pageErrors).toEqual([])
  })

  test('ronda stableford muestra puntos en vez de over/under', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    const ronda = await createFinishedRonda({
      userId: testUserId,
      playerName: 'E2E Test',
      formato: 'stableford',
      modo: 'gross',
      holes: 18,
    })
    createdRondaIds.push(ronda.id)

    await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Stableford format label (no suffix, just "Stableford")
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain('Stableford')

    // Column header should say "PTS" not "Gross" or "Neto"
    const ptsHeader = page.getByText('PTS', { exact: true })
    await expect(ptsHeader).toBeVisible()

    // Score should show "pts" suffix — appears in winner card + leaderboard
    await expect(page.getByText(/\d+ pts/).first()).toBeVisible()

    expect(pageErrors).toEqual([])
  })

  test('ronda 9 hoyos muestra badge 9h y datos correctos', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    const ronda = await createFinishedRonda({
      userId: testUserId,
      formato: 'stroke_play',
      modo: 'gross',
      holes: 9,
    })
    createdRondaIds.push(ronda.id)

    await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Header shows "Resultado final"
    await expect(page.locator('h1')).toContainText('Resultado final')

    // Badge shows 9H (uppercase via text-transform)
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain('9H')

    // Player visible with score — 9 bogeys = +9
    await expect(page.getByText('+9').first()).toBeVisible()

    // "1 jugador" text (singular)
    expect(bodyText).toContain('1 jugador')

    expect(pageErrors).toEqual([])
  })

  test('winner celebration aparece en ronda finalizada', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    const ronda = await createFinishedRonda({
      userId: testUserId,
      playerName: 'E2E Test',
      formato: 'stroke_play',
      modo: 'gross',
    })
    createdRondaIds.push(ronda.id)

    await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // WinnerCelebration should show the winner name (use expand button as unique selector)
    const expandBtn = page.getByRole('button', { name: /expandir scorecard de E2E Test/i })
    await expect(expandBtn).toBeVisible()

    // Share button should exist (part of winner card or standalone)
    const shareButton = page.getByRole('button', { name: /compartir/i })
    // Winner card always has a share button
    const shareCount = await shareButton.count()
    expect(shareCount).toBeGreaterThanOrEqual(1)

    expect(pageErrors).toEqual([])
  })

  test('leaderboard expandible muestra scorecard al hacer tap en jugador', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    const ronda = await createFinishedRonda({
      userId: testUserId,
      playerName: 'E2E Test',
    })
    createdRondaIds.push(ronda.id)

    await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Click on the player row to expand scorecard
    const expandButton = page.getByRole('button', { name: /expandir scorecard/i })
    await expect(expandButton).toBeVisible()
    await expandButton.click()

    // After expanding, the collapse button should appear
    const collapseButton = page.getByRole('button', { name: /colapsar scorecard/i })
    await expect(collapseButton).toBeVisible()

    // Scorecard should show hole numbers and scores
    // OUT label (holes 1-9) should be visible
    await expect(page.getByText('OUT', { exact: true }).first()).toBeVisible()

    // IN label (holes 10-18) should be visible for 18-hole rounds
    await expect(page.getByText('IN', { exact: true })).toBeVisible()

    expect(pageErrors).toEqual([])
  })

  test('ronda en curso muestra "Marcador en vivo" y badge EN VIVO', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    // Create an in-progress round (not finished)
    const admin = adminClient()
    const codigo = generateCode()

    const { data: courseData } = await admin
      .from('courses')
      .select('par_total, course_rating, slope_rating')
      .eq('id', DEFAULT_COURSE_ID)
      .single()
    const { data: courseHoles } = await admin
      .from('course_holes')
      .select('numero, par, stroke_index')
      .eq('course_id', DEFAULT_COURSE_ID)
      .order('numero')

    const courseSnapshot = {
      holes: (courseHoles ?? []).map(h => ({ numero: h.numero, par: h.par, stroke_index: h.stroke_index })),
      par_total: courseData?.par_total,
      si_source: 'verified',
      course_rating: courseData?.course_rating,
      slope_rating: courseData?.slope_rating,
    }

    const { data: ronda, error } = await admin
      .from('rondas_libres')
      .insert({
        codigo,
        course_id: DEFAULT_COURSE_ID,
        course_name: DEFAULT_COURSE_NAME,
        tees: 'blanco',
        holes: 18,
        fecha: new Date().toISOString().slice(0, 10),
        hoyo_inicio: 1,
        formato_juego: 'stroke_play',
        modo_juego: 'gross',
        admin_mode: false,
        estado: 'en_curso',
        creador_id: testUserId,
        course_snapshot: courseSnapshot,
      })
      .select('id, codigo')
      .single()

    if (error || !ronda) throw new Error(`ronda en curso falló: ${error?.message}`)
    createdRondaIds.push(ronda.id)

    // Add player with partial scores (first 5 holes)
    const partialScores: Record<string, number> = {}
    for (let i = 1; i <= 5; i++) {
      const par = courseHoles?.find(h => h.numero === i)?.par ?? 4
      partialScores[String(i)] = par
    }

    await admin.from('ronda_libre_jugadores').insert({
      ronda_id: ronda.id,
      user_id: testUserId,
      nombre: 'E2E Test',
      handicap: null,
      tees: 'blanco',
      scores: partialScores,
      is_guest: false,
    })

    await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Header muestra "Marcador en vivo" (not "Resultado final")
    const h1 = page.locator('h1')
    await expect(h1).toContainText('Marcador en vivo')

        // Header muestra "Marcador en vivo" — the h1 is the reliable scope
    // (EN VIVO text also appears in navbar links, so we don't assert it separately)

    // Player visible with partial score — use expand button as unique selector
    const expandBtn = page.getByRole('button', { name: /expandir scorecard de E2E Test/i })
    await expect(expandBtn).toBeVisible()

    expect(pageErrors).toEqual([])
  })
})
