import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const getUser = vi.fn()
const from = vi.fn()
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser }, from })),
}))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ allowed: true, remaining: 9, resetAt: 0 }),
  rateLimitHeaders: () => ({}),
}))

import { POST } from '../route'

const req = (raw: string) => new NextRequest('http://x/api/torneos/draft/join', { method: 'POST', body: raw })

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
})

describe('POST /api/torneos/draft/join — validación del body', () => {
  it.each([
    ['JSON inválido', '{'],
    ['body null', 'null'],
    ['token numérico', '{"token":123}'],
    ['token objeto', '{"token":{"a":1}}'],
    ['token vacío', '{"token":"  "}'],
  ])('%s → 400 sin consultar la base', async (_caso, raw) => {
    const res = await POST(req(raw))
    expect(res.status).toBe(400)
    expect(from).not.toHaveBeenCalled()
  })
})
