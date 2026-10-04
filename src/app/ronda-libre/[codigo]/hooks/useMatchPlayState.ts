'use client'

import { useMemo } from 'react'
import type { MatchResult } from '@/golf/formats/match-play'
import { matchDeLaRonda } from '@/golf/ronda-libre/match-de-la-ronda'
import type { HoleData, RondaLibre } from '@/types/ronda'

/**
 * Estado del match play (2 jugadores) a partir del estado del scorer. `null`
 * si la ronda no es match play, no tiene 2 jugadores o no hay datos de hoyos.
 * Fuente única `matchDeLaRonda` (la misma del historial y de la vista en vivo):
 * los hoyos concedidos (CONCEDE = -1) cuentan como hoyo perdido.
 */
export function useMatchPlayState(input: {
  ronda: RondaLibre | null
  scores: Record<string, Record<number, number>>
  holeDataMap: Record<number, HoleData>
  playerHcp: Record<string, number>
}): { isMatchPlay: boolean; matchResult: MatchResult | null } {
  const { ronda, scores, holeDataMap, playerHcp } = input
  const isMatchPlay = ronda?.formato_juego === 'match_play'

  const matchResult = useMemo<MatchResult | null>(() => {
    if (!isMatchPlay || !ronda) return null
    const hoyos = Object.entries(holeDataMap).map(([num, data]) => ({
      numero: Number(num),
      par: data.par,
      stroke_index: data.stroke_index,
    }))
    return matchDeLaRonda({ ronda, scoresPorJugador: scores, hoyos, courseHcpPorJugador: playerHcp })
  }, [isMatchPlay, ronda, scores, holeDataMap, playerHcp])

  return { isMatchPlay, matchResult }
}
