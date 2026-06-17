/**
 * useScoreboardCalc — hook puro de cálculos derivados del scorer.
 *
 * Extraído desde page.tsx (Task 3 del scorer-refactor, 13-may-2026).
 * Motivación: eliminar estructuralmente el bug class TDZ-via-closure (P1-12,
 * 12-may-2026) donde hasStrokeAdvantage cerraba sobre modoJuego antes de que
 * fuera declarada en el scope inline de ~145 líneas. Al tener cada cálculo
 * su propio scope de función, el orden de declaración está garantizado por TS.
 *
 * REGLA: NO modificar fórmulas. Este hook es un port 1:1 del bloque inline.
 *
 * Cleanup 17-may-2026 (nits del code review Task 3 / Task 5):
 *  - Output agrupado en namespaces (mode / current / totals / nines / neto / flags / display)
 *  - `currentHoleIdx` ahora required — sin él isLastHole y canFinalize quedan mal
 *  - `strokeAdvantageOn(si)` expuesto desde el hook (elimina helper duplicado en page.tsx)
 *  - Cálculo envuelto en useMemo para evitar recomputar los 4 for-loops por render
 *  - `modoJuego` / `formatoJuego` consistentes (eliminado uso de `ronda.modo_juego` post-resolución)
 */

import { useMemo } from 'react'
import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'
import type { Jugador, RondaLibre, HoleData } from '@/types/ronda'
import { getMissingHoles } from '@/lib/ronda/helpers'

export type ModoJuego = 'gross' | 'neto'
export type FormatoJuego = 'stroke_play' | 'stableford' | 'match_play'

export interface ScoreboardCalcInput {
  ronda: Pick<RondaLibre, 'holes' | 'modo_juego' | 'formato_juego' | 'hoyo_inicio'> & {
    ronda_libre_jugadores?: Jugador[]
  }
  activeJugadorId: string
  jugadores: Jugador[]
  scores: Record<string, Record<number, number>>
  parMap: Record<number, number>
  holeDataMap: Record<number, HoleData>
  playerHcp: Record<string, number>
  currentHole: number
  /** Pre-computed ordenHoyos.indexOf(currentHole). Required — afecta isLastHole y canFinalize. */
  currentHoleIdx: number
}

export interface ScoreboardCalc {
  mode: {
    modoJuego: ModoJuego
    formatoJuego: FormatoJuego
    modoLabel: string
    showNet: boolean
    showStableford: boolean
    /**
     * true sólo en stroke play NETO. En esta modalidad el neto = bruto − hándicap
     * total: la asignación de golpes por hoyo (por stroke index) NO cambia el
     * resultado, así que NO se marcan golpes por hoyo (decisión Juanjo 17-jun).
     * En match play y stableford los golpes por hoyo SÍ importan → false.
     */
    isStrokePlayNeto: boolean
  }
  current: {
    par: number
    score: number | undefined
    holeData: HoleData
    hcpForPlayer: number
    strokesOnHole: number
    strokeAdvantageOnHole: boolean
    currentNetScore: number | null
    currentNetDiff: number | null
    currentStablefordPts: number | null
    isLastHole: boolean
    currentHoleIdx: number
  }
  totals: {
    totalGross: number
    totalParPlayed: number
    totalOverUnder: number
    holesPlayed: number
  }
  nines: {
    f9Gross: number
    f9Par: number
    f9Count: number
    b9Gross: number
    b9Par: number
    b9Count: number
  }
  neto: {
    totalNet: number
    totalStableford: number
    totalNetOverUnder: number
  }
  flags: {
    missingCount: number
    canFinalize: boolean
    isAboveDoubleBogey: boolean
    showStrokeIndexWarning: boolean
  }
  display: {
    displayOverUnder: number
    displayTotal: number
  }
  /** Ventaja de strokes vs rival en un hoyo arbitrario. Reutilizado por MiniScorecardGrid. */
  strokeAdvantageOn: (si: number) => boolean
}

