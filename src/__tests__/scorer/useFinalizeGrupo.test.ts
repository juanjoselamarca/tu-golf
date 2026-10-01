import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { useState } from 'react'
import { useFinalizeGrupo } from '@/app/ronda-libre/[codigo]/score-grupo/hooks/useFinalizeGrupo'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'

const push = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
const addToast = vi.fn()
vi.mock('@/hooks/useToast', () => ({ addToast: (...a: unknown[]) => addToast(...a) }))
const captureError = vi.fn()
vi.mock('@/lib/error-tracking', () => ({ captureError: (...a: unknown[]) => captureError(...a) }))
vi.mock('@/lib/ronda/helpers', async (importOriginal) => ({ ...(await importOriginal<typeof import('@/lib/ronda/helpers')>()), haptic: vi.fn() }))
const saveGroupScores = vi.fn()
vi.mock('@/lib/ronda/score-storage', () => ({ saveGroupScores: (...a: unknown[]) => saveGroupScores(...a), loadGroupScores: () => ({}) }))

const saveRondaLibreScores = vi.fn(async () => ({ error: null }))
const finalizarRondaLibre = vi.fn(async () => ({ finalizada: true, error: null as unknown }))
vi.mock('@/lib/data/ronda-libre-scores', () => ({
  saveRondaLibreScores: (...a: unknown[]) => saveRondaLibreScores(...(a as [])),
  finalizarRondaLibre: (...a: unknown[]) => finalizarRondaLibre(...(a as [])),
}))
const descartarRondaLibre = vi.fn(async () => ({ error: null as string | null }))
vi.mock('@/lib/data/ronda-libre-cierre', () => ({ descartarRondaLibre: (...a: unknown[]) => descartarRondaLibre(...(a as [])) }))

const fetchEstadoRondaLibre = vi.fn(async () => 'en_curso' as string | null)
const guardarTarjetaEnHistorial = vi.fn(async () => ({ status: 'insertada', id: null, tarjeta: {} }) as { status: string; id?: string | null; error?: unknown; tarjeta: unknown })
const recalcularIndiceGolfers = vi.fn(async () => true)
const actualizarNivelDelJugador = vi.fn(async () => {})
vi.mock('@/lib/data/ronda-libre-finalizar', () => ({
  fetchEstadoRondaLibre: (...a: unknown[]) => fetchEstadoRondaLibre(...(a as [])),
  guardarTarjetaEnHistorial: (...a: unknown[]) => guardarTarjetaEnHistorial(...(a as [])),
  recalcularIndiceGolfers: (...a: unknown[]) => recalcularIndiceGolfers(...(a as [])),
  actualizarNivelDelJugador: (...a: unknown[]) => actualizarNivelDelJugador(...(a as [])),
}))

const PAR: Record<number, number> = { 10: 4, 11: 3, 12: 4, 13: 4, 14: 3, 15: 4, 16: 4, 17: 5, 18: 5 }
const back9 = hoyosDeLaRonda(10, 9)
const rondaBase = {
  id: 'r1', codigo: 'ABC', course_name: 'X', course_id: 'c1', tees: 'azul', holes: 9, fecha: '2026-09-30', estado: 'en_curso',
  modo_juego: 'gross', formato_juego: 'stroke_play', hoyo_inicio: 10,
  ronda_libre_jugadores: [
    { id: 'p1', nombre: 'Ana', user_id: 'u1', scores: {} },
    { id: 'p2', nombre: 'Beto', user_id: null, scores: {} },
  ],
}

