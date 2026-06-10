import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}))

const isAdmin = vi.fn()
vi.mock('@/lib/admin', () => ({ isAdmin: (...a: unknown[]) => isAdmin(...a) }))

const single = vi.fn()
const adminRpc = vi.fn()
const adminFrom = vi.fn(() => ({ select: () => ({ eq: () => ({ single }) }) }))
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({ from: adminFrom, rpc: adminRpc }),
}))

const recompute = vi.fn()
vi.mock('@/lib/data/recompute-tee-rounds', () => ({
  recomputeRoundsFromCatalog: (...a: unknown[]) => recompute(...a),
}))

import { POST } from '../route'

const UID = '98c5cb7a-1c0b-4a64-a773-8bd013a92317'
const EMPTY_RESULT = { scanned: 0, resolved: 0, unresolved: [], implausible: [], rounds: [], changedCount: 0, applied: false }

function jsonReq(body: unknown): Request {
  return new Request('http://x/api/admin/recompute-indice', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  isAdmin.mockResolvedValue(true)
  recompute.mockResolvedValue(EMPTY_RESULT)
})

describe('POST /api/admin/recompute-indice', () => {
  it('rechaza con 403 a no-admins', async () => {
    isAdmin.mockResolvedValue(false)
    const res = await POST(jsonReq({ userId: UID }))
    expect(res.status).toBe(403)
    expect(recompute).not.toHaveBeenCalled()
  })

  it('exige userId (400)', async () => {
    const res = await POST(jsonReq({ dryRun: true }))
    expect(res.status).toBe(400)
    expect(recompute).not.toHaveBeenCalled()
  })

  it('rechaza un género inválido (400)', async () => {
    const res = await POST(jsonReq({ userId: UID, genero: 'hombre' }))
    expect(res.status).toBe(400)
    expect(recompute).not.toHaveBeenCalled()
  })

  it('por defecto es dry-run y NO recalcula el índice', async () => {
    const res = await POST(jsonReq({ userId: UID, genero: 'M' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(json.dryRun).toBe(true)
    expect(recompute).toHaveBeenCalledWith(expect.anything(), UID, { dryRun: true, genero: 'M' })
    expect(adminRpc).not.toHaveBeenCalled()
  })

  it('con dryRun:false aplica y recalcula el índice vía RPC', async () => {
    single.mockResolvedValue({ data: { indice_golfers: 5.1 } })
    adminRpc.mockResolvedValue({ error: null })
    const res = await POST(jsonReq({ userId: UID, dryRun: false, genero: 'M' }))
    const json = await res.json()
    expect(res.status).toBe(200)
    expect(recompute).toHaveBeenCalledWith(expect.anything(), UID, { dryRun: false, genero: 'M' })
    expect(adminRpc).toHaveBeenCalledWith('calcular_indice_golfers', { p_user_id: UID })
    expect(json.indiceGolfers).toBe(5.1)
  })

  it('si no se pasa género, lo toma del perfil', async () => {
    single.mockResolvedValue({ data: { genero: 'F' } })
    await POST(jsonReq({ userId: UID, dryRun: true }))
    expect(recompute).toHaveBeenCalledWith(expect.anything(), UID, { dryRun: true, genero: 'F' })
  })

  it('si el RPC falla tras aplicar, devuelve 500 con el detalle', async () => {
    single.mockResolvedValue({ data: { indice_golfers: null } })
    adminRpc.mockResolvedValue({ error: { message: 'boom' } })
    const res = await POST(jsonReq({ userId: UID, dryRun: false, genero: 'M' }))
    expect(res.status).toBe(500)
    const json = await res.json()
    expect(json.detalle).toBe('boom')
  })
})
