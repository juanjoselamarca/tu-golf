// Canario — Board individual de torneo.
//
// Bug 27-jul-2026 (barrido sistemático de campeonato en prod, veredicto 4/10):
// el board individual estaba implementado TRES veces (landing /torneo/[slug],
// /tv, /en-vivo) y las tres comparaban el score contra el par de la CANCHA
// COMPLETA en vez del par de los hoyos jugados. Un jugador en par thru 9 se
// pintaba "−36"; y como el atrasado resta más par que el adelantado, el
// leaderboard quedaba AL REVÉS durante toda la ronda. Encima el neto se leía de
// `rounds.total_net`, columna que sólo escribe /api/game al scorear.
//
// El scorer en cancha (`calcularScoreRonda`) SIEMPRE tuvo esto bien —
// `parJugado`, canario del 9-abr-2026. El board era el que mentía. Este archivo
// fija la paridad: lo que muestra el board == lo que muestra la tarjeta.

import { describe, it, expect } from 'vitest'
import { calcularScoreRonda } from '@/golf/core/round-score'
import { computeIndividualScore, formatScoreVsPar } from '@/golf/leaderboard/individual-score'
import { rankEntries } from '@/golf/leaderboard/rank-entries'
import type { CourseHole, LeaderboardEntry } from '@/golf/leaderboard/types'

const PAR_MAP_18: Record<number, number> = {
  1: 4, 2: 5, 3: 3, 4: 4, 5: 4, 6: 5, 7: 3, 8: 4, 9: 4,
  10: 4, 11: 5, 12: 3, 13: 4, 14: 4, 15: 5, 16: 3, 17: 4, 18: 4,
} // par 72

const COURSE_HOLES_18: CourseHole[] = Object.entries(PAR_MAP_18).map(([n, par], i) => ({
  numero: Number(n),
  par,
  stroke_index: i + 1,
}))

function entry(over: Partial<LeaderboardEntry> & { name: string }): LeaderboardEntry {
  return {
    name: over.name,
    handicap: over.handicap ?? 0,
    grossTotal: over.grossTotal ?? 0,
    netTotal: over.netTotal ?? 0,
    stablefordTotal: over.stablefordTotal ?? 0,
    stablefordScores: over.stablefordScores,
    parPlayed: over.parPlayed ?? 0,
    holesPlayed: over.holesPlayed ?? 0,
    roundsPlayed: over.roundsPlayed,
    cat: over.cat,
    scores: over.scores ?? new Array(18).fill(null),
    status: over.status ?? 'live',
  }
}

describe('Canario — el board dice lo mismo que la tarjeta', () => {
  // Ronda parcial realista: 11 hoyos cargados, mezcla de birdies/pares/bogeys.
  const scores: Record<number, number> = {
    1: 4, 2: 6, 3: 3, 4: 5, 5: 4, 6: 5, 7: 4, 8: 4, 9: 5, 10: 3, 11: 6,
  }

  it('gross, hoyos jugados y par jugado coinciden con calcularScoreRonda', () => {
    const tarjeta = calcularScoreRonda({ scores, roundHoles: 18, parMap: PAR_MAP_18 })
    const board = computeIndividualScore(scores, COURSE_HOLES_18, 0, 18)

    expect(board.grossTotal).toBe(tarjeta.gross)
    expect(board.holesPlayed).toBe(tarjeta.holesPlayed)
    expect(board.parPlayed).toBe(tarjeta.parJugado)
  })

  it('vs par coincide con la tarjeta (hcp 0 → gross == neto)', () => {
    const tarjeta = calcularScoreRonda({ scores, roundHoles: 18, parMap: PAR_MAP_18 })
    const board = computeIndividualScore(scores, COURSE_HOLES_18, 0, 18)

    expect(board.vsParGross).toBe(tarjeta.vsPar)
    expect(board.vsParNet).toBe(tarjeta.vsPar)
  })

  it('la paridad se sostiene hoyo a hoyo durante toda la ronda', () => {
    const vuelta: Record<number, number> = {}
    for (let h = 1; h <= 18; h++) {
      vuelta[h] = PAR_MAP_18[h] + (h % 3 === 0 ? 1 : 0) // bogey cada 3 hoyos
      const tarjeta = calcularScoreRonda({ scores: vuelta, roundHoles: 18, parMap: PAR_MAP_18 })
      const board = computeIndividualScore(vuelta, COURSE_HOLES_18, 0, 18)

      expect(board.vsParGross, `hoyo ${h}`).toBe(tarjeta.vsPar)
      expect(board.parPlayed, `hoyo ${h}`).toBe(tarjeta.parJugado)
    }
  })
})

