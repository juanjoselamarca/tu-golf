// "Deshacer hoyo N" del scorer del organizador: lo que deshace en pantalla lo
// deshace en la base, o avisa y no toca la pantalla.
//
// Antes, deshacer un hoyo recién anotado (que estaba vacío) quitaba el número
// de la pantalla y decía "restaurado" sin llamar al servidor: el golpe seguía
// en `hole_scores`, contaba en el leaderboard y reaparecía al recargar.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useScoreEntry } from './useScoreEntry'
import type { ScoringPlayer, ScoringRound, ScoringTournament } from '@/lib/data/tournaments/scoring'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
const fetchRoundTotals = vi.fn(async (_roundId: string) => ({ total_gross: 0, total_net: 0, total_points: 0 }))
vi.mock('@/lib/data/tournaments/scoring', () => ({
  fetchRoundHoleScores: vi.fn(async () => []),
  fetchRoundTotals: (_client: unknown, roundId: string) => fetchRoundTotals(roundId),
}))
const showError = vi.fn()
const showWarning = vi.fn()
const showSuccess = vi.fn()
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showError, showSuccess, showWarning }),
}))

const ROUND = { id: 'r1', status: 'in_progress', total_gross: 0, total_net: 0, total_points: 0, round_number: 1 } as ScoringRound
const ROUND_2 = { ...ROUND, id: 'r2', round_number: 2 } as ScoringRound
// Referencias estables: el hook las usa como dependencias de efectos.
const TOURNAMENT = { id: 't1' } as ScoringTournament
const PLAYERS = [{ id: 'p1' }, { id: 'p2' }] as ScoringPlayer[]
const VACIO: never[] = []
let rondaActiva = ROUND
const getActiveRound = () => rondaActiva
const applyRoundTotals = vi.fn()
const reloadRoster = vi.fn(async () => {})

function montar() {
  return renderHook(() =>
    useScoreEntry({
      tournament: TOURNAMENT,
      players: PLAYERS,
      courseHoles: VACIO,
      courseTees: VACIO,
      holeCount: 18,
      getActiveRound,
      applyRoundTotals,
      reloadRoster,
    }),
  )
}

type Respuesta = number | 'sin-senal' | Promise<Response>

/** `fetch` que responde lo indicado, en orden (la última se repite), y guarda cada body enviado. */
function servidor(...respuestas: Respuesta[]) {
  const enviados: Record<string, unknown>[] = []
  let i = 0
  const fn = vi.fn(async (_url: string, init: RequestInit) => {
    enviados.push(JSON.parse(String(init.body)))
    const r = respuestas[Math.min(i++, respuestas.length - 1)] ?? 200
    if (r === 'sin-senal') throw new TypeError('Failed to fetch')
    if (typeof r === 'number') return new Response('{}', { status: r })
    return r
  })
  vi.stubGlobal('fetch', fn)
  return { fn, enviados }
}

async function montarConJugador() {
  const hook = montar()
  await act(async () => hook.result.current.selectPlayer('p1'))
  return hook
}

beforeEach(() => {
  rondaActiva = ROUND
  showError.mockClear()
  showWarning.mockClear()
  showSuccess.mockClear()
  applyRoundTotals.mockClear()
  fetchRoundTotals.mockClear()
})

