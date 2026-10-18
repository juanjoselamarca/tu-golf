import { test, expect, type Page } from '@playwright/test'
import {
  adminClient,
  getTestUserId,
  createEphemeralUser,
  deleteEphemeralUser,
  sinError,
  sufijo,
  DEFAULT_COURSE_ID,
} from './helpers/ronda-fixture'
import { exigirBaseDePruebas } from './helpers/base-de-pruebas'

/**
 * Scorer del jugador en un torneo (/torneo/[slug]/score) según el estado del torneo — protege #588 (hunter 18-oct-2026).
 *
 * Antes, en un torneo con inscripciones abiertas el scorer dejaba escribir, `/api/game` respondía 409 y el aviso decía
 * "Torneo cerrado — ya no acepta scores" sobre un torneo que faltaban dos meses para jugar. Ahora:
 *  - borrador / inscripciones abiertas → "El torneo todavía no empieza." y la tarjeta deshabilitada desde la carga;
 *  - cuando el organizador lo inicia, el scorer se habilita SOLO (consulta cada 30 s y al volver a la pestaña) y
 *    vuelve a resolver la cancha: si el organizador la corrigió antes de iniciar, se puntúa con la nueva;
 *  - cerrado / publicado → "Torneo cerrado." y la tarjeta en sólo lectura con lo ya anotado;
 *  - si se cierra mientras el jugador anota, el 409 bloquea la tarjeta y el golpe NO se guarda.
 *
 * El "inicio" se simula con lo que deja `startTournament` en un torneo legacy (sin grupos): status 'in_progress' y
 * la tarjeta `rounds` de la ronda 1 por jugador. El organizador es OTRO usuario (efímero): la página lee con la RLS
 * de un jugador cualquiera. SOLO corre en la base de pruebas (`scripts/test-db/e2e-local.mjs`): un torneo en curso
 * público se vería en /en-vivo de prod. Contra prod se corta en beforeAll. Todo se borra en afterAll.
 */

const AVISO_NO_EMPIEZA = /El torneo todavía no empieza\./
const AVISO_CERRADO = /Torneo cerrado\./

const slug = `e2e-sinempezar-${sufijo()}`
const nombreTorneo = `E2E Sin Empezar ${slug.slice(-8)}`
let organizadorId = ''
let tournamentId = ''
let playerId = ''

/** Cancha A (la del torneo al crearlo) y B (la "corregida" antes de iniciar): distinto par en el hoyo 1. */
const canchaA = { id: DEFAULT_COURSE_ID, nombre: '', parHoyo1: 0, siHoyo1: 0 }
const canchaB = { id: '', nombre: '', parHoyo1: 0, siHoyo1: 0 }

/**
 * "Par X · SI Y" del hoyo 1. Si el hoyo no se resolvió, la pantalla cae a "Par 4" sin SI (`hole?.par ?? 4`): sólo
 * el SI prueba que se cargó ESA cancha (el hoyo 1 de la cancha A es par 4, el mismo valor del default).
 */
function textoHoyo1(c: { parHoyo1: number; siHoyo1: number }): RegExp {
  return new RegExp(`^Par ${c.parHoyo1} · SI ${c.siHoyo1}$`)
}

/** Deja el torneo en `status` con la cancha `cancha`, sin tarjetas ni scores (cada test parte de cero). */
async function prepararTorneo(status: string, cancha: { id: string; nombre: string }) {
  const admin = adminClient()
  // rounds arrastra hole_scores (ON DELETE CASCADE).
  await sinError('delete rounds', admin.from('rounds').delete().eq('tournament_id', tournamentId).select('id'))
  await sinError('update tournaments', admin.from('tournaments')
    .update({ status, course_id: cancha.id, course_name: cancha.nombre }).eq('id', tournamentId).select('id'))
}

/** Lo que deja el inicio de un torneo legacy: tarjeta de la ronda 1 + status 'in_progress'. → id de la tarjeta. */
async function crearTarjetaRonda1(): Promise<string> {
  const r = await sinError('insert rounds', adminClient().from('rounds').insert({
    tournament_id: tournamentId, player_id: playerId, round_number: 1, status: 'in_progress',
  }).select('id').single())
  return (r as { id: string }).id
}

