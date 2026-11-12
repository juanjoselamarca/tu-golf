import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { adminClient, cleanupRondaFixture, DEFAULT_COURSE_ID, DEFAULT_COURSE_NAME, sinError } from './helpers/ronda-fixture'

/**
 * Ronda libre FOURSOME neto — /ronda-libre/[codigo]
 *
 * Foursome (golpes alternados, una bola por pareja) no tenía ningún E2E: ni el hándicap de pareja que graba la API ni
 * la clasificación neta ni el detalle de quién sale en cada hoyo. Este spec crea la ronda por la API REAL (la del
 * wizard, con la sesión del usuario e2e), carga los golpes de cada pareja con la service key y verifica:
 *
 *  - Hándicap de pareja (#638, `handicapEquipoFoursome`): 50 % de la SUMA de los course handicaps SIN redondear de
 *    los dos jugadores en el tee de la ronda, con UN solo redondeo. Los índices están elegidos para que redondear
 *    cada CH antes de sumar dé otro número (Los Robles: 19 bien, 20 mal).
 *  - Neto de la pareja: golpes de hándicap repartidos por stroke index de la cancha sobre la tarjeta de la pareja.
 *  - El orden es por neto: en gross el orden se da vuelta.
 *  - Detalle: al tocar la pareja se ve quién sale en cada hoyo (A en impares, B en pares) y sus golpes.
 *
 * Los números esperados se calculan ACÁ con la fórmula WHS escrita a mano (no importando el motor).
 * Corre contra la app local + base de pruebas (`e2e-local.mjs`); borra sus rondas en afterAll.
 */

/**
 * Hoyos que juegan las parejas: 1-4 y el 13. El 13 es el SI 2 de Los Leones: con hándicap de pareja 19 recibe 1 golpe
 * y con 20 (el número que da redondear antes de sumar) recibe 2, así que el NETO en pantalla también lo discrimina.
 */
const HOYOS = [1, 2, 3, 4, 13]
const PAR_HOYOS = [4, 4, 3, 5, 4]
const SI_HOYOS = [13, 7, 15, 1, 2]
const TEE_BLANCO = { slope: 129, rating: 71.6, par: 72 }

const rondasCreadas: string[] = []

/** Course handicap WHS SIN redondear en el tee blanco de 18 hoyos. */
function chSinRedondear(indice: number): number {
  return indice * (TEE_BLANCO.slope / 113) + (TEE_BLANCO.rating - TEE_BLANCO.par)
}

function golpesEnHoyo(ch: number, si: number): number {
  return Math.floor(ch / 18) + (si <= ch % 18 ? 1 : 0)
}

function fmt(n: number): string {
  return n === 0 ? 'E' : n > 0 ? `+${n}` : String(n)
}

async function crearFoursome(
  request: APIRequestContext,
  jugadores: { nombre: string; indice: number }[],
  equipos: { nombre: string; jugadorIndices: number[] }[],
): Promise<{ id: string; codigo: string }> {
  const res = await request.post('/api/ronda-libre/create', {
    data: {
      course_id: DEFAULT_COURSE_ID,
      course_name: DEFAULT_COURSE_NAME,
      tees: 'blanco',
      holes: 18,
      fecha: new Date().toISOString().slice(0, 10),
      hoyo_inicio: 1,
      formato_juego: 'foursome',
      modo_juego: 'neto',
      admin_mode: true,
      jugadores: jugadores.map((j, i) => ({ nombre: j.nombre, handicap: j.indice, user_id: null, tees: 'blanco', is_guest: i > 0 })),
      equipos,
    },
  })
  const body = await res.json()
  expect(res.status(), `create foursome neto: ${JSON.stringify(body)}`).toBe(200)
  rondasCreadas.push(body.ronda_id)
  return { id: body.ronda_id, codigo: body.codigo }
}

/** Tarjeta de la pareja: `golpes[i]` es el golpe del hoyo `HOYOS[i]`. */
async function anotarPareja(rondaId: string, nombre: string, golpes: number[]): Promise<void> {
  expect(golpes, `golpes de ${nombre}`).toHaveLength(HOYOS.length)
  const scores = Object.fromEntries(golpes.map((g, i) => [String(HOYOS[i]), g]))
  const filas = await sinError(
    `scores de la pareja ${nombre}`,
    adminClient().from('ronda_equipos').update({ scores }).eq('ronda_id', rondaId).eq('nombre', nombre).select('id'),
  )
  expect(filas, `pareja ${nombre} en la ronda`).toHaveLength(1)
}

