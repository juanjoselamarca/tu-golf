// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import type { RondaReciente } from '@/lib/data/ronda-libre-nueva'

// Plan del usuario: lo controla cada test. El hook real lee la suscripción.
const acceso = vi.hoisted(() => ({ loading: false, pro: false }))
vi.mock('@/hooks/useAccesoNeto', () => ({
  useAccesoNeto: () => ({ loading: acceso.loading, puedeUsar: () => acceso.pro }),
}))

import { useFormularioDeRonda } from './useFormularioDeRonda'

const rondaVieja = (over: Partial<RondaReciente> = {}): RondaReciente => ({
  course_name: 'Club de Golf Los Leones', course_id: null, tees: 'blanco', holes: 18,
  formato_juego: 'match_play', modo_juego: 'neto', fecha: '2026-09-01', jugadores: [
    { nombre: 'Juanjo', handicap: 12.4, tees: null, esCreador: true },
    { nombre: 'Nico', handicap: 8.1, tees: 'azul', esCreador: false },
  ],
  ...over,
})

beforeEach(() => {
  acceso.loading = false
  acceso.pro = false
})

describe('useFormularioDeRonda — modo según plan', () => {
  it('free: Stroke Play Neto → Match Play queda en Gross y con el Neto bloqueado', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.setModo('neto'))
    expect(result.current.modo).toBe('neto') // stroke play neto es libre
    expect(result.current.netoBloqueado).toBe(false)

    act(() => result.current.elegirFormato('match_play'))
    expect(result.current.modo).toBe('gross')
    expect(result.current.netoBloqueado).toBe(true)
  })

  it('free: volver a Stroke Play recupera el Neto que había pedido', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.setModo('neto'))
    act(() => result.current.elegirFormato('match_play'))
    act(() => result.current.elegirFormato('stroke_play'))
    expect(result.current.modo).toBe('neto')
  })

  it('free: repetir un Match Play Neto viejo arma un Match Play Gross', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.repetirRonda(rondaVieja()))
    expect(result.current.formato).toBe('match_play')
    expect(result.current.modo).toBe('gross')
  })

  it('free: Match Play Gross es libre y se respeta', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirFormato('match_play'))
    act(() => result.current.setModo('gross'))
    expect(result.current.modo).toBe('gross')
  })

  it('Pro: Match Play Neto se respeta, al elegirlo y al repetir', () => {
    acceso.pro = true
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirFormato('match_play'))
    act(() => result.current.setModo('neto'))
    expect(result.current.modo).toBe('neto')
    expect(result.current.netoBloqueado).toBe(false)

    const otro = renderHook(() => useFormularioDeRonda())
    act(() => otro.result.current.repetirRonda(rondaVieja()))
    expect(otro.result.current.modo).toBe('neto')
  })

  it('mientras el plan carga no se bloquea ni se corrige; al resolver free cae a Gross', () => {
    acceso.loading = true
    const { result, rerender } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.repetirRonda(rondaVieja()))
    expect(result.current.modo).toBe('neto')
    expect(result.current.netoBloqueado).toBe(false)

    acceso.loading = false
    rerender()
    expect(result.current.modo).toBe('gross')
    expect(result.current.netoBloqueado).toBe(true)
  })

  it('un modo_juego desconocido en una ronda vieja no se copia', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.repetirRonda(rondaVieja({ formato_juego: 'stroke_play', modo_juego: 'raro' })))
    expect(result.current.modo).toBe('gross')
  })
})

describe('useFormularioDeRonda — jugadores recientes', () => {
  it('repetir una ronda trae a los rivales con su índice y su tee, sin el creador', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    // El creador viene SEGUNDO: la base no garantiza el orden de los jugadores.
    act(() => result.current.repetirRonda(rondaVieja({
      formato_juego: 'stroke_play',
      jugadores: [
        { nombre: 'Nico', handicap: 8.1, tees: 'azul', esCreador: false },
        { nombre: 'Juanjo', handicap: 12.4, tees: null, esCreador: true },
        { nombre: 'Pedro', handicap: null, tees: null, esCreador: false },
      ],
    })))
    expect(result.current.rivales.map(r => [r.nombre, r.handicap, r.tees])).toEqual([
      ['Nico', 8.1, 'azul'],
      ['Pedro', null, null],
    ])
  })

  it('un jugador reciente ocupa la tarjeta en blanco en vez de sumar otra', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirModoDeScore(true))
    expect(result.current.rivales).toHaveLength(1)
    const idEnBlanco = result.current.rivales[0].id

    act(() => result.current.agregarRival({ nombre: 'Nico', handicap: 8.1, tees: 'azul' }))
    expect(result.current.rivales).toHaveLength(1)
    expect(result.current.rivales[0]).toMatchObject({ id: idEnBlanco, nombre: 'Nico', handicap: 8.1, tees: 'azul' })

    act(() => result.current.agregarRival({ nombre: 'Pedro', handicap: 20, tees: null }))
    expect(result.current.rivales.map(r => r.nombre)).toEqual(['Nico', 'Pedro'])
  })

  it('"+ Agregar jugador" siempre suma una tarjeta nueva', () => {
    const { result } = renderHook(() => useFormularioDeRonda())
    act(() => result.current.elegirModoDeScore(true))
    act(() => result.current.agregarRival())
    expect(result.current.rivales).toHaveLength(2)
  })
})
