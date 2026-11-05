// Scorer del organizador: lo que queda en la celda es lo que hay en la base, o
// la celda queda en rojo. Cada test de acá es un camino donde antes la pantalla
// y la base se separaban sin que el organizador se enterara:
//
//  - "Deshacer" sobre un hoyo recién anotado lo quitaba de la pantalla y decía
//    "restaurado", pero no llamaba al servidor: el golpe seguía en la base,
//    contaba en el leaderboard y reaparecía al recargar.
//  - Vaciar una celda con score no borraba nada.
//  - Un valor fuera de rango (0, 30, −1) se quedaba escrito como si hubiera entrado.
//  - Sin señal, `fetch` rechazaba sin catch: "Guardando…" pegado y ningún aviso.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useScoreEntry } from './useScoreEntry'
import type { ScoringPlayer, ScoringRound, ScoringTournament } from '@/lib/data/tournaments/scoring'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
const fetchRoundTotals = vi.fn(async () => ({ total_gross: 0, total_net: 0, total_points: 0 }))
vi.mock('@/lib/data/tournaments/scoring', () => ({
  fetchRoundHoleScores: vi.fn(async () => []),
  fetchRoundTotals: () => fetchRoundTotals(),
}))
const showError = vi.fn()
const showWarning = vi.fn()
const showSuccess = vi.fn()
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showError, showSuccess, showWarning }),
}))

const ROUND = { id: 'r1', status: 'in_progress', total_gross: 0, total_net: 0, total_points: 0, round_number: 1 } as ScoringRound
// Referencias estables: el hook las usa como dependencias de efectos.
const TOURNAMENT = { id: 't1' } as ScoringTournament
const PLAYERS = [{ id: 'p1' }, { id: 'p2' }] as ScoringPlayer[]
const VACIO: never[] = []
const getActiveRound = () => ROUND
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

/** `fetch` que responde con los status dados, en orden, y guarda cada body enviado. */
function servidor(...statuses: number[]) {
  const enviados: Record<string, unknown>[] = []
  let i = 0
  const fn = vi.fn(async (_url: string, init: RequestInit) => {
    enviados.push(JSON.parse(String(init.body)))
    const status = statuses[Math.min(i++, statuses.length - 1)] ?? 200
    return new Response('{}', { status })
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
    // Los totales de la ficha se refrescan también al deshacer (guardar + deshacer).
    expect(fetchRoundTotals).toHaveBeenCalledTimes(2)
  })

  it('si el servidor no borra (500), el golpe sigue en pantalla y se puede reintentar', async () => {
    servidor(200, 500)
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(11, '5'))
    await act(() => result.current.undoLast())

    expect(result.current.currentScores[11]).toBe(5)
    expect(result.current.lastAction).toMatchObject({ holeNumber: 11 })
    expect(showWarning).toHaveBeenCalledWith('No pudimos deshacer', expect.stringContaining('hoyo 11'))
  })

  it('deshacer una corrección repone el score anterior', async () => {
    const { enviados } = servidor(200)
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(3, '4'))
    await act(() => result.current.saveScore(3, '6'))
    await act(() => result.current.undoLast())

    expect(enviados[2]).toMatchObject({ hole_number: 3, gross_score: 4 })
    expect(result.current.currentScores[3]).toBe(4)
  })
})

describe('useScoreEntry · vaciar una celda', () => {
  it('vaciar una celda con score lo borra en el servidor y deja el deshacer armado', async () => {
    const { enviados } = servidor(200)
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(3, '4'))

    await act(() => result.current.saveScore(3, ''))

    expect(enviados[1]).toMatchObject({ hole_number: 3, gross_score: null })
    expect(result.current.currentScores[3]).toBeUndefined()
    expect(result.current.lastAction).toEqual({ holeNumber: 3, previousScore: 4, playerId: 'p1' })

    // Y el deshacer lo repone.
    await act(() => result.current.undoLast())
    expect(enviados[2]).toMatchObject({ hole_number: 3, gross_score: 4 })
    expect(result.current.currentScores[3]).toBe(4)
  })

  it('si el borrado falla, el score sigue en el estado y la celda queda en error', async () => {
    servidor(200, 503)
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(3, '4'))
    await act(() => result.current.saveScore(3, ''))

    expect(result.current.currentScores[3]).toBe(4)
    expect(result.current.errorHoles.has(3)).toBe(true)
    expect(showError).toHaveBeenCalledWith('No se borró', expect.stringContaining('sigue con 4'))
  })

  it('salir de una celda vacía que nunca tuvo score no llama al servidor', async () => {
    const { fn } = servidor(200)
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(7, ''))
    expect(fn).not.toHaveBeenCalled()
    expect(result.current.lastAction).toBeNull()
  })
})

describe('useScoreEntry · valores que no se guardan', () => {
  it.each(['0', '30', '-1', 'abc'])('"%s" no se guarda: avisa y marca la celda en error', async (valor) => {
    const { fn } = servidor(200)
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(12, valor))

    expect(fn).not.toHaveBeenCalled()
    expect(result.current.currentScores[12]).toBeUndefined()
    expect(result.current.errorHoles.has(12)).toBe(true)
    expect(showWarning).toHaveBeenCalledWith('Score inválido', expect.any(String))
  })

  it('corregir el valor inválido por uno válido guarda y limpia el error', async () => {
    const { enviados } = servidor(200)
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(12, '30'))
    await act(() => result.current.saveScore(12, '3'))

    expect(enviados).toHaveLength(1)
    expect(enviados[0]).toMatchObject({ hole_number: 12, gross_score: 3 })
    expect(result.current.errorHoles.has(12)).toBe(false)
  })

  it('el error de un hoyo no se arrastra a la tarjeta del siguiente jugador', async () => {
    servidor(200)
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(5, '30'))
    expect(result.current.errorHoles.has(5)).toBe(true)

    await act(async () => result.current.selectPlayer('p2'))
    expect(result.current.errorHoles.size).toBe(0)
  })
})

describe('useScoreEntry · guardar', () => {
  it('salir de la celda sin cambiar el score no lo reenvía', async () => {
    const { fn } = servidor(200)
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(4, '5'))
    await act(() => result.current.saveScore(4, '5'))
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('sin señal (fetch rechaza): avisa, marca la celda y no deja "Guardando…" pegado', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(9, '4'))

    expect(result.current.saving).toBe(false)
    expect(result.current.errorHoles.has(9)).toBe(true)
    expect(showError).toHaveBeenCalledWith('Error al guardar', expect.stringContaining('hoyo 9'))
  })

  it('un guardado que falló se reintenta con el mismo valor', async () => {
    const { fn } = servidor(500, 200)
    const { result } = await montarConJugador()
    await act(() => result.current.saveScore(9, '4'))
    expect(result.current.errorHoles.has(9)).toBe(true)

    await act(() => result.current.saveScore(9, '4'))
    expect(fn).toHaveBeenCalledTimes(2)
    expect(result.current.errorHoles.has(9)).toBe(false)
  })
})