describe('useScoreEntry · deshacer', () => {
  it('deshacer un hoyo que estaba vacío BORRA el golpe en el servidor (gross_score null)', async () => {
    const { enviados } = servidor(200)
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(11, '5'))
    expect(result.current.currentScores[11]).toBe(5)

    await act(() => result.current.undoLast())

    expect(enviados).toHaveLength(2)
    expect(enviados[1]).toMatchObject({
      action: 'upsert_score', tournament_id: 't1', round_id: 'r1', hole_number: 11, gross_score: null,
    })
    expect(result.current.currentScores[11]).toBeUndefined()
    expect(result.current.lastAction).toBeNull()
    // Los totales de la ficha se refrescan al guardar y también al deshacer.
    expect(fetchRoundTotals).toHaveBeenCalledTimes(2)
    expect(applyRoundTotals).toHaveBeenLastCalledWith('p1', 'r1', expect.anything())
  })

  it('si el servidor no borra (500), el golpe sigue en pantalla y se puede reintentar', async () => {
    const { enviados } = servidor(200, 500, 200)
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(11, '5'))
    await act(() => result.current.undoLast())

    expect(result.current.currentScores[11]).toBe(5)
    expect(result.current.lastAction).toMatchObject({ holeNumber: 11 })
    expect(showWarning).toHaveBeenCalledWith('No pudimos deshacer', expect.stringContaining('hoyo 11'))
    expect(showSuccess).not.toHaveBeenCalledWith('Deshacer', expect.anything(), expect.anything())

    await act(() => result.current.undoLast())
    expect(enviados[2]).toMatchObject({ hole_number: 11, gross_score: null })
    expect(result.current.currentScores[11]).toBeUndefined()
  })

  it('sin señal (fetch rechaza): avisa, no deja "Guardando…" pegado y el golpe sigue en pantalla', async () => {
    servidor(200, 'sin-senal')
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(11, '5'))
    await act(() => result.current.undoLast())

    expect(result.current.saving).toBe(false)
    expect(result.current.currentScores[11]).toBe(5)
    expect(result.current.lastAction).toMatchObject({ holeNumber: 11 })
    expect(showWarning).toHaveBeenCalledWith('No pudimos deshacer', expect.stringContaining('hoyo 11'))
  })

  it('deshacer un guardado que FALLÓ no manda nada al servidor: no puede borrar un golpe que no puso', async () => {
    // El hoyo "estaba vacío" sólo en la foto local de la tarjeta. Si el guardado
    // falló, en la base puede haber un golpe del propio jugador: un borrado se lo llevaría.
    const { fn, enviados } = servidor(500)
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(10, '6'))
    expect(result.current.errorHoles.has(10)).toBe(true)
    expect(result.current.lastAction).toMatchObject({ holeNumber: 10, estado: 'fallo' })

    await act(() => result.current.undoLast())

    expect(fn).toHaveBeenCalledTimes(1)
    expect(enviados[0]).toMatchObject({ gross_score: 6 })
    expect(result.current.currentScores[10]).toBeUndefined()
    expect(result.current.errorHoles.has(10)).toBe(false)
    expect(result.current.lastAction).toBeNull()
  })

  it('el deshacer queda marcado como guardado sólo cuando el servidor confirma', async () => {
    servidor(200)
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(10, '6'))
    expect(result.current.lastAction).toMatchObject({ holeNumber: 10, newScore: 6, estado: 'guardado' })
  })

  it('guardar sin señal (fetch rechaza) cuenta como guardado fallido: marca roja, sin "Guardando…" pegado, y su deshacer no llama al servidor', async () => {
    const { fn } = servidor('sin-senal')
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(10, '6'))

    expect(result.current.saving).toBe(false)
    expect(result.current.errorHoles.has(10)).toBe(true)
    expect(result.current.lastAction).toMatchObject({ holeNumber: 10, estado: 'fallo' })
    expect(showError).toHaveBeenCalledWith('Error al guardar', expect.stringContaining('hoyo 10'))

    await act(() => result.current.undoLast())
    expect(fn).toHaveBeenCalledTimes(1)
    expect(result.current.currentScores[10]).toBeUndefined()
  })

  it('dos guardados solapados: el que sigue en vuelo no se puede deshacer hasta que el servidor responde', async () => {
    // Con 3G: se anota el 5 y, sin esperar, el 6. Responde el 5 y baja `saving`
    // con el 6 todavía en vuelo: el botón "Deshacer hoyo 6" vuelve a estar vivo.
    let responderA: (r: Response) => void = () => {}
    let responderB: (r: Response) => void = () => {}
    const lentaA = new Promise<Response>((resolve) => { responderA = resolve })
    const lentaB = new Promise<Response>((resolve) => { responderB = resolve })
    const { fn, enviados } = servidor(lentaA, lentaB, 200)
    const { result } = await montarConJugador()

    let a: Promise<void> = Promise.resolve()
    let b: Promise<void> = Promise.resolve()
    act(() => { a = result.current.saveScore(5, '4') })
    act(() => { b = result.current.saveScore(6, '5') })
    await act(async () => {
      responderA(new Response('{}', { status: 200 }))
      await a
    })
    expect(result.current.saving).toBe(false)
    expect(result.current.lastAction).toMatchObject({ holeNumber: 6, estado: 'enviando' })

    await act(() => result.current.undoLast())

    // Ni un borrado al servidor ni una celda vacía con el golpe camino a la base.
    expect(fn).toHaveBeenCalledTimes(2)
    expect(result.current.currentScores[6]).toBe(5)
    expect(result.current.lastAction).toMatchObject({ holeNumber: 6 })
    expect(showWarning).toHaveBeenCalledWith('Espera un momento', expect.stringContaining('hoyo 6'))

    await act(async () => {
      responderB(new Response('{}', { status: 200 }))
      await b
    })
    expect(result.current.lastAction).toMatchObject({ holeNumber: 6, estado: 'guardado' })

    await act(() => result.current.undoLast())
    expect(enviados[2]).toMatchObject({ round_id: 'r1', hole_number: 6, gross_score: null })
    expect(result.current.currentScores[6]).toBeUndefined()
    expect(result.current.currentScores[5]).toBe(4)
  })

  it('si se escribe otro valor en el hoyo con el deshacer en vuelo, la celda se queda con el valor nuevo', async () => {
    let responder: (r: Response) => void = () => {}
    const lenta = new Promise<Response>((resolve) => { responder = resolve })
    // 1º guardar 5 · 2º deshacer (queda en vuelo) · 3º guardar 6
    servidor(200, lenta, 200)
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(11, '5'))

    let deshacer: Promise<void> = Promise.resolve()
    act(() => { deshacer = result.current.undoLast() })
    await act(() => result.current.saveScore(11, '6'))
    await act(async () => {
      responder(new Response('{}', { status: 200 }))
      await deshacer
    })

    expect(result.current.currentScores[11]).toBe(6)
    expect(result.current.lastAction).toMatchObject({ holeNumber: 11, newScore: 6 })
  })

  it('deshacer una corrección repone el score anterior', async () => {
    const { enviados } = servidor(200)
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(3, '4'))
    await act(() => result.current.saveScore(3, '6'))
    await act(() => result.current.undoLast())

    expect(enviados[2]).toMatchObject({ round_id: 'r1', hole_number: 3, gross_score: 4 })
    expect(result.current.currentScores[3]).toBe(4)
  })
})

