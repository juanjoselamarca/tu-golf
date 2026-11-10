import { test, expect } from '@playwright/test'
import { adminClient, createEphemeralUser, DEFAULT_COURSE_ID, deleteEphemeralUser, sinError, sufijo } from './helpers/ronda-fixture'
import { createIndividualTournamentFixture, tarjeta } from './helpers/tournament-individual-fixture'

/**
 * Empates estilo golf a 390 px (PR #770): con 12 jugadores, tres empatados en el décimo lugar se leen "T10"
 * sin cortarse en la columna de posición del torneo en vivo y del modo TV. Deja capturas en test-results/.
 * A mitad de vuelta (9 de 18 hoyos) el countback no corre: el empate se muestra como tal.
 */

let organizadorId = ''
let SLUG = ''
let SLUG_TV = ''

/**
 * El modo TV lee el grafo de inscritos (players → rounds → hole_scores), no las rondas libres de los grupos:
 * para él se arma un torneo con ese grafo y los mismos golpes.
 */
async function crearTorneoLegado(organizerUserId: string, golpes: Array<Record<string, number>>): Promise<string> {
  const sb = adminClient()
  const slug = `e2e-torneo-tv-${sufijo()}`
  const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
  const t = await sinError('insert tournaments', sb.from('tournaments').insert({
    name: 'E2E Copa Empates TV', slug, organizer_id: organizerUserId, course_id: DEFAULT_COURSE_ID, course_name: 'Los Leones',
    date_start: fecha, format: 'stroke_play', formato_juego: 'stroke_play', modo_juego: 'gross', hole_count: 18,
    status: 'in_progress', total_rounds: 1, es_demo: true,
  }).select('id').single()) as { id: string }
  for (let i = 0; i < golpes.length; i++) {
    const p = await sinError('insert players', sb.from('players').insert({
      tournament_id: t.id, pending_user_id: crypto.randomUUID(), player_name: `E2E Jugador ${String(i + 1).padStart(2, '0')}`, status: 'approved', handicap_at_registration: 10,
    }).select('id').single()) as { id: string }
    const r = await sinError('insert rounds', sb.from('rounds').insert({
      tournament_id: t.id, player_id: p.id, round_number: 1, status: 'in_progress',
    }).select('id').single()) as { id: string }
    await sinError('insert hole_scores', sb.from('hole_scores').insert(
      Object.entries(golpes[i]).map(([hoyo, g]) => ({ round_id: r.id, hole_number: Number(hoyo), par: 4, gross_score: g })),
    ).select('id'))
  }
  return slug
}

test.beforeAll(async () => {
  organizadorId = await createEphemeralUser('e2e-org-t10')
  // Nueve jugadores con golpes distintos (36..44) y tres con 45: los tres últimos quedan T10.
  const players = Array.from({ length: 12 }, (_, i) => ({
    nombre: `E2E Jugador ${String(i + 1).padStart(2, '0')}`,
    handicap: 10,
    scores: tarjeta(9, 4, Math.min(i, 9)),
  }))
  SLUG = await createIndividualTournamentFixture({
    organizerUserId: organizadorId, name: 'E2E Copa Empates', status: 'in_progress', modo: 'gross', esDemo: true, players,
  })
  SLUG_TV = await crearTorneoLegado(organizadorId, players.map((p) => p.scores))
})

test.afterAll(async () => {
  const errs = organizadorId ? await deleteEphemeralUser(organizadorId) : []
  if (errs.length > 0) throw new Error(`Limpieza incompleta: ${errs.join(' · ')}`)
})

test.use({ viewport: { width: 390, height: 1100 } })

test('torneo en vivo: T10 cabe en la columna de posición', async ({ page }) => {
  await page.goto(`/torneo/${SLUG}/en-vivo`)
  const t10 = page.locator('tbody tr td:first-child', { hasText: /^T10$/ })
  await expect(t10.first()).toBeVisible({ timeout: 20_000 })
  await expect(t10).toHaveCount(3)
  for (let i = 0; i < 3; i++) {
    const celda = t10.nth(i)
    const { scrollWidth, clientWidth } = await celda.evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  }
  await page.screenshot({ path: 'test-results/empates-t10/en-vivo-390.png', fullPage: true })
  await page.emulateMedia({ colorScheme: 'light' })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
  await page.screenshot({ path: 'test-results/empates-t10/en-vivo-390-claro.png', fullPage: true })
})

test('modo TV: T10 cabe en la columna de posición', async ({ page }) => {
  await page.goto(`/torneo/${SLUG_TV}/tv`)
  const t10 = page.getByText(/^T10$/)
  await expect(t10.first()).toBeVisible({ timeout: 20_000 })
  const { scrollWidth, clientWidth } = await t10.first().evaluate((el) => ({ scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }))
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
  await page.screenshot({ path: 'test-results/empates-t10/tv-390.png', fullPage: true })
})
