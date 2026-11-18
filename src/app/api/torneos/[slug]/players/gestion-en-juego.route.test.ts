// Rutas de la gestión con el torneo en juego (#814 · PR3): auth (sesión + organizador), forma del body, mapeo de
// `ResultadoColocar` a HTTP y el 207 de "inscrito, pero sin grupo". La regla se prueba en `colocarInscrito.test.ts`.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}))
let tablas: Record<string, { data: unknown; error: unknown }>
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({
    from: (t: string) => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.maybeSingle = async () => tablas[t]
      q.single = async () => tablas[t]
      return q
    },
  }),
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => {}) }))
const mockColocar = vi.fn()
const mockPrevio = vi.fn()
vi.mock('@/lib/data/tournaments/colocarInscrito', () => ({
  colocarInscrito: (...a: unknown[]) => mockColocar(...a),
  prechequearAltaConGrupo: (...a: unknown[]) => mockPrevio(...a),
}))
const mockEnroll = vi.fn()
vi.mock('@/lib/data/tournaments/enrollPlayer', () => ({ enrollPlayer: (...a: unknown[]) => mockEnroll(...a) }))

import { PUT } from './[playerId]/grupo/route'
import { DELETE } from './[playerId]/route'
import { POST } from './route'
import { mensajeDeMotivo } from '@/golf/torneo/gestion-en-juego'

const P = '11111111-1111-4111-8111-111111111111'
const G1 = '22222222-2222-4222-8222-222222222222'
const G2 = '33333333-3333-4333-8333-333333333333'
const U = '44444444-4444-4444-8444-444444444444'
const ctx = { params: Promise.resolve({ slug: 's', playerId: P }) }
const req = (body: unknown) => ({ json: async () => body }) as unknown as NextRequest
const torneo = { id: 'T', organizer_id: 'org', status: 'in_progress', total_rounds: 1, formato_juego: 'stroke_play', hcp_calc_mode: 'whs', courses: null }

beforeEach(() => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'org' } } })
  tablas = {
    tournaments: { data: torneo, error: null },
    tournament_groups: { data: { id: G2 }, error: null },
    profiles: { data: { indice: 10, genero: null }, error: null },
  }
  mockColocar.mockReset().mockResolvedValue({ ok: true, operacion: 'mover', aprobado: false, jugadorRondaId: 'jr' })
  mockEnroll.mockReset().mockResolvedValue({ ok: true, playerId: P })
  mockPrevio.mockReset().mockResolvedValue(null)
})

describe('PUT /api/torneos/[slug]/players/[playerId]/grupo', () => {
  it('sin sesión → 401; no organizador → 403; ninguno escribe', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await PUT(req({ groupId: G2, desde: G1 }), ctx)).status).toBe(401)
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'otro' } } })
    expect((await PUT(req({ groupId: G2, desde: G1 }), ctx)).status).toBe(403)
    expect(mockColocar).not.toHaveBeenCalled()
  })

  it('torneo inexistente → 404', async () => {
    tablas.tournaments = { data: null, error: null }
    expect((await PUT(req({ groupId: G2, desde: G1 }), ctx)).status).toBe(404)
  })

  it('sin "desde" (el panel siempre dice dónde lo vio) o groupId inválido → 400', async () => {
    expect((await PUT(req({ groupId: G2 }), ctx)).status).toBe(400)
    expect((await PUT(req({ groupId: 'x', desde: null }), ctx)).status).toBe(400)
    expect(mockColocar).not.toHaveBeenCalled()
  })

  it('ok → 200 y pasa destino, desde y confirmado; el cliente NO elige la política', async () => {
    const res = await PUT(req({ groupId: G2, desde: G1, confirmado: true, politica: { formato: 'scramble' } }), ctx)
    expect(res.status).toBe(200)
    expect(mockColocar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'T', formato_juego: 'stroke_play' }), P, G2, { desde: G1, confirmado: true })
  })

  it('conflicto → 409 con reintentar y el copy del mapa', async () => {
    mockColocar.mockResolvedValue({ ok: false, motivo: 'conflicto', mensaje: mensajeDeMotivo('conflicto'), ofreceRetirar: false })
    const res = await PUT(req({ groupId: G2, desde: G1 }), ctx)
    expect(res.status).toBe(409)
    expect(await res.json()).toEqual({ error: mensajeDeMotivo('conflicto'), codigo: 'conflicto', ofreceRetirar: false, reintentar: true })
  })

  it('requiere confirmación → 409 con los golpes', async () => {
    mockColocar.mockResolvedValue({ ok: false, motivo: 'requiere-confirmacion', mensaje: 'm', ofreceRetirar: false, golpes: { inscrito: 0, destino: 3 } })
    const res = await PUT(req({ groupId: G2, desde: null }), ctx)
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ codigo: 'requiere-confirmacion', golpes: { inscrito: 0, destino: 3 } })
  })

  it.each([['no-existe', 404], ['grupo-no-existe', 404], ['error', 500], ['tarjeta-con-timba', 409]])('%s → %i', async (motivo, status) => {
    mockColocar.mockResolvedValue({ ok: false, motivo, mensaje: 'm', ofreceRetirar: false })
    expect((await PUT(req({ groupId: G2, desde: G1 }), ctx)).status).toBe(status)
  })
})

