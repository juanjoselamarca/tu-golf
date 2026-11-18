// Con el useToast REAL (sin mock): `showError` cambiaba de referencia en cada render, `loadScores` dependía de él
// y el efecto [selectedId, loadScores] volvía a consultar la tarjeta tras cada respuesta. Con un jugador abierto,
// el scorer del organizador consultaba Supabase en bucle mientras la pantalla siguiera abierta.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useScoreEntry } from './useScoreEntry'
import type { ScoringPlayer, ScoringTournament } from '@/lib/data/tournaments/scoring'
import { fetchRoundHoleScores } from '@/lib/data/tournaments/scoring'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
vi.mock('@/lib/data/tournaments/scoring', () => ({
  // Cada respuesta trae filas nuevas (objetos distintos), como la base real.
  fetchRoundHoleScores: vi.fn(async () => [{ hole_number: 1, gross_score: 4, putts: 2, fairway_hit: true, gir: true }]),
  fetchRoundTotals: vi.fn(async () => ({ total_gross: 4, total_net: 4, total_points: 2 })),
}))

const TOURNAMENT = { id: 't1' } as ScoringTournament
const ronda = (id: string) => ({ id, round_number: 1, status: 'in_progress', total_gross: null, total_net: null, total_points: null })
const PLAYERS = [
  { id: 'p1', player_name: 'Rosa Pérez', profiles: null, rounds: [ronda('r1')] },
  { id: 'p2', player_name: 'Pedro Soto', profiles: null, rounds: [ronda('r2')] },
] as unknown as ScoringPlayer[]
const VACIO: never[] = []
const getActiveRound = (p: ScoringPlayer | undefined) => p?.rounds?.[0]
const applyRoundTotals = vi.fn()
const reloadRoster = vi.fn(async () => {})

