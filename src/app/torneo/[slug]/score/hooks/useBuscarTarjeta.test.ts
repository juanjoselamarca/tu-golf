import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const pedirTarjetaVigente = vi.fn()
vi.mock('@/lib/data/tournaments/tarjeta-vigente', () => ({
  pedirTarjetaVigente: (...a: unknown[]) => pedirTarjetaVigente(...a),
}))

import { useBuscarTarjeta, MENSAJE_BUSQUEDA_TARJETA } from './useBuscarTarjeta'

const orden: string[] = []
const base = (over: Partial<Parameters<typeof useBuscarTarjeta>[0]> = {}) => ({
  slug: 'copa',
  playerId: 'p1',
  guestId: null,
  guestToken: null,
  reloadRoster: vi.fn(async () => { orden.push('roster'); return true }),
  ...over,
})

beforeEach(() => {
  orden.length = 0
  pedirTarjetaVigente.mockReset().mockImplementation(async () => { orden.push('ruta'); return 'respondio' })
})

describe('useBuscarTarjeta ("Buscar mi tarjeta")', () => {
  it('primero pide la tarjeta al servidor y DESPUÉS relee el roster', async () => {
    const args = base({ guestId: 'g1', guestToken: 'tok' })
    const { result } = renderHook(() => useBuscarTarjeta(args))
    await act(async () => { await result.current.buscar() })
    expect(orden).toEqual(['ruta', 'roster'])
    expect(pedirTarjetaVigente).toHaveBeenCalledWith({ slug: 'copa', playerId: 'p1', guestId: 'g1', guestToken: 'tok' })
    expect(result.current.buscando).toBe(false)
  })

  it('todo contestó y la tarjeta no está → "Todavía no aparece. Sigue en papel."', async () => {
    const { result } = renderHook(() => useBuscarTarjeta(base()))
    await act(async () => { await result.current.buscar() })
    expect(result.current.resultado).toBe('no_aparece')
    expect(MENSAJE_BUSQUEDA_TARJETA.no_aparece).toBe('Todavía no aparece. Sigue en papel.')
  })

  it('la ruta no contestó → "Sin conexión. Intenta de nuevo." (igual relee el roster)', async () => {
    pedirTarjetaVigente.mockResolvedValue('sin_conexion')
    const args = base()
    const { result } = renderHook(() => useBuscarTarjeta(args))
    await act(async () => { await result.current.buscar() })
    expect(result.current.resultado).toBe('sin_conexion')
    expect(args.reloadRoster).toHaveBeenCalledTimes(1)
    expect(MENSAJE_BUSQUEDA_TARJETA.sin_conexion).toBe('Sin conexión. Intenta de nuevo.')
  })

  it('el roster no se pudo releer → "Sin conexión"', async () => {
    const { result } = renderHook(() => useBuscarTarjeta(base({ reloadRoster: async () => false })))
    await act(async () => { await result.current.buscar() })
    expect(result.current.resultado).toBe('sin_conexion')
  })

  it('doble toque: una sola búsqueda en curso', async () => {
    let soltar: (v: string) => void = () => {}
    pedirTarjetaVigente.mockImplementation(() => new Promise<string>((r) => { soltar = r }))
    const { result } = renderHook(() => useBuscarTarjeta(base()))
    let primera: Promise<void> = Promise.resolve()
    act(() => { primera = result.current.buscar() })
    expect(result.current.buscando).toBe(true)
    await act(async () => { await result.current.buscar() })
    await act(async () => { soltar('respondio'); await primera })
    expect(pedirTarjetaVigente).toHaveBeenCalledTimes(1)
  })

  it('al cambiar de jugador no arrastra el resultado del anterior', async () => {
    const { result, rerender } = renderHook((p: { playerId: string }) => useBuscarTarjeta(base({ playerId: p.playerId })), {
      initialProps: { playerId: 'p1' },
    })
    await act(async () => { await result.current.buscar() })
    expect(result.current.resultado).toBe('no_aparece')
    rerender({ playerId: 'p2' })
    expect(result.current.resultado).toBeNull()
  })

  it('401 (sesión cerrada) → sin_sesion, no "Todavía no aparece"', async () => {
    pedirTarjetaVigente.mockResolvedValue('sin_sesion')
    const { result } = renderHook(() => useBuscarTarjeta(base()))
    await act(async () => { await result.current.buscar() })
    expect(result.current.resultado).toBe('sin_sesion')
  })

  it('sin jugador elegido no hace nada', async () => {
    const { result } = renderHook(() => useBuscarTarjeta(base({ playerId: null })))
    await act(async () => { await result.current.buscar() })
    expect(pedirTarjetaVigente).not.toHaveBeenCalled()
  })
})
