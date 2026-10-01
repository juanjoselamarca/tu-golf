'use client'

import { useMemo } from 'react'
import { calcularMatchPlay, type MatchResult } from '@/golf/formats/match-play'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import type { HoleData, RondaLibre } from '@/types/ronda'

/**
 * Estado del match play (2 jugadores) a partir del estado del scorer. `null`
 * si la ronda no es match play, no tiene exactamente 2 jugadores o no hay
 * datos de hoyos. Los hoyos concedidos (CONCEDE = -1) no entran como golpes:
 * `calcularMatchPlay` los lee aparte.
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
    const jug = ronda.ronda_libre_jugadores
    if (jug.length !== 2) return null

    // Build scores records from state
    const scoresA: Record<string, number> = {}
    const scoresB: Record<string, number> = {}
    const playerScoresA = scores[jug[0].id] ?? {}
    const playerScoresB = scores[jug[1].id] ?? {}
    for (const [k, v] of Object.entries(playerScoresA)) {
      if (v != null && v > 0) scoresA[String(k)] = v
    }
    for (const [k, v] of Object.entries(playerScoresB)) {
      if (v != null && v > 0) scoresB[String(k)] = v
    }

    // Build holes array from holeDataMap
    const holes = Object.entries(holeDataMap).map(([num, data]) => ({
      numero: Number(num),
      par: data.par,
      stroke_index: data.stroke_index,
    }))
    if (holes.length === 0) return null

    return calcularMatchPlay(scoresA, scoresB, holes, {
      courseHandicapA: playerHcp[jug[0].id] ?? 0,
      courseHandicapB: playerHcp[jug[1].id] ?? 0,
      totalHoles: ronda.holes,
      modo: ronda.modo_juego,
      hoyos: hoyosDeLaRonda(ronda.hoyo_inicio, ronda.holes),
    }, { nombreA: jug[0].nombre, nombreB: jug[1].nombre })
  }, [isMatchPlay, ronda, scores, holeDataMap, playerHcp])

  return { isMatchPlay, matchResult }
}