async function iniciarTorneo(cancha?: { id: string; nombre: string }): Promise<string> {
  const roundId = await crearTarjetaRonda1()
  const cambios: Record<string, unknown> = { status: 'in_progress' }
  if (cancha) Object.assign(cambios, { course_id: cancha.id, course_name: cancha.nombre })
  await sinError('iniciar torneo', adminClient().from('tournaments').update(cambios).eq('id', tournamentId).select('id'))
  return roundId
}

async function scoresDe(roundId: string) {
  const { data, error } = await adminClient().from('hole_scores')
    .select('hole_number, gross_score, par').eq('round_id', roundId).order('hole_number')
  if (error) throw new Error(`hole_scores: ${error.message}`)
  return (data ?? []) as Array<{ hole_number: number; gross_score: number | null; par: number | null }>
}

/** Abre el scorer y elige al jugador (el usuario con sesión no se autoselecciona: eso es sólo del invitado). */
async function abrirScorer(page: Page) {
  const res = await page.goto(`/torneo/${slug}/score`)
  expect(res?.status(), 'el scorer del torneo responde').toBeLessThan(400)
  await expect(page.getByRole('heading', { name: nombreTorneo })).toBeVisible()
  await expect(page.getByRole('heading', { name: '¿Quién eres?' })).toBeVisible()
  await page.getByRole('button', { name: /HCP 15/ }).click()
  await expect(page.getByRole('button', { name: /Cambiar jugador/ })).toBeVisible()
}

function inputsDeHoyos(page: Page) {
  return page.locator('input[type="number"]')
}

/** Fila del hoyo N (el texto "Hoyo N" exacto, no "Hoyo 1" dentro de "Hoyo 10"). */
function filaHoyo(page: Page, n: number) {
  return page.locator('div', { has: page.getByText(`Hoyo ${n}`, { exact: true }) })
    .filter({ has: page.locator('input[type="number"]') }).last()
}

async function esperarTarjetaBloqueada(page: Page) {
  await expect(inputsDeHoyos(page)).toHaveCount(18)
  const inputs = await inputsDeHoyos(page).all()
  for (const [i, input] of inputs.entries()) await expect(input, `hoyo ${i + 1} deshabilitado`).toBeDisabled()
}

test.describe.configure({ mode: 'serial' })

