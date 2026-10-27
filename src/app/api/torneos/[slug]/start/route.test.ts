// La ruta de inicio no marca el torneo 'in_progress' si una tarjeta no se armó.
// La materialización en sí se prueba en `startTournament.test.ts`.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}))

const statusUpdates: unknown[] = []
const tables: Record<string, { data: unknown; error: unknown }> = {}
/** Resultado del update condicional a in_progress (por defecto: lo ganó esta llamada). */
let updateResult: { data: unknown; error: unknown }
/** Estado del torneo al releerlo antes de deshacer (por defecto: sigue sin iniciar). */
let statusAlReleer: { data: unknown; error: unknown }
function builder(table: string) {
  const result = () => tables[table] ?? { data: [], error: null }
  const obj: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'in']) obj[m] = () => obj
  obj.single = () => Promise.resolve(result())
  obj.maybeSingle = () => Promise.resolve(statusAlReleer)
  obj.update = (patch: unknown) => {
    statusUpdates.push({ table, patch })
    const chain: Record<string, unknown> = {}
    for (const m of ['eq', 'in']) chain[m] = () => chain
    chain.select = () => Promise.resolve(updateResult)
    return chain
  }
  obj.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve)
  return obj
}
vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: () => ({ from: builder }) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => {}) }))
const mockRateLimit = vi.fn()
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: (...a: unknown[]) => mockRateLimit(...a), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/data/tournaments/rounds', () => ({
  fetchRoundPlayConfig: async () => ({ courseId: 'c1', holeCount: 18, date: '2026-10-30' }),
}))

const mockEnsure = vi.fn()
const mockMaterialize = vi.fn()
const mockDeshacer = vi.fn()
/** Relectura final de grupos (antes de poner in_progress). Por defecto: todos armados. */
const mockRelectura = vi.fn()
vi.mock('@/lib/data/tournaments/startTournament', async (orig) => {
  const real = await orig<typeof import('@/lib/data/tournaments/startTournament')>()
  let lecturas = 0
  beforeEach(() => { lecturas = 0 })
  return {
  ...real,
  fetchStartGroups: async (...a: Parameters<typeof real.fetchStartGroups>) =>
    ++lecturas === 1 ? real.fetchStartGroups(...a) : mockRelectura(),
  ensureRound1Cards: (...a: unknown[]) => mockEnsure(...a),
  materializeGroupScorecard: (...a: unknown[]) => mockMaterialize(...a),
  deshacerGrupo: (...a: unknown[]) => mockDeshacer(...a),
  }
})

import { POST } from './route'
import {
  ERROR_CAMBIO_DE_ESTADO,
  ERROR_ESTADO_DESCONOCIDO,
  ERROR_OTRO_INICIO,
  ERROR_SIN_DESHACER,
} from '@/lib/data/tournaments/startTournament'
import type { NextRequest } from 'next/server'

const call = () => POST({} as NextRequest, { params: Promise.resolve({ slug: 'mi-torneo' }) })
const armado = (groupId: string) => ({ ok: true, groupId, rondaId: `rl-${groupId}`, jugadorRondaIds: [`j-${groupId}`] })
const statusPuesto = () => statusUpdates.some((u) => (u as { table: string }).table === 'tournaments')

beforeEach(() => {
  statusUpdates.length = 0
  updateResult = { data: [{ id: 't1' }], error: null }
  statusAlReleer = { data: { status: 'open' }, error: null }
  mockRateLimit.mockReset().mockReturnValue({ allowed: true })
  mockGetUser.mockResolvedValue({ data: { user: { id: 'org' } } })
  mockEnsure.mockReset().mockResolvedValue(true)
  mockMaterialize.mockReset().mockImplementation(async (_svc: unknown, a: { group: { id: string } }) => armado(a.group.id))
  mockDeshacer.mockReset().mockResolvedValue(true)
  mockRelectura.mockReset().mockResolvedValue({
    groups: [{ id: 'g1', name: 'Grupo 1', ronda_libre_id: 'rl-g1', players: [{ id: 'a', player_id: 'p1', jugador_ronda_id: 'j' }] }],
    error: null,
  })
  tables.tournaments = {
    data: { id: 't1', slug: 'mi-torneo', organizer_id: 'org', status: 'open', format: 'stroke_play', total_rounds: 1, courses: null },
    error: null,
  }
  tables.players = {
    data: [
      { id: 'p1', user_id: 'u1', player_name: null, handicap_at_registration: 10, status: 'approved', profiles: { name: 'Ana', indice: 10 } },
      { id: 'p2', user_id: 'u2', player_name: null, handicap_at_registration: 15, status: 'approved', profiles: { name: 'Beto', indice: 15 } },
    ],
    error: null,
  }
  tables.tournament_groups = {
    data: [
      { id: 'g1', name: 'Grupo 1', ronda_libre_id: null, tournament_group_players: [{ id: 'a', player_id: 'p1' }] },
      { id: 'g2', name: 'Grupo 2', ronda_libre_id: null, tournament_group_players: [{ id: 'b', player_id: 'p2' }] },
    ],
    error: null,
  }
})

