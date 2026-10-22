import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test'
import { adminClient, cleanupRondaFixture, DEFAULT_COURSE_ID, sinError } from './helpers/ronda-fixture'

/**
 * Ronda libre por EQUIPOS — /ronda-libre/[codigo] (Best Ball y Scramble).
 *
 * Ningún E2E cubría las rondas libres por equipos: el wizard las crea (`/api/ronda-libre/create` con `equipos`) y la
 * vista en vivo las clasifica con TeamLeaderboards → motor `src/golf/formats`. Este spec crea cada ronda por la API
 * REAL (la misma que llama el wizard, con la sesión del usuario e2e), carga los golpes con la service key y verifica
 * los NÚMEROS de la clasificación, calculados a mano:
 *
 *  - Best Ball gross: el equipo anota el MEJOR golpe de sus jugadores en cada hoyo (no la suma, no el peor). Un hoyo
 *    que anotó un solo jugador cuenta para el equipo (Thru). Los equipos se ordenan por vs-par, no por orden de alta.
 *    Al tocar un equipo se abren las tarjetas de sus jugadores.
 *  - Scramble gross: los golpes son del equipo (ronda_equipos.scores); el hándicap de equipo que guarda la API es el
 *    USGA de 2 jugadores (35 % del menor + 15 % del mayor) y se muestra en la fila.
 *
 * Par de Los Leones hoyos 1-4 = 4, 4, 3, 5 (se verifica contra course_holes antes de afirmar vs-par).
 * Corre contra la app local + base de pruebas (`e2e-local.mjs`); borra sus rondas en afterAll.
 */

const PAR_HOYOS_1_A_4 = [4, 4, 3, 5]
const rondasCreadas: string[] = []

interface JugadorBody {
  nombre: string
  handicap: number | null
}

async function crearRondaPorEquipos(
  request: APIRequestContext,
  formato: 'best_ball' | 'scramble',
  jugadores: JugadorBody[],
  equipos: { nombre: string; jugadorIndices: number[] }[],
): Promise<{ id: string; codigo: string }> {
  const res = await request.post('/api/ronda-libre/create', {
    data: {
      course_id: DEFAULT_COURSE_ID,
      course_name: 'Los Leones',
      tees: 'blanco',
      holes: 18,
      fecha: new Date().toISOString().slice(0, 10),
      hoyo_inicio: 1,
      formato_juego: formato,
      modo_juego: 'gross',
      admin_mode: true,
      jugadores: jugadores.map((j, i) => ({ ...j, user_id: null, tees: 'blanco', is_guest: i > 0 })),
      equipos,
    },
  })
  const body = await res.json()
  expect(res.status(), `create ${formato}: ${JSON.stringify(body)}`).toBe(200)
  rondasCreadas.push(body.ronda_id)
  return { id: body.ronda_id, codigo: body.codigo }
}

/** Tarjeta de un jugador (por nombre) de la ronda. */
async function anotarJugador(rondaId: string, nombre: string, scores: Record<string, number>): Promise<void> {
  const filas = await sinError(
    `scores de ${nombre}`,
    adminClient().from('ronda_libre_jugadores').update({ scores }).eq('ronda_id', rondaId).eq('nombre', nombre).select('id'),
  )
  expect(filas, `jugador ${nombre} en la ronda`).toHaveLength(1)
}

/** Tarjeta de un equipo (scramble: los golpes son del equipo). */
async function anotarEquipo(rondaId: string, nombre: string, scores: Record<string, number>): Promise<void> {
  const filas = await sinError(
    `scores del equipo ${nombre}`,
    adminClient().from('ronda_equipos').update({ scores }).eq('ronda_id', rondaId).eq('nombre', nombre).select('id'),
  )
  expect(filas, `equipo ${nombre} en la ronda`).toHaveLength(1)
}

/** La tarjeta de clasificación de equipos: la caja más interna con el rótulo del formato y la columna Thru. */
function tablaDeEquipos(page: Page, rotulo: 'Best Ball' | 'Scramble'): Locator {
  return page
    .locator('div')
    .filter({ has: page.getByText(rotulo, { exact: true }) })
    .filter({ has: page.getByText('Thru', { exact: true }) })
    .last()
}

