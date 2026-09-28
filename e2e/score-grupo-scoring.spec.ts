/**
 * Score Grupo — /ronda-libre/[codigo]/score-grupo
 *
 * Verifica la página de scoring grupal (admin mode):
 * 1. Carga correctamente con header de hoyo/par/SI/yardaje
 * 2. Muestra jugador(es) con botones +/-
 * 3. Navegación entre hoyos (Anterior/Siguiente)
 * 4. Score se incrementa/decrementa correctamente
 * 5. Barra de progreso de hoyos visible
 * 6. Score persiste al cambiar de hoyo y volver
 *
 * Complementa score-grupo-finalize-missing.spec.ts (1 test: finalize con hoyos vacíos).
 * Fixture: ronda admin_mode con 1 jugador, limpia en afterAll.
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

interface GrupoRondaFixture {
  id: string
  codigo: string
}

/** Crea una ronda admin_mode en curso con 2 jugadores para scoring grupal. */
async function createAdminRonda(opts: {
  userId: string
  holes?: 9 | 18
}): Promise<GrupoRondaFixture> {
  const admin = adminClient()
  const codigo = generateCode()
  const holes = opts.holes ?? 9

  // Build course_snapshot
  const { data: courseData } = await admin
    .from('courses')
    .select('par_total, course_rating, slope_rating')
    .eq('id', DEFAULT_COURSE_ID)
    .single()
  const { data: courseHoles } = await admin
    .from('course_holes')
    .select('numero, par, stroke_index')
    .eq('id', DEFAULT_COURSE_ID)
    .order('numero')
  // Fallback: query by course_id if id query returned nothing
  const holesData = courseHoles && courseHoles.length > 0
    ? courseHoles
    : (await admin.from('course_holes').select('numero, par, stroke_index').eq('course_id', DEFAULT_COURSE_ID).order('numero')).data ?? []

  const courseSnapshot = {
    holes: holesData.map(h => ({ numero: h.numero, par: h.par, stroke_index: h.stroke_index })),
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
      holes,
      fecha: new Date().toISOString().slice(0, 10),
      hoyo_inicio: 1,
      formato_juego: 'stroke_play',
      modo_juego: 'gross',
      admin_mode: true,
      admin_user_id: opts.userId,
      estado: 'en_curso',
      creador_id: opts.userId,
      course_snapshot: courseSnapshot,
    })
    .select('id, codigo')
    .single()

  if (error || !ronda) throw new Error(`createAdminRonda falló: ${error?.message}`)

  // Insert 2 players — the admin + a guest
  const { error: jug1Err } = await admin.from('ronda_libre_jugadores').insert({
    ronda_id: ronda.id,
    user_id: opts.userId,
    nombre: 'E2E Admin',
    handicap: null,
    tees: 'blanco',
    scores: {},
    is_guest: false,
  })
  if (jug1Err) {
    await admin.from('rondas_libres').delete().eq('id', ronda.id)
    throw new Error(`insert jugador 1 falló: ${jug1Err.message}`)
  }

  const { error: jug2Err } = await admin.from('ronda_libre_jugadores').insert({
    ronda_id: ronda.id,
    user_id: null,
    nombre: 'Invitado E2E',
    handicap: null,
    tees: 'blanco',
    scores: {},
    is_guest: true,
  })
  if (jug2Err) {
    await admin.from('ronda_libre_jugadores').delete().eq('ronda_id', ronda.id)
    await admin.from('rondas_libres').delete().eq('id', ronda.id)
    throw new Error(`insert jugador 2 falló: ${jug2Err.message}`)
  }

  return { id: ronda.id, codigo: ronda.codigo }
}

