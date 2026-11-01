import { test, expect, devices, request as pwRequest, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test'
import { randomUUID } from 'crypto'
import {
  adminClient,
  DEFAULT_COURSE_ID,
  DEFAULT_COURSE_NAME,
  createEphemeralUser,
  createEphemeralUserConCredenciales,
  deleteEphemeralUser,
  sinError,
  sufijo,
} from './helpers/ronda-fixture'

/**
 * Invitado en un torneo: se inscribe SIN cuenta, anota con su token, y después se crea una cuenta y RECLAMA
 * al jugador. Es el camino del torneo por WhatsApp: el organizador manda el link y el socio que no tiene la
 * app entra igual. Hasta ahora no tenía ni un test E2E (`guest-join`/`guest-claim`: cero menciones en `e2e/`).
 *
 * Lo que se afirma es lo que QUEDA GUARDADO, no lo que se ve:
 *  - `players` queda con `pending_user_id` = el guestId del cliente y `user_id` NULL (sin ese vínculo el
 *    invitado entraba al scorer sin poder anotar y al reintentar se inscribía OTRA vez, con el nombre
 *    duplicado en el leaderboard).
 *  - un índice imposible (185 tipeado por 18.5) NO entra: iba directo al neto y ganaba el torneo.
 *  - el `guestToken` firmado anota en `hole_scores`; el token de OTRO invitado no escribe nada (403).
 *  - al reclamar, el jugador pasa a la cuenta y los scores anotados como invitado siguen ahí: si el claim
 *    los perdiera, el socio quedaría en cero después de jugar.
 *
 * SOLO base de pruebas (el spec inscribe y anota con la service key):
 *   node --env-file=.env.local scripts/test-db/e2e-local.mjs -- torneo-invitado-join-claim.spec.ts --project=mobile-chromium-auth
 * Contra prod se corta en beforeAll (lo exige `exigirBaseDePruebas` del global-setup). Todo lo creado se
 * borra en afterAll.
 */

interface Torneo { id: string; slug: string; nombre: string }

let organizadorId = ''
let socio = { id: '', email: '', password: '' }
let anon: APIRequestContext
let ctx: BrowserContext
let page: Page

const NOMBRE_INVITADO = 'E2E Invitado Perez'
const INDICE_INVITADO = 14.2

/**
 * Torneo del organizador efímero en la cancha de pruebas. `status` decide si se puede entrar ('open') y si se
 * puede anotar ('active'). El organizador es Pro: `guest-tournament` es feature Pro y el gate lee
 * `profiles.subscription_tier`, así que el test no depende de si el paywall está prendido.
 */
async function crearTorneo(opts: { status: string; maxPlayers?: number | null }): Promise<Torneo> {
  const slug = `e2e-inv-${sufijo()}`
  const nombre = `E2E Invitado ${slug.slice(-8)}`
  const t = await sinError('insert tournaments', adminClient().from('tournaments').insert({
    name: nombre,
    slug,
    organizer_id: organizadorId,
    course_id: DEFAULT_COURSE_ID,
    course_name: DEFAULT_COURSE_NAME,
    date_start: new Date().toISOString().slice(0, 10),
    format: 'stroke_play',
    hole_count: 18,
    status: opts.status,
    hcp_calc_mode: 'whs',
    max_players: opts.maxPlayers ?? null,
  }).select('id').single())
  return { id: (t as { id: string }).id, slug, nombre }
}

async function activarTorneo(t: Torneo) {
  await sinError('update tournaments status', adminClient().from('tournaments')
    .update({ status: 'active' }).eq('id', t.id).select('id').single())
}

interface FilaJugador {
  id: string
  user_id: string | null
  pending_user_id: string | null
  player_name: string | null
  handicap_at_registration: number | null
  status: string
  rounds: Array<{ id: string; status: string }>
}

/** Todas las filas de `players` del torneo, con su ronda. La cardinalidad es parte de lo que se afirma. */
async function jugadoresEnBase(t: Torneo): Promise<FilaJugador[]> {
  const filas = await sinError('select players', adminClient().from('players')
    .select('id, user_id, pending_user_id, player_name, handicap_at_registration, status, rounds(id, status)')
    .eq('tournament_id', t.id).order('created_at', { ascending: true }))
  return (filas ?? []) as unknown as FilaJugador[]
}

/**
 * IP distinta por llamada. `guest-join` frena 10 inscripciones por minuto y por IP (`checkRateLimit`, ventana
 * fija en memoria) y cuenta ANTES de validar, así que los rechazos también suman: sin esto el spec gastaba el
 * cupo a mitad de camino y el resultado dependía de en qué segundo caía cada test. El freno se prueba aparte,
 * a propósito, en su propio test.
 */
let nIp = 0
function ipUnica(): string {
  nIp += 1
  return `203.0.113.${nIp % 254 + 1}:${nIp}`
}

/** POST /guest-join SIN sesión: así entra el invitado de verdad. */
async function guestJoin(
  t: Torneo,
  data: { guestId?: unknown; name?: unknown; handicap?: unknown },
  ip: string = ipUnica(),
) {
  const res = await anon.post(`/api/torneos/${t.slug}/guest-join`, {
    headers: { 'x-forwarded-for': ip },
    data,
  })
  return {
    status: res.status(),
    body: await res.json().catch(() => ({})) as {
      ok?: boolean; playerId?: string; guestToken?: string; alreadyRegistered?: boolean; error?: string
    },
  }
}

/** POST /api/game upsert_score con los headers del invitado (los mismos que manda /torneo/[slug]/score). */
async function anotarComoInvitado(opts: {
  torneo: Torneo; roundId: string; guestId: string; guestToken: string; hole: number; gross: number
}) {
  const res = await anon.post('/api/game', {
    headers: { 'x-guest-id': opts.guestId, 'x-guest-token': opts.guestToken },
    data: {
      action: 'upsert_score',
      tournament_id: opts.torneo.id,
      round_id: opts.roundId,
      hole_number: opts.hole,
      gross_score: opts.gross,
    },
  })
  return {
    status: res.status(),
    body: await res.json().catch(() => ({})) as { success?: boolean; error?: string; code?: string },
  }
}

async function holeScores(roundId: string) {
  const filas = await sinError('select hole_scores', adminClient().from('hole_scores')
    .select('hole_number, gross_score').eq('round_id', roundId).order('hole_number', { ascending: true }))
  return (filas ?? []) as Array<{ hole_number: number; gross_score: number | null }>
}

/** POST /guest-claim con la sesión del socio que acaba de crear su cuenta. */
async function guestClaim(t: Torneo, guestId: unknown) {
  const res = await page.request.post(`/api/torneos/${t.slug}/guest-claim`, { data: { guestId } })
  return {
    status: res.status(),
    body: await res.json().catch(() => ({})) as { ok?: boolean; playerId?: string; error?: string },
  }
}

test.describe.configure({ mode: 'serial' })

test.describe('Torneo: el invitado se inscribe sin cuenta, anota con su token y después reclama al jugador', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    organizadorId = await createEphemeralUser('e2e-org-invitado')
    // `guest-tournament` es feature Pro: el organizador tiene que serlo o el join responde 403 pro_required.
    await sinError('update organizador pro', adminClient().from('profiles')
      .update({ subscription_tier: 'pro', subscription_status: 'active' })
      .eq('id', organizadorId).select('id').single())
    socio = await createEphemeralUserConCredenciales('e2e-socio-invitado')
    // El socio hereda el nombre del invitado al reclamar: su perfil parte SIN nombre a propósito.
    await sinError('update socio sin nombre', adminClient().from('profiles')
      .update({ name: null, indice: null }).eq('id', socio.id).select('id').single())

    // Contexto sin cookies: el invitado no tiene sesión, es su razón de ser.
    anon = await pwRequest.newContext({ baseURL: testInfo.project.use.baseURL })
    ctx = await browser.newContext({
      ...devices['Pixel 5'],
      baseURL: testInfo.project.use.baseURL,
      storageState: { cookies: [], origins: [] },
    })
    page = await ctx.newPage()
  })

  test.afterAll(async () => {
    await anon?.dispose()
    await ctx?.close()
    const errs: string[] = []
    // Borra los torneos del organizador (players, rounds y hole_scores caen por ON DELETE CASCADE).
    if (organizadorId) errs.push(...(await deleteEphemeralUser(organizadorId)))
    if (socio.id) errs.push(...(await deleteEphemeralUser(socio.id)))
    if (errs.length > 0) throw new Error(`Limpieza incompleta: ${errs.join(' · ')}`)
  })

  let torneo: Torneo
  const guestId = randomUUID()
  let guestToken = ''
  let playerId = ''
  let roundId = ''

  test('se inscribe sin cuenta: queda vinculado por guestId, con su índice crudo y su ronda', async () => {
    torneo = await crearTorneo({ status: 'open' })
    const r = await guestJoin(torneo, { guestId, name: NOMBRE_INVITADO, handicap: INDICE_INVITADO })
    expect(r.status, r.body.error ?? '').toBe(200)
    expect(r.body.ok).toBe(true)
    expect(r.body.playerId, 'devuelve el jugador creado').toBeTruthy()
    expect(r.body.guestToken, 'devuelve el token firmado para anotar').toMatch(/^[0-9a-f]{64}$/)
    expect(r.body.alreadyRegistered, 'es la primera vez').toBeFalsy()
    playerId = r.body.playerId!
    guestToken = r.body.guestToken!

    const filas = await jugadoresEnBase(torneo)
    expect(filas, 'un solo jugador inscrito').toHaveLength(1)
    expect(filas[0].id).toBe(playerId)
    // El vínculo: sin pending_user_id = guestId del cliente, el token no apunta a ningún jugador.
    expect(filas[0].pending_user_id, 'vinculado al guestId del cliente, no al del RPC').toBe(guestId)
    expect(filas[0].user_id, 'invitado: todavía sin cuenta').toBeNull()
    expect(filas[0].player_name).toBe(NOMBRE_INVITADO)
    // WHS guarda el ÍNDICE crudo: el leaderboard convierte con el tee de cada jugador.
    expect(Number(filas[0].handicap_at_registration), 'WHS: índice crudo, sin convertir').toBe(INDICE_INVITADO)
    expect(filas[0].rounds, 'su ronda del torneo quedó creada').toHaveLength(1)
    roundId = filas[0].rounds[0].id
  })

  test('un índice imposible (185 por 18.5) no entra, y tampoco un nombre de una letra ni un guestId falso', async () => {
    const casos: Array<{ data: Record<string, unknown>; error: string; que: string }> = [
      // Un "185" tipeado por 18.5 entra directo al neto del leaderboard y gana el torneo.
      { data: { guestId: randomUUID(), name: 'E2E Dedo Gordo', handicap: 185 }, error: 'invalid_handicap', que: 'índice 185' },
      { data: { guestId: randomUUID(), name: 'E2E Negativo', handicap: -20 }, error: 'invalid_handicap', que: 'índice -20' },
      { data: { guestId: randomUUID(), name: 'X' }, error: 'invalid_name', que: 'nombre de una letra' },
      { data: { guestId: 'no-soy-un-uuid', name: 'E2E Nombre Valido' }, error: 'invalid_guest_id', que: 'guestId que no es UUID' },
    ]
    for (const c of casos) {
      const r = await guestJoin(torneo, c.data)
      expect(r.status, `${c.que}: se rechaza`).toBe(400)
      expect(r.body.error, c.que).toBe(c.error)
    }
    expect(await jugadoresEnBase(torneo), 'ningún rechazo creó un jugador').toHaveLength(1)
  })

  test('reintentar con el MISMO guestId no duplica el nombre en el leaderboard', async () => {
    // El cliente reintenta (volvió a abrir el link, se le cortó la red): tiene que recuperar SU jugador.
    const r = await guestJoin(torneo, { guestId, name: NOMBRE_INVITADO, handicap: INDICE_INVITADO })
    expect(r.status).toBe(200)
    expect(r.body.alreadyRegistered, 'lo reconoce como ya inscrito').toBe(true)
    expect(r.body.playerId, 'el MISMO jugador, no uno nuevo').toBe(playerId)
    expect(r.body.guestToken, 'y el mismo token firmado').toBe(guestToken)
    expect(await jugadoresEnBase(torneo), 'sigue un solo jugador').toHaveLength(1)
  })

  test('con el torneo abierto (no activo) el invitado no puede anotar todavía', async () => {
    const r = await anotarComoInvitado({ torneo, roundId, guestId, guestToken, hole: 1, gross: 4 })
    expect(r.status, 'torneo no activo: 409').toBe(409)
    expect(r.body.code).toBe('tournament_inactive')
    expect(await holeScores(roundId), 'no se guardó ningún score').toHaveLength(0)
  })

  test('con su token anota de verdad; con el token de otro invitado no escribe nada', async () => {
    await activarTorneo(torneo)
    const golpes: Array<[number, number]> = [[1, 4], [2, 5], [3, 3]]
    for (const [hole, gross] of golpes) {
      const r = await anotarComoInvitado({ torneo, roundId, guestId, guestToken, hole, gross })
      expect(r.status, `hoyo ${hole}: ${r.body.error ?? ''}`).toBe(200)
      expect(r.body.success).toBe(true)
    }
    expect(await holeScores(roundId), 'quedaron los 3 hoyos anotados')
      .toEqual(golpes.map(([hole_number, gross_score]) => ({ hole_number, gross_score })))

    // Un token firmado para OTRO guestId: el HMAC es válido pero no es dueño de esta ronda.
    const otro = randomUUID()
    const rOtro = await guestJoin(torneo, { guestId: otro, name: 'E2E Otro Invitado' })
    expect(rOtro.status, rOtro.body.error ?? '').toBe(200)
    const robo = await anotarComoInvitado({
      torneo, roundId, guestId: otro, guestToken: rOtro.body.guestToken!, hole: 4, gross: 10,
    })
    expect(robo.status, 'el token de otro no puede anotar en esta ronda').toBe(403)

    // Un token inventado para el guestId correcto: el HMAC no cuadra.
    const falso = await anotarComoInvitado({
      torneo, roundId, guestId, guestToken: 'f'.repeat(64), hole: 4, gross: 10,
    })
    expect(falso.status, 'token que no es el firmado por el server').toBe(403)

    expect(await holeScores(roundId), 'ninguno de los dos escribió el hoyo 4').toHaveLength(3)
  })

  test('crea su cuenta y reclama al jugador: pasa a su user_id y los scores siguen ahí', async () => {
    // Entra con la cuenta que acaba de crear (el socio efímero) por la pantalla de login real.
    await page.goto('/login')
    await page.locator('input[type="email"]').first().fill(socio.email)
    await page.locator('input[placeholder="Tu contraseña"]').first().fill(socio.password)
    await page.locator('form button[type="submit"]').first().click()
    await page.waitForURL(url => !/\/login/.test(url.pathname), { timeout: 45_000 })

    const r = await guestClaim(torneo, guestId)
    expect(r.status, r.body.error ?? '').toBe(200)
    expect(r.body.ok).toBe(true)
    expect(r.body.playerId, 'reclama al MISMO jugador que jugó').toBe(playerId)

    const filas = await jugadoresEnBase(torneo)
    const reclamado = filas.find(f => f.id === playerId)
    expect(reclamado, 'el jugador sigue en el torneo').toBeDefined()
    expect(reclamado!.user_id, 'el jugador quedó en la cuenta del socio').toBe(socio.id)
    // La constraint players_identity_check exige exactamente uno de los dos.
    expect(reclamado!.pending_user_id, 'ya no es un invitado').toBeNull()
    expect(Number(reclamado!.handicap_at_registration), 'el índice con el que jugó no se toca').toBe(INDICE_INVITADO)
    // Lo que de verdad importa: los hoyos jugados como invitado no se pierden al crear la cuenta.
    expect(await holeScores(roundId), 'los scores del invitado sobreviven al claim').toEqual([
      { hole_number: 1, gross_score: 4 },
      { hole_number: 2, gross_score: 5 },
      { hole_number: 3, gross_score: 3 },
    ])

    // El perfil sin nombre hereda el del invitado (así el leaderboard no lo muestra vacío).
    const perfil = await sinError('select profiles', adminClient().from('profiles')
      .select('name').eq('id', socio.id).single()) as { name: string | null }
    expect(perfil.name, 'el perfil sin nombre toma el del invitado').toBe(NOMBRE_INVITADO)
  })

  test('reclamar de nuevo no mueve al jugador ni inscribe una fila de más', async () => {
    const r = await guestClaim(torneo, guestId)
    // Ya no hay un invitado con ese guestId (el claim lo limpió) → 404. Si quedara, el guard de
    // already_claimed/already_registered lo corta igual: lo que no puede pasar es un 200.
    expect([404, 409], `respuesta inesperada: ${r.status} ${r.body.error ?? ''}`).toContain(r.status)
    expect(['already_claimed', 'already_registered', 'not_found']).toContain(r.body.error)

    const filas = await jugadoresEnBase(torneo)
    expect(filas.filter(f => f.user_id === socio.id), 'sigue un solo jugador del socio').toHaveLength(1)
    expect(filas.find(f => f.id === playerId)!.user_id, 'el dueño no cambió').toBe(socio.id)

    // Un guestId que nunca se inscribió: 404, sin crear nada.
    const inexistente = await guestClaim(torneo, randomUUID())
    expect(inexistente.status).toBe(404)
    expect(inexistente.body.error).toBe('not_found')
    // Un guestId que no es UUID: 400 antes de tocar la base.
    const basura = await guestClaim(torneo, 'no-soy-un-uuid')
    expect(basura.status).toBe(400)
    expect(basura.body.error).toBe('missing_guest_id')
  })

  test('con el cupo lleno el invitado no entra y no queda una fila de más', async () => {
    const lleno = await crearTorneo({ status: 'open', maxPlayers: 1 })
    const primero = await guestJoin(lleno, { guestId: randomUUID(), name: 'E2E Invitado Cupo Uno' })
    expect(primero.status, primero.body.error ?? '').toBe(200)

    const segundo = await guestJoin(lleno, { guestId: randomUUID(), name: 'E2E Invitado Cupo Dos' })
    expect(segundo.status, 'cupo lleno: 409').toBe(409)
    expect(segundo.body.error).toBe('tournament_full')
    expect(await jugadoresEnBase(lleno), 'el cupo se respetó: un solo jugador').toHaveLength(1)
  })

  test('un torneo terminado no admite invitados nuevos', async () => {
    const cerrado = await crearTorneo({ status: 'completed' })
    const r = await guestJoin(cerrado, { guestId: randomUUID(), name: 'E2E Invitado Tarde' })
    expect(r.status, 'torneo terminado: no inscribible').toBe(409)
    expect(r.body.error).toBe('not_inscribible')
    expect(await jugadoresEnBase(cerrado), 'sin jugadores').toHaveLength(0)
  })

  test('una ráfaga desde la misma IP se frena en el 11° intento, y el freno cuenta antes de validar', async () => {
    // El freno existe para que nadie infle un torneo con inscripciones automáticas. Se prueba con payload
    // INVÁLIDO: `checkRateLimit` corre antes de validar, así que los 10 primeros responden 400 sin crear nada
    // y el 11° ya es 429. Si algún día el freno se moviera después de la validación, este test lo caza.
    const rafaga = await crearTorneo({ status: 'open' })
    const ip = `198.51.100.7:${Date.now()}`
    for (let i = 1; i <= 10; i++) {
      const r = await guestJoin(rafaga, { guestId: randomUUID(), name: 'X' }, ip)
      expect(r.status, `intento ${i}: todavía dentro del cupo, rechazado por el nombre`).toBe(400)
      expect(r.body.error).toBe('invalid_name')
    }
    const frenado = await guestJoin(rafaga, { guestId: randomUUID(), name: 'E2E Invitado Rafaga' }, ip)
    expect(frenado.status, 'el 11° intento en el minuto se frena').toBe(429)
    expect(frenado.body.error).toBe('rate_limited')

    // Otra IP entra igual: el freno es por IP, no un portón para todo el torneo.
    const otraIp = await guestJoin(rafaga, { guestId: randomUUID(), name: 'E2E Invitado Otra IP' })
    expect(otraIp.status, otraIp.body.error ?? '').toBe(200)
    expect(await jugadoresEnBase(rafaga), 'solo entró el de la otra IP').toHaveLength(1)
  })

  test('un slug que no existe responde 404 en join y en claim', async () => {
    const fantasma = { id: '', slug: `e2e-no-existe-${sufijo()}`, nombre: '' }
    const join = await guestJoin(fantasma, { guestId: randomUUID(), name: 'E2E Invitado Fantasma' })
    expect(join.status).toBe(404)
    expect(join.body.error).toBe('not_found')
    const claim = await guestClaim(fantasma, randomUUID())
    expect(claim.status).toBe(404)
    expect(claim.body.error).toBe('not_found')
  })
})
