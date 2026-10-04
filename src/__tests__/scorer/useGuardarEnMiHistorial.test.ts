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
vi.mock('@/lib/data/ronda-libre-finalizar', () => ({
  tarjetaYaEnMiHistorial: (...a: unknown[]) => tarjetaYaEnMiHistorial(...a),
  guardarTarjetaEnHistorial: (...a: unknown[]) => guardarTarjetaEnHistorial(...a),
  recalcularIndiceGolfers: (...a: unknown[]) => recalcularIndiceGolfers(...(a as [])),
  actualizarNivelDelJugador: (...a: unknown[]) => actualizarNivelDelJugador(...(a as [])),
  avisarAlCoachRondaNueva: (...a: unknown[]) => avisarAlCoachRondaNueva(...a),
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
    parMap: { 10: 4 }, siMap: { 10: 1 }, courseHcpMap: {}, sinIndice: [], equipos: [],
  }))

describe('useGuardarEnMiHistorial', () => {
  beforeEach(() => vi.clearAllMocks())

  it('ronda terminada, mi tarjeta no está en mi historial → se ofrece', async () => {
    tarjetaYaEnMiHistorial.mockResolvedValue(false)
    const { result } = montar()
    await waitFor(() => expect(result.current.estado).toBe('disponible'))
    expect(tarjetaYaEnMiHistorial).toHaveBeenCalledWith({}, 'p2')
  })

  it('ya está guardada → no se ofrece guardar (estado guardado: se corrige en el historial)', async () => {
    tarjetaYaEnMiHistorial.mockResolvedValue(true)
    const { result } = montar()
    await waitFor(() => expect(result.current.estado).toBe('guardado'))
  })

  it('la lectura falló (sin señal) → se ofrece igual: el guardado es idempotente', async () => {
    tarjetaYaEnMiHistorial.mockResolvedValue(null)
    const { result } = montar()
    await waitFor(() => expect(result.current.estado).toBe('disponible'))
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

  it('guarda la misma fila que el finalizador: le pasa las tarjetas de TODOS (el match necesita al rival)', async () => {
    tarjetaYaEnMiHistorial.mockResolvedValue(false)
    guardarTarjetaEnHistorial.mockResolvedValue({ status: 'insertada', id: 'h1', tarjeta: {} })
    const { result } = montar()
    await waitFor(() => expect(result.current.estado).toBe('disponible'))
    await act(async () => { await result.current.guardar() })
    const [, input] = guardarTarjetaEnHistorial.mock.calls[0] as [unknown, Record<string, unknown>]
    expect(input).toMatchObject({ jugador: { id: 'p2' }, scores: { '10': 5 }, scoresPorJugador: { p1: { '10': 4 }, p2: { '10': 5 } } })
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

  it('duplicada (otra pestaña ya la guardó): avisa, no celebra, no recalcula y queda como guardada', async () => {
    tarjetaYaEnMiHistorial.mockResolvedValue(false)
    guardarTarjetaEnHistorial.mockResolvedValue({ status: 'duplicada', tarjeta: {} })
    const { result } = montar()
    await waitFor(() => expect(result.current.estado).toBe('disponible'))
    await act(async () => { await result.current.guardar() })
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Esta tarjeta ya estaba registrada' }))
    expect(addToast).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'success' }))
    expect(recalcularIndiceGolfers).not.toHaveBeenCalled()
    expect(avisarAlCoachRondaNueva).not.toHaveBeenCalled()
    expect(result.current.estado).toBe('guardado')
  })
})

describe('useGuardarEnMiHistorial — vista previa y corrección de hoyos estimados', () => {
  // Match a 3 hoyos (par 4, SI 1..3, CH 0): Beto (yo) concede el 1 con Ana en 4 → estimado 5.
  const rondaMatch = {
    id: 'r1', codigo: 'ABC', course_name: 'X', course_id: 'c1', tees: 'azul', holes: 3, hoyo_inicio: 1,
    fecha: '2026-10-01', estado: 'finalizada', modo_juego: 'gross', formato_juego: 'match_play',
    ronda_libre_jugadores: [
      { id: 'p1', nombre: 'Ana', user_id: 'u1', scores: { '1': 4, '2': 4, '3': 4 } },
      { id: 'p2', nombre: 'Beto', user_id: 'u2', scores: { '1': -1, '2': 4, '3': 4 } },
    ],
  } as never
  const montarMatch = () => renderHook(() => useGuardarEnMiHistorial({
    ronda: rondaMatch, isFinished: true, currentUserId: 'u2',
    parMap: { 1: 4, 2: 4, 3: 4 }, siMap: { 1: 1, 2: 2, 3: 3 }, courseHcpMap: { p1: 0, p2: 0 }, sinIndice: [], equipos: [],
  }))

  it('la vista previa es la tarjeta que va al historial: el concedido estimado y marcado', async () => {
    tarjetaYaEnMiHistorial.mockResolvedValue(false)
    const { result } = montarMatch()
    await waitFor(() => expect(result.current.estado).toBe('disponible'))
    expect(result.current.vistaPrevia?.scores).toEqual({ 1: 5, 2: 4, 3: 4 })
    expect(result.current.vistaPrevia?.estimados).toEqual([{ hoyo: 1, motivo: 'concedido' }])
  })

  it('corregir: cambia el total, sigue listado como estimado corregido y viaja como corrección (no como golpe del match)', async () => {
    tarjetaYaEnMiHistorial.mockResolvedValue(false)
    guardarTarjetaEnHistorial.mockResolvedValue({ status: 'insertada', id: 'h1', tarjeta: {} })
    const { result } = montarMatch()
    await waitFor(() => expect(result.current.estado).toBe('disponible'))
    act(() => { result.current.corregir(1, 4) })
    expect(result.current.vistaPrevia?.scores[1]).toBe(4)
    expect(result.current.vistaPrevia?.estimados).toEqual([{ hoyo: 1, motivo: 'concedido' }])
    expect(result.current.vistaPrevia?.correcciones).toEqual({ 1: 4 })
    await act(async () => { await result.current.guardar() })
    const [, input] = guardarTarjetaEnHistorial.mock.calls.at(-1) as [unknown, { scores: Record<string, number>; correcciones: Record<number, number> }]
    // Lo anotado en cancha (el CONCEDE) viaja intacto: el match no cambia; la corrección va aparte.
    expect(input.scores).toMatchObject({ '1': -1, '2': 4, '3': 4 })
    expect(input.correcciones).toEqual({ 1: 4 })
  })

  it('corregir respeta el rango del scorer (1..15)', async () => {
    tarjetaYaEnMiHistorial.mockResolvedValue(false)
    const { result } = montarMatch()
    await waitFor(() => expect(result.current.estado).toBe('disponible'))
    act(() => { result.current.corregir(1, 0) })
    expect(result.current.vistaPrevia?.scores[1]).toBe(1)
    act(() => { result.current.corregir(1, 40) })
    expect(result.current.vistaPrevia?.scores[1]).toBe(15)
  })

  it('una corrección deja de aplicar si ese hoyo pasa a tener golpes anotados (igual que el guardado)', async () => {
    tarjetaYaEnMiHistorial.mockResolvedValue(false)
    let ronda = rondaMatch
    const { result, rerender } = renderHook(() => useGuardarEnMiHistorial({
      ronda, isFinished: true, currentUserId: 'u2',
      parMap: { 1: 4, 2: 4, 3: 4 }, siMap: { 1: 1, 2: 2, 3: 3 }, courseHcpMap: { p1: 0, p2: 0 }, sinIndice: [], equipos: [],
    }))
    await waitFor(() => expect(result.current.estado).toBe('disponible'))
    act(() => { result.current.corregir(1, 4) })
    expect(result.current.vistaPrevia?.correcciones).toEqual({ 1: 4 })
    // Llega por realtime: Beto anotó 6 en el hoyo 1 (ya no es estimado).
    const base = rondaMatch as unknown as { ronda_libre_jugadores: Array<{ id: string; scores: Record<string, number> }> }
    ronda = { ...base, ronda_libre_jugadores: [base.ronda_libre_jugadores[0], { ...base.ronda_libre_jugadores[1], scores: { '1': 6, '2': 4, '3': 4 } }] } as never
    rerender()
    expect(result.current.vistaPrevia?.correcciones).toEqual({})
    expect(result.current.vistaPrevia?.scores[1]).toBe(6)
  })
})