describe('POST /api/torneos/[slug]/start', () => {
  it('todas las tarjetas armadas → in_progress', async () => {
    const res = await call()
    expect(res.status).toBe(200)
    expect(mockMaterialize).toHaveBeenCalledTimes(2)
    expect(statusPuesto()).toBe(true)
  })

  it('falla la tarjeta del grupo 2 → 500, deshace el grupo 1 ya armado y el torneo NO se inicia', async () => {
    mockMaterialize
      .mockResolvedValueOnce(armado('g1'))
      .mockResolvedValueOnce({ ok: false, error: 'No se pudo preparar la tarjeta del grupo "Grupo 2". Intenta iniciar de nuevo.' })
    const res = await call()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('Grupo 2')
    expect(statusPuesto()).toBe(false)
    expect(mockDeshacer).toHaveBeenCalledTimes(1)
    expect(mockDeshacer.mock.calls[0].slice(1)).toEqual(['g1', 'rl-g1', ['j-g1']])
  })

  it('si deshacer el grupo 1 falla → mensaje de soporte, no "intenta de nuevo"', async () => {
    mockMaterialize.mockResolvedValueOnce(armado('g1')).mockResolvedValueOnce({ ok: false, error: 'x' })
    mockDeshacer.mockResolvedValue(false)
    expect((await (await call()).json()).error).toBe(ERROR_SIN_DESHACER)
  })

  it('otro inicio ganó un grupo (conflicto) → 409 SIN deshacer lo propio (está completo; el otro lo saltó)', async () => {
    mockMaterialize.mockResolvedValueOnce(armado('g1')).mockResolvedValueOnce({ ok: false, conflicto: true, error: 'otra sesión' })
    const res = await call()
    expect(res.status).toBe(409)
    expect(mockDeshacer).not.toHaveBeenCalled()
    expect(statusPuesto()).toBe(false)
  })

  it('la relectura final encuentra un grupo sin tarjeta (otro inicio lo deshizo) → 409, NO deshace lo propio y NO inicia', async () => {
    mockRelectura.mockResolvedValue({
      groups: [{ id: 'g2', name: 'Grupo 2', ronda_libre_id: null, players: [{ id: 'b', player_id: 'p2' }] }],
      error: null,
    })
    const res = await call()
    expect(res.status).toBe(409)
    expect(mockDeshacer).not.toHaveBeenCalled()
    expect(statusPuesto()).toBe(false)
  })

  it('excepción a mitad → deshace los grupos armados', async () => {
    mockMaterialize.mockResolvedValueOnce(armado('g1')).mockRejectedValueOnce(new Error('timeout'))
    expect((await call()).status).toBe(500)
    expect(mockDeshacer).toHaveBeenCalledTimes(1)
  })

  it('reintento: los grupos ya enlazados no se vuelven a armar', async () => {
    const g1 = (tables.tournament_groups.data as Array<{ ronda_libre_id: string | null; tournament_group_players: Array<{ jugador_ronda_id?: string }> }>)[0]
    g1.ronda_libre_id = 'rl-1'
    g1.tournament_group_players[0].jugador_ronda_id = 'j-1'
    await call()
    expect(mockMaterialize).toHaveBeenCalledTimes(1)
    expect(mockMaterialize.mock.calls[0][1]).toMatchObject({ group: { id: 'g2' } })
  })

  it('fallan las tarjetas de los jugadores → 500, no arma grupos ni inicia', async () => {
    mockEnsure.mockResolvedValue(false)
    const res = await call()
    expect(res.status).toBe(500)
    expect(mockMaterialize).not.toHaveBeenCalled()
    expect(statusPuesto()).toBe(false)
  })

  it('error al leer jugadores → 500, no "se necesita al menos 1 jugador"', async () => {
    tables.players = { data: null, error: { message: 'timeout' } }
    const res = await call()
    expect(res.status).toBe(500)
    expect((await res.json()).error).toBe('No se pudo leer el torneo. Intenta de nuevo.')
  })

  it('jugador aprobado sin grupo → 400 antes de tocar nada', async () => {
    tables.tournament_groups = { data: [], error: null }
    const res = await call()
    expect(res.status).toBe(400)
    expect(mockEnsure).not.toHaveBeenCalled()
  })

  it('no organizador → 403', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'otro' } } })
    expect((await call()).status).toBe(403)
  })

  // ── Carrera entre dos inicios (Fable sobre #587) ──────────────────────────

  it('otro inicio puso el torneo en juego mientras esta llamada armaba → falla un grupo y NO deshace (409)', async () => {
    mockMaterialize.mockResolvedValueOnce(armado('g1')).mockResolvedValueOnce({ ok: false, error: 'x' })
    statusAlReleer = { data: { status: 'in_progress' }, error: null }
    const res = await call()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(ERROR_OTRO_INICIO)
    expect(mockDeshacer).not.toHaveBeenCalled()
  })

  it('no se puede releer el estado antes de deshacer → NO deshace (podría estar en juego) y deja reintentar', async () => {
    mockMaterialize.mockResolvedValueOnce(armado('g1')).mockResolvedValueOnce({ ok: false, error: 'x' })
    statusAlReleer = { data: null, error: { message: 'timeout' } }
    const res = await call()
    expect(res.status).toBe(500)
    // Nada quedó a medias (lo armado está completo): no se le dice "no reintentes, escribe a soporte".
    expect((await res.json()).error).toBe(ERROR_ESTADO_DESCONOCIDO)
    expect(mockDeshacer).not.toHaveBeenCalled()
  })

  it('…salvo que el grupo que falló sí quedó a medias: ahí se mantiene el aviso de soporte', async () => {
    mockMaterialize.mockResolvedValueOnce(armado('g1')).mockResolvedValueOnce({ ok: false, error: ERROR_SIN_DESHACER, sinDeshacer: true })
    statusAlReleer = { data: null, error: { message: 'timeout' } }
    expect((await (await call()).json()).error).toBe(ERROR_SIN_DESHACER)
  })

  it('el torneo se canceló mientras se iniciaba → 409 "cambió de estado", sin deshacer', async () => {
    mockMaterialize.mockResolvedValueOnce(armado('g1')).mockResolvedValueOnce({ ok: false, error: 'x' })
    statusAlReleer = { data: { status: 'cancelled' }, error: null }
    const res = await call()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(ERROR_CAMBIO_DE_ESTADO)
    expect(mockDeshacer).not.toHaveBeenCalled()
  })

  it('el update a in_progress no toca filas (otro inicio ganó) → 409 SIN deshacer', async () => {
    updateResult = { data: [], error: null }
    const res = await call()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(ERROR_OTRO_INICIO)
    expect(mockDeshacer).not.toHaveBeenCalled()
  })

  it('el update a in_progress no toca filas porque el torneo se canceló → 409 "cambió de estado", sin deshacer', async () => {
    updateResult = { data: [], error: null }
    statusAlReleer = { data: { status: 'cancelled' }, error: null }
    const res = await call()
    expect(res.status).toBe(409)
    expect((await res.json()).error).toBe(ERROR_CAMBIO_DE_ESTADO)
    expect(mockDeshacer).not.toHaveBeenCalled()
  })

  it('el update a in_progress falla y el torneo sigue sin iniciar → deshace lo armado (todo o nada)', async () => {
    updateResult = { data: null, error: { message: 'timeout' } }
    const res = await call()
    expect(res.status).toBe(500)
    expect(mockDeshacer).toHaveBeenCalledTimes(2)
  })

  // ── Rate limit ─────────────────────────────────────────────────────────────

  it('una validación que falla (jugador sin grupo) NO consume el cupo de intentos', async () => {
    tables.tournament_groups = { data: [], error: null }
    expect((await call()).status).toBe(400)
    expect(mockRateLimit).not.toHaveBeenCalled()
  })

  it('cupo holgado: 10 intentos en 10 minutos', async () => {
    await call()
    expect(mockRateLimit).toHaveBeenCalledWith('start-torneo:org', 10, 10 * 60 * 1000)
  })

  it('cupo agotado → 429 sin tocar nada', async () => {
    mockRateLimit.mockReturnValue({ allowed: false })
    expect((await call()).status).toBe(429)
    expect(mockEnsure).not.toHaveBeenCalled()
  })

  // ── Inscritos no aprobados dentro de un grupo ──────────────────────────────

  it('un inscrito pendiente dentro de un grupo no recibe tarjeta ni bloquea el inicio', async () => {
    ;(tables.players.data as Array<Record<string, unknown>>).push(
      { id: 'p3', user_id: 'u3', player_name: null, handicap_at_registration: 20, status: 'pending', profiles: { name: 'Caro', indice: 20 } },
    )
    ;(tables.tournament_groups.data as Array<{ tournament_group_players: Array<{ id: string; player_id: string }> }>)[0]
      .tournament_group_players.push({ id: 'c', player_id: 'p3' })
    // La relectura final también trae al pendiente fuera de la tarjeta: no la deja "incompleta".
    mockRelectura.mockResolvedValue({
      groups: [{ id: 'g1', name: 'Grupo 1', ronda_libre_id: 'rl-g1', players: [
        { id: 'a', player_id: 'p1', jugador_ronda_id: 'j' }, { id: 'c', player_id: 'p3', jugador_ronda_id: null },
      ] }],
      error: null,
    })
    const res = await call()
    expect(res.status).toBe(200)
    const g1 = mockMaterialize.mock.calls.find((c) => c[1].group.id === 'g1')![1]
    expect(g1.group.players.map((p: { player_id: string }) => p.player_id)).toEqual(['p1'])
    expect(g1.players.map((p: { id: string }) => p.id)).not.toContain('p3')
  })

  it('torneo ya en juego → 409', async () => {
    ;(tables.tournaments.data as { status: string }).status = 'in_progress'
    expect((await call()).status).toBe(409)
  })
})
