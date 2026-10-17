import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

import { cargarTarjetaGuardada } from './tarjeta-guardada'

const RONDA = { id: 'r1', user_id: 'dueño', course_name: 'Los Leones', course_id: 'c1', scores: [4] }

interface Escenario {
  usuario: string | null
  ronda: { data: unknown; error: { code: string } | null } | Error
  /** Falla la consulta del catálogo de hoyos. */
  catalogoFalla?: boolean
}

let pedidas: Array<{ tabla: string; columnas: string }> = []

function cliente({ usuario, ronda, catalogoFalla }: Escenario) {
  const from = (tabla: string) => {
    let columnas = ''
    const b: Record<string, unknown> = {}
    b.select = (c: string) => { columnas = c; pedidas.push({ tabla, columnas }); return b }
    b.eq = () => b
    b.order = () => Promise.resolve(catalogoFalla
      ? { data: null, error: { code: '57014' } }
      : { data: [{ numero: 1, par: 4, stroke_index: 1 }], error: null })
    b.single = () => (ronda instanceof Error ? Promise.reject(ronda) : Promise.resolve(ronda))
    b.maybeSingle = () => Promise.resolve(
      tabla === 'profiles' ? { data: { name: 'Juanjo' } } : { data: { notes: 'privadas' } },
    )
    return b
  }
  return {
    auth: { getUser: async () => ({ data: { user: usuario ? { id: usuario } : null } }) },
    from,
  } as unknown as SupabaseClient
}

beforeEach(() => { pedidas = [] })

describe('cargarTarjetaGuardada', () => {
  it('ronda inexistente (PGRST116) → no_existe', async () => {
    const c = cliente({ usuario: null, ronda: { data: null, error: { code: 'PGRST116' } } })
    expect(await cargarTarjetaGuardada(c, 'x')).toEqual({ estado: 'no_existe' })
  })

  it('un id que no es uuid (22P02) → no_existe', async () => {
    const c = cliente({ usuario: null, ronda: { data: null, error: { code: '22P02' } } })
    expect(await cargarTarjetaGuardada(c, 'abc')).toEqual({ estado: 'no_existe' })
  })

  it('error de la base o de red → error (reintentable), no "no existe"', async () => {
    expect(await cargarTarjetaGuardada(cliente({ usuario: null, ronda: { data: null, error: { code: '57014' } } }), 'r1'))
      .toEqual({ estado: 'error' })
    expect(await cargarTarjetaGuardada(cliente({ usuario: null, ronda: new TypeError('Failed to fetch') }), 'r1'))
      .toEqual({ estado: 'error' })
  })

  it('un tercero no recibe las notas (ni se piden)', async () => {
    const c = cliente({ usuario: 'otro', ronda: { data: RONDA, error: null } })
    const r = await cargarTarjetaGuardada(c, 'r1')
    expect(r.estado === 'ok' && r.ronda.notes).toBeNull()
    expect(r.estado === 'ok' && r.esDueño).toBe(false)
    expect(pedidas.some(p => p.columnas.includes('notes'))).toBe(false)
  })

  it('el dueño recibe sus notas, el nombre y el catálogo', async () => {
    const c = cliente({ usuario: 'dueño', ronda: { data: RONDA, error: null } })
    const r = await cargarTarjetaGuardada(c, 'r1')
    expect(r).toMatchObject({
      estado: 'ok', esDueño: true, nombreDelJugador: 'Juanjo',
      ronda: { notes: 'privadas' }, hoyosDelCatalogo: [{ numero: 1, par: 4 }],
    })
  })

  it('si falla el catálogo → error (reintentable), no una tarjeta sin pares', async () => {
    const c = cliente({ usuario: 'dueño', ronda: { data: RONDA, error: null }, catalogoFalla: true })
    expect(await cargarTarjetaGuardada(c, 'r1')).toEqual({ estado: 'error' })
  })
})