describe('DELETE /api/torneos/[slug]/players/[playerId]', () => {
  it('borra con destino null; con golpes → 409 que ofrece retirar', async () => {
    mockColocar.mockResolvedValueOnce({ ok: true, operacion: 'borrar', aprobado: false, jugadorRondaId: null })
    expect((await DELETE(req({ desde: G1 }) as unknown as Request, ctx)).status).toBe(200)
    expect(mockColocar).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), P, null, { desde: G1, confirmado: false })

    mockColocar.mockResolvedValueOnce({ ok: false, motivo: 'borrar-con-golpes', mensaje: mensajeDeMotivo('borrar-con-golpes', { ofreceRetirar: true }), ofreceRetirar: true })
    const res = await DELETE(req({ desde: G1 }) as unknown as Request, ctx)
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ codigo: 'borrar-con-golpes', ofreceRetirar: true })
  })

  it('no organizador → 403; body sin desde → 400', async () => {
    expect((await DELETE(req({}) as unknown as Request, ctx)).status).toBe(400)
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'otro' } } })
    expect((await DELETE(req({ desde: null }) as unknown as Request, ctx)).status).toBe(403)
    expect(mockColocar).not.toHaveBeenCalled()
  })
})

describe('POST /api/torneos/[slug]/players con groupId', () => {
  const post = (body: unknown) => POST(req(body), { params: Promise.resolve({ slug: 's' }) })

  it('sin groupId: inscribe como siempre y no coloca', async () => {
    const res = await post({ mode: 'registered', userId: U })
    expect(res.status).toBe(200)
    expect(mockColocar).not.toHaveBeenCalled()
  })

  it('inscribe y coloca → 200 con colocado', async () => {
    const res = await post({ mode: 'registered', userId: U, groupId: G2, confirmado: true })
    expect(res.status).toBe(200)
    expect(mockColocar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'T' }), P, G2, { desde: null, confirmado: true })
  })

  it('inscribe pero no coloca → 207: inscrito sin grupo, con el motivo', async () => {
    mockColocar.mockResolvedValue({ ok: false, motivo: 'match-play-grupo-lleno', mensaje: mensajeDeMotivo('match-play-grupo-lleno'), ofreceRetirar: false })
    const res = await post({ mode: 'registered', userId: U, groupId: G2 })
    expect(res.status).toBe(207)
    expect(await res.json()).toMatchObject({ ok: true, playerId: P, colocado: false, codigo: 'match-play-grupo-lleno' })
  })

  it('lo evitable se rechaza ANTES de inscribir: 409/404 sin alta (match play lleno, golpes sin confirmar, grupo ajeno)', async () => {
    mockPrevio.mockResolvedValueOnce({ ok: false, motivo: 'match-play-grupo-lleno', mensaje: 'm', ofreceRetirar: false })
    expect((await post({ mode: 'registered', userId: U, groupId: G2 })).status).toBe(409)
    mockPrevio.mockResolvedValueOnce({ ok: false, motivo: 'requiere-confirmacion', mensaje: 'm', ofreceRetirar: false, golpes: { inscrito: 0, destino: 4 } })
    const res = await post({ mode: 'registered', userId: U, groupId: G2 })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ codigo: 'requiere-confirmacion', golpes: { destino: 4 } })
    mockPrevio.mockResolvedValueOnce({ ok: false, motivo: 'grupo-no-existe', mensaje: 'm', ofreceRetirar: false })
    expect((await post({ mode: 'registered', userId: U, groupId: G2 })).status).toBe(404)
    expect(mockEnroll).not.toHaveBeenCalled()
    expect(mockPrevio).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ id: 'T' }), G2, false)
  })
})
