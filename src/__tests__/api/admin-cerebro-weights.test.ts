/**
 * Tests del endpoint admin /api/admin/cerebro/weights.
 *
 * Mock de isCerebroAdmin para evitar cookies() de next/headers que necesita
 * request context. Validamos que el guard rechaza 403 cuando no es admin
 * y que el path admin no devuelve 403 por sí solo (puede fallar después
 * por Zod o por DB — eso es OK; lo que validamos es que el guard no es
 * el bloqueador).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/lib/cerebro/admin-auth', () => ({
  isCerebroAdmin: vi.fn(),
}))
vi.mock('@/lib/cerebro/weights', () => ({
  getAllWeights: vi.fn(async () => []),
  setWeight: vi.fn(async () => {}),
}))
vi.mock('@/lib/cerebro/weights-cache', () => ({
  invalidateLocal: vi.fn(),
}))

import { GET, PUT } from '@/app/api/admin/cerebro/weights/route'
import { isCerebroAdmin } from '@/lib/cerebro/admin-auth'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('GET /api/admin/cerebro/weights', () => {
  it('devuelve 403 cuando isCerebroAdmin es false', async () => {
    vi.mocked(isCerebroAdmin).mockResolvedValue(false)
    const req = new NextRequest('http://localhost/api/admin/cerebro/weights')
    const res = await GET(req)
    expect(res.status).toBe(403)
  })

  it('devuelve 200 con weights cuando isCerebroAdmin es true', async () => {
    vi.mocked(isCerebroAdmin).mockResolvedValue(true)
    const req = new NextRequest('http://localhost/api/admin/cerebro/weights')
    const res = await GET(req)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('weights')
  })
})

describe('PUT /api/admin/cerebro/weights', () => {
  it('devuelve 403 sin auth aunque el body sea válido', async () => {
    vi.mocked(isCerebroAdmin).mockResolvedValue(false)
    const req = new NextRequest('http://localhost/api/admin/cerebro/weights', {
      method: 'PUT',
      body: JSON.stringify({
        parameter_type: 'block',
        parameter_key: 'test_api',
        new_weight: 0.25,
      }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PUT(req)
    expect(res.status).toBe(403)
  })

  it('devuelve 400 con body inválido aunque sea admin (Zod validation)', async () => {
    vi.mocked(isCerebroAdmin).mockResolvedValue(true)
    const req = new NextRequest('http://localhost/api/admin/cerebro/weights', {
      method: 'PUT',
      body: JSON.stringify({ parameter_type: 'invalid', parameter_key: '', new_weight: 5 }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PUT(req)
    expect(res.status).toBe(400)
  })

  it('devuelve 200 cuando admin + body válido', async () => {
    vi.mocked(isCerebroAdmin).mockResolvedValue(true)
    const req = new NextRequest('http://localhost/api/admin/cerebro/weights', {
      method: 'PUT',
      body: JSON.stringify({
        parameter_type: 'block',
        parameter_key: 'test_api',
        new_weight: 0.25,
      }),
      headers: { 'content-type': 'application/json' },
    })
    const res = await PUT(req)
    expect(res.status).toBe(200)
  })
})
