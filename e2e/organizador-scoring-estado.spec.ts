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
 * Pestaña Scoring del organizador (/organizador/[slug]/scoring) según el estado del torneo — protege #588 (hunter 18-oct).
 *
 * Antes la cabecera decía "● EN VIVO" fijo (también en un borrador) y cada golpe en un torneo sin empezar terminaba
 * en "Intenta nuevamente" (el servidor responde 409 siempre). Ahora:
 *  - el badge es el estado real (`tournamentStatusBadge`): Borrador / Inscripciones abiertas / ● En curso / Cerrado / Publicado;
 *  - sin empezar: "El torneo todavía no empieza", sin tarjetas, y lleva a Jugadores (donde se inicia);
 *  - cerrado: las tarjetas se siguen leyendo (revisarlas antes de publicar) pero no se editan, y ofrece reabrir;
 *  - publicado: sólo lectura y NO promete reabrir (`reopenTournamentAction` sólo acepta 'closed').
 *
 * El organizador es el usuario E2E (sesión del global-setup); la jugadora es un usuario efímero con nombre propio.
 * SOLO base de pruebas (`scripts/test-db/e2e-local.mjs`): un torneo en curso público se vería en /en-vivo de prod.
 */

const slug = `e2e-orgscoring-${sufijo()}`
const nombreTorneo = `E2E Org Scoring ${slug.slice(-8)}`
const nombreJugadora = `Jugadora ${slug.slice(-6)}`
let jugadoraId = ''
let tournamentId = ''
let playerId = ''
let roundId = ''
let parHoyo1 = 0
let courseId = ''

const AVISO_NO_EMPIEZA = 'El torneo todavía no empieza'

async function ponerEstado(status: string) {
  await sinError(`status ${status}`, adminClient().from('tournaments').update({ status }).eq('id', tournamentId).select('id'))
}

async function abrirScoring(page: Page) {
  const res = await page.goto(`/organizador/${slug}/scoring`)
  expect(res?.status(), 'la pestaña Scoring responde').toBeLessThan(400)
  await expect(page.getByRole('heading', { name: new RegExp(nombreTorneo) })).toBeVisible()
}

/** El badge de estado vive dentro del h1 junto al nombre: se lee el h1 completo. */
function cabecera(page: Page) {
  return page.getByRole('heading', { name: new RegExp(nombreTorneo) })
}

function tarjetaJugadora(page: Page) {
  return page.getByRole('button', { name: new RegExp(nombreJugadora.split(' ')[0]) })
}

/** Celda "H<n>" de la grilla (la más interna que tiene el rótulo exacto y un input). */
function celdaHoyo(page: Page, n: number) {
  return page.locator('div', { has: page.getByText(`H${n}`, { exact: true }) })
    .filter({ has: page.locator('input[type="number"]') }).last()
}

/** Grilla de la tarjeta seleccionada: 18 inputs (H1…H18). */
function inputsDeHoyos(page: Page) {
  return page.locator('input[type="number"]')
}

test.describe.configure({ mode: 'serial' })

