// Stats del hoyo (putts / fairway / GIR) en el scorer del organizador. Revisión Fable de #832 (P2):
//  1. Al pasar de A a B, la foto de stats seguía siendo la de A hasta que terminaba la carga de B: anotar el hoyo 1
//     de B antes (o con la carga caída) mandaba putts, fairway y GIR de A a la ronda de B. Y una carga de A que
//     llegaba tarde pintaba sus stats en la tarjeta de B.
//  2. Una stat no se podía borrar: el null se descartaba. Y mandar null "por defecto" borraría datos buenos, así
//     que la foto omite lo que el organizador no tocó.

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useScoreEntry } from './useScoreEntry'
import type { HoleScoreRow, ScoringPlayer, ScoringRound, ScoringTournament } from '@/lib/data/tournaments/scoring'

vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn() }))
const fetchRoundHoleScores = vi.fn<(roundId: string) => Promise<Partial<HoleScoreRow>[]>>(async () => [])
vi.mock('@/lib/data/tournaments/scoring', () => ({
  fetchRoundHoleScores: (_c: unknown, roundId: string) => fetchRoundHoleScores(roundId),
  fetchRoundTotals: async () => ({ total_gross: 0, total_net: 0, total_points: 0 }),
}))
const toast = { showError: vi.fn(), showWarning: vi.fn(), showSuccess: vi.fn() }
vi.mock('@/hooks/useToast', () => ({ useToast: () => toast }))

const RONDA_A = { id: 'rA', status: 'in_progress', round_number: 1 } as ScoringRound
const RONDA_B = { id: 'rB', status: 'in_progress', round_number: 1 } as ScoringRound
const TOURNAMENT = { id: 't1' } as ScoringTournament
const PLAYERS = [{ id: 'pA' }, { id: 'pB' }] as ScoringPlayer[]
const VACIO: never[] = []
const getActiveRound = (p: ScoringPlayer | undefined) => (p?.id === 'pA' ? RONDA_A : p?.id === 'pB' ? RONDA_B : undefined)
const STATS_A = [{ hole_number: 1, gross_score: 4, putts: 2, fairway_hit: true, gir: true }]

function montar() {
  return renderHook(() =>
    useScoreEntry({
      tournament: TOURNAMENT, players: PLAYERS, courseHoles: VACIO, courseTees: VACIO, holeCount: 18,
      getActiveRound, applyRoundTotals: vi.fn(), reloadRoster: vi.fn(async () => {}),
    }),
  )
}

function servidor() {
  const enviados: Record<string, unknown>[] = []
  vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => {
    enviados.push(JSON.parse(String(init.body)))
    return new Response('{}', { status: 200 })
  }))
  return enviados
}

function diferida<T>() {
  let resolver!: (v: T) => void
  let rechazar!: (e: unknown) => void
  const promesa = new Promise<T>((res, rej) => { resolver = res; rechazar = rej })
  return { promesa, resolver, rechazar }
}

const SIN_STATS = ['putts', 'fairway_hit', 'gir']

beforeEach(() => {
  fetchRoundHoleScores.mockReset()
  fetchRoundHoleScores.mockImplementation(async (id) => (id === 'rA' ? STATS_A : []))
  Object.values(toast).forEach((f) => f.mockClear())
})

describe('useScoreEntry · stats al cambiar de tarjeta', () => {
  it('de A a B con la carga de B pendiente: el hoyo 1 de B sale sin las stats de A', async () => {
    const enviados = servidor()
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    expect(result.current.holePutts[1]).toBe(2)
    await act(() => result.current.saveHoleStat(1, { gir: false })) // A tocó una stat a mano

    const cargaB = diferida<Partial<HoleScoreRow>[]>()
    fetchRoundHoleScores.mockImplementation(() => cargaB.promesa)
    await act(async () => result.current.selectPlayer('pB'))
    // La pantalla de B no muestra nada de A mientras carga.
    expect(result.current.holePutts).toEqual({})
    expect(result.current.holeFairway).toEqual({})
    expect(result.current.holeGir).toEqual({})

    await act(() => result.current.saveScore(1, '5'))
    const deB = enviados.at(-1)!
    expect(deB).toMatchObject({ round_id: 'rB', hole_number: 1, gross_score: 5 })
    for (const k of SIN_STATS) expect(deB).not.toHaveProperty(k)
  })

  it('de A a B con la carga de B caída: anotar en B tampoco lleva las stats de A', async () => {
    const enviados = servidor()
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    fetchRoundHoleScores.mockImplementation(async () => { throw new Error('red') })
    await act(async () => result.current.selectPlayer('pB'))
    expect(toast.showError).toHaveBeenCalledTimes(1)

    await act(() => result.current.saveScore(1, '5'))
    for (const k of SIN_STATS) expect(enviados.at(-1)).not.toHaveProperty(k)
  })

  it('la carga de A que llega después de abrir B no pinta sus stats ni sus golpes en B', async () => {
    servidor()
    const cargaA = diferida<Partial<HoleScoreRow>[]>()
    fetchRoundHoleScores.mockImplementation((id) => (id === 'rA' ? cargaA.promesa : Promise.resolve([])))
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    await act(async () => result.current.selectPlayer('pB'))
    await act(async () => { cargaA.resolver(STATS_A) })

    expect(result.current.selectedId).toBe('pB')
    expect(result.current.currentScores).toEqual({})
    expect(result.current.holePutts).toEqual({})
    expect(result.current.holeGir).toEqual({})
  })

  it('el error de una carga vieja no avisa sobre la tarjeta nueva', async () => {
    servidor()
    const cargaA = diferida<Partial<HoleScoreRow>[]>()
    fetchRoundHoleScores.mockImplementation((id) => (id === 'rA' ? cargaA.promesa : Promise.resolve([])))
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    await act(async () => result.current.selectPlayer('pB'))
    await act(async () => { cargaA.rechazar(new Error('red')) })
    expect(toast.showError).not.toHaveBeenCalled()
  })
})

describe('useScoreEntry · borrar y omitir stats', () => {
  it('guardar sólo el golpe NO manda las stats que vinieron de la base (no las borra ni las reescribe)', async () => {
    const enviados = servidor()
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    await act(() => result.current.saveScore(1, '5'))
    for (const k of SIN_STATS) expect(enviados.at(-1)).not.toHaveProperty(k)
  })

  it('borrar los putts manda null explícito, y el borrado sigue en los envíos siguientes del hoyo', async () => {
    const enviados = servidor()
    const { result } = montar()
    await act(async () => result.current.selectPlayer('pA'))
    await act(() => result.current.saveHoleStat(1, { putts: null }))
    expect(enviados.at(-1)).toHaveProperty('putts', null)
    // Sólo viaja lo tocado: fairway y GIR de la base no se mandan.
    expect(enviados.at(-1)).not.toHaveProperty('fairway_hit')
    expect(enviados.at(-1)).not.toHaveProperty('gir')

    await act(() => result.current.saveHoleStat(1, { gir: false }))
    expect(enviados.at(-1)).toMatchObject({ putts: null, gir: false })
    await act(() => result.current.saveScore(1, '6'))
    expect(enviados.at(-1)).toMatchObject({ gross_score: 6, putts: null, gir: false })
    expect(enviados.at(-1)).not.toHaveProperty('fairway_hit')
  })
})
