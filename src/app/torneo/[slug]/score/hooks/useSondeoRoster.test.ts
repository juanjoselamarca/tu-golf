import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'

const pedirTarjetaVigente = vi.fn()
vi.mock('@/lib/data/tournaments/tarjeta-vigente', () => ({
  pedirTarjetaVigente: (...a: unknown[]) => pedirTarjetaVigente(...a),
}))

import { useSondeoRoster, INTERVALO_SONDEO_ROSTER_MS, rondaSiguienteYaAbierta } from './useSondeoRoster'

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

  it.each([['sin_sesion'], ['sin_permiso'], ['rechazo_definitivo']])('tras un %s deja de pedir la tarjeta (solo relee)', async (r) => {
    pedirTarjetaVigente.mockResolvedValue(r)
    const reloadRoster = reload()
    renderHook(() => useSondeoRoster({ activo: true, pedirTarjeta: PEDIR, reloadRoster }))
    await tick()
    await tick()
    await tick()
    expect(pedirTarjetaVigente).toHaveBeenCalledTimes(1)
    expect(reloadRoster).toHaveBeenCalledTimes(3)
  })

  it('tras un 401 avisa para qué jugador (la pantalla ofrece iniciar sesión); otro corte no', async () => {
    pedirTarjetaVigente.mockResolvedValue('sin_sesion')
    const { result } = renderHook(() => useSondeoRoster({ activo: true, pedirTarjeta: PEDIR, reloadRoster: reload() }))
    expect(result.current.sinSesionDe).toBeNull()
    await tick()
    expect(result.current.sinSesionDe).toBe('p1')

    pedirTarjetaVigente.mockReset().mockResolvedValue('rechazo_definitivo')
    const otro = renderHook(() => useSondeoRoster({ activo: true, pedirTarjeta: PEDIR, reloadRoster: reload() }))
    await tick()
    expect(otro.result.current.sinSesionDe).toBeNull()
  })

  it('un 409 round_not_in_play (respondio) no corta: vuelve a pedir en el próximo tick', async () => {
    const reloadRoster = reload()
    renderHook(() => useSondeoRoster({ activo: true, pedirTarjeta: PEDIR, reloadRoster }))
    await tick()
    await tick()
    expect(pedirTarjetaVigente).toHaveBeenCalledTimes(2)
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

describe('rondaSiguienteYaAbierta (cuándo el sondeo pide la tarjeta)', () => {
  it('entre rondas (nadie tiene tarjeta de la 2) → no: 0 POST mientras se espera', () => {
    const roster = [{ rounds: [{ round_number: 1 }] }, { rounds: [{ round_number: 1 }] }, { rounds: null }]
    expect(rondaSiguienteYaAbierta(roster, 1)).toBe(false)
  })
  it('la ronda 2 ya abierta para otro jugador → sí', () => {
    const roster = [{ rounds: [{ round_number: 1 }] }, { rounds: [{ round_number: 1 }, { round_number: 2 }] }]
    expect(rondaSiguienteYaAbierta(roster, 1)).toBe(true)
  })
  it('round_number nulo cuenta como 1', () => {
    expect(rondaSiguienteYaAbierta([{ rounds: [{ round_number: null }] }], 1)).toBe(false)
  })
})
