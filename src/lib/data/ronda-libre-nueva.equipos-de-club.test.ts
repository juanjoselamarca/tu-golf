import { describe, it, expect, vi } from 'vitest'
import { equiposDeClubDeLaRonda, fetchRondasRecientes } from './ronda-libre-nueva'

const respuesta = vi.hoisted(() => ({ actual: { data: null as unknown, error: null as unknown } }))
const captureError = vi.hoisted(() => vi.fn(async () => undefined))
vi.mock('@/lib/error-tracking', () => ({ captureError }))
vi.mock('@/lib/supabase', () => {
  // Cadena de PostgREST: cada paso devuelve la misma consulta; el await entrega la respuesta.
  const consulta: Record<string, unknown> = {}
  for (const m of ['from', 'select', 'eq', 'order', 'limit']) consulta[m] = () => consulta
  consulta.then = (ok: (r: unknown) => unknown) => Promise.resolve(respuesta.actual).then(ok)
  return { createClient: () => consulta }
})

describe('equiposDeClubDeLaRonda — repetir una ronda de scramble rápido', () => {
  it('devuelve los nombres en orden si todos los equipos son de club', () => {
    expect(equiposDeClubDeLaRonda([
      { nombre: 'Los Tigres', handicap_origen: 'club' },
      { nombre: 'Equipo 2', handicap_origen: 'club' },
    ])).toEqual(['Los Tigres', 'Equipo 2'])
  })

  it('una ronda con jugadores (o sin equipos) no es de club', () => {
    expect(equiposDeClubDeLaRonda([{ nombre: 'Equipo 1', handicap_origen: 'calculado' }])).toBeNull()
    expect(equiposDeClubDeLaRonda([])).toBeNull()
    expect(equiposDeClubDeLaRonda(null)).toBeNull()
    expect(equiposDeClubDeLaRonda(undefined)).toBeNull()
  })

  it('una mezcla (no debería existir) no se repite como de club', () => {
    expect(equiposDeClubDeLaRonda([
      { nombre: 'Los Tigres', handicap_origen: 'club' },
      { nombre: 'Equipo 2', handicap_origen: 'calculado' },
    ])).toBeNull()
  })
})

describe('fetchRondasRecientes — un error no se calla', () => {
  it('con error de la consulta (p. ej. el embed de equipos) lo reporta y la pantalla sigue sin el atajo', async () => {
    respuesta.actual = { data: null, error: { code: '42703', message: 'column handicap_origen does not exist' } }
    expect(await fetchRondasRecientes('u1')).toEqual([])
    expect(captureError).toHaveBeenCalledWith(respuesta.actual.error, expect.objectContaining({ context: 'ronda-libre-nueva.rondas-recientes' }))
  })

  it('sin error ni filas: lista vacía y nada que reportar', async () => {
    captureError.mockClear()
    respuesta.actual = { data: [], error: null }
    expect(await fetchRondasRecientes('u1')).toEqual([])
    expect(captureError).not.toHaveBeenCalled()
  })
})
