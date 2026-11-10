// POST /api/perfil/default-tee — validación del cuerpo.
//
// Bug que cubre (10-nov-2026): `null` y `[]` son JSON válido, así que pasaban
// el `try { await req.json() }` y `body.color` reventaba en un 500 sin
// mensaje. Un `color` numérico llegaba a `extractTeeColor`, que espera texto.
import { describe, it, expect, vi, beforeEach } from 'vitest'

const getUser = vi.fn()
const update = vi.fn()
vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from: () => ({
      update: (v: unknown) => { update(v); return { eq: async () => ({ error: null }) } },
      select: () => ({ eq: () => ({ single: async () => ({ data: { genero: null } }) }) }),
    }),
    rpc: vi.fn(),
  })),
}))
vi.mock('@/lib/data/recompute-tee-rounds', () => ({ applyDefaultTeeToRounds: vi.fn(async () => 0) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/rate-limit', () => ({
  checkRateLimit: () => ({ allowed: true }),
  rateLimitHeaders: () => ({}),
}))

import { NextRequest } from 'next/server'
import { POST } from '../route'

function req(body: string): NextRequest {
  return new NextRequest('http://x/api/perfil/default-tee', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  getUser.mockResolvedValue({ data: { user: { id: 'u-1' } } })
})

describe('POST /api/perfil/default-tee', () => {
  it('cuerpo null, lista o no-JSON → 400 (no 500) y no toca el perfil', async () => {
    for (const body of ['null', '[]', '"azul"', 'no-json']) {
      const res = await POST(req(body))
      expect(res.status, body).toBe(400)
    }
    expect(update).not.toHaveBeenCalled()
  })

  it('color o género que no son texto → 400 o se ignoran, nunca 500', async () => {
    const r1 = await POST(req(JSON.stringify({ color: 5 })))
    expect(r1.status).toBe(400)
    const r2 = await POST(req(JSON.stringify({ color: 'azul', genero: 7 })))
    expect(r2.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ default_tee_color: 'azul' })
  })

  it('color y género válidos se guardan', async () => {
    const res = await POST(req(JSON.stringify({ color: 'Blanco', genero: 'f' })))
    expect(res.status).toBe(200)
    expect(update).toHaveBeenCalledWith({ default_tee_color: 'blanco', genero: 'F' })
  })
})