test.describe('Organizador: la pestaña Scoring dice el estado real del torneo (#588)', () => {
  test.beforeAll(async () => {
    exigirBaseDePruebas('organizador-scoring-estado.spec.ts')
    const admin = adminClient()
    const organizadorId = await getTestUserId()

    // Cancha de 18 hoyos con el hoyo 1 de par ≠ 4: la tarjeta cae a `hole?.par ?? 4` si la cancha no se resuelve,
    // así que con un par 4 el par guardado no probaría nada.
    const candidatas = await sinError('course_holes candidatas', admin.from('course_holes')
      .select('course_id, par').eq('numero', 1).neq('par', 4).limit(20))
    for (const cand of candidatas as Array<{ course_id: string; par: number }>) {
      const { count } = await admin.from('course_holes').select('numero', { count: 'exact', head: true }).eq('course_id', cand.course_id)
      if (count !== 18) continue
      courseId = cand.course_id
      parHoyo1 = cand.par
      break
    }
    if (!courseId) throw new Error('la base de pruebas no tiene una cancha de 18 hoyos con el hoyo 1 de par ≠ 4')
    const c = await sinError('courses', admin.from('courses').select('nombre').eq('id', courseId).single())

    jugadoraId = await createEphemeralUser('e2e-jug-orgscoring')
    await sinError('profiles name', admin.from('profiles').update({ name: nombreJugadora }).eq('id', jugadoraId).select('id'))

    const t = await sinError('insert tournaments', admin.from('tournaments').insert({
      name: nombreTorneo,
      slug,
      organizer_id: organizadorId,
      course_id: courseId,
      course_name: (c as { nombre: string }).nombre,
      date_start: new Date().toISOString().slice(0, 10),
      format: 'stroke_play',
      hole_count: 18,
      status: 'draft',
    }).select('id').single())
    tournamentId = (t as { id: string }).id

    const p = await sinError('insert players', admin.from('players').insert({
      tournament_id: tournamentId,
      user_id: jugadoraId,
      status: 'approved',
      handicap_at_registration: 12,
    }).select('id').single())
    playerId = (p as { id: string }).id
  })

  test.afterAll(async () => {
    const errs: string[] = []
    // tournaments arrastra players, rounds y hole_scores (ON DELETE CASCADE).
    if (tournamentId) {
      const { error } = await adminClient().from('tournaments').delete().eq('id', tournamentId)
      if (error) errs.push(`tournaments: ${error.message}`)
    }
    if (jugadoraId && errs.length === 0) errs.push(...(await deleteEphemeralUser(jugadoraId)))
    else if (jugadoraId) errs.push(`usuario efímero sin borrar: ${jugadoraId}`)
    if (errs.length) console.warn(`[organizador-scoring-estado] cleanup parcial:\n  ${errs.join('\n  ')}`)
  })

  for (const { status, badge } of [
    { status: 'draft', badge: 'Borrador' },
    { status: 'open', badge: 'Inscripciones abiertas' },
  ]) {
    test(`${badge}: badge real (no "EN VIVO"), aviso de que no empieza y lleva a Jugadores`, async ({ page }) => {
      await ponerEstado(status)
      await abrirScoring(page)
      await expect(cabecera(page)).toContainText(badge)
      await expect(cabecera(page)).not.toContainText(/EN VIVO|En curso|●/i)

      const aviso = page.getByRole('status').filter({ hasText: AVISO_NO_EMPIEZA })
      await expect(aviso).toBeVisible()
      await expect(aviso).toContainText('Inícialo desde Jugadores para anotar scores.')
      // Sin empezar no hay tarjetas que anotar: ni la de la jugadora ni la grilla.
      await expect(tarjetaJugadora(page)).toHaveCount(0)
      await expect(inputsDeHoyos(page)).toHaveCount(0)

      await aviso.getByRole('link', { name: 'Ir a Jugadores' }).click()
      await expect(page).toHaveURL(new RegExp(`/organizador/${slug}/jugadores$`))
    })
  }

  test('en curso: "● En curso", sin aviso, y el golpe del organizador se guarda en la tarjeta de la jugadora', async ({ page }) => {
    const r = await sinError('insert rounds', adminClient().from('rounds').insert({
      tournament_id: tournamentId, player_id: playerId, round_number: 1, status: 'in_progress',
    }).select('id').single())
    roundId = (r as { id: string }).id
    await ponerEstado('in_progress')

    await abrirScoring(page)
    await expect(cabecera(page)).toContainText('● En curso')
    await expect(page.getByText(AVISO_NO_EMPIEZA)).toHaveCount(0)
    await expect(page.getByRole('status')).toHaveCount(0)

    await tarjetaJugadora(page).click()
    await expect(inputsDeHoyos(page)).toHaveCount(18)
    // La celda del hoyo 1 trae el par de la cancha (≠ 4: no es el default de un hoyo sin resolver).
    await expect(celdaHoyo(page, 1)).toContainText(`P${parHoyo1}`)
    const h1 = inputsDeHoyos(page).first()
    await expect(h1).toBeEditable()

    const golpes = parHoyo1 + 1
    const respuesta = page.waitForResponse(res => res.url().includes('/api/game') && res.request().method() === 'POST')
    await h1.fill(String(golpes))
    await h1.blur()
    expect((await respuesta).status(), '/api/game acepta el golpe en un torneo en curso').toBe(200)

    await expect.poll(async () => {
      const { data } = await adminClient().from('hole_scores').select('hole_number, gross_score, par').eq('round_id', roundId)
      return data
    }, { timeout: 15_000 }).toEqual([{ hole_number: 1, gross_score: golpes, par: parHoyo1 }])
    // El total de la tarjeta lo refleja (GROSS = el único golpe anotado).
    await expect(page.getByText('GROSS', { exact: true }).locator('..')).toContainText(String(golpes))

    // Tarjeta completa (hoyos 2-18 a par, sembrados): en curso aparece "Finalizar ronda". Es el control positivo de
    // que el test "cerrado" lo busca con un selector que sí lo encuentra cuando existe.
    const hoyos = await sinError('course_holes', adminClient().from('course_holes')
      .select('numero, par').eq('course_id', courseId).gt('numero', 1).order('numero'))
    await sinError('hole_scores 2-18', adminClient().from('hole_scores').insert(
      (hoyos as Array<{ numero: number; par: number }>).map(h => ({
        round_id: roundId, hole_number: h.numero, par: h.par, gross_score: h.par,
      })),
    ).select('id'))
    await abrirScoring(page)
    await tarjetaJugadora(page).click()
    await expect(inputsDeHoyos(page).last()).not.toHaveValue('')
    await expect(page.getByRole('button', { name: /Finalizar ronda/ })).toBeVisible()
  })

  test('cerrado: tarjetas en sólo lectura con lo anotado, y ofrece reabrir desde Jugadores', async ({ page }) => {
    expect(roundId, 'el test "en curso" dejó la tarjeta con el hoyo 1').not.toBe('')
    await ponerEstado('closed')
    const posts: string[] = []
    page.on('request', r => { if (r.method() === 'POST' && r.url().includes('/api/game')) posts.push(r.url()) })

    await abrirScoring(page)
    await expect(cabecera(page)).toContainText('Cerrado')
    await expect(cabecera(page)).not.toContainText(/EN VIVO|En curso|●/i)
    const aviso = page.getByRole('status').filter({ hasText: 'Torneo cerrado' })
    await expect(aviso).toBeVisible()
    await expect(aviso).toContainText('reábrelo desde Jugadores')
    await expect(aviso.getByRole('link', { name: 'Ir a Jugadores' })).toHaveAttribute('href', `/organizador/${slug}/jugadores`)

    // Las tarjetas se siguen viendo (revisarlas entre cerrar y publicar)…
    await tarjetaJugadora(page).click()
    const h1 = inputsDeHoyos(page).first()
    await expect(h1).toHaveValue(String(parHoyo1 + 1))
    // …pero no se editan, y aunque la tarjeta está completa no hay "Finalizar ronda" que el servidor rechazaría.
    await expect(inputsDeHoyos(page)).toHaveCount(18)
    for (const input of await inputsDeHoyos(page).all()) await expect(input).not.toBeEditable()
    // Intento real: aunque el input dejara de ser readonly, el onBlur no manda el golpe en sólo lectura.
    const enfocado = await h1.evaluate((el: HTMLInputElement) => {
      el.removeAttribute('readonly')
      el.focus()
      const ok = document.activeElement === el
      el.value = '9'
      el.blur()
      return ok
    })
    expect(enfocado, 'el input recibió el foco (si no, el blur no dispara onBlur y el intento no prueba nada)').toBe(true)
    await expect(page.getByRole('button', { name: /Finalizar ronda/ })).toHaveCount(0)
    // Ausencia de un POST: no hay evento que esperar, así que se da margen fijo (el onBlur postea al instante).
    await page.waitForTimeout(1_500)
    expect(posts, 'leer la tarjeta cerrada no manda golpes').toEqual([])
  })

  test('publicado: sólo lectura y NO promete reabrir (un publicado no tiene vuelta atrás)', async ({ page }) => {
    await ponerEstado('published')
    await abrirScoring(page)
    await expect(cabecera(page)).toContainText('Publicado')
    await expect(cabecera(page)).not.toContainText(/EN VIVO|En curso|●/i)

    const aviso = page.getByRole('status').filter({ hasText: 'Publicado' })
    await expect(aviso).toBeVisible()
    await expect(aviso).toContainText('Ya no acepta scores. Las tarjetas son solo lectura.')
    await expect(aviso).not.toContainText(/reábrelo/i)
    await expect(aviso.getByRole('link', { name: 'Ir a Jugadores' })).toHaveCount(0)

    await tarjetaJugadora(page).click()
    await expect(inputsDeHoyos(page).first()).toHaveValue(String(parHoyo1 + 1))
    await expect(inputsDeHoyos(page)).toHaveCount(18)
    for (const input of await inputsDeHoyos(page).all()) await expect(input).not.toBeEditable()
  })
})
