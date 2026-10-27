import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}))

const eq = vi.fn()
const update = vi.fn(() => ({ eq }))
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({ from: () => ({ update }) }),
}))

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 4, resetAt: 0 }),
  rateLimitHeaders: () => ({}),
}))

import { POST } from '../route'

const req = (raw: string) => new Request('http://x/api/coach/activate', { method: 'POST', body: raw })

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
  eq.mockResolvedValue({ error: null })
})

describe('POST /api/coach/activate — validación del body', () => {
  it.each([
    ['JSON inválido', '{'],
    ['body null', 'null'],
    ['code numérico', '{"code":25}'],
    ['code objeto', '{"code":{"x":1}}'],
    ['code vacío', '{"code":"   "}'],
    ['sin code', '{}'],
  ])('%s → 400 y no activa nada', async (_caso, raw) => {
    const res = await POST(req(raw))
    expect(res.status).toBe(400)
    expect(update).not.toHaveBeenCalled()
  })

  it('código incorrecto → 403', async () => {
    const res = await POST(req('{"code":"NOPE"}'))
    expect(res.status).toBe(403)
    expect(update).not.toHaveBeenCalled()
  })

  it('código correcto (espacios y minúsculas) → activa la beta del usuario de la sesión', async () => {
    const res = await POST(req('{"code":"  taiger25 "}'))
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ coach_access_enabled: true })
    expect(eq).toHaveBeenCalledWith('id', 'u-1')
  })
})
