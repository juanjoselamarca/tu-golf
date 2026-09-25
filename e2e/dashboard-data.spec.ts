/**
 * Dashboard — /dashboard (Mi Golf)
 *
 * Verifica que el dashboard del usuario autenticado muestra datos reales:
 * 1. Tabs Competencia/Identidad visibles y conmutables
 * 2. Saludo con nombre del usuario ("Hola, <nombre>")
 * 3. HCP (índice) visible o "Sin calibrar"
 * 4. Tab Identidad muestra "Índice Golfers+" con valor numérico
 * 5. Secciones clave: rondas, torneos, niveles
 * 6. Sin errores JS ni 5xx
 *
 * Precondición: el test user ya tiene rondas históricas (garantizado por
 * perfil-stats.spec.ts o su propia fixture).
 */
import { test, expect, type Page } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'
import { getTestUserId } from './helpers/ronda-fixture'

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

/** Asegura que el test user tiene al menos 1 ronda histórica. */
async function ensureHistoricalRound(userId: string): Promise<string | null> {
  const sb = adminClient()
  const { data } = await sb
    .from('historical_rounds')
    .select('id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (data) return null

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

/**
 * Navega a /dashboard y espera a que el contenido real renderice.
 * Detecta Vercel Security Checkpoint y marca fixme si aparece.
 */
async function gotoDashboardReady(page: Page): Promise<boolean> {
  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

  const bodyText = await page.locator('body').innerText()
  if (bodyText.includes('Failed to verify your browser') || bodyText.includes('Security Checkpoint')) {
    return false
  }

  // Esperar a que el contenido de Suspense cargue — "Hola," o "Competencia"
  try {
    await page.getByText('Competencia').waitFor({ state: 'visible', timeout: 20_000 })
  } catch {
    // Si el tab no carga en 20s, puede ser un problema real
  }

  // Esperar a que las skeletons (aria-busy) desaparezcan
  try {
    await page.locator('[aria-busy="true"]').waitFor({ state: 'hidden', timeout: 15_000 })
  } catch {
    // OK si no hay skeletons ya
  }

  return true
}

test.describe('Dashboard — /dashboard', () => {
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

  test('carga sin redirect a login y sin errores', async ({ page }) => {
    const pageErrors: string[] = []
    const serverErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))
    page.on('response', res => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
    })

    const loaded = await gotoDashboardReady(page)
    test.fixme(!loaded, 'Vercel Security Checkpoint bloqueó el headless browser')

    expect(page.url()).not.toContain('/login')

    const appErrors = pageErrors.filter(
      e => !e.includes('Lock broken by another request') && !e.includes('ResizeObserver'),
    )
    expect(appErrors, 'errores JS en /dashboard').toEqual([])
    expect(serverErrors, '5xx en /dashboard').toEqual([])
  })

  test('muestra saludo "Hola, <nombre>" y datos del dashboard', async ({ page }) => {
    const loaded = await gotoDashboardReady(page)
    test.fixme(!loaded, 'Vercel Security Checkpoint bloqueó el headless browser')

    // Esperar saludo
    await expect(page.getByText(/Hola,/)).toBeVisible({ timeout: 20_000 })

    // Debe mostrar contenido real: rondas, torneos, o CTA
    const bodyText = await page.locator('body').innerText()
    const hasContent = /ronda|torneo|Nueva ronda|score|hoyo|Los Leones|Organizar/i.test(bodyText)
    expect(hasContent, 'Dashboard debe mostrar rondas, torneos o acciones').toBe(true)
  })

  test('tabs Competencia e Identidad conmutables', async ({ page }) => {
    const loaded = await gotoDashboardReady(page)
    test.fixme(!loaded, 'Vercel Security Checkpoint bloqueó el headless browser')

    // Verificar que ambos tabs son visibles
    const identidadTab = page.locator('button[role="tab"]').filter({ hasText: 'Identidad' })
    const competenciaTab = page.locator('button[role="tab"]').filter({ hasText: 'Competencia' })
    await expect(competenciaTab).toBeVisible({ timeout: 15_000 })
    await expect(identidadTab).toBeVisible()

    // Click Identidad via JS — la skeleton overlay intercepta pointer events normales
    await identidadTab.dispatchEvent('click')
    await page.waitForTimeout(1000)

    // El panel de Identidad debe ahora ser visible (texto en uppercase por CSS)
    const identidadPanel = page.locator('[role="tabpanel"]:not([aria-hidden="true"])')
    await expect(identidadPanel).toBeVisible({ timeout: 10_000 })

    // Volver a Competencia
    await competenciaTab.dispatchEvent('click')
    await page.waitForTimeout(500)
    const bodyBack = await page.locator('body').innerText()
    expect(bodyBack).toMatch(/Hola,|ronda|Nueva ronda|score|EN VIVO/i)
  })

  test('tab Identidad muestra "Índice Golfers+" con valor', async ({ page }) => {
    const loaded = await gotoDashboardReady(page)
    test.fixme(!loaded, 'Vercel Security Checkpoint bloqueó el headless browser')

    // Click tab Identidad via JS dispatch
    const identidadTab = page.locator('button[role="tab"]').filter({ hasText: 'Identidad' })
    await expect(identidadTab).toBeVisible({ timeout: 15_000 })
    await identidadTab.dispatchEvent('click')
    await page.waitForTimeout(1000)

    // Esperar contenido visible
    const identidadPanel = page.locator('[role="tabpanel"]:not([aria-hidden="true"])')
    const panelText = await identidadPanel.innerText({ timeout: 10_000 })
    // CSS text-transform: uppercase → innerText devuelve "ÍNDICE GOLFERS+"
    expect(panelText.toUpperCase()).toContain('ÍNDICE GOLFERS+')

    // Debe tener un valor numérico o "Sin calibrar" o "—"
    const hasIndex = /\d+\.\d|Sin calibrar|—/.test(panelText)
    expect(hasIndex, 'Identidad debe mostrar índice numérico, "Sin calibrar" o "—"').toBe(true)
  })

  test('tab Identidad muestra nivel de juego', async ({ page }) => {
    const loaded = await gotoDashboardReady(page)
    test.fixme(!loaded, 'Vercel Security Checkpoint bloqueó el headless browser')

    const identidadTab = page.locator('button[role="tab"]').filter({ hasText: 'Identidad' })
    await expect(identidadTab).toBeVisible({ timeout: 15_000 })
    await identidadTab.dispatchEvent('click')
    await page.waitForTimeout(1000)

    const identidadPanel = page.locator('[role="tabpanel"]:not([aria-hidden="true"])')
    const panelText = await identidadPanel.innerText({ timeout: 10_000 })
    const levelNames = ['Principiante', 'Intermedio', 'Avanzado', 'Experto', 'Scratch', 'Elite', 'Bogey']
    const hasLevel = levelNames.some(l => panelText.includes(l))
    // Si no hay nivel, al menos debe mostrar progreso de calibración
    const hasCalibration = /calibr|rondas con|desbloquear/i.test(panelText)
    expect(hasLevel || hasCalibration, 'Identidad debe mostrar nivel de juego o progreso de calibración').toBe(true)
  })

  test('no muestra "Iniciar sesión" ni formulario de login', async ({ page }) => {
    const loaded = await gotoDashboardReady(page)
    test.fixme(!loaded, 'Vercel Security Checkpoint bloqueó el headless browser')

    const bodyText = await page.locator('body').innerText()
    const hasLoginCTA = /iniciar sesi[oó]n|^login$/im.test(bodyText)
    expect(hasLoginCTA, 'No debería verse CTA de login con sesión activa').toBe(false)
  })
})
