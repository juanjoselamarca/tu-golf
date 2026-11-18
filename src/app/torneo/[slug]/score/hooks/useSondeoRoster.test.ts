import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const pedirTarjetaVigente = vi.fn()
vi.mock('@/lib/data/tournaments/tarjeta-vigente', () => ({
  pedirTarjetaVigente: (...a: unknown[]) => pedirTarjetaVigente(...a),
}))

import { useSondeoRoster, INTERVALO_SONDEO_ROSTER_MS } from './useSondeoRoster'

const tick = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(INTERVALO_SONDEO_ROSTER_MS) }) }
const PEDIR = { slug: 'copa', playerId: 'p1', guestId: null, guestToken: null }
const orden: string[] = []

describe('useSondeoRoster', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    orden.length = 0
    pedirTarjetaVigente.mockReset().mockImplementation(async () => { orden.push('ruta'); return 'respondio' })
  })
  afterEach(() => { vi.useRealTimers() })
  const reload = () => vi.fn(async () => { orden.push('roster'); return true })

  it('ronda cerrada y la siguiente sin tarjeta: pide la tarjeta ANTES de releer el roster', async () => {
    const reloadRoster = reload()
    renderHook(() => useSondeoRoster({ activo: true, pedirTarjeta: PEDIR, reloadRoster }))
    await tick()
    expect(orden).toEqual(['ruta', 'roster'])
    expect(pedirTarjetaVigente).toHaveBeenCalledWith(PEDIR)
  })

  it('sin pedirTarjeta (jugador sin tarjeta: tiene su botón) solo relee', async () => {
    const reloadRoster = reload()
    renderHook(() => useSondeoRoster({ activo: true, pedirTarjeta: null, reloadRoster }))
    await tick()
    expect(orden).toEqual(['roster'])
  })

  it('inactivo (torneo cerrado o nada que esperar) no sondea; al apagarse, deja de sondear', async () => {
    const reloadRoster = reload()
    const { rerender } = renderHook((p: { activo: boolean }) => useSondeoRoster({ activo: p.activo, pedirTarjeta: PEDIR, reloadRoster }), {
      initialProps: { activo: false },
    })
    await tick()
    expect(reloadRoster).not.toHaveBeenCalled()
    rerender({ activo: true })
    await tick()
    expect(reloadRoster).toHaveBeenCalledTimes(1)
    rerender({ activo: false })
    await tick()
    expect(reloadRoster).toHaveBeenCalledTimes(1)
  })

  it('con la pestaña oculta no sondea', async () => {
    const reloadRoster = reload()
    const oculto = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    renderHook(() => useSondeoRoster({ activo: true, pedirTarjeta: PEDIR, reloadRoster }))
    await tick()
    expect(reloadRoster).not.toHaveBeenCalled()
    oculto.mockRestore()
  })

  it('una consulta colgada no se solapa con la siguiente', async () => {
    pedirTarjetaVigente.mockImplementation(() => new Promise(() => {}))
    const reloadRoster = reload()
    renderHook(() => useSondeoRoster({ activo: true, pedirTarjeta: PEDIR, reloadRoster }))
    await tick()
    await tick()
    expect(pedirTarjetaVigente).toHaveBeenCalledTimes(1)
  })
})
