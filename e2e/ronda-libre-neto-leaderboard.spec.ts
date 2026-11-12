import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { adminClient, cleanupRondaFixture, DEFAULT_COURSE_ID, DEFAULT_COURSE_NAME, sinError } from './helpers/ronda-fixture'

/**
 * Ronda libre Stroke Play NETO — /ronda-libre/[codigo]
 *
 * Ningún E2E afirmaba un NETO de ronda libre: los specs de resultados y de equipos juegan en gross. Este spec crea la
 * ronda por la API REAL (la misma que llama el wizard, con la sesión del usuario e2e), carga los golpes con la
 * service key y verifica que la clasificación sale de la cadena completa del motor:
 *
 *   índice declarado → course handicap WHS del tee de la ronda (slope/113 + CR − par, un solo redondeo)
 *   → golpes de hándicap repartidos por STROKE INDEX (no por número de hoyo) → neto vs par de los hoyos jugados.
 *
 * Los números esperados se calculan ACÁ, con la fórmula WHS escrita a mano a partir del tee y del SI de la base de
 * pruebas (no importando el motor: un test que llama al código que prueba no discrimina nada). Los jugadores están
 * elegidos para que cada atajo equivocado cambie el resultado:
 *  - jugar con el ÍNDICE en vez del course handicap: Rodrigo (17,0 → CH 19) pierde el 2º golpe del hoyo 4 (SI 1)
 *    y empata con Paula; Tomás (12,0 → CH 13) pierde el golpe del hoyo 1 (SI 13).
 *  - repartir por número de hoyo en vez de SI: Tomás recibiría golpe en el hoyo 3 (SI 15) y quedaría en E.
 *  - ordenar por gross: el orden se da vuelta (Paula E · Rodrigo +3 · Tomás +4 en gross).
 *
 * Corre contra la app local + base de pruebas (`e2e-local.mjs`); borra sus rondas en afterAll.
 */

/** Los Leones en la base de pruebas: par y SI de los hoyos 1-9 (se verifican antes de afirmar). */
const PAR_1_A_9 = [4, 4, 3, 5, 4, 3, 4, 4, 5]
const SI_1_A_9 = [13, 7, 15, 1, 11, 17, 3, 9, 5]
/** Tee blanco: 18 hoyos y primeros 9 (front). */
const TEE_BLANCO = { slope: 129, rating: 71.6, par: 72, frontSlope: 128, frontRating: 36.2 }

const rondasCreadas: string[] = []

interface Jugador {
  nombre: string
  indice: number
}

async function crearRondaNeto(request: APIRequestContext, jugadores: Jugador[], holes: 9 | 18): Promise<{ id: string; codigo: string }> {
  const res = await request.post('/api/ronda-libre/create', {
    data: {
      course_id: DEFAULT_COURSE_ID,
      course_name: DEFAULT_COURSE_NAME,
      tees: 'blanco',
      holes,
      fecha: new Date().toISOString().slice(0, 10),
      hoyo_inicio: 1,
      formato_juego: 'stroke_play',
      modo_juego: 'neto',
      admin_mode: true,
      jugadores: jugadores.map((j, i) => ({ nombre: j.nombre, handicap: j.indice, user_id: null, tees: 'blanco', is_guest: i > 0 })),
    },
  })
  const body = await res.json()
  expect(res.status(), `create stroke play neto ${holes}h: ${JSON.stringify(body)}`).toBe(200)
  rondasCreadas.push(body.ronda_id)
  return { id: body.ronda_id, codigo: body.codigo }
}

async function anotar(rondaId: string, nombre: string, golpes: number[]): Promise<void> {
  const scores = Object.fromEntries(golpes.map((g, i) => [String(i + 1), g]))
  const filas = await sinError(
    `scores de ${nombre}`,
    adminClient().from('ronda_libre_jugadores').update({ scores }).eq('ronda_id', rondaId).eq('nombre', nombre).select('id'),
  )
  expect(filas, `jugador ${nombre} en la ronda`).toHaveLength(1)
}

/** Golpes recibidos en un hoyo de SI `si` (1..n) con course handicap `ch` en una vuelta de `n` hoyos (WHS 6.2). */
function golpesEnHoyo(ch: number, si: number, n: number): number {
  return Math.floor(ch / n) + (si <= ch % n ? 1 : 0)
}

/** Neto vs par de los hoyos jugados, calculado a mano. `siDeLaVuelta` ya es permutación 1..n. */
function netoVsPar(golpes: number[], ch: number, siDeLaVuelta: number[], n: number): number {
  return golpes.reduce((acc, g, i) => acc + g - golpesEnHoyo(ch, siDeLaVuelta[i], n) - PAR_1_A_9[i], 0)
}

function grossVsPar(golpes: number[]): number {
  return golpes.reduce((acc, g, i) => acc + g - PAR_1_A_9[i], 0)
}

