/**
 * Borrar una ronda desde admin: un solo DELETE sobre rondas_libres; los jugadores caen por la FK
 * ON DELETE CASCADE. Borrarlos antes dejaba, si el segundo DELETE fallaba, una ronda viva sin
 * jugadores cuyos scorers recibían P0001 y limpiaban su tarjeta local (PR #763).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { borrados, falla, updates } = vi.hoisted(() => ({
  borrados: [] as string[],
  falla: { rondas: false },
  updates: [] as Array<Record<string, unknown>>,
}))
vi.mock('@/utils/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin-1' } } }) } }),
}))
vi.mock('@/lib/admin', () => ({ isAdmin: async () => true }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/push/round-update', () => ({ pushRoundUpdate: vi.fn(async () => ({})) }))
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({
    from: (tabla: string) => ({
      delete: () => ({
        eq: async () => {
          borrados.push(tabla)
          return { error: tabla === 'rondas_libres' && falla.rondas ? { message: 'boom' } : null }
        },
      }),
      update: (cambios: Record<string, unknown>) => {
        updates.push(cambios)
        return { eq: () => ({ select: () => ({ single: async () => ({ data: { codigo: 'ABC123' }, error: null }) }) }) }
      },
      insert: async () => ({ error: null }),
    }),
  }),
}))

import { DELETE, PATCH } from './route'

const ID = '6f1c1d0e-2b3a-4c5d-8e9f-0a1b2c3d4e5f'
const llamar = (id = ID) => DELETE({} as never, { params: Promise.resolve({ id }) })
const patch = (body: string, id = ID) =>
  PATCH(new Request('http://x', { method: 'PATCH', body }) as never, { params: Promise.resolve({ id }) })

beforeEach(() => { borrados.length = 0; updates.length = 0; falla.rondas = false })

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

describe('PATCH /api/admin/rondas-libres/[id]: validación de entrada', () => {
  it('cierra la ronda con un estado válido', async () => {
    const res = await patch(JSON.stringify({ estado: 'finalizada' }))
    expect(res.status).toBe(200)
    expect(updates).toEqual([{ estado: 'finalizada' }])
  })

  it('un cuerpo que no es JSON responde 400, no 500', async () => {
    const res = await patch('{no es json')
    expect(res.status).toBe(400)
    expect(updates).toEqual([])
  })

  it.each([[''], [0], [false], [null], [['finalizada']], ['cerrada']])(
    'estado %j responde 400 sin tocar la base',
    async (estado) => {
      const res = await patch(JSON.stringify({ estado }))
      expect(res.status).toBe(400)
      expect(updates).toEqual([])
    },
  )

  it('un id que no es UUID responde 400 sin escribir', async () => {
    const res = await patch(JSON.stringify({ estado: 'finalizada' }), 'no-uuid')
    expect(res.status).toBe(400)
    expect(updates).toEqual([])
  })
})

describe('DELETE /api/admin/rondas-libres/[id]: id inválido', () => {
  it('un id que no es UUID responde 400 sin borrar nada', async () => {
    const res = await llamar('no-uuid')
    expect(res.status).toBe(400)
    expect(borrados).toEqual([])
  })
})
