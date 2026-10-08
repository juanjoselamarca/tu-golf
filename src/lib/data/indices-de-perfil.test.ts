import { describe, it, expect, vi, beforeEach } from 'vitest'

const llamadas: unknown[][] = []
let respuesta: { data: unknown; error: { message: string } | null } = { data: [], error: null }
vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({
    from: (t: string) => {
      llamadas.push(['from', t])
      const q: Record<string, unknown> = {}
      q.select = (...a: unknown[]) => { llamadas.push(['select', ...a]); return q }
      q.in = (...a: unknown[]) => { llamadas.push(['in', ...a]); return Promise.resolve(respuesta) }
      return q
    },
  }),
}))

import { indicesDePerfil } from './indices-de-perfil'

beforeEach(() => {
  llamadas.length = 0
  respuesta = { data: [], error: null }
})

describe('indicesDePerfil — índice de perfiles para pantallas públicas (cliente de servicio)', () => {
  it('lee sólo id e índice, de los usuarios pedidos, deduplicados', async () => {
    respuesta = { data: [{ id: 'u1', indice: 18 }, { id: 'u2', indice: 4.2 }], error: null }
    const m = await indicesDePerfil(['u1', 'u2', 'u1', ''])
    expect(llamadas).toEqual([['from', 'profiles'], ['select', 'id, indice'], ['in', 'id', ['u1', 'u2']]])
    expect(m.get('u1')).toBe(18)
    expect(m.get('u2')).toBe(4.2)
  })

  it('sin usuarios no consulta', async () => {
    expect((await indicesDePerfil([])).size).toBe(0)
    expect(llamadas).toEqual([])
  })

  it('un perfil sin índice no aparece (no se inventa 0)', async () => {
    respuesta = { data: [{ id: 'u1', indice: null }], error: null }
    expect((await indicesDePerfil(['u1'])).has('u1')).toBe(false)
  })

  it('falla CERRADO: con error de la BD lanza, nunca devuelve "sin índices"', async () => {
    respuesta = { data: null, error: { message: 'timeout' } }
    await expect(indicesDePerfil(['u1'])).rejects.toThrow(/índices de perfil/)
  })
})
