import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'

const pedirTarjetaVigente = vi.fn()
vi.mock('@/lib/data/tournaments/tarjeta-vigente', () => ({
  pedirTarjetaVigente: (...a: unknown[]) => pedirTarjetaVigente(...a),
}))

import { useCrearTarjeta, MENSAJE_CREAR_TARJETA } from './useCrearTarjeta'

const sinNada = vi.fn(async () => true)

describe('useCrearTarjeta (scorer del organizador)', () => {
  beforeEach(() => { pedirTarjetaVigente.mockReset() })

  it('pide la tarjeta del jugador (sin headers de invitado: el organizador va con su sesión) y relee el roster', async () => {
    const orden: string[] = []
    pedirTarjetaVigente.mockImplementation(async () => { orden.push('ruta'); return 'respondio' })
    const reloadRoster = vi.fn(async () => { orden.push('roster'); return true })
    const { result } = renderHook(() => useCrearTarjeta({ slug: 'copa', playerId: 'p1', reloadRoster }))
    await act(async () => { await result.current.crear() })
    expect(pedirTarjetaVigente).toHaveBeenCalledWith({ slug: 'copa', playerId: 'p1' })
    expect(orden).toEqual(['ruta', 'roster'])
    expect(result.current.creando).toBe(false)
  })

  it.each([
    ['respondio', 'no_aparece'],
    ['rechazo_definitivo', 'rechazo_definitivo'],
    ['sin_sesion', 'sin_sesion'],
    ['sin_permiso', 'sin_permiso'],
    ['sin_conexion', 'sin_conexion'],
  ] as const)('respuesta %s → mensaje %s', async (respuesta, tipo) => {
    pedirTarjetaVigente.mockResolvedValue(respuesta)
    const { result } = renderHook(() => useCrearTarjeta({ slug: 'copa', playerId: 'p1', reloadRoster: sinNada }))
    await act(async () => { await result.current.crear() })
    expect(result.current.resultado).toBe(tipo)
    expect(MENSAJE_CREAR_TARJETA[tipo]).toBeTruthy()
  })

  it('el resultado es del jugador con que se pidió: al cambiar de jugador no se arrastra', async () => {
    pedirTarjetaVigente.mockResolvedValue('rechazo_definitivo')
    const { result, rerender } = renderHook(
      (p: { playerId: string }) => useCrearTarjeta({ slug: 'copa', playerId: p.playerId, reloadRoster: sinNada }),
      { initialProps: { playerId: 'p1' } },
    )
    await act(async () => { await result.current.crear() })
    expect(result.current.resultado).toBe('rechazo_definitivo')
    rerender({ playerId: 'p2' })
    expect(result.current.resultado).toBeNull()
  })

  it('2xx pero el roster no se pudo releer → sin_conexion (no "no aparece": la tarjeta puede existir)', async () => {
    pedirTarjetaVigente.mockResolvedValue('respondio')
    const { result } = renderHook(() => useCrearTarjeta({ slug: 'copa', playerId: 'p1', reloadRoster: async () => false }))
    await act(async () => { await result.current.crear() })
    expect(result.current.resultado).toBe('sin_conexion')
  })

  it('un rechazo definitivo se dice igual aunque la relectura falle', async () => {
    pedirTarjetaVigente.mockResolvedValue('rechazo_definitivo')
    const { result } = renderHook(() => useCrearTarjeta({ slug: 'copa', playerId: 'p1', reloadRoster: async () => false }))
    await act(async () => { await result.current.crear() })
    expect(result.current.resultado).toBe('rechazo_definitivo')
  })

  it('sin slug no pide nada', async () => {
    const { result } = renderHook(() => useCrearTarjeta({ slug: null, playerId: 'p1', reloadRoster: sinNada }))
    await act(async () => { await result.current.crear() })
    expect(pedirTarjetaVigente).not.toHaveBeenCalled()
  })
})
