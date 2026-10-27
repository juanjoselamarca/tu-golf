import { test, expect } from '@playwright/test'
import { createEphemeralUser, deleteEphemeralUser } from './helpers/ronda-fixture'
import { createIndividualTournamentFixture, tarjeta } from './helpers/tournament-individual-fixture'

/**
 * E2E — Live polimórfico: /torneo/[slug]/en-vivo carga sin errores.
 *
 * La ruta es pública pero el leaderboard pide sesión: corre en el proyecto autenticado. Crea un torneo en curso de
 * 2 rondas (de un organizador efímero) en beforeAll y lo borra en afterAll.
 */

const TORNEO = 'E2E Copa En Vivo'
const RONDAS = 2
const JUGADORES = Array.from({ length: 3 }, (_, i) => ({ nombre: `E2E Live ${i + 1}`, handicap: 8 + i * 4, scores: tarjeta(9, 4, i) }))
let organizadorId = ''
let slug = ''

test.beforeAll(async () => {
  organizadorId = await createEphemeralUser('e2e-org-live')
  slug = await createIndividualTournamentFixture({
    organizerUserId: organizadorId, name: TORNEO, status: 'in_progress', totalRounds: RONDAS, players: JUGADORES,
  })
})

test.afterAll(async () => {
  const errs = organizadorId ? await deleteEphemeralUser(organizadorId) : []
  if (errs.length > 0) throw new Error(`Limpieza incompleta: ${errs.join(' · ')}`)
})

test.describe('Live polimórfico — /torneo/[slug]/en-vivo', () => {
  test('carga el header y el leaderboard del torneo', async ({ page }) => {
    const pageErrors: string[] = []
    const serverErrors: string[] = []
    page.on('pageerror', (err) => pageErrors.push(err.message))
    page.on('response', (res) => {
      if (res.status() >= 500) serverErrors.push(`${res.status()} ${res.url()}`)
    })

    await page.goto(`/torneo/${slug}/en-vivo`, { waitUntil: 'domcontentloaded' })

    await expect(page.getByRole('heading', { name: TORNEO })).toBeVisible({ timeout: 10_000 })
    for (const j of JUGADORES) await expect(page.getByRole('cell', { name: j.nombre })).toBeVisible()

    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})
    expect(pageErrors, 'pageerrors en /en-vivo').toEqual([])
    expect(serverErrors, '5xx en /en-vivo').toEqual([])
  })

  test('con total_rounds > 1 hay una tab por ronda más el acumulado', async ({ page }) => {
    await page.goto(`/torneo/${slug}/en-vivo`, { waitUntil: 'domcontentloaded' })

    const tabs = page.getByRole('tablist', { name: 'Vista por ronda' }).getByRole('tab')
    await expect(tabs).toHaveText(['Acumulado', ...Array.from({ length: RONDAS }, (_, i) => `Ronda ${i + 1}`)], { timeout: 10_000 })
  })
})
