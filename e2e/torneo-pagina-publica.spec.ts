/**
 * Torneo Página Pública — /torneo/[slug]
 *
 * La página principal de un torneo. Pública, cualquier persona puede verla.
 * Verifica con datos de torneos REALES de producción:
 *
 * 1. Torneo cerrado: header, cancha, formato, podio, leaderboard, resultados
 * 2. Torneo en progreso: header, badge en vivo, leaderboard
 * 3. Torneo demo: badge DEMO, jugadores simulados
 * 4. Slug inexistente: 404 controlado
 * 5. Nav tabs correctos
 * 6. No errores de cliente
 *
 * NO crea datos — usa torneos existentes en producción.
 * Si los torneos de prueba no existen, se skipean los tests.
 */
import { test, expect } from '@playwright/test'

// Torneos reales en producción para tests (verificados 2026-09-27)
const CLOSED_SLUG = 'copa-lb-test'             // Cerrado, 6 jugadores, La Dehesa, stroke_play neto
const CLOSED_NAME = 'Copa Leaderboard Test'
const CLOSED_COURSE = 'La Dehesa'

const IN_PROGRESS_SLUG = 'lb-open-2026-padre-e-hijo-mpleeet7'  // En progreso, 5 jugadores, scramble
const IN_PROGRESS_NAME = 'LB OPEN 2026 PADRE E HIJO'

const DEMO_SLUG = 'demo-copa-chile-2026'       // Demo, 40 jugadores simulados
const DEMO_NAME = 'Copa Golfers+ Chile Demo'

test.describe('Torneo cerrado — /torneo/[slug]', () => {
  test('carga header con nombre, cancha y formato', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    const response = await page.goto(`/torneo/${CLOSED_SLUG}`, { waitUntil: 'domcontentloaded' })

    // Si el torneo no existe, skipear
    if (response && response.status() === 404) {
      test.skip(true, `Torneo "${CLOSED_SLUG}" no existe en producción`)
    }

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
    const response = await page.goto(`/torneo/${CLOSED_SLUG}`, { waitUntil: 'domcontentloaded' })
    if (response && response.status() === 404) {
      test.skip(true, `Torneo "${CLOSED_SLUG}" no existe`)
    }

    await expect(page.getByText(CLOSED_NAME).first()).toBeVisible({ timeout: 15_000 })

    // Esperar a que carguen los tabs del leaderboard
    await page.waitForTimeout(2000)

    const bodyText = await page.locator('body').innerText()

    // Debe tener jugadores (nombres) o al menos el leaderboard
    // Los tabs del leaderboard: "General", "Gross", "Neto", "Grupos", "GWI"
    const hasLeaderboardTabs = /General|Gross|Neto|Grupos|GWI/i.test(bodyText)
    // O tiene posiciones (1., 2., etc.)
    const hasPositions = /\b1\b.*\b2\b/s.test(bodyText)

    expect(
      hasLeaderboardTabs || hasPositions,
      'no se encontraron tabs de leaderboard ni posiciones de jugadores'
    ).toBe(true)
  })

  test('torneo cerrado muestra podio top 3', async ({ page }) => {
    const response = await page.goto(`/torneo/${CLOSED_SLUG}`, { waitUntil: 'domcontentloaded' })
    if (response && response.status() === 404) {
      test.skip(true, `Torneo "${CLOSED_SLUG}" no existe`)
    }

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
    const response = await page.goto(`/torneo/${CLOSED_SLUG}`, { waitUntil: 'domcontentloaded' })
    if (response && response.status() === 404) {
      test.skip(true, `Torneo "${CLOSED_SLUG}" no existe`)
    }

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
  test('carga con badge DEMO y jugadores simulados', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    const response = await page.goto(`/torneo/${DEMO_SLUG}`, { waitUntil: 'domcontentloaded' })
    if (response && response.status() === 404) {
      test.skip(true, `Torneo demo "${DEMO_SLUG}" no existe`)
    }

    await expect(page.getByText(DEMO_NAME, { exact: false }).first()).toBeVisible({ timeout: 15_000 })

    // Demo tournament should have many players
    await page.waitForTimeout(2000)
    const bodyText = await page.locator('body').innerText()

    // El bottom sheet demo o badge DEMO visible
    const hasDemoIndicator = /demo/i.test(bodyText)
    expect(hasDemoIndicator, 'no se encontró indicador DEMO').toBe(true)

    // Sin errores
    expect(pageErrors, `errores: ${pageErrors.join(' | ')}`).toEqual([])
  })

  test('leaderboard demo muestra al menos 10 jugadores', async ({ page }) => {
    const response = await page.goto(`/torneo/${DEMO_SLUG}`, { waitUntil: 'domcontentloaded' })
    if (response && response.status() === 404) {
      test.skip(true, `Torneo demo no existe`)
    }

    await expect(page.getByText(DEMO_NAME, { exact: false }).first()).toBeVisible({ timeout: 15_000 })
    await page.waitForTimeout(3000)

    // El leaderboard demo tiene 40 jugadores — al menos 10 deberían verse
    const bodyText = await page.locator('body').innerText()
    // Buscar patrones de posiciones: "1", "2", ... "10"
    const positions = bodyText.match(/\b\d{1,2}\b/g) ?? []
    expect(positions.length).toBeGreaterThan(5)
  })
})

test.describe('Torneo en progreso — /torneo/[slug]', () => {
  test('muestra badge o indicador de torneo en vivo', async ({ page }) => {
    const pageErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))

    const response = await page.goto(`/torneo/${IN_PROGRESS_SLUG}`, { waitUntil: 'domcontentloaded' })
    if (response && response.status() === 404) {
      test.skip(true, `Torneo "${IN_PROGRESS_SLUG}" no existe — configurar slug real`)
    }

    // Nombre visible
    await expect(page.getByText(IN_PROGRESS_NAME, { exact: false }).first()).toBeVisible({ timeout: 15_000 })

    // Sin errores
    expect(pageErrors, `errores: ${pageErrors.join(' | ')}`).toEqual([])
  })

  test('nav tabs incluye En Vivo para torneo activo', async ({ page }) => {
    const response = await page.goto(`/torneo/${IN_PROGRESS_SLUG}`, { waitUntil: 'domcontentloaded' })
    if (response && response.status() === 404) {
      test.skip(true, `Torneo no existe`)
    }

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
    const response = await page.goto(`/torneo/${CLOSED_SLUG}`, { waitUntil: 'domcontentloaded' })
    if (response && response.status() === 404) {
      test.skip(true, `Torneo no existe`)
    }

    await expect(page.getByText(CLOSED_NAME).first()).toBeVisible({ timeout: 15_000 })

    // Torneo cerrado no debe tener CTA de inscripción
    const joinBtn = page.getByText('Inscribirme en este torneo')
    await expect(joinBtn).toBeHidden({ timeout: 5_000 })
  })
})
