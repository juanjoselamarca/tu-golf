import { describe, it, expect } from 'vitest'
import {
  ordenarEquiposScramble, ordenarEquiposBestBall,
  type ScrambleTeamResult, type ScrambleHoleDetail,
  type BestBallTeamResult, type BestBallHoleDetail,
} from '@/golf/formats'

// ─── Builders mínimos ───

const PAR9 = 4

function mkScrambleHole(numero: number, neto: number, gross: number, stableford: number): ScrambleHoleDetail {
  return {
    numero, par: PAR9, strokeIndex: numero,
    gross, strokesRecibidos: gross - neto, neto, stableford,
    overUnderGross: gross - PAR9, overUnderNeto: neto - PAR9,
  }
}

/** Equipo scramble de 9 hoyos a partir de neto por hoyo (gross = neto para el test). */
function mkScramble(id: string, netoPorHoyo: number[], stablefordTotal = 0): ScrambleTeamResult {
  const holes = netoPorHoyo.map((n, i) => mkScrambleHole(i + 1, n, n, 0))
  const totalNeto = netoPorHoyo.reduce((s, n) => s + n, 0)
  const parJugado = PAR9 * netoPorHoyo.length
  return {
    teamId: id, teamNombre: id.toUpperCase(), teamHandicap: 0,
    holes,
    totalGross: totalNeto, totalNeto, totalStableford: stablefordTotal,
    overUnderGross: totalNeto - parJugado, overUnderNeto: totalNeto - parJugado,
    holesPlayed: netoPorHoyo.length,
  }
}

function mkBestBallHole(numero: number, teamNeto: number): BestBallHoleDetail {
  return {
    numero, par: PAR9, strokeIndex: numero, playerScores: [],
    teamGross: teamNeto, teamNeto, teamStableford: 0,
  }
}

function mkBestBall(id: string, netoPorHoyo: number[]): BestBallTeamResult {
  const holes = netoPorHoyo.map((n, i) => mkBestBallHole(i + 1, n))
  const totalNeto = netoPorHoyo.reduce((s, n) => s + n, 0)
  const parJugado = PAR9 * netoPorHoyo.length
  return {
    teamId: id, teamNombre: id.toUpperCase(), holes,
    totalGross: totalNeto, totalNeto, totalStableford: 0,
    overUnderGross: totalNeto - parJugado, overUnderNeto: totalNeto - parJugado,
    holesPlayed: netoPorHoyo.length,
  }
}

describe('ordenarEquiposScramble — desempate USGA', () => {
  it('empate de neto 9h: desempata por countback (últimos 6/3/1), no por orden de entrada', () => {
    // Ambos neto total 35 (empate). Entran en orden [B, A].
    // Sin desempate, el sort estable dejaría [B, A].
    // Countback 9h: A mejor en los últimos 6 (h4-9: 23 < 24) → A debe quedar 1°.
    const a = mkScramble('a', [4,4,4,4,4,4,3,4,4]) // últimos6 = 23
    const b = mkScramble('b', [3,4,4,4,4,4,4,4,4]) // últimos6 = 24
    const ordered = ordenarEquiposScramble([b, a], 'scramble', 'neto')
    expect(ordered.map((t) => t.teamId)).toEqual(['a', 'b'])
  })

  it('sin empate: ordena por neto ascendente (menor es mejor)', () => {
    const a = mkScramble('a', [4,4,4,4,4,4,4,4,4]) // neto 36
    const b = mkScramble('b', [3,4,4,4,4,4,4,4,4]) // neto 35 (mejor)
    const ordered = ordenarEquiposScramble([a, b], 'scramble', 'neto')
    expect(ordered.map((t) => t.teamId)).toEqual(['b', 'a'])
  })

  it('stableford: empate se rompe por countback (higher wins)', () => {
    // Empate de stableford total (18). Diferencia en los últimos hoyos.
    const a: ScrambleTeamResult = {
      ...mkScramble('a', [4,4,4,4,4,4,4,4,4], 18),
      holes: [2,2,2,2,2,2,2,3,3].map((s, i) => ({ ...mkScrambleHole(i + 1, 4, 4, 0), stableford: s })),
    }
    const b: ScrambleTeamResult = {
      ...mkScramble('b', [4,4,4,4,4,4,4,4,4], 18),
      holes: [3,3,2,2,2,2,2,2,2].map((s, i) => ({ ...mkScrambleHole(i + 1, 4, 4, 0), stableford: s })),
    }
    const ordered = ordenarEquiposScramble([b, a], 'stableford', 'neto')
    expect(ordered[0].teamId).toBe('a') // A gana los últimos hoyos (más puntos)
  })
})

describe('ordenarEquiposBestBall — desempate USGA', () => {
  it('empate de neto 9h: desempata por countback', () => {
    const a = mkBestBall('a', [4,4,4,4,4,4,3,4,4]) // últimos6 = 23
    const b = mkBestBall('b', [3,4,4,4,4,4,4,4,4]) // últimos6 = 24
    const ordered = ordenarEquiposBestBall([b, a], 'best_ball', 'neto')
    expect(ordered.map((t) => t.teamId)).toEqual(['a', 'b'])
  })
})