test.describe('Torneo: el scorer del jugador según el estado del torneo (#588)', () => {
  test.beforeAll(async () => {
    exigirBaseDePruebas('torneo-score-sin-empezar.spec.ts')
    const admin = adminClient()
    const testUserId = await getTestUserId()

    const hA = await sinError('course_holes hoyo 1 A', admin.from('course_holes')
      .select('par, stroke_index').eq('course_id', canchaA.id).eq('numero', 1).single()) as { par: number; stroke_index: number | null }
    if (hA.stroke_index == null) throw new Error('el hoyo 1 de la cancha A no tiene SI: el test no la distinguiría del default')
    const a = await sinError('courses A', admin.from('courses').select('nombre').eq('id', canchaA.id).single())
    Object.assign(canchaA, { nombre: (a as { nombre: string }).nombre, parHoyo1: hA.par, siHoyo1: hA.stroke_index })
    // Cancha B: de 18 hoyos, con OTRO par en el hoyo 1 (ni el de A ni el default 4) y SI, para que la pantalla y la
    // base delaten tanto la cancha vieja como una cancha sin resolver.
    const candidatas = await sinError('course_holes candidatas', admin.from('course_holes')
      .select('course_id, par, stroke_index').eq('numero', 1)
      .not('par', 'in', `(${canchaA.parHoyo1},4)`).not('stroke_index', 'is', null).limit(20))
    for (const c of candidatas as Array<{ course_id: string; par: number; stroke_index: number }>) {
      const { count } = await admin.from('course_holes').select('numero', { count: 'exact', head: true }).eq('course_id', c.course_id)
      if (count !== 18) continue
      const b = await sinError('courses B', admin.from('courses').select('nombre').eq('id', c.course_id).single())
      Object.assign(canchaB, { id: c.course_id, nombre: (b as { nombre: string }).nombre, parHoyo1: c.par, siHoyo1: c.stroke_index })
      break
    }
    if (!canchaB.id) throw new Error('la base de pruebas no tiene una cancha de 18 hoyos con otro par (≠4) en el hoyo 1')

    organizadorId = await createEphemeralUser('e2e-org-sinempezar')
    const t = await sinError('insert tournaments', admin.from('tournaments').insert({
      name: nombreTorneo,
      slug,
      organizer_id: organizadorId,
      course_id: canchaA.id,
      course_name: canchaA.nombre,
      date_start: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
      format: 'stroke_play',
      hole_count: 18,
      status: 'open',
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
    // tournaments arrastra players, rounds y hole_scores (ON DELETE CASCADE).
    if (tournamentId) {
      const { error } = await admin.from('tournaments').delete().eq('id', tournamentId)
      if (error) errs.push(`tournaments: ${error.message}`)
    }
    if (organizadorId && errs.length === 0) errs.push(...(await deleteEphemeralUser(organizadorId)))
    else if (organizadorId) errs.push(`usuario efímero sin borrar: ${organizadorId}`)
    if (errs.length) console.warn(`[torneo-score-sin-empezar] cleanup parcial:\n  ${errs.join('\n  ')}`)
  })

  test('inscripciones abiertas: avisa que todavía no empieza (no "cerrado") y la tarjeta no se puede escribir', async ({ page }) => {
    await prepararTorneo('open', canchaA)
    const posts: string[] = []
    page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/api/game')) posts.push(r.url()) })

    await abrirScorer(page)
    await expect(page.getByRole('status').filter({ hasText: AVISO_NO_EMPIEZA })).toBeVisible()
    await expect(page.getByText(/Podrás anotar tu score cuando el organizador lo inicie/)).toBeVisible()
    await expect(page.getByText(AVISO_CERRADO)).toHaveCount(0)
    // La tarjeta muestra la cancha del torneo, pero bloqueada desde la carga (no después de un 409).
    await expect(filaHoyo(page, 1).getByText(textoHoyo1(canchaA))).toBeVisible()
    await esperarTarjetaBloqueada(page)

    // Aunque el input quedara habilitado (un render a destiempo), `handleScoreChange` tampoco manda el golpe: se fuerza
    // un intento real por el onBlur y no debe salir ningún POST (antes de #588 salía y volvía 409).
    await filaHoyo(page, 1).locator('input[type="number"]').evaluate((el: HTMLInputElement) => {
      el.removeAttribute('disabled')
      el.focus()
      el.value = '5'
      el.blur()
    })
    await page.waitForTimeout(1_500)
    expect(posts, 'el guard de handleScoreChange no deja salir el golpe').toEqual([])
  })

  test('borrador: el jugador no lo ve (es privado del organizador) y nunca lee "Torneo cerrado" ni una tarjeta escribible', async ({ page }) => {
    await prepararTorneo('draft', canchaA)
    const res = await page.goto(`/torneo/${slug}/score`)
    expect(res?.status(), 'el scorer del torneo responde').toBeLessThan(400)
    // La RLS de `tournaments` no le muestra un borrador a quien no lo organiza: la página dice "no encontrado".
    await expect(page.getByRole('heading', { name: 'Torneo no encontrado' })).toBeVisible()
    await expect(page.getByText(AVISO_CERRADO)).toHaveCount(0)
    await expect(inputsDeHoyos(page)).toHaveCount(0)
  })

  test('el organizador corrige la cancha e inicia: al volver a la pestaña se habilita sola y guarda con la cancha nueva', async ({ page }) => {
    await prepararTorneo('open', canchaA)
    // Reloj congelado: el intervalo de 30 s nunca corre, así que SOLO `visibilitychange` puede habilitar la tarjeta.
    await page.clock.install()
    await abrirScorer(page)
    await expect(page.getByRole('status').filter({ hasText: AVISO_NO_EMPIEZA })).toBeVisible()
    await expect(filaHoyo(page, 1).getByText(textoHoyo1(canchaA))).toBeVisible()

    // Mientras el jugador espera en el tee, el organizador cambia la cancha y arranca el torneo.
    const roundId = await iniciarTorneo(canchaB)
    // El jugador vuelve a la app (bloqueo de pantalla / otra app): `visibilitychange` dispara el chequeo.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

    await expect(page.getByText(AVISO_NO_EMPIEZA)).toHaveCount(0, { timeout: 15_000 })
    // La cancha se volvió a resolver: par y SI del hoyo 1 son los de la cancha corregida, no los cacheados.
    await expect(filaHoyo(page, 1).getByText(textoHoyo1(canchaB))).toBeVisible()
    const hoyo1 = filaHoyo(page, 1).locator('input[type="number"]')
    await expect(hoyo1).toBeEnabled()
    // Ya terminó de cargar (no es el "Cargando..." intermedio, donde todo aviso da 0): tampoco dice "cerrado".
    await expect(page.getByText(AVISO_CERRADO)).toHaveCount(0)

    const golpes = canchaB.parHoyo1 + 1
    await hoyo1.fill(String(golpes))
    await hoyo1.blur()
    await expect(page.getByText('✓ Guardado')).toBeVisible({ timeout: 15_000 })

    await expect.poll(() => scoresDe(roundId), { timeout: 15_000 }).toEqual([
      { hole_number: 1, gross_score: golpes, par: canchaB.parHoyo1 },
    ])
  })

  test('sin salir de la pantalla: el chequeo de cada 30 s también la habilita', async ({ page }) => {
    await prepararTorneo('open', canchaA)
    await page.clock.install()
    await abrirScorer(page)
    await expect(page.getByRole('status').filter({ hasText: AVISO_NO_EMPIEZA })).toBeVisible()

    const consultas: string[] = []
    page.on('request', r => {
      if (r.url().includes('/rest/v1/tournaments') && r.url().includes('select=status')) consultas.push(r.url())
    })
    await iniciarTorneo()
    // Antes de los 30 s no se consulta el estado (no corre en cada render) y el aviso sigue.
    await page.clock.runFor(5_000)
    await expect(page.getByText(AVISO_NO_EMPIEZA)).toBeVisible()
    expect(consultas, 'ninguna consulta de estado antes de los 30 s').toEqual([])
    await page.clock.runFor(30_000)
    await expect.poll(() => consultas.length, { message: 'el tick de 30 s consultó el estado' }).toBeGreaterThan(0)

    await expect(page.getByText(AVISO_NO_EMPIEZA)).toHaveCount(0, { timeout: 15_000 })
    await expect(filaHoyo(page, 1).locator('input[type="number"]')).toBeEnabled()
  })

  for (const status of ['closed', 'published'] as const) {
    test(`${status === 'closed' ? 'cerrado' : 'publicado'}: "Torneo cerrado" y la tarjeta en sólo lectura con lo ya anotado`, async ({ page }) => {
      await prepararTorneo('in_progress', canchaA)
      const roundId = await crearTarjetaRonda1()
      await sinError('insert hole_scores', adminClient().from('hole_scores').insert({
        round_id: roundId, hole_number: 1, par: canchaA.parHoyo1, gross_score: canchaA.parHoyo1,
      }).select('id'))
      await sinError('cerrar torneo', adminClient().from('tournaments').update({ status }).eq('id', tournamentId).select('id'))

      await abrirScorer(page)
      await expect(page.getByRole('status').filter({ hasText: AVISO_CERRADO })).toBeVisible()
      await expect(page.getByText(/Ya no acepta scores; la tarjeta es sólo lectura/)).toBeVisible()
      await expect(page.getByText(AVISO_NO_EMPIEZA)).toHaveCount(0)
      await expect(filaHoyo(page, 1).locator('input[type="number"]')).toHaveValue(String(canchaA.parHoyo1))
      await esperarTarjetaBloqueada(page)
    })
  }

  test('se cierra mientras el jugador anota: el golpe no se guarda y la tarjeta se bloquea con "Torneo cerrado"', async ({ page }) => {
    await prepararTorneo('open', canchaA)
    const roundId = await iniciarTorneo()
    await abrirScorer(page)
    await expect(page.getByText(AVISO_NO_EMPIEZA)).toHaveCount(0)
    await expect(page.getByText(AVISO_CERRADO)).toHaveCount(0)
    const hoyo2 = filaHoyo(page, 2).locator('input[type="number"]')
    await expect(hoyo2).toBeEnabled()

    // El organizador cierra el torneo con el jugador todavía en el scorer.
    await sinError('cerrar torneo', adminClient().from('tournaments').update({ status: 'closed' }).eq('id', tournamentId).select('id'))
    const respuesta = page.waitForResponse(r => r.url().includes('/api/game') && r.request().method() === 'POST')
    await hoyo2.fill('5')
    await hoyo2.blur()
    expect((await respuesta).status(), '/api/game rechaza el golpe en un torneo cerrado').toBe(409)

    await expect(page.getByRole('status').filter({ hasText: AVISO_CERRADO })).toBeVisible()
    await expect(page.getByText(AVISO_NO_EMPIEZA)).toHaveCount(0)
    await esperarTarjetaBloqueada(page)
    await expect(page.getByText('✓ Guardado')).toHaveCount(0)
    expect(await scoresDe(roundId), 'el golpe tardío no quedó en la base').toEqual([])
  })
})
