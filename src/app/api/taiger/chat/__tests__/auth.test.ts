import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AuthRetryableFetchError, AuthApiError } from '@supabase/supabase-js'
import { NextRequest } from 'next/server'

const getUser = vi.fn()
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser } })),
}))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

import { POST } from '../route'

const req = () =>
  new NextRequest('http://x/api/taiger/chat', {
    method: 'POST',
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Hola' }] }),
  })

beforeEach(() => getUser.mockReset())

// El chat del coach manda al login con un 401 (useTaigerChat → destinoSinReintento).
// Un 401 tiene que significar "no hay sesión", no "Auth no respondió": si no, un
// tropiezo de red saca al usuario del coach y le hace perder la conversación.
describe('POST /api/taiger/chat — sesión', () => {
  it('Auth no responde (error reintentable) → 503, no 401', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthRetryableFetchError('fetch failed', 0) })
    const res = await POST(req())
    expect(res.status).toBe(503)
  })

  it('sin sesión de verdad → 401', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: new AuthApiError('invalid JWT', 401, undefined) })
    const res = await POST(req())
    expect(res.status).toBe(401)
  })

  it('sin cookie (sin error) → 401', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null })
    const res = await POST(req())
    expect(res.status).toBe(401)
  })
})
