import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test'
import {
  adminClient,
  DEFAULT_COURSE_ID,
  createEphemeralUser,
  deleteEphemeralUser,
  sinError,
  sufijo,
} from './helpers/ronda-fixture'
import { exigirBaseDePruebas } from './helpers/base-de-pruebas'

/**
 * Leaderboard en vivo de un torneo por API — `/api/torneo/[slug]/live` (pública, CDN) y `/api/torneo/[slug]/neto`
 * (con sesión). Es lo que consulta cada espectador cada 10 s desde el incidente del torneo Los Leones (04-oct-2026).
 *
 * Qué se protege (datos, no "carga"):
 *  - Orden, golpes brutos, vs-par y hoyos jugados de cada jugador, calculados contra el par REAL de cada hoyo.
 *  - Privacidad (decisión de Juanjo, 08-oct-2026, regla canónica `vistaPublica`): sin sesión, en el camino de ronda
 *    libre NO viaja nada neto; en un torneo NETO viaja sólo el bruto (ni handicap de nadie: handicap + bruto = neto);
 *    en uno GROSS el handicap de un jugador con cuenta (sale de su perfil) no viaja, el del invitado (tipeado) sí.
 *  - Con sesión, `/neto` devuelve la clasificación neta completa, privada y sin CDN.
 *  - Puertas: slug inexistente o borrador → 404 (nunca un leaderboard vacío); query string → 400 (saltaría el CDN).
 *
 * Fixture realista: torneo de un organizador efímero con UN grupo que juega en una ronda libre (la materialización
 * real): un jugador con cuenta (usuario efímero con índice en el perfil, tarjeta sin handicap) y dos invitados. SOLO
 * base de pruebas (`node --env-file=.env.local scripts/test-db/e2e-local.mjs -- torneo-live-api.spec.ts
 * --project=mobile-chromium-auth`): un torneo en curso se ve en /en-vivo. Todo se borra en afterAll.
 */

// Par de los hoyos 1-9 de Los Leones según course_holes (el par que usa el motor para el vs-par).
const PAR_1_9 = [4, 4, 3, 5, 4, 3, 4, 4, 5]
const conSobre = (hoyos: number, sobre: number[]) =>
  Object.fromEntries(PAR_1_9.slice(0, hoyos).map((p, i) => [String(i + 1), p + (sobre[i] ?? 0)]))

const parJugado = (thru: number) => PAR_1_9.slice(0, thru).reduce((a, b) => a + b, 0)

// Tarjetas: Andrés (cuenta) +2 con 9, Carla +3 con 5, Beto +6 con 9 → orden bruto Andrés, Carla, Beto.
// Carla tiene MENOS golpes (23) que Andrés (38) pero peor vs-par: a mitad de vuelta se ordena por vs-par, no por golpes.
const JUGADORES = {
  cuenta: { nombre: 'E2E Andrés Cuenta', scores: conSobre(9, [1, 0, 0, 1]), gross: 38, vsPar: 2, thru: 9 },
  carla: { nombre: 'E2E Carla Invitada', handicap: 20, scores: conSobre(5, [1, 1, 1]), gross: 23, vsPar: 3, thru: 5 },
  beto: { nombre: 'E2E Beto Invitado', handicap: 10, scores: conSobre(9, [1, 1, 1, 1, 1, 1]), gross: 42, vsPar: 6, thru: 9 },
}
const ORDEN_BRUTO = [JUGADORES.cuenta.nombre, JUGADORES.carla.nombre, JUGADORES.beto.nombre]
const INDICE_PERFIL = 14.2

interface FilaLive {
  name: string
  gross_total: number
  vs_par: number
  thru: number
  handicap_index?: number
  net_total?: number
  points_total?: number
}
interface RespuestaLive {
  tournament: { modo: string; modoReal: string; caminoRondaLibre: boolean; status: string; par_total: number; vista: { sinNeto: boolean; soloBruto: boolean } }
  players: FilaLive[]
}

let organizadorId = ''
let cuentaId = ''
const torneos: string[] = []
const rondas: string[] = []
let anonimo: APIRequestContext

