import { describe, it, expect, vi } from 'vitest'
import { importRound } from '@/lib/import-round'
import { POST } from './route'

vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) } }),
}))
vi.mock('@/lib/import-round', async (original) => ({
  ...(await original<typeof import('@/lib/import-round')>()),
  importRound: vi.fn(async () => ({ success: true, roundId: 'r1', totalGross: 90, totalNeto: null, warnings: [] })),
}))

describe('POST /api/rounds/import — metadata del cliente (#545)', () => {
  it('descarta las claves que escribe el servidor (hoyos, ajuste_whs, estimados, ronda en vivo)', async () => {
    const body = {
      courseName: 'Los Leones', playedAt: '2026-10-01', scores: Array(18).fill(5),
      metadata: { putts: 30, hoyos: [10], ajuste_whs: { indice: 54 }, estimados: [{ hoyo: 1, motivo: 'no_jugado' }], ronda_libre_jugador_id: 'x' },
    }
    const res = await POST(new Request('http://x/api/rounds/import', { method: 'POST', body: JSON.stringify(body) }))
    expect(res.status).toBe(200)
    expect(vi.mocked(importRound).mock.calls[0][1].metadata).toEqual({ putts: 30 })
  })
})
