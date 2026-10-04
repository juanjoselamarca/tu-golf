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
import { handicapQueJuega } from '@/golf/core/rules'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import type { Jugador, RondaLibre, HoleData } from '@/types/ronda'
import { getMissingHoles } from '@/lib/ronda/helpers'
import { puedeFinalizar } from '@/golf/ronda-libre/progreso-de-ronda'
import { etiquetaDeModalidad } from '@/golf/ronda-libre/etiqueta-modalidad'

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
  /** Hoyos de la ronda en orden de juego (`hoyosDeLaRonda`). Misma lista que usa la página. */
  hoyos: readonly number[]
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
    hoyos,
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

    // Hoyos DE ESTA RONDA (una de 9 desde el 10 son 10..18), no 1..N.
    let totalGross = 0, totalParPlayed = 0
    for (const h of hoyos) {
      const s = playerScores?.[h]
      if (s != null) { totalGross += s; totalParPlayed += parMap[h] ?? 4 }
    }
    const totalOverUnder = totalGross - totalParPlayed
    const holesPlayed = Object.keys(playerScores ?? {}).length
    const canFinalize = puedeFinalizar(holesPlayed, isLastHole)

    const missingCount = activeJugadorId
      ? getMissingHoles(playerScores ?? {}, totalHoles, hoyos).length
      : 0

    let f9Gross = 0, f9Par = 0, f9Count = 0
    let b9Gross = 0, b9Par = 0, b9Count = 0
    // OUT/IN por número de hoyo: una ronda de 9 desde el 10 es toda IN.
    for (const h of hoyos) {
      const s = playerScores?.[h]
      if (s == null) continue
      if (h <= 9) { f9Gross += s; f9Par += parMap[h] ?? 4; f9Count++ }
      else { b9Gross += s; b9Par += parMap[h] ?? 4; b9Count++ }
    }

    const hcpForPlayer = playerHcp[activeJugadorId] ?? 0
    // SI normalizado (permutación 1..N) para ALOCAR golpes: Σ == course handicap
    // aunque el SI de catálogo sea 18h-impar en un loop de 9h. No-op si ya es
    // válido. El SI que se muestra (columna del scorecard) no cambia.
    const siAlloc = normalizedStrokeIndexByHole(Object.values(holeDataMap), totalHoles, hoyos)
    const siCurrent = siAlloc[currentHole] ?? holeData.stroke_index
    const strokesOnHole = strokesRecibidosEnHoyo(hcpForPlayer, siCurrent, totalHoles)

    const jug = rondaJugadores ?? jugadores
    const rivalId = jug.length === 2 ? jug.find(j => j.id !== activeJugadorId)?.id : null
    const rivalHcp = rivalId ? (playerHcp[rivalId] ?? 0) : 0

    const strokeAdvantageOn = (si: number): boolean => {
      if (modoJuego === 'gross' || jug.length !== 2) return strokesRecibidosEnHoyo(hcpForPlayer, si, totalHoles) > 0
      const myStrokes = strokesRecibidosEnHoyo(hcpForPlayer, si, totalHoles)
      const theirStrokes = strokesRecibidosEnHoyo(rivalHcp, si, totalHoles)
      return myStrokes > theirStrokes
    }
    const strokeAdvantageOnHole = strokeAdvantageOn(siCurrent)

    const currentNetScore = score != null ? score - strokesOnHole : null
    const currentNetDiff = currentNetScore != null ? currentNetScore - par : null
    // Puntos: en gross el handicap no entra en juego (`handicapQueJuega`).
    const hcpPuntos = handicapQueJuega(modoJuego, hcpForPlayer)
    const currentStablefordPts = score != null ? puntosStablefordHoyo(score, par, hcpPuntos, siCurrent, totalHoles) : null

    let totalNet = 0, totalNetPar = 0, totalStableford = 0
    let missingStrokeIndex = false
    for (const h of hoyos) {
      const s = playerScores?.[h]
      if (s != null) {
        const hd = holeDataMap[h]
        if (!hd?.stroke_index && (modoJuego === 'neto' || formatoJuego === 'stableford')) missingStrokeIndex = true
        const si = siAlloc[h] ?? hd?.stroke_index ?? h
        const strk = strokesRecibidosEnHoyo(hcpForPlayer, si, totalHoles)
        totalNet += s - strk
        totalNetPar += parMap[h] ?? 4
        totalStableford += puntosStablefordHoyo(s, parMap[h] ?? 4, hcpPuntos, si, totalHoles)
      }
    }
    const totalNetOverUnder = totalNet - totalNetPar

    const modoLabel = etiquetaDeModalidad(modoJuego, formatoJuego)
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
    hoyos,
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
