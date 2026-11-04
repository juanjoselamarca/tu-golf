// Las 9 rutas de escritura que quedaron sin rate limit (04-nov-2026) lo consultan después de la
// sesión y ANTES de tocar la base: con el cupo agotado responden 429 sin una sola consulta.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockRateLimit = vi.fn()
const mockFrom = vi.fn()
const chain = (): Record<string, unknown> => {
  const obj: Record<string, unknown> = {}
  for (const m of ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'is', 'in', 'order']) obj[m] = () => obj
  obj.single = obj.maybeSingle = () => Promise.resolve({ data: null, error: { code: 'X' } })
  obj.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: null, error: null, count: 0 }).then(resolve)
  return obj
}
const from = (table: string) => { mockFrom(table); return chain() }
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) }, from }),
}))
vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: () => ({ from, storage: { from } }) }))
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: (...a: unknown[]) => mockRateLimit(...a), rateLimitHeaders: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => {}) }))
vi.mock('@/golf/billing/require-feature', () => ({ checkFeatureAccess: async () => ({ allowed: true }), rechazoDeFeature: () => null }))

const ID = '11111111-1111-4111-8111-111111111111'
const params = Promise.resolve({ id: ID, userId: ID, tournamentId: ID })
// Cuerpo válido para las rutas que validan el body antes de consultar (colaborador y transferencia).
const req = (method: string, body = '{}') => new Request('http://g/', { method, headers: { 'content-type': 'application/json' }, body })
const RUTAS: Array<[string, string, () => Promise<{ POST?: unknown; PUT?: unknown; DELETE?: unknown }>]> = [
  ['draft-cover', 'POST', () => import('@/app/api/torneos/draft/[id]/cover/route')],
  ['draft-share-link', 'POST', () => import('@/app/api/torneos/draft/[id]/share-link/route')],
  ['draft-collab', 'POST', () => import('@/app/api/torneos/draft/[id]/collaborators/route')],
  ['draft-collab-remove', 'DELETE', () => import('@/app/api/torneos/draft/[id]/collaborators/[userId]/route')],
  ['draft-transfer', 'POST', () => import('@/app/api/torneos/draft/[id]/transfer-ownership/route')],
  ['draft-preview', 'POST', () => import('@/app/api/torneos/draft/[id]/preview/route')],
  ['draft-create', 'POST', () => import('@/app/api/torneos/draft/duplicate-from/[tournamentId]/route')],
  ['taiger-plan-accept', 'POST', () => import('@/app/api/taiger/plans/[id]/accept/route')],
  ['push-preferences', 'PUT', () => import('@/app/api/push/preferences/route')],
]

beforeEach(() => { mockRateLimit.mockReset(); mockFrom.mockReset() })

describe.each(RUTAS)('%s (%s)', (clave, metodo, cargar) => {
  const llamar = async () => {
    const mod = await cargar()
    const handler = mod[metodo as 'POST' | 'PUT' | 'DELETE'] as (r: Request, p: { params: typeof params }) => Promise<Response>
    return handler(req(metodo, clave === 'push-preferences' ? '{}' : JSON.stringify({ user_id_to_add: ID, new_owner_id: ID })), { params })
  }
  it('con el cupo agotado responde 429 sin tocar la base', async () => {
    mockRateLimit.mockReturnValue({ allowed: false, remaining: 0, resetAt: 0 })
    const res = await llamar()
    expect(res.status).toBe(429)
    expect(mockFrom).not.toHaveBeenCalled()
    expect(mockRateLimit).toHaveBeenCalledWith(`${clave}:u1`, expect.any(Number), expect.any(Number))
  })
  it('con cupo sigue su camino normal', async () => {
    mockRateLimit.mockReturnValue({ allowed: true, remaining: 1, resetAt: 0 })
    const res = await llamar()
    expect(res.status).not.toBe(429)
    expect(mockFrom).toHaveBeenCalled()
  })
})