export function useScoreboardCalc(input: ScoreboardCalcInput): ScoreboardCalc {
  const {
    ronda,
    activeJugadorId,
    jugadores,
    scores,
    parMap,
    holeDataMap,
    playerHcp,
    currentHole,
    currentHoleIdx,
  } = input

  const playerScores = scores[activeJugadorId]
  const rondaJugadores = ronda.ronda_libre_jugadores

  return useMemo<ScoreboardCalc>(() => {
    const totalHoles = ronda.holes

    // CRÍTICO: modoJuego y formatoJuego al TOP del cálculo — fix estructural del
    // bug P1-12 (12-may-2026). No mover.
    const modoJuego: ModoJuego = (ronda.modo_juego ?? 'gross') as ModoJuego
    const formatoJuego: FormatoJuego = (ronda.formato_juego ?? 'stroke_play') as FormatoJuego

    const isLastHole = currentHoleIdx >= totalHoles - 1

    const par = parMap[currentHole] ?? 4
    const score = playerScores?.[currentHole]
    const holeData: HoleData = holeDataMap[currentHole] ?? { numero: currentHole, par, stroke_index: currentHole, yardaje: null }

    let totalGross = 0, totalParPlayed = 0
    for (let h = 1; h <= totalHoles; h++) {
      const s = playerScores?.[h]
      if (s != null) { totalGross += s; totalParPlayed += parMap[h] ?? 4 }
    }
    const totalOverUnder = totalGross - totalParPlayed
    const holesPlayed = Object.keys(playerScores ?? {}).length
    const canFinalize = holesPlayed >= 9 || isLastHole

    const missingCount = activeJugadorId
      ? getMissingHoles(playerScores ?? {}, totalHoles).length
      : 0

    let f9Gross = 0, f9Par = 0, f9Count = 0
    let b9Gross = 0, b9Par = 0, b9Count = 0
    for (let h = 1; h <= Math.min(9, totalHoles); h++) {
      const s = playerScores?.[h]
      if (s != null) { f9Gross += s; f9Par += parMap[h] ?? 4; f9Count++ }
    }
    for (let h = 10; h <= totalHoles; h++) {
      const s = playerScores?.[h]
      if (s != null) { b9Gross += s; b9Par += parMap[h] ?? 4; b9Count++ }
    }

    const hcpForPlayer = playerHcp[activeJugadorId] ?? 0
    const strokesOnHole = strokesRecibidosEnHoyo(hcpForPlayer, holeData.stroke_index)

    const jug = rondaJugadores ?? jugadores
    const rivalId = jug.length === 2 ? jug.find(j => j.id !== activeJugadorId)?.id : null
    const rivalHcp = rivalId ? (playerHcp[rivalId] ?? 0) : 0

    const strokeAdvantageOn = (si: number): boolean => {
      if (modoJuego === 'gross' || jug.length !== 2) return strokesRecibidosEnHoyo(hcpForPlayer, si) > 0
      const myStrokes = strokesRecibidosEnHoyo(hcpForPlayer, si)
      const theirStrokes = strokesRecibidosEnHoyo(rivalHcp, si)
      return myStrokes > theirStrokes
    }
    const strokeAdvantageOnHole = strokeAdvantageOn(holeData.stroke_index)

    const currentNetScore = score != null ? score - strokesOnHole : null
    const currentNetDiff = currentNetScore != null ? currentNetScore - par : null
    const currentStablefordPts = score != null ? puntosStablefordHoyo(score, par, hcpForPlayer, holeData.stroke_index) : null

    let totalNet = 0, totalNetPar = 0, totalStableford = 0
    let missingStrokeIndex = false
    for (let h = 1; h <= totalHoles; h++) {
      const s = playerScores?.[h]
      if (s != null) {
        const hd = holeDataMap[h]
        if (!hd?.stroke_index && (modoJuego === 'neto' || formatoJuego === 'stableford')) missingStrokeIndex = true
        const si = hd?.stroke_index ?? h
        const strk = strokesRecibidosEnHoyo(hcpForPlayer, si)
        totalNet += s - strk
        totalNetPar += parMap[h] ?? 4
        totalStableford += puntosStablefordHoyo(s, parMap[h] ?? 4, hcpForPlayer, si)
      }
    }
    const totalNetOverUnder = totalNet - totalNetPar

    const modoLabel = formatoJuego === 'match_play' ? 'Match Play Neto'
      : formatoJuego === 'stableford' ? 'Stableford'
      : modoJuego === 'neto' ? 'Stroke Play Neto'
      : 'Stroke Play'
    const showNet = modoJuego === 'neto' && formatoJuego !== 'stableford'
    const showStableford = formatoJuego === 'stableford'
    // Stroke play neto: el hándicap se aplica al total, no por hoyo → sin marcas
    // de golpes por hoyo. Match play neto mantiene showNet pero NO es esto.
    const isStrokePlayNeto = formatoJuego === 'stroke_play' && modoJuego === 'neto'
    const displayOverUnder = showNet ? totalNetOverUnder : totalOverUnder
    const displayTotal = showStableford ? totalStableford : totalGross

    const showStrokeIndexWarning = missingStrokeIndex && (showNet || showStableford)
    const isAboveDoubleBogey = score != null && score > par + 2

    return {
      mode: { modoJuego, formatoJuego, modoLabel, showNet, showStableford, isStrokePlayNeto },
      current: {
        par, score, holeData, hcpForPlayer, strokesOnHole, strokeAdvantageOnHole,
        currentNetScore, currentNetDiff, currentStablefordPts,
        isLastHole, currentHoleIdx,
      },
      totals: { totalGross, totalParPlayed, totalOverUnder, holesPlayed },
      nines: { f9Gross, f9Par, f9Count, b9Gross, b9Par, b9Count },
      neto: { totalNet, totalStableford, totalNetOverUnder },
      flags: { missingCount, canFinalize, isAboveDoubleBogey, showStrokeIndexWarning },
      display: { displayOverUnder, displayTotal },
      strokeAdvantageOn,
    }
  }, [
    ronda.holes,
    ronda.modo_juego,
    ronda.formato_juego,
    rondaJugadores,
    activeJugadorId,
    jugadores,
    playerScores,
    parMap,
    holeDataMap,
    playerHcp,
    currentHole,
    currentHoleIdx,
  ])
}
