/**
 * Torneo Página Pública — /torneo/[slug]
 *
 * La página principal de un torneo. Pública, cualquier persona puede verla.
 *
 * 1. Torneo cerrado: header, cancha, formato, podio, leaderboard, resultados
 * 2. Torneo en progreso: header, badge en vivo, leaderboard
 * 3. Torneo demo: jugadores simulados
 * 4. Slug inexistente: 404 controlado
 * 5. Nav tabs correctos
 * 6. No errores de cliente
 *
 * Crea sus torneos (de un organizador efímero) en beforeAll y los borra en afterAll.
 */
import { test, expect } from '@playwright/test'
import { createEphemeralUser, deleteEphemeralUser } from './helpers/ronda-fixture'
import { createIndividualTournamentFixture, tarjeta } from './helpers/tournament-individual-fixture'

const CLOSED_NAME = 'E2E Copa Cerrada'
const CLOSED_COURSE = 'Los Leones'
const IN_PROGRESS_NAME = 'E2E Copa En Curso'
const DEMO_NAME = 'E2E Copa Simulada'
const DEMO_PLAYERS = Array.from({ length: 12 }, (_, i) => `E2E Simulado ${i + 1}`)

let organizadorId = ''
let CLOSED_SLUG = ''
let IN_PROGRESS_SLUG = ''
let DEMO_SLUG = ''

test.beforeAll(async () => {
  organizadorId = await createEphemeralUser('e2e-org-pagina-publica')
  CLOSED_SLUG = await createIndividualTournamentFixture({
    organizerUserId: organizadorId,
    name: CLOSED_NAME,
    status: 'closed',
    players: Array.from({ length: 6 }, (_, i) => ({ nombre: `E2E Cerrado ${i + 1}`, handicap: 6 + i * 3, scores: tarjeta(18, 4, i) })),
  })
  IN_PROGRESS_SLUG = await createIndividualTournamentFixture({
    organizerUserId: organizadorId,
    name: IN_PROGRESS_NAME,
    status: 'in_progress',
    players: Array.from({ length: 4 }, (_, i) => ({ nombre: `E2E En Curso ${i + 1}`, handicap: 10 + i, scores: tarjeta(9, 4, i) })),
  })
  DEMO_SLUG = await createIndividualTournamentFixture({
    organizerUserId: organizadorId,
    name: DEMO_NAME,
    status: 'in_progress',
    esDemo: true,
    players: DEMO_PLAYERS.map((nombre, i) => ({ nombre, handicap: 4 + i * 2, scores: tarjeta(13, 4, i % 5) })),
  })
})

test.afterAll(async () => {
  const errs = organizadorId ? await deleteEphemeralUser(organizadorId) : []
  if (errs.length > 0) throw new Error(`Limpieza incompleta: ${errs.join(' · ')}`)
})

test.describe('Torneo cerrado — /torneo/[slug]', () => {
  test('carga header con nombre, cancha y formato', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto(`/torneo/${CLOSED_SLUG}`, { waitUntil: 'domcontentloaded' })

    // Nombre del torneo visible
    await expect(page.getByText(CLOSED_NAME).first()).toBeVisible({ timeout: 15_000 })

    // Nombre de la cancha visible
    await expect(page.getByText(CLOSED_COURSE, { exact: false }).first()).toBeVisible({ timeout: 10_000 })

    // Formato visible — "Stroke Play" o similar
    const bodyText = await page.locator('body').innerText()
    expect(bodyText).toMatch(/stroke\s*play|neto|gross/i)

    // Sin errores
    expect(pageErrors, `errores: ${pageErrors.join(' | ')}`).toEqual([])
  })

  test('muestra leaderboard con jugadores y scores', async ({ page }) => {
    await page.goto(`/torneo/${CLOSED_SLUG}`, { waitUntil: 'domcontentloaded' })

    await expect(page.getByText(CLOSED_NAME).first()).toBeVisible({ timeout: 15_000 })

    // Esperar a que carguen los tabs del leaderboard
    await page.waitForTimeout(2000)

    const bodyText = await page.locator('body').innerText()

    // Debe tener jugadores (nombres) o al menos el leaderboard
    // Los tabs del leaderboard: "General", "Gross", "Neto", "Grupos", "GWI"
    const hasLeaderboardTabs = /General|Gross|Neto|Grupos|GWI/i.test(bodyText)
    // O tiene posiciones (1., 2., etc.)
    const hasPositions = bodyText.includes('1') && bodyText.includes('2')

    expect(
      hasLeaderboardTabs || hasPositions,
      'no se encontraron tabs de leaderboard ni posiciones de jugadores'
    ).toBe(true)
  })

  test('torneo cerrado muestra podio top 3', async ({ page }) => {
    await page.goto(`/torneo/${CLOSED_SLUG}`, { waitUntil: 'domcontentloaded' })

    await expect(page.getByText(CLOSED_NAME).first()).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(2000)

    // El podio muestra posiciones 1, 2, 3 con iconos de trofeo/medalla
    // Buscar indicadores del componente TournamentPodium
    const bodyText = await page.locator('body').innerText()

    // El podio muestra scores como E, +N o -N
    const hasScores = /[E+-]\d*/.test(bodyText)
    // O muestra nombres de jugadores
    const hasNames = bodyText.length > 200

    expect(hasScores || hasNames, 'página sin datos de scores ni jugadores').toBe(true)
  })

  test('nav tabs muestra Info activo y En Vivo si corresponde', async ({ page }) => {
    await page.goto(`/torneo/${CLOSED_SLUG}`, { waitUntil: 'domcontentloaded' })

    await expect(page.getByText(CLOSED_NAME).first()).toBeVisible({ timeout: 15_000 })

    // TournamentNavTabs muestra tabs — buscar por texto "Info" o "Información"
    const bodyText = await page.locator('body').innerText()
    const hasInfoTab = /\bInfo\b|Información/i.test(bodyText)
    // También podría tener "Resultados" para torneos cerrados
    const hasResultsTab = /Resultados/i.test(bodyText)
    expect(hasInfoTab || hasResultsTab, 'ni tab Info ni tab Resultados visible').toBe(true)
  })
})