/** La tarjeta de clasificación de parejas: la caja más interna con el rótulo del formato y la columna Thru. */
function tablaFoursome(page: Page): Locator {
  return page
    .locator('div')
    .filter({ has: page.getByText('Foursome', { exact: true }) })
    .filter({ has: page.getByText('Thru', { exact: true }) })
    .last()
}

function filaDe(tabla: Locator, pareja: string): Locator {
  return tabla.locator(':scope > div').filter({ hasText: pareja })
}

/**
 * Celdas de la fila normalizadas: posición, pareja (+ jugadores y HCP), score, thru. Se lee dentro de `expect.poll`
 * para no fallar si la vista repinta justo en la lectura.
 */
async function celdas(fila: Locator): Promise<string[]> {
  const textos = await fila.locator(':scope > div').first().locator(':scope > *').allInnerTexts()
  return textos.map(t => t.replace(/[▲▼]/g, '').replace(/\s+/g, ' ').trim())
}

test.describe('Ronda libre Foursome neto — clasificación', () => {
  test.beforeAll(async () => {
    const hoyos = await sinError(
      'par y SI de Los Leones',
      adminClient().from('course_holes').select('numero, par, stroke_index').eq('course_id', DEFAULT_COURSE_ID).order('numero'),
    )
    // El motor escala el rating con el par de la CANCHA (suma de course_holes): tiene que ser 72.
    expect((hoyos ?? []).reduce((a, h) => a + h.par, 0), 'par total de Los Leones').toBe(TEE_BLANCO.par)
    const jugados = HOYOS.map(n => (hoyos ?? []).find(h => h.numero === n))
    expect(jugados.map(h => h?.par), 'par de Los Leones hoyos 1-4 y 13').toEqual(PAR_HOYOS)
    expect(jugados.map(h => h?.stroke_index), 'SI de Los Leones hoyos 1-4 y 13').toEqual(SI_HOYOS)
    const tee = await sinError(
      'tee blanco de Los Leones',
      adminClient().from('course_tees').select('slope, rating, par_total').eq('course_id', DEFAULT_COURSE_ID).eq('nombre', 'blanco').single(),
    )
    expect([tee?.slope, Number(tee?.rating), tee?.par_total], 'slope, CR y par del tee blanco').toEqual([
      TEE_BLANCO.slope,
      TEE_BLANCO.rating,
      TEE_BLANCO.par,
    ])
  })

  test.afterAll(async () => {
    for (const id of rondasCreadas) await cleanupRondaFixture(id)
  })

  test('hándicap de pareja 50 % sin redondear, neto por SI, orden por neto y quién sale en cada hoyo', async ({ page }) => {
    const jugadores = [
      { nombre: 'Ignacio Roble', indice: 9.6 },
      { nombre: 'Josefa Roble', indice: 25.0 },
      { nombre: 'Kurt Puma', indice: 2.0 },
      { nombre: 'Lía Puma', indice: 6.0 },
    ]
    // Los Robles: CH 10,56 + 28,14 = 38,70 × 50 % = 19,35 → 19 (redondeando antes: 11 + 28 = 39 → 19,5 → 20).
    // Los Pumas:  CH 1,88 + 6,45 = 8,33 × 50 % = 4,17 → 4.
    const hcpPareja = (a: number, b: number) => Math.round(0.5 * (chSinRedondear(a) + chSinRedondear(b)))
    const hcpRobles = hcpPareja(9.6, 25.0)
    const hcpPumas = hcpPareja(2.0, 6.0)
    expect([hcpRobles, hcpPumas], 'hándicaps de pareja a mano').toEqual([19, 4])
    expect(
      Math.round(0.5 * (Math.round(chSinRedondear(9.6)) + Math.round(chSinRedondear(25.0)))),
      'redondear cada CH antes de sumar da otro número (lo que discrimina)',
    ).toBe(20)

    const { id, codigo } = await crearFoursome(page.request, jugadores, [
      { nombre: 'Los Robles', jugadorIndices: [0, 1] },
      { nombre: 'Los Pumas', jugadorIndices: [2, 3] },
    ])

    const equipos = await sinError(
      'parejas de la ronda',
      adminClient()
        .from('ronda_equipos')
        .select('nombre, handicap_equipo, handicap_equipo_juego, ronda_equipo_jugadores(orden)')
        .eq('ronda_id', id)
        .order('nombre'),
    )
    // `handicap_equipo` es el que se muestra; `handicap_equipo_juego` el que reparte golpes (al 100 % son iguales).
    expect(
      (equipos ?? []).map(e => [e.nombre, Number(e.handicap_equipo), Number(e.handicap_equipo_juego)]),
      'hándicap de pareja grabado (mostrado y de juego)',
    ).toEqual([
      ['Los Pumas', hcpPumas, hcpPumas],
      ['Los Robles', hcpRobles, hcpRobles],
    ])
    for (const e of equipos ?? []) expect(e.ronda_equipo_jugadores, `miembros de ${e.nombre}`).toHaveLength(2)

    // Hoyos 1-4 y 13 (par 20, SI 13, 7, 15, 1, 2):
    //   Robles HCP 19: 1 golpe por hoyo + el 2º en el SI 1 (h4) = 6 → gross 25 (+5) → neto 19 (−1)
    //     (con HCP 20 también el 2º en el SI 2 (h13) = 7 → −2)
    //   Pumas  HCP 4:  golpe en el SI 1 (h4) y el SI 2 (h13)    = 2 → gross 22 (+2) → neto 20 (E)
    //     (repartiendo por número de hoyo recibirían en h1-h4 → −2)
    const golpesRobles = [5, 5, 4, 6, 5]
    const golpesPumas = [4, 5, 3, 5, 5]
    const netoVsPar = (golpes: number[], hcp: number) =>
      golpes.reduce((acc, g, i) => acc + g - golpesEnHoyo(hcp, SI_HOYOS[i]) - PAR_HOYOS[i], 0)
    expect([netoVsPar(golpesRobles, hcpRobles), netoVsPar(golpesPumas, hcpPumas)]).toEqual([-1, 0])
    expect(netoVsPar(golpesRobles, 20), 'con HCP 20 el neto cambia (lo que discrimina)').toBe(-2)
    await anotarPareja(id, 'Los Robles', golpesRobles)
    await anotarPareja(id, 'Los Pumas', golpesPumas)

    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))
    await page.goto(`/ronda-libre/${codigo}`, { waitUntil: 'domcontentloaded' })

    const tabla = tablaFoursome(page)
    await expect(tabla).toBeVisible({ timeout: 20_000 })
    await expect(tabla.getByText('Neto', { exact: true })).toBeVisible()

    const robles = filaDe(tabla, 'Los Robles')
    const pumas = filaDe(tabla, 'Los Pumas')
    await expect(robles).toHaveCount(1)
    await expect(pumas).toHaveCount(1)

    await expect
      .poll(() => celdas(robles), { message: 'fila de Los Robles' })
      .toEqual(['1', expect.stringMatching(new RegExp(`^Los Robles Ignacio Roble · Josefa Roble ?HCP ${hcpRobles}$`)), fmt(-1), '5'])
    await expect
      .poll(() => celdas(pumas), { message: 'fila de Los Pumas' })
      .toEqual(['2', expect.stringMatching(new RegExp(`^Los Pumas Kurt Puma · Lía Puma ?HCP ${hcpPumas}$`)), fmt(0), '5'])

    // El líder va arriba en el DOM (no solo con el número 1).
    await expect
      .poll(async () => {
        const texto = await tabla.innerText()
        return texto.indexOf('Los Robles') < texto.indexOf('Los Pumas')
      })
      .toBe(true)

    // Detalle de la pareja: golpes por hoyo y quién sale (A = Ignacio en impares, B = Josefa en pares).
    await robles.locator('[role="button"]').click()
    // El detalle es el 2º hijo de la fila (el 1º es la fila clickeable).
    const detalle = robles.locator(':scope > div').nth(1)
    await expect(detalle).toBeVisible()
    // Leyenda: A = el primer jugador de la pareja, B = el segundo.
    await expect(detalle).toContainText('A Ignacio Roble')
    await expect(detalle).toContainText('B Josefa Roble')
    // Grillas de 9 columnas por vuelta: números de hoyo, golpes (— sin jugar) y quién sale.
    // El selector depende del estilo inline de la grilla (TeamLeaderboards): si cambia, este assert de 54 celdas exactas
    // se pone rojo (no pasa en falso) y hay que actualizarlo.
    const celdasDetalle = (await detalle.locator('div[style*="grid"] > div').allInnerTexts()).map(s => s.trim())
    expect(celdasDetalle, 'ida: hoyos, golpes, quién sale · vuelta: ídem').toEqual([
      '1', '2', '3', '4', '5', '6', '7', '8', '9',
      '5', '5', '4', '6', '—', '—', '—', '—', '—',
      'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A',
      '10', '11', '12', '13', '14', '15', '16', '17', '18',
      '—', '—', '—', '5', '—', '—', '—', '—', '—',
      'B', 'A', 'B', 'A', 'B', 'A', 'B', 'A', 'B',
    ])
    // Tocar de nuevo cierra el detalle.
    await robles.locator('[role="button"]').click()
    await expect(detalle).toHaveCount(0)

    expect(pageErrors, 'errores JS en la vista de la ronda').toEqual([])
  })
})