/** Torneo en curso en Los Leones con un grupo en ronda libre y los 3 jugadores con sus tarjetas. */
async function crearTorneo(modo: 'gross' | 'neto', status = 'in_progress'): Promise<string> {
  const sb = adminClient()
  const slug = `e2e-live-${modo}-${sufijo()}`
  const t = await sinError('insert tournaments', sb.from('tournaments').insert({
    name: `E2E Live ${modo} ${slug.slice(-8)}`,
    slug,
    organizer_id: organizadorId,
    course_id: DEFAULT_COURSE_ID,
    course_name: 'Los Leones',
    date_start: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }),
    format: 'stroke_play',
    formato_juego: 'stroke_play',
    modo_juego: modo,
    hole_count: 18,
    status,
  }).select('id').single()) as { id: string }
  torneos.push(t.id)

  const r = await sinError('insert rondas_libres', sb.from('rondas_libres').insert({
    codigo: sufijo().slice(0, 6).toUpperCase(),
    course_id: DEFAULT_COURSE_ID,
    course_name: 'Los Leones',
    tees: 'blanco',
    holes: 18,
    fecha: new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }),
    hoyo_inicio: 1,
    formato_juego: 'stroke_play',
    modo_juego: modo,
    admin_mode: false,
    estado: 'en_curso',
    creador_id: organizadorId,
  }).select('id').single()) as { id: string }
  rondas.push(r.id)

  const { cuenta, beto, carla } = JUGADORES
  await sinError('insert ronda_libre_jugadores', sb.from('ronda_libre_jugadores').insert([
    // Con cuenta y SIN handicap en la tarjeta: el índice sale del perfil (handicap_de_perfil).
    { ronda_id: r.id, user_id: cuentaId, nombre: cuenta.nombre, handicap: null, tees: 'blanco', scores: cuenta.scores, is_guest: false },
    { ronda_id: r.id, user_id: null, nombre: beto.nombre, handicap: beto.handicap, tees: 'blanco', scores: beto.scores, is_guest: true },
    { ronda_id: r.id, user_id: null, nombre: carla.nombre, handicap: carla.handicap, tees: 'blanco', scores: carla.scores, is_guest: true },
  ]).select('id'))
  await sinError('insert tournament_groups', sb.from('tournament_groups').insert({
    tournament_id: t.id, name: 'Grupo 1', ronda_libre_id: r.id, sort_order: 0,
  }).select('id'))
  return slug
}

async function getLive(slug: string, sufijoUrl = '') {
  const res = await anonimo.get(`/api/torneo/${slug}/live${sufijoUrl}`)
  return { res, body: (await res.json().catch(() => null)) as RespuestaLive | null }
}

function fila(body: RespuestaLive, nombre: string): FilaLive {
  const f = body.players.find(p => p.name === nombre)
  expect(f, `${nombre} está en el leaderboard`).toBeTruthy()
  return f!
}

/** Lo que tiene que valer siempre, con o sin sesión: golpes brutos y hoyos jugados de cada tarjeta. */
function verificarBrutos(body: RespuestaLive) {
  expect(body.players, 'los 3 jugadores del grupo').toHaveLength(3)
  for (const j of Object.values(JUGADORES)) {
    const f = fila(body, j.nombre)
    expect(f.gross_total, `${j.nombre}: golpes brutos`).toBe(j.gross)
    expect(f.thru, `${j.nombre}: hoyos jugados`).toBe(j.thru)
  }
}

/** Vista en bruto: vs-par de cada jugador contra el par de los hoyos que jugó, y orden por vs-par. */
function verificarClasificacionBruta(body: RespuestaLive) {
  for (const j of Object.values(JUGADORES)) expect(fila(body, j.nombre).vs_par, `${j.nombre}: vs-par bruto`).toBe(j.vsPar)
  expect(body.players.map(p => p.name)).toEqual(ORDEN_BRUTO)
}

test.describe.configure({ mode: 'serial' })

