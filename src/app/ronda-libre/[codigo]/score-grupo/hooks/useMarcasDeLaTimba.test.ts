import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import type { VistaDelJuego } from '@/golf/ronda-libre/juego-de-la-ronda'

const cola: { jugadorId: string; puntitoId: string; hoyo: number; marcar: boolean; valor: number }[] = []
const mocks = vi.hoisted(() => ({
  marcar: vi.fn(),
  reenviar: vi.fn(),
  retiro: vi.fn(),
  toast: vi.fn(),
}))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/hooks/useToast', () => ({ addToast: mocks.toast }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/data/ronda-libre-scores', () => ({ marcarRetiroTimba: mocks.retiro }))
vi.mock('@/lib/ronda/puntitos-pendientes', () => ({
  marcasPendientes: () => [...cola],
  marcarPuntitoConRespaldo: mocks.marcar,
  reenviarPuntitosPendientes: mocks.reenviar,
}))

import { useMarcasDeLaTimba } from './useMarcasDeLaTimba'

const SANDY = { id: 's', tipo: 'sandy', valor: 1, destino: 'individual', activo: true } as const
const GREENIE = { id: 'g', tipo: 'greenie', valor: 1, destino: 'individual', activo: true } as const
const vista = {
  config: { puntitos: [SANDY, GREENIE] },
  marcas: [{ jugadorId: 'a', hoyo: 3, puntitoId: 'g' }],
  retiros: {},
} as unknown as VistaDelJuego

beforeEach(() => {
  cola.length = 0
  Object.values(mocks).forEach(m => m.mockReset())
})

const montar = (conexion = 'ok', recargar = vi.fn(async () => {})) =>
  renderHook(() => useMarcasDeLaTimba({ codigo: 'ABC123', activo: true, vista, recargar, conexion }))

describe('useMarcasDeLaTimba', () => {
  it('marcar escribe en la cola y se ve al toque, aunque el envío no responda', async () => {
    mocks.marcar.mockImplementation(() => {
      cola.push({ jugadorId: 'b', puntitoId: 's', hoyo: 4, marcar: true, valor: 1 })
      return new Promise(() => {}) // sin señal
    })
    const { result } = montar()
    act(() => result.current.alternar('b', SANDY, 4))
    expect(mocks.marcar).toHaveBeenCalledWith({}, 'ABC123', { jugadorId: 'b', puntitoId: 's', hoyo: 4, marcar: true, esGreenie: false })
    expect(result.current.marcas).toContainEqual({ jugadorId: 'b', hoyo: 4, puntitoId: 's' })
    expect(result.current.hayPendientes).toBe(true)
  })

  it('tocar una marca guardada la quita; el greenie viaja como greenie', () => {
    mocks.marcar.mockReturnValue(new Promise(() => {}))
    const { result } = montar()
    act(() => result.current.alternar('a', GREENIE, 3))
    expect(mocks.marcar.mock.calls[0][2]).toEqual({ jugadorId: 'a', puntitoId: 'g', hoyo: 3, marcar: false, esGreenie: true })
  })

  it('un rechazo definitivo al marcar queda para avisarle al grupo', async () => {
    mocks.marcar.mockResolvedValue({ error: { code: 'P0003' } })
    const recargar = vi.fn(async () => {})
    const { result } = montar('ok', recargar)
    act(() => result.current.alternar('b', SANDY, 4))
    await waitFor(() => expect(result.current.rechazadas).toEqual([{ jugadorId: 'b', puntitoId: 's', hoyo: 4, marcar: true }]))
    expect(recargar).toHaveBeenCalled()
    act(() => result.current.descartarRechazadas())
    expect(result.current.rechazadas).toEqual([])
  })

  it('al volver la señal reenvía lo pendiente y avisa las rechazadas del reenvío', async () => {
    cola.push({ jugadorId: 'b', puntitoId: 's', hoyo: 4, marcar: true, valor: 1 })
    mocks.reenviar.mockImplementation(async () => {
      const marca = cola.shift()!
      return { enviadas: 0, rechazadas: [{ marca, code: 'P0003' }], pendientes: 0 }
    })
    const { result } = montar('ok')
    await waitFor(() => expect(result.current.rechazadas).toHaveLength(1))
    expect(result.current.hayPendientes).toBe(false)
  })

  it('sin señal no reenvía; enviarPendientes dice si quedó algo (cerrar lo exige)', async () => {
    cola.push({ jugadorId: 'b', puntitoId: 's', hoyo: 4, marcar: true, valor: 1 })
    mocks.reenviar.mockResolvedValue({ enviadas: 0, rechazadas: [], pendientes: 1 })
    const { result } = montar('sin_conexion')
    expect(mocks.reenviar).not.toHaveBeenCalled()
    let listo = true
    await act(async () => { listo = await result.current.enviarPendientes() })
    expect(listo).toBe(false)
  })

  it('retiro: guardado recarga el juego; con error avisa y no recarga', async () => {
    const recargar = vi.fn(async () => {})
    mocks.retiro.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { code: '', status: 0 } })
    const { result } = montar('ok', recargar)
    let ok = false
    await act(async () => { ok = await result.current.retirar('d', 8) })
    expect(ok).toBe(true)
    expect(mocks.retiro).toHaveBeenCalledWith({}, { codigo: 'ABC123', jugadorId: 'd', desdeHoyo: 8 })
    expect(recargar).toHaveBeenCalledTimes(1)
    await act(async () => { ok = await result.current.retirar('d', null) })
    expect(ok).toBe(false)
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', title: 'No se deshizo el retiro' }))
    expect(recargar).toHaveBeenCalledTimes(1)
  })
})
