import { test, expect, type Page } from '@playwright/test'
import {
  adminClient,
  getTestUserId,
  createEphemeralUser,
  deleteEphemeralUser,
  sinError,
  sufijo,
} from './helpers/ronda-fixture'
import { exigirBaseDePruebas } from './helpers/base-de-pruebas'

/**
 * "Anotar mi score →" en /torneo/[slug] — el jugador inscrito llega a su scorer (PR #567, hunter 16-oct-2026).
 *
 * Antes ninguna pantalla llevaba al jugador inscrito a anotar su tarjeta: solo veía "Ver leaderboard". El botón
 * aparece SOLO si `visorPuedeAnotar` (inscrito, no retirado/DQ, torneo active/in_progress, no demo) y su destino
 * es el scorer que lee el leaderboard (`destinoDelScorer`): la ronda libre de su grupo si el torneo usa rondas de
 * grupo; `/torneo/[slug]/score` si es legacy; sin botón si su ronda ya está finalizada.
 *
 * Fixture realista: el organizador es OTRO usuario (efímero), así la página lee la inscripción del visor con SU
 * sesión y la RLS de `players` / `rondas_libres` es la de un jugador cualquiera, no la del dueño del torneo.
 * SOLO corre en la base de pruebas (`scripts/test-db/e2e-local.mjs`): siembra un torneo en curso público, que en prod
 * se vería en /en-vivo. Contra prod se corta en beforeAll. Todo se borra en afterAll.
 */

const CTA = /Anotar mi score/

async function abrirTorneo(page: Page, slug: string) {
  const res = await page.goto(`/torneo/${slug}`)
  expect(res?.status(), 'la página pública del torneo responde').toBeLessThan(400)
  // El nombre del torneo confirma que se renderizó ESTE torneo (no un 404 ni un error genérico).
  await expect(page.getByText(nombreTorneo).first()).toBeVisible()
}

const slug = `e2e-anotar-${sufijo()}`
const nombreTorneo = `E2E Anotar ${slug.slice(-8)}`
let organizadorId = ''
let tournamentId = ''
let playerId = ''
let rondaId = ''
let rondaCodigo = ''
let grupoId = ''

test.describe.configure({ mode: 'serial' })

