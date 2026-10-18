// La ruta de inicio no marca el torneo 'in_progress' si una tarjeta no se armó.
// La materialización en sí se prueba en `startTournament.test.ts`.

import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockGetUser = vi.fn()
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}))

const statusUpdates: unknown[] = []
const tables: Record<string, { data: unknown; error: unknown }> = {}
function builder(table: string) {
  const result = () => tables[table] ?? { data: [], error: null }
  const obj: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order']) obj[m] = () => obj
  obj.single = () => Promise.resolve(result())
  obj.update = (patch: unknown) => {
    statusUpdates.push({ table, patch })
    return { eq: () => Promise.resolve({ error: null }) }
  }
  obj.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result()).then(resolve)
  return obj
}
vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: () => ({ from: builder }) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => {}) }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/data/tournaments/rounds', () => ({
  fetchRoundPlayConfig: async () => ({ courseId: 'c1', holeCount: 18, date: '2026-10-30' }),
}))

const mockEnsure = vi.fn()
const mockMaterialize = vi.fn()
const mockDeshacer = vi.fn()
vi.mock('@/lib/data/tournaments/startTournament', async (orig) => ({
  ...(await orig<typeof import('@/lib/data/tournaments/startTournament')>()),
  ensureRound1Cards: (...a: unknown[]) => mockEnsure(...a),
  materializeGroupScorecard: (...a: unknown[]) => mockMaterialize(...a),
  deshacerGrupo: (...a: unknown[]) => mockDeshacer(...a),
}))

import { POST } from './route'
import { ERROR_SIN_DESHACER } from '@/lib/data/tournaments/startTournament'
import type { NextRequest } from 'next/server'

const call = () => POST({} as NextRequest, { params: Promise.resolve({ slug: 'mi-torneo' }) })
const armado = (groupId: string) => ({ ok: true, groupId, rondaId: `rl-${groupId}`, jugadorRondaIds: [`j-${groupId}`] })
const statusPuesto = () => statusUpdates.some((u) => (u as { table: string }).table === 'tournaments')

beforeEach(() => {
  statusUpdates.length = 0
  mockGetUser.mockResolvedValue({ data: { user: { id: 'org' } } })
  mockEnsure.mockReset().mockResolvedValue(true)
  mockMaterialize.mockReset().mockImplementation(async (_svc: unknown, a: { group: { id: string } }) => armado(a.group.id))
  mockDeshacer.mockReset().mockResolvedValue(true)
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

  it('otro inicio en curso (conflicto) → 409 y deshace lo propio', async () => {
    mockMaterialize.mockResolvedValueOnce(armado('g1')).mockResolvedValueOnce({ ok: false, conflicto: true, error: 'otra sesión' })
    const res = await call()
    expect(res.status).toBe(409)
    expect(mockDeshacer).toHaveBeenCalledTimes(1)
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

  it('torneo ya en juego → 409', async () => {
    ;(tables.tournaments.data as { status: string }).status = 'in_progress'
    expect((await call()).status).toBe(409)
  })
})
