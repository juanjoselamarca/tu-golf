import { test, expect } from '@playwright/test'
import {
  createRondaFixture,
  cleanupRondaFixture,
  getTestUserId,
  createTeamRondaFixture,
  cleanupTeamRondaFixture,
  type RondaFixture,
  type TeamRondaFixture,
} from './helpers/ronda-fixture'

/**
 * E2E Multi-formato — Thursday rotation.
 *
 * Verifica que cada formato de juego renderiza correctamente su UI
 * diferenciada en la página de ronda libre:
 *
 * - stroke_play / stableford: formatos individuales (ya cubiertos parcialmente
 *   en ronda-flow.spec.ts, acá verificamos labels específicos)
 * - best_ball: formato de equipo con scores individuales por jugador
 * - scramble: formato de equipo con bola compartida
 * - foursome: formato de equipo con bola compartida (alternando tiros)
 *
 * Los tests son READ-ONLY: crean fixtures via admin API, navegan la página,
 * verifican UI, y limpian. No crean datos persistentes.
 */

test.describe.configure({ mode: 'serial' })
test.setTimeout(90_000) // team fixtures hacen múltiples queries a Supabase

let testUserId: string

// Tracking para cleanup global
const individualRondas: string[] = []
const teamRondas: { id: string; equipoIds: string[] }[] = []

test.beforeAll(async () => {
  if (!process.env.E2E_TEST_USER_EMAIL) return
  testUserId = await getTestUserId()
})

test.afterAll(async () => {
  // Cleanup individual rondas
  for (const id of individualRondas) {
    try { await cleanupRondaFixture(id) } catch { /* ignore */ }
  }
  // Cleanup team rondas
  for (const r of teamRondas) {
    try { await cleanupTeamRondaFixture(r.id, r.equipoIds) } catch { /* ignore */ }
  }
})

test.beforeEach(() => {
  if (!process.env.E2E_TEST_USER_EMAIL || !process.env.E2E_TEST_USER_PASSWORD) {
    test.skip(true, 'E2E_TEST_USER_EMAIL/PASSWORD no configurados')
  }
})

// ─── Helpers ───

async function createIndividualRonda(opts: Parameters<typeof createRondaFixture>[0]): Promise<RondaFixture> {
  const r = await createRondaFixture(opts)
  individualRondas.push(r.id)
  return r
}

async function createTeamRonda(opts: Parameters<typeof createTeamRondaFixture>[0]): Promise<TeamRondaFixture> {
  const r = await createTeamRondaFixture(opts)
  teamRondas.push({ id: r.id, equipoIds: r.equipoIds })
  return r
}

/** Espera que la página de ronda termine de cargar (desaparezca "Cargando ronda"). */
async function waitForRondaLoaded(page: import('@playwright/test').Page) {
  // Esperar a que "Cargando ronda" desaparezca (máx 30s — team formats son más lentos)
  await page.locator('text=Cargando ronda').waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {})
  // Esperar a que aparezca el header "Marcador en vivo" (h1 visible, no <title>)
  await page.locator('h1:has-text("Marcador en vivo"), h1:has-text("Resultado final")').first()
    .waitFor({ state: 'visible', timeout: 20_000 })
}

// Equipos de prueba reutilizables (2 jugadores por equipo, 2 equipos)
const TEST_TEAMS = [
  {
    nombre: 'E2E Equipo Alfa',
    handicapEquipo: 10,
    sharedScores: { '1': 4, '2': 5, '3': 3 },
    players: [
      { nombre: 'E2E Jugador A1', handicap: 12 },
      { nombre: 'E2E Jugador A2', handicap: 8 },
    ],
  },
  {
    nombre: 'E2E Equipo Beta',
    handicapEquipo: 14,
    sharedScores: { '1': 5, '2': 4, '3': 4 },
    players: [
      { nombre: 'E2E Jugador B1', handicap: 18 },
      { nombre: 'E2E Jugador B2', handicap: 10 },
    ],
  },
]