function montar(opts: { ronda?: typeof rondaBase; scores?: Record<string, Record<number, number>>; teamEquipos?: unknown[] } = {}) {
  const r = opts.ronda ?? rondaBase
  return renderHook(() => {
    const [scores, setScores] = useState(opts.scores ?? { p1: { 10: 4, 11: 3, 12: 4, 13: 4, 14: 3, 15: 4, 16: 4, 17: 5 }, p2: { 10: 5 } })
    const [currentHole] = useState(18)
    const fin = useFinalizeGrupo({
      ronda: r as never, codigo: 'ABC', currentHole, hoyos: back9, scores, setScores, parMap: PAR,
      teamEquipos: (opts.teamEquipos ?? []) as never,
    })
    return { scores, fin }
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  fetchEstadoRondaLibre.mockResolvedValue('en_curso')
  guardarTarjetaEnHistorial.mockResolvedValue({ status: 'insertada', id: null, tarjeta: {} })
})

describe('useFinalizeGrupo', () => {
  it('primer tap arma la confirmación sin finalizar', async () => {
    const { result } = montar()
    await act(async () => { await result.current.fin.finalizeRound() })
    expect(result.current.fin.confirmFinalize).toBe(true)
    expect(result.current.fin.finalizing).toBe(false)
    expect(fetchEstadoRondaLibre).not.toHaveBeenCalled()
  })

  it('segundo tap: rellena con par SÓLO los hoyos de la ronda, guarda a todos, historial por jugador con cuenta, cierra y navega', async () => {
    const { result } = montar()
    await act(async () => { await result.current.fin.finalizeRound() })
    await act(async () => { await result.current.fin.finalizeRound() })

    // Relleno: p1 le faltaba el 18, p2 los 11..18. Nadie recibe hoyos 1..9.
    expect(result.current.scores.p1[18]).toBe(5)
    expect(result.current.scores.p2[18]).toBe(5)
    expect(result.current.scores.p1[1]).toBeUndefined()
    expect(saveGroupScores).toHaveBeenCalledWith('ABC', result.current.scores)
    expect(saveRondaLibreScores).toHaveBeenCalledTimes(2)
    expect(saveRondaLibreScores).toHaveBeenCalledWith({}, { codigo: 'ABC', jugadorId: 'p2', delta: expect.objectContaining({ '18': 5 }) })

    // Historial: sólo p1 (p2 es invitado), sin pedir el id, con la misma lista de hoyos.
    expect(guardarTarjetaEnHistorial).toHaveBeenCalledTimes(1)
    const [, input] = guardarTarjetaEnHistorial.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(input).toMatchObject({ userId: 'u1', conId: false, hoyos: back9 })
    expect((input.scores as Record<number, number>)[18]).toBe(5)
    expect(recalcularIndiceGolfers).toHaveBeenCalledWith({}, 'u1', expect.anything())
    expect(actualizarNivelDelJugador).toHaveBeenCalledWith({}, 'u1')

    expect(finalizarRondaLibre).toHaveBeenCalledWith({}, 'ABC', { jugadorId: 'p1' })
    expect(push).toHaveBeenCalledWith('/ronda-libre/ABC?finished=true')
  })

  it('ya finalizada desde otro dispositivo: avisa y navega sin escribir', async () => {
    fetchEstadoRondaLibre.mockResolvedValue('finalizada')
    const { result } = montar()
    await act(async () => { await result.current.fin.finalizeRound() })
    await act(async () => { await result.current.fin.finalizeRound() })
    expect(addToast).toHaveBeenCalledWith({ title: 'Esta ronda ya fue finalizada', type: 'info' })
    expect(saveRondaLibreScores).not.toHaveBeenCalled()
    expect(guardarTarjetaEnHistorial).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith('/ronda-libre/ABC?finished=true')
    expect(result.current.fin.finalizing).toBe(false)
  })

  it('tarjeta duplicada (el jugador ya finalizó desde su teléfono): sigue con los demás y cierra', async () => {
    guardarTarjetaEnHistorial.mockResolvedValue({ status: 'duplicada', tarjeta: {} })
    const { result } = montar()
    await act(async () => { await result.current.fin.finalizeRound() })
    await act(async () => { await result.current.fin.finalizeRound() })
    expect(captureError).toHaveBeenCalledWith(expect.any(Error), expect.objectContaining({ context: 'score_grupo_finalize_historical.duplicada', level: 'info' }))
    expect(recalcularIndiceGolfers).not.toHaveBeenCalled()
    expect(finalizarRondaLibre).toHaveBeenCalled()
  })

  it('error al insertar el historial: toast, el botón vuelve a estar disponible y NO cierra la ronda', async () => {
    guardarTarjetaEnHistorial.mockResolvedValue({ status: 'error', error: { code: '42501' }, tarjeta: {} })
    const { result } = montar()
    await act(async () => { await result.current.fin.finalizeRound() })
    await act(async () => { await result.current.fin.finalizeRound() })
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Error guardando tarjeta' }))
    expect(result.current.fin.finalizing).toBe(false)
    expect(finalizarRondaLibre).not.toHaveBeenCalled()
    expect(push).not.toHaveBeenCalled()
  })

  it('scramble: el historial del jugador lleva el score del EQUIPO', async () => {
    const ronda = { ...rondaBase, formato_juego: 'scramble' }
    const teamScores = { '10': 4, '11': 3, '12': 4, '13': 4, '14': 3, '15': 4, '16': 4, '17': 5, '18': 4 }
    const { result } = montar({ ronda, teamEquipos: [{ id: 'e1', nombre: 'E', handicap_equipo: null, scores: teamScores, jugadorIds: ['p1', 'p2'], jugadorNombres: ['Ana', 'Beto'] }] })
    await act(async () => { await result.current.fin.finalizeRound() })
    await act(async () => { await result.current.fin.finalizeRound() })
    const [, input] = guardarTarjetaEnHistorial.mock.calls[0] as unknown as [unknown, Record<string, unknown>]
    expect(input.scores).toBe(teamScores)
  })

  it('un segundo finalizar mientras hay uno en vuelo no corre el flujo dos veces', async () => {
    let resolver: (v: string) => void = () => {}
    fetchEstadoRondaLibre.mockImplementationOnce(() => new Promise<string>(r => { resolver = r }))
    const { result } = montar()
    await act(async () => { await result.current.fin.finalizeRound() })
    let primera: Promise<void> = Promise.resolve()
    act(() => { primera = result.current.fin.finalizeRound() })
    expect(result.current.fin.finalizing).toBe(true)
    await act(async () => { await result.current.fin.finalizeRound() }) // ignorado
    await act(async () => { resolver('en_curso'); await primera })
    expect(fetchEstadoRondaLibre).toHaveBeenCalledTimes(1)
    expect(finalizarRondaLibre).toHaveBeenCalledTimes(1)
  })

  it('descartar: cierra el modal, llama al RPC y va al dashboard; si falla, toast y botón de vuelta', async () => {
    const { result } = montar()
    act(() => { result.current.fin.setShowDiscardConfirm(true) })
    await act(async () => { await result.current.fin.discardRound() })
    expect(descartarRondaLibre).toHaveBeenCalledWith({}, 'ABC')
    expect(result.current.fin.showDiscardConfirm).toBe(false)
    expect(push).toHaveBeenCalledWith('/dashboard?discarded=1')

    push.mockClear()
    descartarRondaLibre.mockResolvedValueOnce({ error: 'Solo quien creó la ronda puede descartarla.' })
    const { result: r2 } = montar()
    await act(async () => { await r2.current.fin.discardRound() })
    expect(addToast).toHaveBeenCalledWith(expect.objectContaining({ type: 'error', message: 'Solo quien creó la ronda puede descartarla.' }))
    expect(r2.current.fin.discarding).toBe(false)
    expect(push).not.toHaveBeenCalled()
  })
})
