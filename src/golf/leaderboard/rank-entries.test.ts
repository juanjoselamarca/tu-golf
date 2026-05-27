import { describe, it, expect } from 'vitest'
import { rankEntries, type RankingMode } from './rank-entries'
import type { LeaderboardEntry } from './types'

function entry(over: Partial<LeaderboardEntry> & { name: string }): LeaderboardEntry {
  return {
    name: over.name,
    handicap: over.handicap ?? 10,
    grossTotal: over.grossTotal ?? 0,
    netTotal: over.netTotal ?? 0,
    stablefordTotal: over.stablefordTotal ?? 0,
    stablefordScores: over.stablefordScores,
    vsPar: over.vsPar ?? 0,
    holesPlayed: over.holesPlayed ?? 18,
    roundsPlayed: over.roundsPlayed,
    cat: over.cat,
    scores: over.scores ?? new Array(18).fill(4),
    status: over.status ?? 'F',
  }
}

describe('rankEntries — canario del dual leaderboard', () => {
  const baseEntries: LeaderboardEntry[] = [
    entry({ name: 'A', handicap: 5,  grossTotal: 75, netTotal: 70, stablefordTotal: 38 }),
    entry({ name: 'B', handicap: 18, grossTotal: 90, netTotal: 72, stablefordTotal: 36 }),
    entry({ name: 'C', handicap: 12, grossTotal: 82, netTotal: 70, stablefordTotal: 39 }),
  ]
  const opts = { parTotal: 72, formatoJuego: 'stroke_play' as const }

  it('ranking por gross ordena por menor strokes totales', () => {
    const out = rankEntries(baseEntries, 'gross', opts)
    expect(out.map((p) => p.name.split(' ')[0])).toEqual(['A', 'C', 'B'])
    expect(out[0].pos).toBe(1)
    expect(out[2].pos).toBe(3)
  })

  it('ranking por neto ordena por menor net total y rompe empates con countback', () => {
    const out = rankEntries(baseEntries, 'neto', opts)
    // A y C empatan en net=70 → countback decide quién va primero
    // (mismos scores [4]*18 → cualquiera puede quedar 1°, ambos terminan con anotación)
    expect(out[0].total).toBeLessThanOrEqual(out[1].total)
    expect(out[1].total).toBeLessThanOrEqual(out[2].total)
    // El último siempre es B (neto 72).
    expect(out[2].name.startsWith('B')).toBe(true)
  })

  it('ranking por stableford ordena por mayor puntos', () => {
    const out = rankEntries(baseEntries, 'stableford', opts)
    expect(out.map((p) => p.name.split(' ')[0])).toEqual(['C', 'A', 'B'])
  })

  it('Player.total refleja vsPar para el modo elegido', () => {
    const grossOut = rankEntries(baseEntries, 'gross', opts)
    // A: gross=75 vs par=72 → +3
    expect(grossOut.find((p) => p.name.startsWith('A'))?.total).toBe(3)

    const netoOut = rankEntries(baseEntries, 'neto', opts)
    // A: net=70 vs par=72 → -2
    expect(netoOut.find((p) => p.name.startsWith('A'))?.total).toBe(-2)
  })

  it('entries vacíos devuelven array vacío', () => {
    expect(rankEntries([], 'gross', opts)).toEqual([])
  })

  it('multi-round: usa roundsPlayed del entry para calcular vsPar', () => {
    const multi: LeaderboardEntry[] = [
      // 2 rondas: net cumulativo = 145, parTotal*2 = 144 → vsPar = +1
      entry({ name: 'Multi', netTotal: 145, grossTotal: 160, roundsPlayed: 2 }),
    ]
    const out = rankEntries(multi, 'neto', { parTotal: 72, formatoJuego: 'stroke_play' })
    expect(out[0].total).toBe(1)
  })

  it('jugador sin hoyos jugados tiene vsPar 0 incluso si grossTotal/netTotal son 0', () => {
    const empty: LeaderboardEntry[] = [entry({ name: 'Nuevo', holesPlayed: 0, status: 'live' })]
    const out = rankEntries(empty, 'gross', opts)
    expect(out[0].total).toBe(0)
  })

  it.each<[RankingMode]>([['gross'], ['neto'], ['stableford']])(
    'modo %s: cada Player tiene cat heredado o "General" por default',
    (mode) => {
      const withCat: LeaderboardEntry[] = [
        entry({ name: 'Cat1', cat: 'Cat. A' }),
        entry({ name: 'Cat2' }),
      ]
      const out = rankEntries(withCat, mode, opts)
      const cat1 = out.find((p) => p.name.startsWith('Cat1'))
      const cat2 = out.find((p) => p.name.startsWith('Cat2'))
      expect(cat1?.cat).toBe('Cat. A')
      expect(cat2?.cat).toBe('General')
    },
  )

  it('stableford siempre usa higher_wins para countback', () => {
    // Dos jugadores con mismo puntaje stableford → countback decide
    const tied: LeaderboardEntry[] = [
      entry({ name: 'X', stablefordTotal: 36, scores: [3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3], stablefordScores: [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2] }),
      entry({ name: 'Y', stablefordTotal: 36, scores: [4,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3,3], stablefordScores: [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2] }),
    ]
    const out = rankEntries(tied, 'stableford', opts)
    expect(out).toHaveLength(2)
    expect(out[0].total).toBe(36)
  })
})
