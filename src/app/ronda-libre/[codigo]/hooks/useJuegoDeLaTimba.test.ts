import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useJuegoDeLaTimba } from './useJuegoDeLaTimba'

vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))

const VISTA = { config: { modo: 'gross' }, jugadorIds: ['a'], resultado: { hoyos: [] }, golpesRecibidos: {}, marcas: [], retiros: {} }
const respuesta = (status: number, cuerpo: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo }) as Response

let fetchMock: ReturnType<typeof vi.fn>
beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('useJuegoDeLaTimba', () => {
  it('lee GET /juego y entrega la vista sin el campo estado', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { estado: 'ok', ...VISTA }))
    const { result } = renderHook(() => useJuegoDeLaTimba('ABC123', { activo: true, intervaloS: 0 }))
    await waitFor(() => expect(result.current.juego.estado).toBe('ok'))
    expect(fetchMock.mock.calls[0][0]).toBe('/api/ronda-libre/ABC123/juego')
    expect(result.current.vista).toEqual(VISTA)
  })

  it('sin sesión (401) lo dice; nunca cae a otra fuente', async () => {
    fetchMock.mockResolvedValue(respuesta(401, { error: 'Requiere sesión' }))
    const { result } = renderHook(() => useJuegoDeLaTimba('ABC123', { activo: true, intervaloS: 0 }))
    await waitFor(() => expect(result.current.juego.estado).toBe('sin_sesion'))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sin juego calculable: entrega el motivo', async () => {
    fetchMock.mockResolvedValue(respuesta(200, { estado: 'sin_juego', motivo: 'jugadores_cambiaron' }))
    const { result } = renderHook(() => useJuegoDeLaTimba('ABC123', { activo: true, intervaloS: 0 }))
    await waitFor(() => expect(result.current.juego).toEqual({ estado: 'sin_juego', motivo: 'jugadores_cambiaron' }))
  })

  it('si un pedido falla después de uno bueno, se queda con lo último y lo marca desactualizado', async () => {
    fetchMock.mockResolvedValueOnce(respuesta(200, { estado: 'ok', ...VISTA })).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useJuegoDeLaTimba('ABC123', { activo: true, intervaloS: 0 }))
    await waitFor(() => expect(result.current.juego.estado).toBe('ok'))
    await act(() => result.current.recargar())
    expect(result.current.juego).toMatchObject({ estado: 'ok', vista: VISTA, desactualizado: true })
  })

  it('sin nada que mostrar y sin señal: error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
    const { result } = renderHook(() => useJuegoDeLaTimba('ABC123', { activo: true, intervaloS: 0 }))
    await waitFor(() => expect(result.current.juego.estado).toBe('error'))
  })

  it('una respuesta vieja no pisa a una más nueva', async () => {
    let soltarVieja: (r: Response) => void = () => {}
    fetchMock
      .mockReturnValueOnce(new Promise<Response>(r => { soltarVieja = r }))
      .mockResolvedValueOnce(respuesta(200, { estado: 'ok', ...VISTA, jugadorIds: ['nueva'] }))
    const { result } = renderHook(() => useJuegoDeLaTimba('ABC123', { activo: true, intervaloS: 0 }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    await act(() => result.current.recargar())
    await act(async () => { soltarVieja(respuesta(200, { estado: 'ok', ...VISTA, jugadorIds: ['vieja'] })) })
    expect(result.current.vista?.jugadorIds).toEqual(['nueva'])
  })

  it('inactiva (no es Timba): no pide nada', async () => {
    renderHook(() => useJuegoDeLaTimba('ABC123', { activo: false, intervaloS: 0 }))
    await new Promise(r => setTimeout(r, 20))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
