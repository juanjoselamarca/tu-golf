/**
 * Tests del endpoint admin /api/admin/cerebro/weights.
 *
 * Sin cookie de admin, debe devolver 403. Esto valida que el guard está
 * activo. Tests con admin real se hacen via Playwright E2E en olas
 * siguientes — para Ola 0 con que el guard rechace requests no-admin
 * alcanza.
 */
import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, PUT } from '@/app/api/admin/cerebro/weights/route'

describe('GET /api/admin/cerebro/weights', () => {
  it('devuelve 403 sin cookie sb-access-token', async () => {
    const req = new NextRequest('http://localhost/api/admin/cerebro/weights')
    const res = await GET(req)
    expect(res.status).toBe(403)
  })
})

describe('PUT /api/admin/cerebro/weights', () => {
  it('devuelve 403 sin auth aunque el body sea válido', async () => {
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
})