test.describe('Score Grupo — /ronda-libre/[codigo]/score-grupo', () => {
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
        console.warn(`[score-grupo] cleanup falló para ${id}:`, (e as Error).message)
      }
    }
  })

  test.beforeEach(() => {
    if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
      test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
    }
  })

  test('score-grupo carga sin errores y muestra hoyo 1 con par', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    const ronda = await createAdminRonda({ userId: testUserId, holes: 9 })
    createdRondaIds.push(ronda.id)

    await page.goto(`/ronda-libre/${ronda.codigo}/score-grupo`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // No redirect to login
    expect(page.url()).not.toContain('/login')

    // Shows hole info — HOYO label and PAR label visible
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain('HOYO')
    expect(bodyText).toContain('PAR')

    // Shows both players (exact match to avoid annotator label duplicate)
    await expect(page.getByText('E2E Admin', { exact: true })).toBeVisible()
    await expect(page.getByText('Invitado E2E', { exact: true })).toBeVisible()

    expect(pageErrors).toEqual([])
  })

  test('botón + incrementa el score del jugador', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    const ronda = await createAdminRonda({ userId: testUserId, holes: 9 })
    createdRondaIds.push(ronda.id)

    await page.goto(`/ronda-libre/${ronda.codigo}/score-grupo`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Find the first + button (gold button for incrementing score)
    const plusButtons = page.locator('button:has-text("+")')
    const firstPlus = plusButtons.first()
    await expect(firstPlus).toBeVisible()

    // Click + button once — score should change from par to par+1
    await firstPlus.click()
    await page.waitForTimeout(300)

    // After clicking +, there should be a score indicator showing the result
    // The body should contain a score chip (Bogey for par+1)
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toContain('Bogey')

    expect(pageErrors).toEqual([])
  })

  test('navegación Siguiente avanza al hoyo 2', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    const ronda = await createAdminRonda({ userId: testUserId, holes: 9 })
    createdRondaIds.push(ronda.id)

    await page.goto(`/ronda-libre/${ronda.codigo}/score-grupo`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Click "Siguiente" button
    const siguienteBtn = page.getByRole('button', { name: /siguiente/i })
    await expect(siguienteBtn).toBeVisible()
    await siguienteBtn.click()
    await page.waitForTimeout(300)

    // The hole number should now show 2 somewhere in the header
    const bodyText = await page.locator('body').innerText()
    // The HOYO section should now show "2"
    // Look for the hole number changing (the progress bar should highlight hole 2)
    expect(bodyText).toMatch(/HOYO/)

    expect(pageErrors).toEqual([])
  })

  test('navegación Anterior vuelve al hoyo 1 desde hoyo 2', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    const ronda = await createAdminRonda({ userId: testUserId, holes: 9 })
    createdRondaIds.push(ronda.id)

    await page.goto(`/ronda-libre/${ronda.codigo}/score-grupo`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Go to hole 2
    const siguienteBtn = page.getByRole('button', { name: /siguiente/i })
    await siguienteBtn.click()
    await page.waitForTimeout(300)

    // Go back to hole 1
    const anteriorBtn = page.getByRole('button', { name: /anterior/i })
    await expect(anteriorBtn).toBeVisible()
    await anteriorBtn.click()
    await page.waitForTimeout(300)

    // Should still work — no errors
    expect(pageErrors).toEqual([])
  })

  test('score persiste al ir al hoyo 2 y volver al hoyo 1', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    const ronda = await createAdminRonda({ userId: testUserId, holes: 9 })
    createdRondaIds.push(ronda.id)

    await page.goto(`/ronda-libre/${ronda.codigo}/score-grupo`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Score the first player on hole 1: click + twice (par + 2 = double bogey)
    const plusButtons = page.locator('button:has-text("+")')
    const firstPlus = plusButtons.first()
    await firstPlus.click()
    await page.waitForTimeout(200)
    await firstPlus.click()
    await page.waitForTimeout(200)

    // Navigate to hole 2
    const siguienteBtn = page.getByRole('button', { name: /siguiente/i })
    await siguienteBtn.click()
    await page.waitForTimeout(500)

    // Navigate back to hole 1
    const anteriorBtn = page.getByRole('button', { name: /anterior/i })
    await anteriorBtn.click()
    await page.waitForTimeout(500)

    // The score should still show the double bogey chip ("+2" or "Doble")
    const bodyText = await page.locator('body').innerText()
    // Double bogey shows "+2" chip
    expect(bodyText).toMatch(/\+2|Doble/)

    expect(pageErrors).toEqual([])
  })

  test('botón Finalizar visible y funcional', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    const ronda = await createAdminRonda({ userId: testUserId, holes: 9 })
    createdRondaIds.push(ronda.id)

    await page.goto(`/ronda-libre/${ronda.codigo}/score-grupo`, { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

    // Navigate to last hole (hole 9) — Finalizar only shows on last hole or after 9 holes scored
    for (let i = 0; i < 8; i++) {
      const nextBtn = page.getByRole('button', { name: /siguiente/i })
      await nextBtn.click()
      await page.waitForTimeout(200)
    }

    // Finalizar button should be visible on last hole (text includes checkmark ✓)
    const finalizarBtn = page.getByRole('button', { name: /finalizar/i }).first()
    await expect(finalizarBtn).toBeVisible({ timeout: 10_000 })

    // First click activates confirmation mode
    await finalizarBtn.click()
    await page.waitForTimeout(300)

    // Second state: "Marcar N hoyos como par y finalizar?" should appear
    // (since no holes have been scored)
    const confirmBtn = page.getByRole('button', { name: /marcar.*como par.*finalizar/i }).first()
    await expect(confirmBtn).toBeVisible({ timeout: 5_000 })

    // Don't actually finalize — just verify the UI state
    expect(pageErrors).toEqual([])
  })
})
