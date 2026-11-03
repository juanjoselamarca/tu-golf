/**
 * GET /api/torneos/[slug]/nombres — el relleno de nombres del scorer para el
 * visor SIN sesión. Sin esta ruta, `/torneo/[slug]/score` mostraba el selector
 * "¿Quién eres?" con N filas idénticas que decían "Jugador" (la policy SELECT de
 * `profiles` es `TO authenticated` y el embed del cliente llegaba null): el
 * invitado no se encontraba y un toque equivocado anotaba en la tarjeta de otro.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

let torneo: { id: string; status: string } | null = { id: 't1', status: 'open' }
const roster = [
  { id: 'p1', user_id: 'u1', player_name: null },
  { id: 'p2', user_id: null, player_name: 'Invitado Pedro' },
  { id: 'p3', user_id: 'u9', player_name: null },
]

vi.mock('@/lib/supabaseAdmin', () => ({
  createAdminClient: () => ({
    from: (tabla: string) => {
      const q: Record<string, unknown> = {}
      q.select = () => q
      q.eq = () => q
      q.maybeSingle = async () => ({ data: torneo, error: null })
      q.in = async () => ({ data: [{ id: 'u1', name: 'Juan José Lamarca' }], error: null })
      q.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: tabla === 'players' ? roster : [], error: null }).then(resolve)
      return q
    },
  }),
}))

import { GET } from '../route'

const pedir = (slug = 'copa') =>
  GET({} as never, { params: Promise.resolve({ slug }) })

beforeEach(() => { torneo = { id: 't1', status: 'open' } })

describe('GET /api/torneos/[slug]/nombres', () => {
  it('devuelve el nombre de cada inscrito por players.id', async () => {
    const res = await pedir()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      nombres: {
        p1: 'Juan José Lamarca',   // perfil, invisible para el cliente anónimo
        p2: 'Invitado Pedro',      // invitado sin cuenta: player_name
        p3: 'Jugador',             // con cuenta y sin nombre: no hay nada honesto
      },
    })
  })

  it('404 en un torneo que no es visible públicamente (no expone el roster de un borrador)', async () => {
    torneo = { id: 't1', status: 'draft' }
    const res = await pedir()
    expect(res.status).toBe(404)
    expect(await res.json()).toEqual({ error: 'not_found' })
  })

  it('404 si el torneo no existe', async () => {
    torneo = null
    expect((await pedir()).status).toBe(404)
  })
})
