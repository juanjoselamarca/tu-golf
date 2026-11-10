/**
 * Borrar una ronda desde admin: un solo DELETE sobre rondas_libres; los jugadores caen por la FK
 * ON DELETE CASCADE. Borrarlos antes dejaba, si el segundo DELETE fallaba, una ronda viva sin
 * jugadores cuyos scorers recibían P0001 y limpiaban su tarjeta local (PR #763).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { borrados, falla } = vi.hoisted(() => ({ borrados: [] as string[], falla: { rondas: false } }))
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) } }),
}))
vi.mock('@/lib/admin', () => ({ isAdmin: async () => true }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/push/round-update', () => ({ pushRoundUpdate: vi.fn() }))
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({
    from: (tabla: string) => ({
      delete: () => ({
        eq: async () => {
          borrados.push(tabla)
          return { error: tabla === 'rondas_libres' && falla.rondas ? { message: 'boom' } : null }
        },
      }),
      insert: async () => ({ error: null }),
    }),
  }),
}))

import { DELETE } from './route'

const llamar = () => DELETE({} as never, { params: Promise.resolve({ id: 'r-1' }) })

beforeEach(() => { borrados.length = 0; falla.rondas = false })

describe('DELETE /api/admin/rondas-libres/[id]', () => {
  it('borra sólo la ronda: los jugadores caen por cascada', async () => {
    const res = await llamar()
    expect(res.status).toBe(200)
    expect(borrados).toEqual(['rondas_libres'])
  })

  it('si el DELETE de la ronda falla, sus jugadores siguen intactos', async () => {
    falla.rondas = true
    const res = await llamar()
    expect(res.status).toBe(500)
    expect(borrados).not.toContain('ronda_libre_jugadores')
  })
})