describe('useScoreEntry — la carga de la tarjeta no entra en bucle', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('abrir un jugador consulta su tarjeta una vez, aunque pasen varios renders', async () => {
    const { result } = renderHook(() => useScoreEntry({
      tournament: TOURNAMENT, players: PLAYERS, courseHoles: VACIO, courseTees: VACIO, holeCount: 18,
      getActiveRound, applyRoundTotals, reloadRoster,
    }))
    await act(async () => result.current.selectPlayer('p1'))
    // Dar tiempo a que, si hubiera bucle, se encadenen varias consultas.
    for (let i = 0; i < 10; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)) })

    expect(result.current.currentScores[1]).toBe(4)
    expect(vi.mocked(fetchRoundHoleScores)).toHaveBeenCalledTimes(1)
  })

  // Señal mala en el club: el organizador abre a Rosa y enseguida a Pedro; la respuesta de Rosa llega última.
  // Sin descartar la respuesta vieja, la tarjeta de Pedro mostraba los golpes de Rosa (y "deshacer" los escribía).
  it('una respuesta vieja de otro jugador no pisa la tarjeta abierta', async () => {
    const pendientes = new Map<string, (rows: unknown[]) => void>()
    const colgada = (_c: unknown, roundId: string) =>
      new Promise((res) => { pendientes.set(roundId, res as (rows: unknown[]) => void) }) as never
    vi.mocked(fetchRoundHoleScores).mockImplementationOnce(colgada).mockImplementationOnce(colgada)
    const { result } = renderHook(() => useScoreEntry({
      tournament: TOURNAMENT, players: PLAYERS, courseHoles: VACIO, courseTees: VACIO, holeCount: 18,
      getActiveRound, applyRoundTotals, reloadRoster,
    }))
    await act(async () => result.current.selectPlayer('p1'))
    await act(async () => result.current.selectPlayer('p2'))
    await act(async () => { pendientes.get('r2')!([{ hole_number: 1, gross_score: 5, putts: 2, fairway_hit: null, gir: null }]) })
    await act(async () => { pendientes.get('r1')!([{ hole_number: 1, gross_score: 3, putts: 1, fairway_hit: true, gir: true }]) })

    expect(result.current.currentScores[1]).toBe(5)
    expect(result.current.holePutts[1]).toBe(2)
  })

  // Rosa tiene 2 putts y fairway en el hoyo 1; el organizador abre a Pedro y anota su hoyo 1 antes de que
  // llegue la lectura de Pedro. El envío no puede llevar las stats de Rosa. Desde #834 el golpe ni siquiera sale
  // mientras la tarjeta de Pedro carga (podría pisar golpes guardados); al cargar, tampoco lleva nada de Rosa.
  it('anotar antes de que llegue la lectura del nuevo jugador no arrastra stats del anterior', async () => {
    let cargarPedro!: (rows: unknown[]) => void
    vi.mocked(fetchRoundHoleScores)
      .mockResolvedValueOnce([{ hole_number: 1, gross_score: 4, putts: 2, fairway_hit: true, gir: true }] as never)
      .mockImplementationOnce(() => new Promise((res) => { cargarPedro = res as (rows: unknown[]) => void }) as never)
    const fetchMock = vi.fn(async () => new Response('{}', { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const { result } = renderHook(() => useScoreEntry({
        tournament: TOURNAMENT, players: PLAYERS, courseHoles: VACIO, courseTees: VACIO, holeCount: 18,
        getActiveRound, applyRoundTotals, reloadRoster,
      }))
      await act(async () => result.current.selectPlayer('p1'))
      expect(result.current.holePutts[1]).toBe(2)
      await act(async () => result.current.selectPlayer('p2'))
      expect(result.current.holePutts[1]).toBeUndefined()
      await act(async () => { await result.current.saveScore(1, '5') })
      expect(fetchMock).not.toHaveBeenCalled()

      await act(async () => { cargarPedro([]) })
      await act(async () => { await result.current.saveScore(1, '5') })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const cuerpo = JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)
      expect(cuerpo.round_id).toBe('r2')
      expect(cuerpo.putts ?? null).toBeNull()
      expect(cuerpo.fairway_hit ?? null).toBeNull()
      expect(cuerpo.gir ?? null).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  // Doble toque con guante sobre la tarjeta ya abierta: antes quedaba en blanco y sin recargar.
  it('volver a tocar al jugador abierto no borra su tarjeta', async () => {
    const { result } = renderHook(() => useScoreEntry({
      tournament: TOURNAMENT, players: PLAYERS, courseHoles: VACIO, courseTees: VACIO, holeCount: 18,
      getActiveRound, applyRoundTotals, reloadRoster,
    }))
    await act(async () => result.current.selectPlayer('p1'))
    await act(async () => result.current.selectPlayer('p1'))
    expect(result.current.currentScores[1]).toBe(4)
    expect(result.current.holePutts[1]).toBe(2)
    expect(vi.mocked(fetchRoundHoleScores)).toHaveBeenCalledTimes(1)
  })

  // El guardado del hoyo 5 de Rosa falla cuando el organizador ya abrió a Pedro: la marca roja no va a Pedro.
  it('un guardado fallido del jugador anterior no marca en rojo el hoyo del nuevo', async () => {
    let fallar!: () => void
    const fetchMock = vi.fn(() => new Promise<Response>((res) => { fallar = () => res(new Response('{}', { status: 500 })) }))
    vi.stubGlobal('fetch', fetchMock)
    try {
      const { result } = renderHook(() => useScoreEntry({
        tournament: TOURNAMENT, players: PLAYERS, courseHoles: VACIO, courseTees: VACIO, holeCount: 18,
        getActiveRound, applyRoundTotals, reloadRoster,
      }))
      await act(async () => result.current.selectPlayer('p1'))
      let guardado!: Promise<void>
      act(() => { guardado = result.current.saveScore(5, '6') })
      await act(async () => result.current.selectPlayer('p2'))
      await act(async () => { fallar(); await guardado })
      expect(result.current.errorHoles.has(5)).toBe(false)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  // Lo marcado en rojo en la tarjeta de Rosa no pasa a la de Pedro al cambiar de jugador.
  it('las marcas rojas de un jugador se limpian al abrir a otro', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 500 })))
    try {
      const { result } = renderHook(() => useScoreEntry({
        tournament: TOURNAMENT, players: PLAYERS, courseHoles: VACIO, courseTees: VACIO, holeCount: 18,
        getActiveRound, applyRoundTotals, reloadRoster,
      }))
      await act(async () => result.current.selectPlayer('p1'))
      await act(async () => { await result.current.saveScore(5, '6') })
      expect(result.current.errorHoles.has(5)).toBe(true)
      await act(async () => result.current.selectPlayer('p2'))
      expect(result.current.errorHoles.size).toBe(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