function fmt(n: number): string {
  return n === 0 ? 'E' : n > 0 ? `+${n}` : String(n)
}

/** Fila del leaderboard individual: el botón que expande la tarjeta del jugador. */
function filaDe(page: Page, nombre: string): Locator {
  return page.getByRole('button', { name: new RegExp(`(Expandir|Colapsar) scorecard de ${nombre}$`) })
}

/** Celdas de la fila: posición, jugador, HCP, score (+ secundario), thru. */
async function celdas(fila: Locator): Promise<string[]> {
  return fila.locator(':scope > *').allInnerTexts()
}

test.describe('Ronda libre Stroke Play neto — clasificación', () => {
  test.beforeAll(async () => {
    const hoyos = await sinError(
      'par y SI de Los Leones',
      adminClient().from('course_holes').select('numero, par, stroke_index').eq('course_id', DEFAULT_COURSE_ID).lte('numero', 9).order('numero'),
    )
    // Si la cancha de pruebas cambia, los netos de abajo dejan de ser ciertos: fallar acá, no en un número raro.
    expect((hoyos ?? []).map(h => h.par), 'par de Los Leones hoyos 1-9').toEqual(PAR_1_A_9)
    expect((hoyos ?? []).map(h => h.stroke_index), 'SI de Los Leones hoyos 1-9').toEqual(SI_1_A_9)
    const tee = await sinError(
      'tee blanco de Los Leones',
      adminClient()
        .from('course_tees')
        .select('slope, rating, par_total, front_slope_rating, front_course_rating')
        .eq('course_id', DEFAULT_COURSE_ID)
        .eq('nombre', 'blanco')
        .single(),
    )
    expect(
      [tee?.slope, Number(tee?.rating), tee?.par_total, tee?.front_slope_rating, Number(tee?.front_course_rating)],
      'slope, CR, par y front del tee blanco',
    ).toEqual([TEE_BLANCO.slope, TEE_BLANCO.rating, TEE_BLANCO.par, TEE_BLANCO.frontSlope, TEE_BLANCO.frontRating])
  })

  test.afterAll(async () => {
    for (const id of rondasCreadas) await cleanupRondaFixture(id)
  })

  test('18 hoyos: neto con course handicap WHS y golpes por SI; el orden es por neto, no por gross', async ({ page }) => {
    // CH = round(índice × 129/113 + (71,6 − 72)):
    //   Paula 1,0 → 0,74 → 1 · Tomás 12,0 → 13,30 → 13 · Rodrigo 17,0 → 19,01 → 19
    const ch = (indice: number) => Math.round(indice * (TEE_BLANCO.slope / 113) + (TEE_BLANCO.rating - TEE_BLANCO.par))
    const jugadores = [
      { nombre: 'Paula Baja', indice: 1.0, golpes: [4, 4, 3, 5] },
      { nombre: 'Tomás Medio', indice: 12.0, golpes: [5, 5, 4, 6] },
      { nombre: 'Rodrigo Alto', indice: 17.0, golpes: [5, 4, 4, 6] },
    ]
    expect(jugadores.map(j => ch(j.indice)), 'course handicaps a mano').toEqual([1, 13, 19])

    const { id, codigo } = await crearRondaNeto(page.request, jugadores, 18)
    for (const j of jugadores) await anotar(id, j.nombre, j.golpes)

    // Neto vs par a mano (hoyos 1-4, SI 13, 7, 15, 1 de 18):
    //   Paula   16 − 1 (h4)              − 16 = −1   · gross E
    //   Tomás   20 − 3 (h1, h2, h4)      − 16 = +1   · gross +4
    //   Rodrigo 19 − 5 (1 c/u + 2º en h4) − 16 = −2  · gross +3
    const esperado = jugadores.map(j => ({
      ...j,
      ch: ch(j.indice),
      neto: netoVsPar(j.golpes, ch(j.indice), SI_1_A_9.slice(0, 4), 18),
      gross: grossVsPar(j.golpes),
    }))
    expect(esperado.map(e => [e.nombre, e.neto, e.gross])).toEqual([
      ['Paula Baja', -1, 0],
      ['Tomás Medio', 1, 4],
      ['Rodrigo Alto', -2, 3],
    ])

    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))
    await page.goto(`/ronda-libre/${codigo}`, { waitUntil: 'domcontentloaded' })

    await expect(filaDe(page, 'Rodrigo Alto')).toBeVisible({ timeout: 20_000 })
    // Encabezado del modo: la columna principal es Neto y hay columna HCP.
    await expect(page.getByText('Neto', { exact: true }).first()).toBeVisible()
    await expect(page.getByText('HCP', { exact: true }).first()).toBeVisible()

    const ordenNeto = ['Rodrigo Alto', 'Paula Baja', 'Tomás Medio']
    for (const [i, nombre] of ordenNeto.entries()) {
      const e = esperado.find(x => x.nombre === nombre)!
      const [pos, jugador, hcp, score, thru] = await celdas(filaDe(page, nombre))
      expect(pos.trim(), `posición de ${nombre}`).toBe(String(i + 1))
      expect(jugador).toContain(nombre)
      expect(hcp.trim(), `HCP (course handicap) de ${nombre}`).toBe(String(e.ch))
      // Score principal = neto; debajo, el gross de apoyo (solo si difiere del neto).
      const [principal, secundario] = score.split('\n').map(s => s.trim())
      expect(principal, `neto de ${nombre}`).toBe(fmt(e.neto))
      expect(secundario, `gross de apoyo de ${nombre}`).toBe(`Gross ${fmt(e.gross)}`)
      expect(thru.trim(), `thru de ${nombre}`).toBe('4')
    }

    // El orden también en el DOM (no solo el número de posición).
    const nombresEnOrden = await page.getByRole('button', { name: /^(Expandir|Colapsar) scorecard de / }).evaluateAll(
      els => els.map(el => (el.getAttribute('aria-label') ?? '').replace(/^(Expandir|Colapsar) scorecard de /, '')),
    )
    expect(nombresEnOrden).toEqual(ordenNeto)

    expect(pageErrors, 'errores JS en la vista de la ronda').toEqual([])
  })

  test('9 hoyos: course handicap de 9 hoyos (front) y SI renormalizado a 1-9', async ({ page }) => {
    // WHS 9 hoyos: CH9 = round(índice/2 × slope_front/113 + (CR_front − par_front)), par front 36.
    //   Rodrigo 17,0 → 8,5 × 128/113 + 0,2 = 9,83 → 10 · Paula 1,0 → 0,5 × 128/113 + 0,2 = 0,77 → 1
    const parFront = PAR_1_A_9.reduce((a, b) => a + b, 0)
    expect(parFront).toBe(36)
    const ch9 = (indice: number) =>
      Math.round((indice / 2) * (TEE_BLANCO.frontSlope / 113) + (TEE_BLANCO.frontRating - parFront))
    // SI de 18 (13, 7, 15, 1, 11, 17, 3, 9, 5) renormalizado a 1-9 por orden: 7, 4, 8, 1, 6, 9, 2, 5, 3.
    const siDeLaVuelta = SI_1_A_9.map(si => [...SI_1_A_9].sort((a, b) => a - b).indexOf(si) + 1)
    expect(siDeLaVuelta).toEqual([7, 4, 8, 1, 6, 9, 2, 5, 3])

    const jugadores = [
      { nombre: 'Paula Nueve', indice: 1.0, golpes: [4, 4, 3, 5, 4] },
      { nombre: 'Rodrigo Nueve', indice: 17.0, golpes: [5, 6, 4, 6, 5] },
    ]
    expect(jugadores.map(j => ch9(j.indice)), 'course handicaps 9h a mano').toEqual([1, 10])

    const { id, codigo } = await crearRondaNeto(page.request, jugadores, 9)
    for (const j of jugadores) await anotar(id, j.nombre, j.golpes)

    // Hoyos 1-5 (par 20). Paula CH 1: golpe en el SI 1 de la vuelta (h4) → 20 − 1 − 20 = −1.
    // Rodrigo CH 10: 1 en cada hoyo + 2º en el SI 1 (h4) → 26 − 6 − 20 = 0 (E). Con el SI de 18 sin renormalizar
    // también da E acá, pero con el CH de 18 hoyos (19) serían 11 golpes → −5: eso es lo que discrimina.
    const esperado = jugadores.map(j => ({
      ...j,
      ch: ch9(j.indice),
      neto: netoVsPar(j.golpes, ch9(j.indice), siDeLaVuelta.slice(0, 5), 9),
      gross: grossVsPar(j.golpes),
    }))
    expect(esperado.map(e => [e.nombre, e.neto, e.gross])).toEqual([
      ['Paula Nueve', -1, 0],
      ['Rodrigo Nueve', 0, 6],
    ])

    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))
    await page.goto(`/ronda-libre/${codigo}`, { waitUntil: 'domcontentloaded' })
    await expect(filaDe(page, 'Paula Nueve')).toBeVisible({ timeout: 20_000 })

    for (const [i, nombre] of ['Paula Nueve', 'Rodrigo Nueve'].entries()) {
      const e = esperado.find(x => x.nombre === nombre)!
      const [pos, , , score, thru] = await celdas(filaDe(page, nombre))
      expect(pos.trim(), `posición de ${nombre}`).toBe(String(i + 1))
      const [principal, secundario] = score.split('\n').map(s => s.trim())
      expect(principal, `neto de ${nombre}`).toBe(fmt(e.neto))
      expect(secundario, `gross de apoyo de ${nombre}`).toBe(`Gross ${fmt(e.gross)}`)
      expect(thru.trim(), `thru de ${nombre}`).toBe('5')
    }

    expect(pageErrors, 'errores JS en la vista de la ronda').toEqual([])
  })
})
