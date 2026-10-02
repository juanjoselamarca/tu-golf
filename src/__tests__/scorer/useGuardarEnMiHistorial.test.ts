import { renderHook, act, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
const addToast = vi.fn()
vi.mock('@/hooks/useToast', () => ({ addToast: (...a: unknown[]) => addToast(...a) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
const tarjetaYaEnMiHistorial = vi.fn()
const guardarTarjetaEnHistorial = vi.fn()
const recalcularIndiceGolfers = vi.fn(async () => true)
const actualizarNivelDelJugador = vi.fn(async () => {})
const avisarAlCoachRondaNueva = vi.fn()
const extrasDeTarjeta = vi.fn(async () => ({ matchResult: null as string | null, teamName: null as string | null }))
vi.mock('@/lib/data/ronda-libre-finalizar', () => ({
  tarjetaYaEnMiHistorial: (...a: unknown[]) => tarjetaYaEnMiHistorial(...a),
  guardarTarjetaEnHistorial: (...a: unknown[]) => guardarTarjetaEnHistorial(...a),
  recalcularIndiceGolfers: (...a: unknown[]) => recalcularIndiceGolfers(...(a as [])),
  actualizarNivelDelJugador: (...a: unknown[]) => actualizarNivelDelJugador(...(a as [])),
  avisarAlCoachRondaNueva: (...a: unknown[]) => avisarAlCoachRondaNueva(...a),
  extrasDeTarjeta: (...a: unknown[]) => extrasDeTarjeta(...(a as [])),
}))

import { useGuardarEnMiHistorial } from '@/app/ronda-libre/[codigo]/hooks/useGuardarEnMiHistorial'

const ronda = {
  id: 'r1', codigo: 'ABC', course_name: 'X', course_id: 'c1', tees: 'azul', holes: 9, hoyo_inicio: 10,
  fecha: '2026-10-01', estado: 'finalizada', modo_juego: 'gross', formato_juego: 'stroke_play',
  ronda_libre_jugadores: [
    { id: 'p1', nombre: 'Ana', user_id: 'u1', scores: { '10': 4 } },
    { id: 'p2', nombre: 'Beto', user_id: 'u2', scores: { '10': 5 } },
  ],
} as never

const montar = (over: Partial<{ isFinished: boolean; currentUserId: string | null }> = {}) =>
  renderHook(() => useGuardarEnMiHistorial({
    ronda, isFinished: over.isFinished ?? true, currentUserId: over.currentUserId === undefined ? 'u2' : over.currentUserId,
    parMap: { 10: 4 }, equipos: [],
  }))

describe('useGuardarEnMiHistorial', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ronda terminada, mi tarjeta no está en mi historial → se ofrece', async () => {
    tarjetaYaEnMiHistorial.mockResolvedValue(false)
    const { result } = montar()
    await waitFor(() => expect(result.current.estado).toBe('disponible'))
    expect(tarjetaYaEnMiHistorial).toHaveBeenCalledWith({}, 'p2')
  })

  it('ya está guardada, o la lectura falló → no se ofrece', async () => {
    tarjetaYaEnMiHistorial.mockResolvedValue(true)
    const a = montar()
    await waitFor(() => expect(tarjetaYaEnMiHistorial).toHaveBeenCalled())
    expect(a.result.current.estado).toBe('oculto')
    tarjetaYaEnMiHistorial.mockResolvedValue(null)
    const b = montar()
    await waitFor(() => expect(tarjetaYaEnMiHistorial).toHaveBeenCalledTimes(2))
    expect(b.result.current.estado).toBe('oculto')
  })

  it('no jugué la ronda, sin sesión o ronda en curso → no se ofrece ni consulta', async () => {
    montar({ currentUserId: 'u9' })
    montar({ currentUserId: null })
    montar({ isFinished: false })
    await new Promise(r => setTimeout(r, 0))
    expect(tarjetaYaEnMiHistorial).not.toHaveBeenCalled()
  })

  it('guardar: SU tarjeta con su userId, recalcula índice, avisa al coach y se oculta', async () => {
    tarjetaYaEnMiHistorial.mockResolvedValue(false)
    guardarTarjetaEnHistorial.mockResolvedValue({ status: 'insertada', id: 'h1', tarjeta: {} })
    const { result } = montar()
    await waitFor(() => expect(result.current.estado).toBe('disponible'))
    await act(async () => { await result.current.guardar() })
    const [, input] = guardarTarjetaEnHistorial.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(input).toMatchObject({ userId: 'u2', conId: true, hoyos: [10, 11, 12, 13, 14, 15, 16, 17, 18] })
    expect((input.jugador as { id: string }).id).toBe('p2')
    expect(avisarAlCoachRondaNueva).toHaveBeenCalledWith('h1', 'u2')
    expect(recalcularIndiceGolfers).toHaveBeenCalled()
    expect(result.current.estado).toBe('guardado')
  })

  it('error al guardar: aviso y se puede reintentar', async () => {
    tarjetaYaEnMiHistorial.mockResolvedValue(false)
    guardarTarjetaEnHistorial.mockResolvedValue({ status: 'error', error: { code: 'X' }, tarjeta: {} })
    const { result } = montar()
    await waitFor(() => expect(result.current.estado).toBe('disponible'))
    await act(async () => { await result.current.guardar() })
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'No pudimos guardar la ronda' }))
    expect(result.current.estado).toBe('disponible')
  })

  it('guarda la misma fila que el finalizador: match play y equipo vía extrasDeTarjeta', async () => {
    tarjetaYaEnMiHistorial.mockResolvedValue(false)
    extrasDeTarjeta.mockResolvedValueOnce({ matchResult: '3&2', teamName: 'Los Pros' })
    guardarTarjetaEnHistorial.mockResolvedValue({ status: 'insertada', id: 'h1', tarjeta: {} })
    const { result } = montar()
    await waitFor(() => expect(result.current.estado).toBe('disponible'))
    await act(async () => { await result.current.guardar() })
    const [, extrasInput] = extrasDeTarjeta.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(extrasInput).toMatchObject({ jugadorId: 'p2', scoresPorJugador: { p1: { '10': 4 }, p2: { '10': 5 } } })
    const [, input] = guardarTarjetaEnHistorial.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(input).toMatchObject({ matchResult: '3&2', teamName: 'Los Pros' })
  })

  it('sin hoyos anotados: avisa, no celebra, no recalcula índice y se oculta', async () => {
    tarjetaYaEnMiHistorial.mockResolvedValue(false)
    guardarTarjetaEnHistorial.mockResolvedValue({ status: 'sin_hoyos', tarjeta: {} })
    const { result } = montar()
    await waitFor(() => expect(result.current.estado).toBe('disponible'))
    await act(async () => { await result.current.guardar() })
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sin hoyos anotados' }))
    expect(addToast).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }))
    expect(recalcularIndiceGolfers).not.toHaveBeenCalled()
    expect(result.current.estado).toBe('oculto')
  })

  it('duplicada (otra pestaña ya la guardó): avisa, no celebra, no recalcula y se oculta', async () => {
    tarjetaYaEnMiHistorial.mockResolvedValue(false)
    guardarTarjetaEnHistorial.mockResolvedValue({ status: 'duplicada', tarjeta: {} })
    const { result } = montar()
    await waitFor(() => expect(result.current.estado).toBe('disponible'))
    await act(async () => { await result.current.guardar() })
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Esta tarjeta ya estaba en tu historial' }))
    expect(addToast).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }))
    expect(recalcularIndiceGolfers).not.toHaveBeenCalled()
    expect(avisarAlCoachRondaNueva).not.toHaveBeenCalled()
    expect(result.current.estado).toBe('oculto')
  })
})
