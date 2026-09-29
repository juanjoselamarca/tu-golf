/**
 * /api/admin/health-check/fix — cerrar rondas abandonadas / con estado inválido
 * avisa a quienes las siguen (review C-2: con exec_sql no volvían filas y el
 * "Resultado final" nunca salía).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.mock('@/utils/supabase/server', () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) } })),
}))
vi.mock('@/lib/admin', () => ({ isAdmin: vi.fn(async () => true) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn(async () => {}) }))
vi.mock('@/lib/push/round-update', () => ({ pushRoundUpdate: vi.fn(async () => ({ status: 'sent', sent: 1, failed: 0, cleaned: 0, finished: true })) }))

const closed = { rows: [{ id: 'r1', codigo: 'AAA111' }, { id: 'r2', codigo: 'BBB222' }] }
const calls: string[] = []
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => ({
      update: () => {
        calls.push(`update:${table}`)
        const chain = {
          eq: () => chain, lt: () => chain, not: () => chain,
          select: async () => ({ data: closed.rows, error: null }),
        }
        return chain
      },
      insert: async () => ({ error: null }),
      rpc: undefined,
    }),
    rpc: vi.fn(async () => ({ data: null })),
  })),
}))

import { POST } from '@/app/api/admin/health-check/fix/route'
import { pushRoundUpdate } from '@/lib/push/round-update'

const req = (fixId: string) => new NextRequest('http://localhost/api/admin/health-check/fix', {
  method: 'POST', body: JSON.stringify({ fixId }), headers: { 'content-type': 'application/json' },
})

beforeEach(() => { vi.clearAllMocks(); calls.length = 0 })

describe('POST /api/admin/health-check/fix — cierres de rondas libres', () => {
  for (const fixId of ['abandoned-rondas', 'invalid-ronda-estados']) {
    it(`${fixId}: cierra con el query builder y empuja el "Resultado final" a CADA ronda cerrada`, async () => {
      const res = await POST(req(fixId))
      expect(res.status).toBe(200)
      expect(calls).toContain('update:rondas_libres')
      expect(pushRoundUpdate).toHaveBeenCalledTimes(2)
      expect(pushRoundUpdate).toHaveBeenCalledWith(expect.anything(), 'AAA111')
      expect(pushRoundUpdate).toHaveBeenCalledWith(expect.anything(), 'BBB222')
    })
  }

  it('sin rondas para cerrar no empuja nada', async () => {
    closed.rows = []
    const res = await POST(req('abandoned-rondas'))
    expect(await res.json()).toMatchObject({ result: { fixed: 0 } })
    expect(pushRoundUpdate).not.toHaveBeenCalled()
    closed.rows = [{ id: 'r1', codigo: 'AAA111' }, { id: 'r2', codigo: 'BBB222' }]
  })
})