test.describe('Torneo en vivo por API: datos correctos y privacidad por visor', () => {
  test.beforeAll(async ({}, testInfo) => {
    exigirBaseDePruebas('torneo-live-api.spec.ts')
    organizadorId = await createEphemeralUser('e2e-org-live-api')
    cuentaId = await createEphemeralUser('e2e-jug-live-api')
    await sinError('update profiles', adminClient().from('profiles')
      .update({ name: JUGADORES.cuenta.nombre, indice: INDICE_PERFIL }).eq('id', cuentaId).select('id').single())
    // Cliente SIN cookies: lo que ve un espectador anónimo (y lo que cachea el CDN para todos).
    anonimo = await pwRequest.newContext({ baseURL: testInfo.project.use.baseURL, storageState: { cookies: [], origins: [] } })
  })

  test.afterAll(async () => {
    await anonimo?.dispose()
    const sb = adminClient()
    const errs: string[] = []
    // tournaments arrastra grupos (CASCADE); tournament_groups.ronda_libre_id es NO ACTION → la ronda va DESPUÉS.
    for (const id of torneos) {
      const { error } = await sb.from('tournaments').delete().eq('id', id)
      if (error) errs.push(`tournaments ${id}: ${error.message}`)
    }
    for (const id of rondas) {
      const { error } = await sb.from('rondas_libres').delete().eq('id', id)
      if (error) errs.push(`rondas_libres ${id}: ${error.message}`)
    }
    if (errs.length === 0) {
      if (cuentaId) errs.push(...(await deleteEphemeralUser(cuentaId)))
      if (organizadorId) errs.push(...(await deleteEphemeralUser(organizadorId)))
    }
    if (errs.length > 0) throw new Error(`Limpieza incompleta: ${errs.join(' · ')}`)
  })

  test('torneo NETO sin sesión: sólo bruto — orden por vs-par, sin neto ni handicap de nadie, cacheable', async () => {
    const slug = await crearTorneo('neto')
    const { res, body } = await getLive(slug)
    expect(res.status()).toBe(200)
    expect(res.headers()['cache-control'], 'al navegador nunca stale (el CDN cachea aparte)').toBe('public, max-age=0, must-revalidate')
    expect(body).not.toBeNull()

    expect(body!.tournament.caminoRondaLibre).toBe(true)
    expect(body!.tournament.modoReal).toBe('neto')
    expect(body!.tournament.modo, 'la vista pública de un torneo neto se arma en bruto').toBe('gross')
    expect(body!.tournament.vista).toMatchObject({ sinNeto: true, soloBruto: true })
    expect(body!.tournament.status).toBe('in_progress')

    verificarBrutos(body!)
    verificarClasificacionBruta(body!)

    // Con cualquiera de estos más el bruto se deduce el handicap (y de ahí el índice): no viajan, ni como clave.
    for (const p of body!.players) {
      expect(p, `${p.name}: sin handicap`).not.toHaveProperty('handicap_index')
      expect(p, `${p.name}: sin neto`).not.toHaveProperty('net_total')
      expect(p, `${p.name}: sin puntos`).not.toHaveProperty('points_total')
    }
  })

  test('torneo NETO con sesión (/neto): clasificación neta completa, privada y sin CDN', async ({ request }) => {
    // `request` del proyecto auth = sesión del usuario E2E (cualquier visor con sesión ve el neto; no exige PRO).
    const slug = await crearTorneo('neto')
    const res = await request.get(`/api/torneo/${slug}/neto`)
    expect(res.status()).toBe(200)
    expect(res.headers()['cache-control'], 'privada: nunca al CDN').toBe('private, no-store')
    expect(Number(res.headers()['x-armado-hace']), '"Actualizado hace N s" sale de este header').toBeGreaterThanOrEqual(0)
    const body = await res.json() as RespuestaLive

    expect(body.tournament.modo).toBe('neto')
    expect(body.tournament.vista).toMatchObject({ sinNeto: false, soloBruto: false })
    verificarBrutos(body)
    for (const p of body.players) {
      expect(typeof p.net_total, `${p.name}: con sesión viaja el neto`).toBe('number')
      expect(typeof p.handicap_index, `${p.name}: con sesión viaja el handicap`).toBe('number')
      expect(p.net_total!, `${p.name}: con handicap positivo el neto es menor que el bruto`).toBeLessThan(p.gross_total)
      // En un torneo neto el SCORE es neto vs el par de los hoyos jugados (no el bruto, no el par de 18).
      expect(p.vs_par, `${p.name}: vs-par neto = neto − par jugado`).toBe(p.net_total! - parJugado(p.thru))
    }
    // Clasificación neta: de menor a mayor vs-par neto.
    const vsPar = body.players.map(p => p.vs_par)
    expect(vsPar, 'ordenado por vs-par neto').toEqual([...vsPar].sort((a, b) => a - b))
    // El jugador con cuenta no anotó handicap en la tarjeta: el suyo sale del índice de su perfil (14,2 → handicap de
    // cancha). Sin leer el perfil sería 0 y su neto igual al bruto.
    expect(fila(body, JUGADORES.cuenta.nombre).handicap_index, 'handicap del jugador con cuenta desde su perfil').toBeGreaterThan(0)

    // Y sin sesión la misma ruta se cierra (el neto es sólo para visores con sesión).
    const sinSesion = await anonimo.get(`/api/torneo/${slug}/neto`)
    expect(sinSesion.status()).toBe(401)
  })

  test('torneo GROSS sin sesión: el handicap del invitado viaja, el del jugador con cuenta no; neto nunca', async () => {
    const slug = await crearTorneo('gross')
    const { res, body } = await getLive(slug)
    expect(res.status()).toBe(200)
    expect(body!.tournament.modo).toBe('gross')
    expect(body!.tournament.vista).toMatchObject({ sinNeto: true, soloBruto: false })

    verificarBrutos(body!)
    verificarClasificacionBruta(body!)

    expect(fila(body!, JUGADORES.cuenta.nombre), 'cuenta: su índice sale del perfil → no viaja').not.toHaveProperty('handicap_index')
    expect(typeof fila(body!, JUGADORES.beto.nombre).handicap_index, 'invitado: handicap tipeado en la tarjeta').toBe('number')
    expect(typeof fila(body!, JUGADORES.carla.nombre).handicap_index).toBe('number')
    for (const p of body!.players) expect(p, `${p.name}: sin neto`).not.toHaveProperty('net_total')
  })

  test('puertas: slug inexistente y borrador → 404; query string → 400 sin consultar', async () => {
    const inexistente = await getLive(`e2e-no-existe-${sufijo()}`)
    expect(inexistente.res.status()).toBe(404)

    // Un borrador no es público (RLS): para el espectador no existe, no es un leaderboard vacío.
    const borrador = await crearTorneo('gross', 'draft')
    expect((await getLive(borrador)).res.status()).toBe(404)

    // Cada ?x=<distinto> sería otra clave de cache: un MISS que pega a la base por espectador.
    const conQuery = await getLive(borrador, `?t=${Date.now()}`)
    expect(conQuery.res.status()).toBe(400)
    expect(conQuery.res.headers()['cache-control']).toBe('private, no-store')

    const slugInvalido = await anonimo.get('/api/torneo/NO_VALIDO/live')
    expect(slugInvalido.status()).toBe(404)
  })
})