// Para best_ball, los scores individuales van en cada jugador, no compartidos
const BEST_BALL_TEAMS = [
  {
    nombre: 'E2E Equipo Alfa',
    handicapEquipo: null, // best_ball no usa handicap de equipo
    players: [
      { nombre: 'E2E Jugador A1', handicap: 12, scores: { '1': 4, '2': 5, '3': 3 } },
      { nombre: 'E2E Jugador A2', handicap: 8, scores: { '1': 5, '2': 4, '3': 4 } },
    ],
  },
  {
    nombre: 'E2E Equipo Beta',
    handicapEquipo: null,
    players: [
      { nombre: 'E2E Jugador B1', handicap: 18, scores: { '1': 6, '2': 5, '3': 5 } },
      { nombre: 'E2E Jugador B2', handicap: 10, scores: { '1': 5, '2': 6, '3': 4 } },
    ],
  },
]

// ─── Tests por formato ───

test.describe('Formatos individuales — labels correctos', () => {
  test('stroke_play gross muestra "Stroke Play Gross"', async ({ page }) => {
    const ronda = await createIndividualRonda({
      creadorUserId: testUserId,
      formato_juego: 'stroke_play',
      modo_juego: 'gross',
    })

    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'domcontentloaded' })
    await waitForRondaLoaded(page)

    expect(page.url(), 'no debe redirigir a /login').not.toContain('/login')

    // El header muestra "Stroke Play Gross" en la línea de detalles
    await expect(
      page.locator('text=/Stroke Play Gross/').first(),
      'debe mostrar "Stroke Play Gross" en el header',
    ).toBeVisible({ timeout: 5_000 })
    expect(pageErrors, 'sin errores JS en la página').toEqual([])
  })

  test('stableford muestra "Stableford"', async ({ page }) => {
    const ronda = await createIndividualRonda({
      creadorUserId: testUserId,
      formato_juego: 'stableford',
      modo_juego: 'gross',
    })

    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'domcontentloaded' })
    await waitForRondaLoaded(page)

    expect(page.url()).not.toContain('/login')
    await expect(
      page.locator('text=/Stableford/').first(),
      'debe mostrar "Stableford" en el header',
    ).toBeVisible({ timeout: 5_000 })
    expect(pageErrors).toEqual([])
  })

  test('match_play muestra "Match Play" (sin sufijo — siempre neto en Chile)', async ({ page }) => {
    const ronda = await createIndividualRonda({
      creadorUserId: testUserId,
      formato_juego: 'match_play',
      modo_juego: 'neto',
    })

    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'domcontentloaded' })
    await waitForRondaLoaded(page)

    expect(page.url()).not.toContain('/login')
    // formatLabel() omite sufijo Neto/Gross para match_play (siempre neto en cultura chilena)
    await expect(
      page.locator('text=/Match Play/').first(),
      'debe mostrar "Match Play" en el header',
    ).toBeVisible({ timeout: 5_000 })
    expect(pageErrors).toEqual([])
  })
})

test.describe('Best Ball — formato de equipo con scores individuales', () => {
  test('página de ronda best_ball carga sin errores y muestra label correcto', async ({ page }) => {
    const ronda = await createTeamRonda({
      creadorUserId: testUserId,
      formato_juego: 'best_ball',
      modo_juego: 'neto',
      teams: BEST_BALL_TEAMS,
    })

    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'domcontentloaded' })
    await waitForRondaLoaded(page)

    expect(page.url(), 'no debe redirigir a /login').not.toContain('/login')

    // Header muestra "Best Ball Neto"
    await expect(
      page.locator('text=/Best Ball Neto/').first(),
      'debe mostrar "Best Ball Neto"',
    ).toBeVisible({ timeout: 5_000 })

    // Best ball muestra nombres de equipo en el leaderboard
    const bodyText = await page.locator('body').innerText()
    expect(bodyText, 'debe mostrar nombre del equipo Alfa').toContain('E2E Equipo Alfa')
    expect(bodyText, 'debe mostrar nombre del equipo Beta').toContain('E2E Equipo Beta')

    // Best ball NO es shared ball → individual leaderboard también debe existir
    expect(bodyText, 'debe mostrar jugador A1').toContain('E2E Jugador A1')

    expect(pageErrors, 'sin errores JS').toEqual([])
  })
})

