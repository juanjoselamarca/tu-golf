import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const upsert = vi.fn()
const maybeSingle = vi.fn()
const select = vi.fn(() => ({ eq: () => ({ maybeSingle }) }))
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from: () => ({ select, upsert }),
  })),
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => {}) }))

import { GET, PUT } from '../route'
import { PREFERENCIAS_DEFAULT } from '@/lib/push/preferencias'

const put = (body: unknown) =>
  PUT(new Request('http://x/api/push/preferences', { method: 'PUT', body: JSON.stringify(body) }))

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u1' } } })
  upsert.mockResolvedValue({ error: null })
})

describe('GET /api/push/preferences', () => {
  it('devuelve solo las preferencias (sin id/user_id/timestamps)', async () => {
    maybeSingle.mockResolvedValue({ data: { birdies: false, indice_cambios: false }, error: null })
    const res = await GET()
    expect(await res.json()).toEqual({ ...PREFERENCIAS_DEFAULT, birdies: false, indice_cambios: false })
    expect(select).toHaveBeenCalledWith(expect.not.stringContaining('*'))
  })

  it('sin fila → defaults', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    expect(await (await GET()).json()).toEqual(PREFERENCIAS_DEFAULT)
  })

  it('lo que devuelve el GET es aceptado tal cual por el PUT', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })
    const prefs = await (await GET()).json()
    expect((await put(prefs)).status).toBe(200)
  })
})

describe('PUT /api/push/preferences', () => {
  it('guarda solo la clave enviada: no resetea las demás a su default', async () => {
    const res = await put({ indice_cambios: false })
    expect(res.status).toBe(200)
    const [fila, opts] = upsert.mock.calls[0]
    expect(fila).toEqual({ user_id: 'u1', indice_cambios: false, updated_at: expect.any(String) })
    expect(opts).toEqual({ onConflict: 'user_id' })
  })

  it('rechaza claves desconocidas (user_id incluido)', async () => {
    expect((await put({ user_id: 'otro' })).status).toBe(400)
    expect(upsert).not.toHaveBeenCalled()
  })

  it('sin sesión → 401', async () => {
    getUser.mockResolvedValue({ data: { user: null } })
    expect((await put({ birdies: false })).status).toBe(401)
  })

  it('falla de la base → 500 (el panel revierte el interruptor)', async () => {
    upsert.mockResolvedValue({ error: { message: 'x' } })
    expect((await put({ birdies: false })).status).toBe(500)
  })
})