test.describe('Torneo: "Anotar mi score" lleva al jugador inscrito a su scorer', () => {
  test.beforeAll(async () => {
    exigirBaseDePruebas('torneo-anotar-mi-score.spec.ts')
    const admin = adminClient()
    const testUserId = await getTestUserId()
    organizadorId = await createEphemeralUser('e2e-org-anotar')

    const t = await sinError('insert tournaments', admin.from('tournaments').insert({
      name: nombreTorneo,
      slug,
      organizer_id: organizadorId,
      course_name: 'Los Leones',
      date_start: new Date().toISOString().slice(0, 10),
      format: 'stroke_play',
      hole_count: 18,
      status: 'in_progress',
    }).select('id').single())
    tournamentId = (t as { id: string }).id

    const p = await sinError('insert players', admin.from('players').insert({
      tournament_id: tournamentId,
      user_id: testUserId,
      status: 'approved',
      handicap_at_registration: 15,
    }).select('id').single())
    playerId = (p as { id: string }).id
  })

  test.afterAll(async () => {
    const admin = adminClient()
    const errs: string[] = []
    // tournaments arrastra players, rounds, tournament_groups y tournament_group_players (ON DELETE CASCADE).
    // tournament_groups.ronda_libre_id es NO ACTION: la ronda se borra DESPUÉS del torneo.
    if (tournamentId) {
      const { error } = await admin.from('tournaments').delete().eq('id', tournamentId)
      if (error) errs.push(`tournaments: ${error.message}`)
    }
    if (rondaId) {
      const { error } = await admin.from('rondas_libres').delete().eq('id', rondaId)
      if (error) errs.push(`rondas_libres: ${error.message}`)
    }
    // Con el torneo o la ronda sin borrar, el organizador sigue referenciado: se deja y se avisa su id.
    if (organizadorId && errs.length === 0) errs.push(...(await deleteEphemeralUser(organizadorId)))
    else if (organizadorId) errs.push(`usuario efímero sin borrar: ${organizadorId}`)
    if (errs.length) console.warn(`[torneo-anotar-mi-score] cleanup parcial:\n  ${errs.join('\n  ')}`)
  })

  test('legacy en curso: el inscrito ve el botón y llega al scorer del torneo', async ({ page }) => {
    await abrirTorneo(page, slug)
    const cta = page.getByRole('link', { name: CTA })
    await expect(cta).toBeVisible()
    await expect(cta).toHaveAttribute('href', `/torneo/${slug}/score`)

    // Uso en cancha: el blanco táctil mide ≥ 44 px de alto.
    const box = await cta.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)

    await cta.click()
    await expect(page).toHaveURL(new RegExp(`/torneo/${slug}/score$`))
    await expect(page.getByRole('heading', { name: nombreTorneo })).toBeVisible()
    // El scorer cargó el roster CON este jugador (HCP de inscripción sembrado = 15), no un error ni un roster vacío.
    await expect(page.getByRole('heading', { name: '¿Quién eres?' })).toBeVisible()
    await expect(page.getByRole('button', { name: /HCP 15/ })).toBeVisible()
    await expect(page.getByText('No pudimos cargar el torneo')).toHaveCount(0)
  })

  test('sin sesión: el visitante anónimo no ve el botón', async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } })
    const page = await ctx.newPage()
    try {
      await abrirTorneo(page, slug)
      await expect(page.getByRole('link', { name: CTA })).toHaveCount(0)
    } finally {
      await ctx.close()
    }
  })

  test('torneo abierto (aún no empieza): no hay botón', async ({ page }) => {
    const admin = adminClient()
    await sinError('torneo → open', admin.from('tournaments').update({ status: 'open' }).eq('id', tournamentId))
    try {
      await abrirTorneo(page, slug)
      await expect(page.getByRole('link', { name: CTA })).toHaveCount(0)
      // Con inscripción abierta, al YA inscrito no se le ofrece inscribirse de nuevo (aquí sí discrimina:
      // con el torneo en curso el link no sale para nadie).
      await expect(page.getByRole('link', { name: /Inscribirme en este torneo/ })).toHaveCount(0)
    } finally {
      await sinError('torneo → in_progress', admin.from('tournaments').update({ status: 'in_progress' }).eq('id', tournamentId))
    }
  })

  test('torneo cerrado: no hay botón', async ({ page }) => {
    const admin = adminClient()
    await sinError('torneo → closed', admin.from('tournaments').update({ status: 'closed' }).eq('id', tournamentId))
    try {
      await abrirTorneo(page, slug)
      await expect(page.getByRole('link', { name: CTA })).toHaveCount(0)
    } finally {
      await sinError('torneo → in_progress', admin.from('tournaments').update({ status: 'in_progress' }).eq('id', tournamentId))
    }
  })

  test('jugador retirado: no hay botón', async ({ page }) => {
    const admin = adminClient()
    await sinError('player → withdrawn', admin.from('players').update({ status: 'withdrawn' }).eq('id', playerId))
    try {
      await abrirTorneo(page, slug)
      await expect(page.getByRole('link', { name: CTA })).toHaveCount(0)
    } finally {
      await sinError('player → approved', admin.from('players').update({ status: 'approved' }).eq('id', playerId))
    }
  })

  test('jugador descalificado: no hay botón', async ({ page }) => {
    const admin = adminClient()
    await sinError('player → disqualified', admin.from('players').update({ status: 'disqualified' }).eq('id', playerId))
    try {
      await abrirTorneo(page, slug)
      await expect(page.getByRole('link', { name: CTA })).toHaveCount(0)
    } finally {
      await sinError('player → approved', admin.from('players').update({ status: 'approved' }).eq('id', playerId))
    }
  })

  test('torneo demo: no hay botón (los demo son solo para mirar)', async ({ page }) => {
    const admin = adminClient()
    await sinError('torneo → demo', admin.from('tournaments').update({ es_demo: true }).eq('id', tournamentId))
    try {
      await abrirTorneo(page, slug)
      await expect(page.getByRole('link', { name: CTA })).toHaveCount(0)
    } finally {
      await sinError('torneo → no demo', admin.from('tournaments').update({ es_demo: false }).eq('id', tournamentId))
    }
  })

  test('con rondas de grupo: el botón lleva a la ronda libre de SU grupo', async ({ page }) => {
    const admin = adminClient()
    const testUserId = await getTestUserId()
    rondaCodigo = sufijo().slice(0, 6).toUpperCase()
    const r = await sinError('insert rondas_libres', admin.from('rondas_libres').insert({
      codigo: rondaCodigo,
      course_id: 'b1b6ba60-18f0-48a8-97c2-ef10e25fbe26',
      course_name: 'Los Leones',
      tees: 'blanco',
      holes: 18,
      fecha: new Date().toISOString().slice(0, 10),
      hoyo_inicio: 1,
      formato_juego: 'stroke_play',
      modo_juego: 'gross',
      admin_mode: false,
      estado: 'en_curso',
      creador_id: organizadorId,
    }).select('id').single())
    rondaId = (r as { id: string }).id

    // Como la materialización real del torneo: el jugador está en la ronda de su grupo con su user_id.
    await sinError('insert ronda_libre_jugadores', admin.from('ronda_libre_jugadores').insert({
      ronda_id: rondaId, user_id: testUserId, nombre: 'E2E Jugador', handicap: 15, tees: 'blanco', scores: {},
    }))
    const g = await sinError('insert tournament_groups', admin.from('tournament_groups').insert({
      tournament_id: tournamentId, name: 'Grupo 1', ronda_libre_id: rondaId, sort_order: 0,
    }).select('id').single())
    grupoId = (g as { id: string }).id
    await sinError('insert tournament_group_players', admin.from('tournament_group_players').insert({
      group_id: grupoId, player_id: playerId,
    }))

    await abrirTorneo(page, slug)
    const cta = page.getByRole('link', { name: CTA })
    await expect(cta).toBeVisible()
    // El scorer legacy NO: su score no aparecería en este leaderboard (lee las rondas de grupo).
    await expect(cta).toHaveAttribute('href', `/ronda-libre/${rondaCodigo}/score`)
  })

  test('con rondas de grupo y el inscrito sin grupo: no hay botón (ningún scorer suyo se vería)', async ({ page }) => {
    test.skip(!grupoId, 'depende de la ronda de grupo del test anterior')
    const admin = adminClient()
    await sinError('sacar del grupo', admin.from('tournament_group_players').delete().eq('group_id', grupoId).eq('player_id', playerId))
    try {
      await abrirTorneo(page, slug)
      // No cae al scorer legacy: su score no aparecería en un leaderboard que lee las rondas de grupo.
      await expect(page.getByRole('link', { name: CTA })).toHaveCount(0)
    } finally {
      await sinError('volver al grupo', admin.from('tournament_group_players').insert({ group_id: grupoId, player_id: playerId }))
    }
  })

  test('con rondas de grupo y su ronda finalizada: no hay botón', async ({ page }) => {
    test.skip(!rondaId, 'depende de la ronda de grupo del test anterior')
    const admin = adminClient()
    await sinError('ronda → finalizada', admin.from('rondas_libres').update({ estado: 'finalizada' }).eq('id', rondaId))
    await abrirTorneo(page, slug)
    await expect(page.getByRole('link', { name: CTA })).toHaveCount(0)
  })
})
