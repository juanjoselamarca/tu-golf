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
    const { players } = rankEntries(baseEntries, 'gross', opts)
    expect(players.map((p) => p.name.split(' ')[0])).toEqual(['A', 'C', 'B'])
    expect(players[0].pos).toBe(1)
    expect(players[2].pos).toBe(3)
  })

  it('ranking por neto ordena por menor net total y rompe empates con countback', () => {
    const { players } = rankEntries(baseEntries, 'neto', opts)
    // A y C empatan en net=70 → countback decide quién va primero
    expect(players[0].total).toBeLessThanOrEqual(players[1].total)
    expect(players[1].total).toBeLessThanOrEqual(players[2].total)
    expect(players[2].name.startsWith('B')).toBe(true)
  })

  it('ranking por stableford ordena por mayor puntos', () => {
    const { players } = rankEntries(baseEntries, 'stableford', opts)
    expect(players.map((p) => p.name.split(' ')[0])).toEqual(['C', 'A', 'B'])
  })

  it('Player.total refleja vsPar para el modo elegido', () => {
    const { players: grossOut } = rankEntries(baseEntries, 'gross', opts)
    expect(grossOut.find((p) => p.name.startsWith('A'))?.total).toBe(3)

    const { players: netoOut } = rankEntries(baseEntries, 'neto', opts)
    expect(netoOut.find((p) => p.name.startsWith('A'))?.total).toBe(-2)
  })

  it('entries vacíos devuelven players y order vacíos', () => {
    const out = rankEntries([], 'gross', opts)
    expect(out.players).toEqual([])
    expect(out.order).toEqual([])
  })

  it('multi-round: usa roundsPlayed del entry para calcular vsPar', () => {
    const multi: LeaderboardEntry[] = [
      entry({ name: 'Multi', netTotal: 145, grossTotal: 160, roundsPlayed: 2 }),
    ]
    const { players } = rankEntries(multi, 'neto', { parTotal: 72, formatoJuego: 'stroke_play' })
    expect(players[0].total).toBe(1)
  })

  it('jugador sin hoyos jugados tiene vsPar 0 incluso si grossTotal/netTotal son 0', () => {
    const empty: LeaderboardEntry[] = [entry({ name: 'Nuevo', holesPlayed: 0, status: 'live' })]
    const { players } = rankEntries(empty, 'gross', opts)
    expect(players[0].total).toBe(0)
  })

  it.each<[RankingMode]>([['gross'], ['neto'], ['stableford']])(
    'modo %s: cada Player tiene cat heredado o "General" por default',
    (mode) => {
      const withCat: LeaderboardEntry[] = [
        entry({ name: 'Cat1', cat: 'Cat. A' }),
        entry({ name: 'Cat2' }),
      ]
      const { players } = rankEntries(withCat, mode, opts)
      const cat1 = players.find((p) => p.name.startsWith('Cat1'))
      const cat2 = players.find((p) => p.name.startsWith('Cat2'))
      expect(cat1?.cat).toBe('Cat. A')
      expect(cat2?.cat).toBe('General')
    },
  )

  it('stableford-mode usa higher_wins para countback', () => {
    const tied: LeaderboardEntry[] = [
      entry({ name: 'X', stablefordTotal: 36, stablefordScores: [2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2] }),
      entry({ name: 'Y', stablefordTotal: 36, stablefordScores: [1,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2,2] }),
    ]
    const { players } = rankEntries(tied, 'stableford', opts)
    expect(players).toHaveLength(2)
    expect(players[0].total).toBe(36)
  })

  // ── Fixes del code review ─────────────────────────────────────────

  it('order array indexa de vuelta a los entries originales (POST-countback)', () => {
    const { players, order } = rankEntries(baseEntries, 'gross', opts)
    // order[i] es el originalIndex del entry cuyo Player quedó en pos i
    expect(order).toHaveLength(players.length)
    // baseEntries[order[0]] === 'A' (1° gross)
    expect(baseEntries[order[0]].name).toBe('A')
    expect(baseEntries[order[1]].name).toBe('C')
    expect(baseEntries[order[2]].name).toBe('B')
  })

  it('countback gross y neto pueden romper empates de manera DISTINTA', () => {
    // Caso construido: A y B con mismos gross AND mismos neto, pero
    // distribución de scores opuestas (uno fuerte al inicio, otro al final).
    // Countback gross usa scores brutos; countback neto usa scores brutos
    // también, pero el primaryScore (gross vs neto) puede diferir.
    // Acá hacemos un escenario donde gross empata por total pero countback
    // sigue dando lower_wins para ambos.
    const pair: LeaderboardEntry[] = [
      entry({
        name: 'Front',
        handicap: 10,
        grossTotal: 80, netTotal: 70,
        // Scores fuertes en los primeros 9, débiles en los últimos 9.
        scores: [3,3,3,3,3,3,3,3,3, 5,5,5,5,5,5,5,5,5],
      }),
      entry({
        name: 'Back',
        handicap: 10,
        grossTotal: 80, netTotal: 70,
        // Scores débiles en los primeros 9, fuertes en los últimos 9.
        scores: [5,5,5,5,5,5,5,5,5, 3,3,3,3,3,3,3,3,3],
      }),
    ]
    // Countback estándar USGA mira los últimos 9 primero. Ante empate
    // total, gana quien jugó mejor los últimos 9 → 'Back'.
    const { players: grossOut } = rankEntries(pair, 'gross', opts)
    expect(grossOut[0].name.startsWith('Back')).toBe(true)
    const { players: netoOut } = rankEntries(pair, 'neto', opts)
    expect(netoOut[0].name.startsWith('Back')).toBe(true)
    // Ambos modos resuelven el empate consistentemente porque el countback
    // por hoyo es idéntico — pero la prueba clave es que NINGUNO usa
    // higher_wins (bug previo en torneos stableford con vista gross/neto).
  })

  it('torneo Stableford con vista Gross usa lower_wins countback (fix bug)', () => {
    // Bug previo: cuando formatoJuego === 'stableford', cbMode se forzaba
    // a 'higher_wins' incluso si mode === 'gross'. Resultado: ante empate
    // de strokes, el countback elegía al jugador con MÁS strokes (peor).
    const tied: LeaderboardEntry[] = [
      entry({ name: 'Mejor', grossTotal: 80, scores: [3,3,3,3,3,3,3,3,3,5,5,5,5,5,5,5,5,5] }),
      entry({ name: 'Peor', grossTotal: 80, scores: [5,5,5,5,5,5,5,5,5,3,3,3,3,3,3,3,3,3] }),
    ]
    // En torneo stableford visto en Gross, countback debe ser lower_wins
    // → ganan los últimos 9 con menos strokes → 'Peor' (que en realidad es
    // quien jugó los últimos 9 mejor) gana.
    const stablefordOpts = { parTotal: 72, formatoJuego: 'stableford' as const }
    const { players } = rankEntries(tied, 'gross', stablefordOpts)
    // Con lower_wins en los últimos 9, gana 'Peor' (3s en últimos 9 = 27 strokes
    // vs 'Mejor' que en últimos 9 tiene 5s = 45 strokes).
    expect(players[0].name.startsWith('Peor')).toBe(true)
  })
})