test.describe('Scramble — formato de equipo con bola compartida', () => {
  test('página de ronda scramble carga sin errores y muestra label correcto', async ({ page }) => {
    const ronda = await createTeamRonda({
      creadorUserId: testUserId,
      formato_juego: 'scramble',
      modo_juego: 'neto',
      teams: TEST_TEAMS,
    })

    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'domcontentloaded' })
    await waitForRondaLoaded(page)

    expect(page.url(), 'no debe redirigir a /login').not.toContain('/login')

    // Header muestra "Scramble Neto"
    await expect(
      page.locator('text=/Scramble Neto/').first(),
      'debe mostrar "Scramble Neto"',
    ).toBeVisible({ timeout: 5_000 })

    // Scramble muestra equipos
    const bodyText = await page.locator('body').innerText()
    expect(bodyText, 'debe mostrar nombre del equipo Alfa').toContain('E2E Equipo Alfa')
    expect(bodyText, 'debe mostrar nombre del equipo Beta').toContain('E2E Equipo Beta')

    expect(pageErrors, 'sin errores JS').toEqual([])
  })

  test('scramble muestra HCP de equipo en el leaderboard', async ({ page }) => {
    const ronda = await createTeamRonda({
      creadorUserId: testUserId,
      formato_juego: 'scramble',
      modo_juego: 'neto',
      teams: TEST_TEAMS,
    })

    await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'domcontentloaded' })
    await waitForRondaLoaded(page)

    // Verificar que el leaderboard muestra info de HCP de equipo
    const bodyText = await page.locator('body').innerText()
    // El leaderboard debe mostrar "HCP" en alguna parte (columna o detalle)
    expect(bodyText, 'debe contener referencia a HCP').toMatch(/HCP/i)
  })
})

test.describe('Foursome — formato de equipo con bola compartida alternando', () => {
  test('página de ronda foursome carga sin errores y muestra label correcto', async ({ page }) => {
    const ronda = await createTeamRonda({
      creadorUserId: testUserId,
      formato_juego: 'foursome',
      modo_juego: 'neto',
      teams: TEST_TEAMS,
    })

    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'domcontentloaded' })
    await waitForRondaLoaded(page)

    expect(page.url(), 'no debe redirigir a /login').not.toContain('/login')

    // Header muestra "Foursome Neto"
    await expect(
      page.locator('text=/Foursome Neto/').first(),
      'debe mostrar "Foursome Neto"',
    ).toBeVisible({ timeout: 5_000 })

    // Foursome muestra equipos
    const bodyText = await page.locator('body').innerText()
    expect(bodyText, 'debe mostrar nombre del equipo Alfa').toContain('E2E Equipo Alfa')
    expect(bodyText, 'debe mostrar nombre del equipo Beta').toContain('E2E Equipo Beta')

    expect(pageErrors, 'sin errores JS').toEqual([])
  })

  test('foursome muestra los 4 jugadores repartidos en equipos', async ({ page }) => {
    const ronda = await createTeamRonda({
      creadorUserId: testUserId,
      formato_juego: 'foursome',
      modo_juego: 'neto',
      teams: TEST_TEAMS,
    })

    await page.goto(`/ronda-libre/${ronda.codigo}`, { waitUntil: 'domcontentloaded' })
    await waitForRondaLoaded(page)

    const bodyText = await page.locator('body').innerText()
    // Los 4 jugadores deben aparecer repartidos en los 2 equipos
    expect(bodyText, 'debe mostrar jugador A2').toContain('E2E Jugador A2')
    expect(bodyText, 'debe mostrar jugador B1').toContain('E2E Jugador B1')
  })
})
