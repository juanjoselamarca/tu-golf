// Ruta de corrección del hándicap inscrito: auth (sesión + organizador), forma del body y rango.
// La lógica de la edición se prueba en `editarHandicapInscrito.test.ts`.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { NextRequest } from 'next/server'

const mockGetUser = vi.fn()
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: mockGetUser } }),
}))
let torneo: { data: unknown; error: unknown }
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({
    from: () => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.maybeSingle = async () => torneo
      return q
    },
  }),
}))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: () => ({ allowed: true }), rateLimitHeaders: () => ({}) }))
const mockEditar = vi.fn()
vi.mock('@/lib/data/tournaments/editarHandicapInscrito', async (orig) => ({
  ...(await orig<typeof import('@/lib/data/tournaments/editarHandicapInscrito')>()),
  editarHandicapInscrito: (...a: unknown[]) => mockEditar(...a),
}))

import { PUT } from './route'

const put = (body: unknown) =>
  PUT({ json: async () => body } as unknown as NextRequest, { params: Promise.resolve({ slug: 's', playerId: 'p1' }) })

beforeEach(() => {
  mockGetUser.mockResolvedValue({ data: { user: { id: 'org' } } })
  torneo = { data: { id: 'T', organizer_id: 'org', hcp_calc_mode: 'whs', courses: null }, error: null }
  mockEditar.mockReset().mockResolvedValue({ ok: true, valor: 12 })
})

describe('PUT /api/torneos/[slug]/players/[playerId]/handicap', () => {
  it('sin sesión → 401', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    expect((await put({ value: 12, esperado: null })).status).toBe(401)
  })

  it('no es el organizador → 403 y no escribe', async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: 'otro' } } })
    expect((await put({ value: 12, esperado: null })).status).toBe(403)
    expect(mockEditar).not.toHaveBeenCalled()
  })

  it('sin "esperado" → 400 (el panel siempre dice qué vio)', async () => {
    expect((await put({ value: 12 })).status).toBe(400)
  })

  it('fuera del rango de índice (WHS) → 400 y no escribe', async () => {
    expect((await put({ value: 60, esperado: 10 })).status).toBe(400)
    expect((await put({ value: '12', esperado: 10 })).status).toBe(400)
    expect(mockEditar).not.toHaveBeenCalled()
  })

  it('válido → llama a la edición con esperado y valor', async () => {
    const res = await put({ value: 12, esperado: null })
    expect(res.status).toBe(200)
    expect(mockEditar).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: 'T' }), 'p1', null, 12)
  })

  it('conflicto → 409 con código', async () => {
    mockEditar.mockResolvedValue({ ok: false, motivo: 'conflicto' })
    const res = await put({ value: 12, esperado: 10 })
    expect(res.status).toBe(409)
    expect(await res.json()).toMatchObject({ codigo: 'conflicto' })
  })

  it('torneo inexistente → 404', async () => {
    torneo = { data: null, error: null }
    expect((await put({ value: 12, esperado: 10 })).status).toBe(404)
  })
})