describe('Canario — "−36" no vuelve nunca', () => {
  it('jugador en par thru 9 NO se pinta bajo par', () => {
    const nueveEnPar: Record<number, number> = {}
    for (let h = 1; h <= 9; h++) nueveEnPar[h] = PAR_MAP_18[h]

    const board = computeIndividualScore(nueveEnPar, COURSE_HOLES_18, 0, 18)

    expect(board.vsParGross).toBe(0)
    expect(board.vsParGross).not.toBe(-36)
    expect(formatScoreVsPar(board.vsParGross, board.hasData)).toBe('E')
  })

  it('ningún avance parcial en par produce un score negativo', () => {
    const acumulado: Record<number, number> = {}
    for (let h = 1; h <= 18; h++) {
      acumulado[h] = PAR_MAP_18[h]
      const board = computeIndividualScore(acumulado, COURSE_HOLES_18, 0, 18)
      expect(board.vsParGross, `thru ${h}`).toBe(0)
    }
  })
})

describe('Canario — el leaderboard no queda al revés durante la ronda', () => {
  /** Entry de un jugador que va exactamente en par thru `n` hoyos. */
  const enParThru = (name: string, n: number): LeaderboardEntry => {
    const scores: Record<number, number> = {}
    for (let h = 1; h <= n; h++) scores[h] = PAR_MAP_18[h]
    const s = computeIndividualScore(scores, COURSE_HOLES_18, 0, 18)
    return entry({
      name,
      grossTotal: s.grossTotal,
      netTotal: s.netTotal,
      parPlayed: s.parPlayed,
      holesPlayed: s.holesPlayed,
      scores: [...s.scores],
    })
  }

  it('con todos en par, el que va thru 3 NO lidera sobre el que va thru 15', () => {
    const { players } = rankEntries(
      [enParThru('Atrasado', 3), enParThru('Adelantado', 15)],
      'gross',
      { formatoJuego: 'stroke_play' },
    )

    expect(players.map((p) => p.total)).toEqual([0, 0])
    // A igual vs par manda el más avanzado.
    expect(players[0].name.startsWith('Adelantado')).toBe(true)
  })

  it('el que va +5 thru 18 queda detrás del que va E thru 6', () => {
    const bueno = enParThru('Bueno', 6)
    const malo = entry({
      name: 'Malo',
      grossTotal: 77, netTotal: 77, parPlayed: 72, holesPlayed: 18, status: 'F',
    })

    const { players } = rankEntries([malo, bueno], 'gross', { formatoJuego: 'stroke_play' })

    expect(players[0].name.startsWith('Bueno')).toBe(true)
    expect(players[0].total).toBe(0)
    expect(players[1].total).toBe(5)
  })

  it('el que no empezó va al fondo y muestra "—", no "E"', () => {
    const sinEmpezar = entry({ name: 'Sin Empezar' })
    const jugando = enParThru('Jugando', 4)

    const { players } = rankEntries([sinEmpezar, jugando], 'gross', { formatoJuego: 'stroke_play' })

    expect(players[0].name.startsWith('Jugando')).toBe(true)
    expect(players[1].name.startsWith('Sin Empezar')).toBe(true)
    expect(players[1].holes).toBe(0)
    expect(formatScoreVsPar(players[1].total, players[1].holes > 0)).toBe('—')
  })
})

describe('Canario — el neto sale de los hoyos, no de una columna', () => {
  it('hcp 18: 18 hoyos de bogey dan neto en par', () => {
    const bogeys: Record<number, number> = {}
    for (let h = 1; h <= 18; h++) bogeys[h] = PAR_MAP_18[h] + 1

    const board = computeIndividualScore(bogeys, COURSE_HOLES_18, 18, 18)

    expect(board.grossTotal).toBe(90)
    expect(board.vsParGross).toBe(18)
    expect(board.vsParNet).toBe(0)
  })

  it('mid-ronda con hcp sólo descuenta los golpes de los hoyos jugados', () => {
    // 9 hoyos de bogey con hcp 18 → 1 golpe por hoyo → neto en par.
    const bogeys9: Record<number, number> = {}
    for (let h = 1; h <= 9; h++) bogeys9[h] = PAR_MAP_18[h] + 1

    const board = computeIndividualScore(bogeys9, COURSE_HOLES_18, 18, 18)

    expect(board.vsParNet).toBe(0)
    expect(board.vsParGross).toBe(9)
  })
})
