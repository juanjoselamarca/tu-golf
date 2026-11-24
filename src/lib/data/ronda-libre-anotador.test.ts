import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

import { reclamarEquipoDeRonda, liberarEquipoDeRonda, mensajeEquipoTomado, MENSAJE_YA_NO_ANOTAS } from './ronda-libre-anotador'

const cliente = (r: { data?: unknown; error?: { code: string } | null } | Error) => ({
  rpc: vi.fn(() => (r instanceof Error ? Promise.reject(r) : Promise.resolve({ data: r.data ?? null, error: r.error ?? null }))),
}) as unknown as Parameters<typeof reclamarEquipoDeRonda>[0]

describe('reclamarEquipoDeRonda', () => {
  it('llama la RPC con código y equipo', async () => {
    const c = cliente({ data: { estado: 'ok' } })
    expect(await reclamarEquipoDeRonda(c, 'ABC123', 'e1')).toEqual({ estado: 'ok' })
    expect((c as unknown as { rpc: ReturnType<typeof vi.fn> }).rpc).toHaveBeenCalledWith('reclamar_equipo_de_ronda', { p_codigo: 'ABC123', p_equipo_id: 'e1' })
  })
  it('tomado: el copy con el nombre de quien lo anota, o «otro celular»', async () => {
    expect(await reclamarEquipoDeRonda(cliente({ data: { estado: 'tomado', anotador_nombre: 'Pedro' } }), 'X', 'e1'))
      .toEqual({ estado: 'tomado', mensaje: 'Ese equipo ya lo anota Pedro. Elige otro.' })
    expect(await reclamarEquipoDeRonda(cliente({ data: { estado: 'tomado', anotador_nombre: null } }), 'X', 'e1'))
      .toEqual({ estado: 'tomado', mensaje: 'Ese equipo ya lo anota otro celular. Elige otro.' })
  })
  it('ya_tienes_equipo trae el equipo', async () => {
    expect(await reclamarEquipoDeRonda(cliente({ data: { estado: 'ya_tienes_equipo', equipo_id: 'e2' } }), 'X', 'e1'))
      .toEqual({ estado: 'ya_tienes_equipo', equipoId: 'e2' })
  })
  it('errores SQL a copy (contrato de pruebas-sql/equipos-de-club.sql)', async () => {
    expect(await reclamarEquipoDeRonda(cliente({ error: { code: 'P0002' } }), 'X', 'e1')).toMatchObject({ estado: 'error', ronda: 'cerrada', mensaje: 'La ronda ya terminó.' })
    expect(await reclamarEquipoDeRonda(cliente({ error: { code: 'P0001' } }), 'X', 'e1')).toMatchObject({ estado: 'error', ronda: 'viva' })
    expect(await reclamarEquipoDeRonda(cliente({ error: { code: 'P0003' } }), 'X', 'e1')).toMatchObject({ estado: 'error', ronda: 'sin_permiso' })
  })
  it('sin red: nunca lanza', async () => {
    expect(await reclamarEquipoDeRonda(cliente(new Error('fetch failed')), 'X', 'e1')).toMatchObject({ estado: 'error', ronda: 'sin_respuesta' })
  })
})

describe('liberarEquipoDeRonda', () => {
  it('ok y rechazo de quien no es creador ni anotador', async () => {
    expect(await liberarEquipoDeRonda(cliente({ data: { estado: 'ok' } }), 'X', 'e1')).toEqual({ estado: 'ok' })
    expect(await liberarEquipoDeRonda(cliente({ error: { code: 'P0003' } }), 'X', 'e1')).toEqual({
      estado: 'error', mensaje: 'Solo quien creó la ronda o quien anota ese equipo puede liberarlo.',
    })
  })
})

describe('copy', () => {
  it('ya no anotas', () => {
    expect(MENSAJE_YA_NO_ANOTAS).toBe('Ya no anotas este equipo.')
    expect(mensajeEquipoTomado('Ana')).toBe('Ese equipo ya lo anota Ana. Elige otro.')
  })
})
