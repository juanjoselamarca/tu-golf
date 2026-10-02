'use client'

import { useMemo } from 'react'
import { strokesRecibidosEnHoyo } from '@/golf/core/scoring'
import { normalizeStrokeIndexMap } from '@/golf/core/stroke-index'
import { getMissingHoles } from '@/lib/ronda/helpers'
import { hoyosAnotados, puedeFinalizar, totalesDeTarjeta, type TotalesDeTarjeta } from '@/golf/ronda-libre/progreso-de-ronda'
import { etiquetaDeModalidad } from '@/golf/ronda-libre/etiqueta-modalidad'
import type { FormatoJuego, HoleData, Jugador, ModoJuego, RondaLibre } from '@/types/ronda'

export interface GrupoScoreboard {
  totalHoles: number
  par: number
  holeData: HoleData
  modoJuego: ModoJuego
  formatoJuego: FormatoJuego
  modoLabel: string
  showNetStableford: boolean
  isMatchPlay: boolean
  /**
   * SI normalizado (permutación 1..totalHoles) SÓLO para alocar golpes en los
   * indicadores del scorer de equipo (dot del progress row, hint "GOLPES"): SI de
   * catálogo 18h-impar en 9h perdía golpes. El SI que se MUESTRA sigue siendo el de
   * catálogo (holeData.stroke_index). Misma fuente canónica que board/scorer/card.
   */
  siAllocByHole: Record<number, number>
  /**
   * HCP con el que se marcan los puntos de golpe. En Match Play Neto es la
   * DIFERENCIA NETA contra el de menor HCP (que juega scratch); en stroke
   * play / stableford cada jugador usa su HCP absoluto.
   */
  getDotHcp: (playerId: string) => number
  holesWithScores: (jugadorId: string) => number
  /** Hoyos anotados del jugador que más lleva (THRU del header). */
  maxThru: number
  canFinalize: boolean
  /** Hoyos sin marcar entre TODOS los jugadores: si > 0, finalizar pide confirmar el relleno con par. */
  totalMissingScores: number
  getPlayerTotal: (jugadorId: string) => TotalesDeTarjeta
  /** Golpes que recibe el jugador en el hoyo actual. */
  strokesOnHole: (jugadorId: string) => number
  /** Máximo de golpes recibidos entre los jugadores en el hoyo actual (hint GOLPES). */
  maxStrokesOnHole: number
}

/**
 * Cálculos derivados del scorer de GRUPO (puros, memoizados). Totales y
 * progreso salen de `progreso-de-ronda` (fuente única compartida con el
 * scorer individual) sobre los hoyos DE LA RONDA.
 */
export function useGrupoScoreboard(input: {
  ronda: Pick<RondaLibre, 'holes' | 'modo_juego' | 'formato_juego'> | null
  jugadores: Jugador[]
  scores: Record<string, Record<number, number>>
  parMap: Record<number, number>
  holeDataMap: Record<number, HoleData>
  playerHcp: Record<string, number>
  ordenHoyos: readonly number[]
  currentHole: number
  isLastHole: boolean
}): GrupoScoreboard {
  const { ronda, jugadores, scores, parMap, holeDataMap, playerHcp, ordenHoyos, currentHole, isLastHole } = input
  const holes = ronda?.holes
  const modo = ronda?.modo_juego
  const formato = ronda?.formato_juego

  return useMemo<GrupoScoreboard>(() => {
    const totalHoles = holes ?? ordenHoyos.length
    const par = parMap[currentHole] ?? 4
    const holeData = holeDataMap[currentHole] ?? { numero: currentHole, par, stroke_index: currentHole, yardaje: null }
    const siAllocByHole: Record<number, number> = normalizeStrokeIndexMap(
      Object.fromEntries(ordenHoyos.map(h => [h, holeDataMap[h]?.stroke_index ?? h])),
      totalHoles,
      ordenHoyos,
    )
    const modoJuego = (modo || 'gross') as ModoJuego
    const formatoJuego = (formato || 'stroke_play') as FormatoJuego
    const modoLabel = etiquetaDeModalidad(modoJuego, formatoJuego)
    const showNetStableford = modoJuego !== 'gross'
    const isMatchPlay = formatoJuego === 'match_play'

    const getDotHcp = (playerId: string): number => {
      const absHcp = playerHcp[playerId] ?? 0
      if (!isMatchPlay) return absHcp
      const hcps = jugadores.map(p => playerHcp[p.id] ?? 0)
      const minHcp = hcps.length > 0 ? Math.min(...hcps) : 0
      return Math.max(0, absHcp - minHcp)
    }

    const holesWithScores = (jId: string) => hoyosAnotados(scores[jId], ordenHoyos)
    const maxThru = Math.max(...jugadores.map(j => holesWithScores(j.id)), 0)
    const canFinalize = puedeFinalizar(maxThru, isLastHole)
    const totalMissingScores = jugadores.reduce(
      (sum, j) => sum + getMissingHoles(scores[j.id] ?? {}, totalHoles, ordenHoyos).length, 0,
    )
    const getPlayerTotal = (jId: string) => totalesDeTarjeta(scores[jId], ordenHoyos, parMap)

    const siCurrent = siAllocByHole[currentHole] ?? holeData.stroke_index
    const strokesOnHole = (jId: string) => strokesRecibidosEnHoyo(getDotHcp(jId), siCurrent, totalHoles)
    const maxStrokesOnHole = jugadores.length > 0 ? Math.max(...jugadores.map(j => strokesOnHole(j.id))) : 0

    return {
      totalHoles, par, holeData, modoJuego, formatoJuego, modoLabel, showNetStableford, isMatchPlay,
      siAllocByHole, getDotHcp, holesWithScores, maxThru, canFinalize, totalMissingScores, getPlayerTotal,
      strokesOnHole, maxStrokesOnHole,
    }
  }, [holes, modo, formato, jugadores, scores, parMap, holeDataMap, playerHcp, ordenHoyos, currentHole, isLastHole])
}