describe('useScoreEntry · el deshacer no sale de su tarjeta', () => {
  it('multi-ronda: deshacer escribe en la ronda donde se anotó, no en la activa al momento del tap', async () => {
    const { enviados } = servidor(200)
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(18, '5'))
    rondaActiva = ROUND_2

    await act(() => result.current.undoLast())

    expect(enviados[1]).toMatchObject({ round_id: 'r1', hole_number: 18, gross_score: null })
  })

  it('cerrar la tarjeta (o cambiar de ronda) descarta el deshacer pendiente', async () => {
    const { fn } = servidor(200)
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(18, '5'))
    act(() => result.current.clearSelection())

    expect(result.current.lastAction).toBeNull()
    await act(() => result.current.undoLast())
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('una respuesta que llega después de reabrir al MISMO jugador en otra ronda no toca esa tarjeta', async () => {
    let responder: (r: Response) => void = () => {}
    const lenta = new Promise<Response>((resolve) => { responder = resolve })
    // 1º guardar R1 · 2º deshacer R1 (queda en vuelo) · 3º guardar R2
    const { enviados } = servidor(200, lenta, 200)
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(18, '5'))

    let deshacer: Promise<void> = Promise.resolve()
    act(() => { deshacer = result.current.undoLast() })
    rondaActiva = ROUND_2
    act(() => result.current.clearSelection())
    await act(async () => result.current.selectPlayer('p1'))
    await act(() => result.current.saveScore(18, '5'))

    await act(async () => {
      responder(new Response('{}', { status: 200 }))
      await deshacer
    })

    expect(enviados[1]).toMatchObject({ round_id: 'r1', hole_number: 18, gross_score: null })
    expect(enviados[2]).toMatchObject({ round_id: 'r2', hole_number: 18, gross_score: 5 })
    // Mismo jugador, mismo hoyo, mismo número: es la tarjeta de la R2 y no se toca.
    expect(result.current.currentScores[18]).toBe(5)
  })

  it('una respuesta que llega después de abrir otro jugador no toca su tarjeta ni su deshacer', async () => {
    let responder: (r: Response) => void = () => {}
    const lenta = new Promise<Response>((resolve) => { responder = resolve })
    // 1º guardar p1 · 2º deshacer p1 (queda en vuelo) · 3º guardar p2
    servidor(200, lenta, 200)
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(5, '7'))

    let deshacer: Promise<void> = Promise.resolve()
    act(() => { deshacer = result.current.undoLast() })
    await act(async () => result.current.selectPlayer('p2'))
    await act(() => result.current.saveScore(5, '4'))

    await act(async () => {
      responder(new Response('{}', { status: 200 }))
      await deshacer
    })

    expect(result.current.selectedId).toBe('p2')
    expect(result.current.currentScores[5]).toBe(4)
    expect(result.current.lastAction).toMatchObject({ playerId: 'p2', holeNumber: 5 })
    // El total que se refresca es el de la tarjeta deshecha, no el de la abierta.
    expect(applyRoundTotals).toHaveBeenLastCalledWith('p1', 'r1', expect.anything())
  })
})
