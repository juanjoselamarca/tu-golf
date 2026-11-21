// Rutas de grupo con el torneo en juego (#814 · PR4): auth (sesión + organizador), forma del body y mapeo de
// `ResultadoGrupoEnJuego` a HTTP. La regla se prueba en grupoEnJuego.test.ts y en la prueba SQL.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}))
let torneoLeido: { data: unknown; error: unknown }
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.maybeSingle = async () => torneoLeido
      return q
    },
  }),
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => {}) }))
const mockCrear = vi.fn()
const mockBorrar = vi.fn()
vi.mock('@/lib/data/tournaments/grupoEnJuego', () => ({
  LARGO_MAX_NOMBRE_GRUPO: 60,
  crearGrupoEnJuego: (...a: unknown[]) => mockCrear(...a),
  borrarGrupoEnJuego: (...a: unknown[]) => mockBorrar(...a),
}))

import { POST } from './route'
import { DELETE } from './[groupId]/route'

const G = '22222222-2222-4222-8222-222222222222'
const torneo = { id: 'T', organizer_id: 'org', status: 'in_progress', total_rounds: 1, formato_juego: 'stroke_play' }
const ctx = { params: Promise.resolve({ slug: 's' }) }
const ctxG = (groupId = G) => ({ params: Promise.resolve({ slug: 's', groupId }) })
const req = (body?: unknown) => ({ text: async () => (body === undefined ? '' : JSON.stringify(body)) }) as unknown as NextRequest

beforeEach(() => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'org' } } })
  torneoLeido = { data: torneo, error: null }
  mockCrear.mockReset().mockResolvedValue({ ok: true, groupId: G, rondaLibreId: 'R', nombre: 'Grupo 3' })
  mockBorrar.mockReset().mockResolvedValue({ ok: true, groupId: G, rondaLibreId: 'R', nombre: null })
})

describe('POST /api/torneos/[slug]/grupos', () => {
  it('sin sesión → 401; no organizador → 403; torneo inexistente → 404; ninguno escribe', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await POST(req({}), ctx)).status).toBe(401)
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'otro' } } })
    expect((await POST(req({}), ctx)).status).toBe(403)
    torneoLeido = { data: null, error: null }
    expect((await POST(req({}), ctx)).status).toBe(404)
    expect(mockCrear).not.toHaveBeenCalled()
  })

  it('sin body o vacío → 201 con el nombre por defecto (lo decide la capa de datos)', async () => {
    const res = await POST(req(), ctx)
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual({ ok: true, groupId: G, rondaLibreId: 'R', nombre: 'Grupo 3' })
    expect(mockCrear).toHaveBeenCalledWith(expect.anything(), torneo, { nombre: null, groupId: null, creatorId: 'org' })
  })

  it('pasa nombre recortado o groupId', async () => {
    await POST(req({ nombre: '  Los de atrás ' }), ctx)
    expect(mockCrear.mock.calls[0][2]).toEqual({ nombre: 'Los de atrás', groupId: null, creatorId: 'org' })
    await POST(req({ groupId: G }), ctx)
    expect(mockCrear.mock.calls[1][2]).toEqual({ nombre: null, groupId: G, creatorId: 'org' })
  })

  it('body inválido → 400: ambos, nombre vacío o largo, groupId no uuid, campos extra, JSON roto', async () => {
    for (const b of [{ nombre: 'A', groupId: G }, { nombre: '   ' }, { nombre: 'x'.repeat(61) }, { groupId: 'x' }, { politica: {} }]) {
      expect((await POST(req(b), ctx)).status).toBe(400)
    }
    const roto = { text: async () => '{' } as unknown as NextRequest
    expect((await POST(roto, ctx)).status).toBe(400)
    expect(mockCrear).not.toHaveBeenCalled()
  })

  it('motivos → 409; grupo-no-existe → 404; error → 500, con codigo y mensaje', async () => {
    mockCrear.mockResolvedValueOnce({ ok: false, motivo: 'nombre-repetido', mensaje: 'Ya hay un grupo con ese nombre.' })
    const r1 = await POST(req({ nombre: 'Grupo 1' }), ctx)
    expect(r1.status).toBe(409)
    expect(await r1.json()).toEqual({ error: 'Ya hay un grupo con ese nombre.', codigo: 'nombre-repetido' })
    mockCrear.mockResolvedValueOnce({ ok: false, motivo: 'grupo-no-existe', mensaje: 'x' })
    expect((await POST(req({ groupId: G }), ctx)).status).toBe(404)
    mockCrear.mockResolvedValueOnce({ ok: false, motivo: 'error', mensaje: 'x' })
    expect((await POST(req({}), ctx)).status).toBe(500)
  })
})

describe('DELETE /api/torneos/[slug]/grupos/[groupId]', () => {
  it('sin sesión → 401; no organizador → 403; groupId inválido → 400; ninguno escribe', async () => {
    mockGetUser.mockResolvedValueOnce({ data: { user: null } })
    expect((await DELETE(req(), ctxG())).status).toBe(401)
    mockGetUser.mockResolvedValueOnce({ data: { user: { id: 'otro' } } })
    expect((await DELETE(req(), ctxG())).status).toBe(403)
    expect((await DELETE(req(), ctxG('x'))).status).toBe(400)
    expect(mockBorrar).not.toHaveBeenCalled()
  })

  it('ok → 200 y borra ese grupo de ese torneo', async () => {
    const res = await DELETE(req(), ctxG())
    expect(res.status).toBe(200)
    expect(mockBorrar).toHaveBeenCalledWith(expect.anything(), torneo, G)
  })

  it('con jugadores → 409 con el motivo', async () => {
    mockBorrar.mockResolvedValueOnce({ ok: false, motivo: 'grupo-con-jugadores', mensaje: 'Ese grupo tiene jugadores.' })
    const res = await DELETE(req(), ctxG())
    expect(res.status).toBe(409)
    expect((await res.json()).codigo).toBe('grupo-con-jugadores')
  })
})
