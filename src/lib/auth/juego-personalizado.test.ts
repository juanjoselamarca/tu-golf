import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('server-only', () => ({}))
let rol: string | null = 'player'
let probador: { data: unknown; error: unknown } = { data: null, error: null }
let falla = false
const desde = vi.fn((tabla: string) => {
  if (falla) throw new Error('boom')
  const fila = tabla === 'profiles' ? { data: rol ? { role: rol } : null, error: null } : probador
  const q = { select: () => q, eq: () => q, single: async () => fila, maybeSingle: async () => fila }
  return q
})
vi.mock('@/lib/supabaseAdmin', () => ({ createAdminClient: () => ({ from: desde }) }))

import { puedeCrearJuegoPersonalizado } from './juego-personalizado'

describe('puedeCrearJuegoPersonalizado — admin o probador de la Timba', () => {
  beforeEach(() => { rol = 'player'; probador = { data: null, error: null }; falla = false; desde.mockClear() })

  it('sin usuario: no, sin consultar', async () => {
    expect(await puedeCrearJuegoPersonalizado(null)).toBe(false)
    expect(desde).not.toHaveBeenCalled()
  })

  it('admin: sí, sin mirar la lista de probadores', async () => {
    rol = 'admin'
    expect(await puedeCrearJuegoPersonalizado('u1')).toBe(true)
    expect(desde).not.toHaveBeenCalledWith('timba_probadores')
  })

  it('probador sin ser admin: sí', async () => {
    probador = { data: { user_id: 'u1' }, error: null }
    expect(await puedeCrearJuegoPersonalizado('u1')).toBe(true)
  })

  it('jugador cualquiera: no', async () => {
    expect(await puedeCrearJuegoPersonalizado('u1')).toBe(false)
  })

  it('la tabla aún no existe (error) o todo falla: falla cerrado', async () => {
    probador = { data: null, error: { code: '42P01' } }
    expect(await puedeCrearJuegoPersonalizado('u1')).toBe(false)
    falla = true
    expect(await puedeCrearJuegoPersonalizado('u1')).toBe(false)
  })
})