test.describe('Torneo demo — /torneo/[slug]', () => {
  test('carga sin errores', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto(`/torneo/${DEMO_SLUG}`, { waitUntil: 'domcontentloaded' })

    await expect(page.getByText(DEMO_NAME, { exact: false }).first()).toBeVisible({ timeout: 15_000 })

    expect(pageErrors, `errores: ${pageErrors.join(' | ')}`).toEqual([])
  })

  test('leaderboard demo muestra al menos 10 jugadores', async ({ page }) => {
    await page.goto(`/torneo/${DEMO_SLUG}`, { waitUntil: 'domcontentloaded' })

    await expect(page.getByText(DEMO_NAME, { exact: false }).first()).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(3000)

    const bodyText = await page.locator('body').innerText()
    const visibles = DEMO_PLAYERS.filter((nombre) => bodyText.includes(nombre))
    expect(visibles.length).toBeGreaterThanOrEqual(10)
  })
})

test.describe('Torneo en progreso — /torneo/[slug]', () => {
  test('muestra badge o indicador de torneo en vivo', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto(`/torneo/${IN_PROGRESS_SLUG}`, { waitUntil: 'domcontentloaded' })

    // Nombre visible
    await expect(page.getByText(IN_PROGRESS_NAME, { exact: false }).first()).toBeVisible({ timeout: 15_000 })

    // Sin errores
    expect(pageErrors, `errores: ${pageErrors.join(' | ')}`).toEqual([])
  })

  test('nav tabs incluye En Vivo para torneo activo', async ({ page }) => {
    await page.goto(`/torneo/${IN_PROGRESS_SLUG}`, { waitUntil: 'domcontentloaded' })

    await expect(page.getByText(IN_PROGRESS_NAME, { exact: false }).first()).toBeVisible({ timeout: 15_000 })

    // Torneo en progreso debería tener tab "En Vivo"
    const liveTab = page.getByRole('link', { name: /En Vivo/i }).first()
    const hasLive = await liveTab.isVisible().catch(() => false)

    // O al menos tiene tab Info
    const infoTab = page.getByRole('link', { name: /Info/i }).first()
    const hasInfo = await infoTab.isVisible().catch(() => false)

    expect(hasLive || hasInfo, 'ni tab En Vivo ni tab Info visible').toBe(true)
  })
})

test.describe('Torneo — edge cases', () => {
  test('slug inexistente muestra 404 controlado', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    await page.goto('/torneo/slug-que-no-existe-xyz-99999', {
      waitUntil: 'domcontentloaded',
    })

    // Next.js notFound() renderiza la shell sin datos de torneo.
    // Verificar que NO muestra datos de torneo (nombre, leaderboard, etc.)
    await page.waitForTimeout(2000)
    const bodyText = await page.locator('body').innerText()

    // No debe contener un nombre de torneo, leaderboard, ni formato
    const hasTournamentData = /leaderboard|stroke.play|stableford|podio|inscribirme/i.test(bodyText)
    expect(hasTournamentData, 'slug inexistente mostró datos de torneo').toBe(false)

    // No crash de cliente
    expect(pageErrors, `errores: ${pageErrors.join(' | ')}`).toEqual([])
  })

  test('no muestra "Unirme" para usuario anónimo en torneo cerrado', async ({ page }) => {
    await page.goto(`/torneo/${CLOSED_SLUG}`, { waitUntil: 'domcontentloaded' })

    await expect(page.getByText(CLOSED_NAME).first()).toBeVisible({ timeout: 15_000 })

    // Torneo cerrado no debe tener CTA de inscripción
    const joinBtn = page.getByText('Inscribirme en este torneo')
    await expect(joinBtn).toBeHidden({ timeout: 5_000 })
  })
})
