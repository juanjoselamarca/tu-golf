import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

import { captureError } from '@/lib/error-tracking'
import { nombreDelDueñoDeTarjetaPublica } from './tarjeta-nombre-publico'

type Resp = { data: unknown; error: { code: string } | null }

let filtros: Array<{ tabla: string; col: string; val: unknown }> = []

/** Cliente admin falso: `rondas` responde a historical_rounds, `perfil` a profiles. */
function admin(rondas: Resp, perfil: Resp = { data: { name: 'Juanjo Lamarca' }, error: null }) {
  return {
    from: (tabla: string) => {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = (col: string, val: unknown) => { filtros.push({ tabla, col, val }); return b }
      b.maybeSingle = () => Promise.resolve(tabla === 'profiles' ? perfil : rondas)
      return b
    },
  } as unknown as SupabaseClient
}

beforeEach(() => { filtros = []; vi.mocked(captureError).mockClear() })

describe('nombreDelDueñoDeTarjetaPublica', () => {
  it('ronda pública → el nombre del dueño', async () => {
    const r = await nombreDelDueñoDeTarjetaPublica(admin({ data: { user_id: 'u1' }, error: null }), 'r1')
    expect(r).toBe('Juanjo Lamarca')
    expect(filtros).toContainEqual({ tabla: 'profiles', col: 'id', val: 'u1' })
  })

  it('sólo mira rondas públicas (lo mismo que deja ver la policy public_rounds)', async () => {
    await nombreDelDueñoDeTarjetaPublica(admin({ data: { user_id: 'u1' }, error: null }), 'r1')
    expect(filtros).toContainEqual({ tabla: 'historical_rounds', col: 'privacy', val: 'public' })
    expect(filtros).toContainEqual({ tabla: 'historical_rounds', col: 'id', val: 'r1' })
  })

  it('ronda privada o inexistente → null, sin preguntar por el perfil', async () => {
    expect(await nombreDelDueñoDeTarjetaPublica(admin({ data: null, error: null }), 'r1')).toBeNull()
    expect(filtros.some(f => f.tabla === 'profiles')).toBe(false)
  })

  it('perfil sin nombre (o sólo espacios) → null, para que la pantalla no muestre un vacío', async () => {
    const r = await nombreDelDueñoDeTarjetaPublica(
      admin({ data: { user_id: 'u1' }, error: null }, { data: { name: '  ' }, error: null }), 'r1')
    expect(r).toBeNull()
  })

  it('id que no es uuid (22P02) → null sin reportar; otro error → null y se reporta', async () => {
    expect(await nombreDelDueñoDeTarjetaPublica(admin({ data: null, error: { code: '22P02' } }), 'abc')).toBeNull()
    expect(captureError).not.toHaveBeenCalled()
    expect(await nombreDelDueñoDeTarjetaPublica(admin({ data: null, error: { code: '57014' } }), 'r1')).toBeNull()
    expect(captureError).toHaveBeenCalledTimes(1)
  })
})