/** Fila (hija directa de la tabla) de un equipo. */
function filaDe(tabla: Locator, equipo: string): Locator {
  return tabla.locator(':scope > div').filter({ hasText: equipo })
}

/** Celdas de una fila: posición, equipo (+ jugadores), score, thru. */
async function celdas(fila: Locator): Promise<string[]> {
  const grid = fila.locator(':scope > div').first()
  return grid.locator(':scope > *').allInnerTexts()
}

test.describe('Ronda libre por equipos — clasificación', () => {
  test.beforeAll(async () => {
    const hoyos = await sinError(
      'par de Los Leones',
      adminClient().from('course_holes').select('numero, par').eq('course_id', DEFAULT_COURSE_ID).lte('numero', 4).order('numero'),
    )
    // Si el par de la cancha cambia, los vs-par de abajo dejan de ser ciertos: fallar acá, no en un número raro.
    expect((hoyos ?? []).map(h => h.par), 'par de Los Leones hoyos 1-4').toEqual(PAR_HOYOS_1_A_4)
  })

  test.afterAll(async () => {
    for (const id of rondasCreadas) await cleanupRondaFixture(id)
  })

  test('Best Ball gross: mejor bola por hoyo, orden por vs-par, Thru y tarjetas del equipo', async ({ page }) => {
    const { id, codigo } = await crearRondaPorEquipos(
      page.request,
      'best_ball',
      [
        { nombre: 'Ana Cóndor', handicap: 12 },
        { nombre: 'Beto Cóndor', handicap: 18 },
        { nombre: 'Caro Águila', handicap: 8 },
        { nombre: 'Dani Águila', handicap: 22 },
      ],
      [
        { nombre: 'Los Cóndores', jugadorIndices: [0, 1] },
        { nombre: 'Las Águilas', jugadorIndices: [2, 3] },
      ],
    )

    // Equipos y miembros quedaron grabados como los mandó el wizard.
    const equipos = await sinError(
      'equipos de la ronda',
      adminClient().from('ronda_equipos').select('nombre, handicap_equipo, ronda_equipo_jugadores(orden)').eq('ronda_id', id),
    )
    expect((equipos ?? []).map(e => e.nombre).sort()).toEqual(['Las Águilas', 'Los Cóndores'])
    for (const e of equipos ?? []) {
      expect(e.ronda_equipo_jugadores, `miembros de ${e.nombre}`).toHaveLength(2)
      expect(e.handicap_equipo, 'Best Ball no tiene hándicap de equipo').toBeNull()
    }

    // Cóndores: mejor bola 4, 4, 3 y el hoyo 4 sólo lo anotó Ana (6) → 17 contra par 16 = +1, Thru 4.
    //   (sumando las dos tarjetas serían 37; con la peor bola, 18.)
    await anotarJugador(id, 'Ana Cóndor', { '1': 4, '2': 5, '3': 3, '4': 6 })
    await anotarJugador(id, 'Beto Cóndor', { '1': 5, '2': 4, '3': 4 })
    // Águilas: mejor bola 3, 5, 2 → 10 contra par 11 = -1, Thru 3. Se creó segundo y va primero.
    await anotarJugador(id, 'Caro Águila', { '1': 3, '2': 5, '3': 4 })
    await anotarJugador(id, 'Dani Águila', { '1': 5, '2': 6, '3': 2 })

    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))
    await page.goto(`/ronda-libre/${codigo}`, { waitUntil: 'domcontentloaded' })

    const tabla = tablaDeEquipos(page, 'Best Ball')
    await expect(tabla).toBeVisible({ timeout: 20_000 })
    await expect(tabla.getByText('Gross', { exact: true })).toBeVisible()
    await expect(tabla.getByText('+/- Par', { exact: true })).toBeVisible()

    const aguilas = filaDe(tabla, 'Las Águilas')
    const condores = filaDe(tabla, 'Los Cóndores')
    await expect(aguilas).toHaveCount(1)
    await expect(condores).toHaveCount(1)

    const [posA, equipoA, scoreA, thruA] = await celdas(aguilas)
    expect(posA.trim()).toBe('1')
    expect(equipoA).toContain('Caro Águila · Dani Águila')
    expect(scoreA.trim()).toBe('-1')
    expect(thruA.trim()).toBe('3')

    const [posC, equipoC, scoreC, thruC] = await celdas(condores)
    expect(posC.trim()).toBe('2')
    expect(equipoC).toContain('Ana Cóndor · Beto Cóndor')
    expect(scoreC.trim()).toBe('+1')
    expect(thruC.trim()).toBe('4')

    // El líder va arriba en el DOM (no sólo con el número 1).
    const texto = await tabla.innerText()
    expect(texto.indexOf('Las Águilas')).toBeLessThan(texto.indexOf('Los Cóndores'))

    // Tocar el equipo abre la tarjeta de cada jugador; tocar de nuevo la cierra.
    await aguilas.getByRole('button').click()
    await expect(aguilas.getByText('Best Ball Gross').first()).toBeVisible()
    await expect(aguilas.getByText('Caro Águila').nth(1)).toBeVisible()
    await expect(aguilas.getByText('Dani Águila').nth(1)).toBeVisible()
    await aguilas.getByRole('button').first().click()
    await expect(aguilas.getByText('Best Ball Gross')).toHaveCount(0)

    expect(pageErrors, 'errores JS en la vista de la ronda').toEqual([])
  })

  test('Scramble gross: golpes del equipo, hándicap USGA de equipo y orden por vs-par', async ({ page }) => {
    const { id, codigo } = await crearRondaPorEquipos(
      page.request,
      'scramble',
      [
        { nombre: 'Eli Halcón', handicap: 10 },
        { nombre: 'Fede Halcón', handicap: 20 },
        { nombre: 'Gabi Zorzal', handicap: 4 },
        { nombre: 'Hugo Zorzal', handicap: 30 },
      ],
      [
        { nombre: 'Los Halcones', jugadorIndices: [0, 1] },
        { nombre: 'Los Zorzales', jugadorIndices: [2, 3] },
      ],
    )

    // Hándicap de equipo USGA, 2 jugadores: 35 % del menor + 15 % del mayor.
    //   Halcones 0,35×10 + 0,15×20 = 6,5 · Zorzales 0,35×4 + 0,15×30 = 5,9
    const equipos = await sinError(
      'equipos de la ronda',
      adminClient().from('ronda_equipos').select('nombre, handicap_equipo').eq('ronda_id', id).order('nombre'),
    )
    expect((equipos ?? []).map(e => [e.nombre, Number(e.handicap_equipo)])).toEqual([
      ['Los Halcones', 6.5],
      ['Los Zorzales', 5.9],
    ])

    // Halcones 5, 4, 3 = 12 contra par 11 → +1 · Zorzales 4, 4, 3 = 11 → E. Ambos Thru 3.
    await anotarEquipo(id, 'Los Halcones', { '1': 5, '2': 4, '3': 3 })
    await anotarEquipo(id, 'Los Zorzales', { '1': 4, '2': 4, '3': 3 })

    const pageErrors: string[] = []
    page.on('pageerror', e => pageErrors.push(e.message))
    await page.goto(`/ronda-libre/${codigo}`, { waitUntil: 'domcontentloaded' })

    const tabla = tablaDeEquipos(page, 'Scramble')
    await expect(tabla).toBeVisible({ timeout: 20_000 })
    await expect(tabla.getByText('Gross', { exact: true })).toBeVisible()

    const [posZ, equipoZ, scoreZ, thruZ] = await celdas(filaDe(tabla, 'Los Zorzales'))
    expect(posZ.trim()).toBe('1')
    expect(equipoZ).toContain('Gabi Zorzal · Hugo Zorzal')
    expect(equipoZ).toContain('HCP 5.9')
    expect(scoreZ.trim()).toBe('E')
    expect(thruZ.trim()).toBe('3')

    const [posH, equipoH, scoreH, thruH] = await celdas(filaDe(tabla, 'Los Halcones'))
    expect(posH.trim()).toBe('2')
    expect(equipoH).toContain('Eli Halcón · Fede Halcón')
    expect(equipoH).toContain('HCP 6.5')
    expect(scoreH.trim()).toBe('+1')
    expect(thruH.trim()).toBe('3')

    expect(pageErrors, 'errores JS en la vista de la ronda').toEqual([])
  })
})
