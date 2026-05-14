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
 */

import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'
import type { Jugador, RondaLibre, HoleData } from '@/types/ronda'
import { getMissingHoles } from '@/lib/ronda/helpers'

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
  /** Pre-computed ordenHoyos.indexOf(currentHole). Pass 0 if unknown. */
  currentHoleIdx?: number
}

export interface ScoreboardCalc {
  // Modo / formato resueltos con defaults
  modoJuego: 'gross' | 'neto'
  formatoJuego: 'stroke_play' | 'stableford' | 'match_play'
  modoLabel: string
  showNet: boolean
  showStableford: boolean

  // Hoyo actual
  par: number
  score: number | undefined
  holeData: HoleData
  hcpForPlayer: number
  strokesOnHole: number
  strokeAdvantageOnHole: boolean

  // Totales gross
  totalGross: number
  totalParPlayed: number
  totalOverUnder: number
  holesPlayed: number

  // Front 9 / Back 9
  f9Gross: number
  f9Par: number
  f9Count: number
  b9Gross: number
  b9Par: number
  b9Count: number

  // Neto + Stableford
  totalNet: number
  totalStableford: number
  totalNetOverUnder: number
  currentNetScore: number | null
  currentNetDiff: number | null
  currentStablefordPts: number | null

  // Display final (según modo)
  displayOverUnder: number
  displayTotal: number

  // Warnings + flags
  missingCount: number
  canFinalize: boolean
  isAboveDoubleBogey: boolean
  showStrokeIndexWarning: boolean
  isLastHole: boolean
  currentHoleIdx: number
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
  } = input

  const totalHoles = ronda.holes

  // CRÍTICO: modoJuego y formatoJuego deben declararse al TOP del hook,
  // antes de cualquier closure que los use — fix estructural del bug P1-12
  // (TDZ ReferenceError cuando hasStrokeAdvantage cerraba sobre modoJuego
  // declarada más abajo en el scope inline de page.tsx).
  const modoJuego = (ronda.modo_juego ?? 'gross') as 'gross' | 'neto'
  const formatoJuego = (ronda.formato_juego ?? 'stroke_play') as 'stroke_play' | 'stableford' | 'match_play'

  // currentHoleIdx — callar si se provee, si no calcular por posición directa
  const currentHoleIdx = input.currentHoleIdx ?? 0

  const isLastHole = currentHoleIdx >= totalHoles - 1

  const par = parMap[currentHole] ?? 4
  const score = scores[activeJugadorId]?.[currentHole]
  const holeData: HoleData = holeDataMap[currentHole] ?? { numero: currentHole, par, stroke_index: currentHole, yardaje: null }

  // Total score
  let totalGross = 0, totalParPlayed = 0
  for (let h = 1; h <= totalHoles; h++) {
    const s = scores[activeJugadorId]?.[h]
    if (s != null) { totalGross += s; totalParPlayed += parMap[h] ?? 4 }
  }
  const totalOverUnder = totalGross - totalParPlayed
  const holesPlayed = Object.keys(scores[activeJugadorId] ?? {}).length
  const canFinalize = holesPlayed >= 9 || currentHoleIdx >= totalHoles - 1

  // Hoyos del rango 1..totalHoles que aún no tienen score.
  const missingCount = activeJugadorId
    ? getMissingHoles(scores[activeJugadorId] ?? {}, totalHoles).length
    : 0

  // FIX #6: Front 9 / Back 9 totals
  let f9Gross = 0, f9Par = 0, f9Count = 0
  let b9Gross = 0, b9Par = 0, b9Count = 0
  for (let h = 1; h <= Math.min(9, totalHoles); h++) {
    const s = scores[activeJugadorId]?.[h]
    if (s != null) { f9Gross += s; f9Par += parMap[h] ?? 4; f9Count++ }
  }
  for (let h = 10; h <= totalHoles; h++) {
    const s = scores[activeJugadorId]?.[h]
    if (s != null) { b9Gross += s; b9Par += parMap[h] ?? 4; b9Count++ }
  }

  // Handicap strokes on this hole
  const hcpForPlayer = playerHcp[activeJugadorId] ?? 0
  const strokesOnHole = strokesRecibidosEnHoyo(hcpForPlayer, holeData.stroke_index)

  // Diferencia de strokes vs rival (para dots: solo mostrar donde HAY ventaja)
  const jug = ronda.ronda_libre_jugadores ?? jugadores
  const rivalId = jug.length === 2 ? jug.find(j => j.id !== activeJugadorId)?.id : null
  const rivalHcp = rivalId ? (playerHcp[rivalId] ?? 0) : 0

  // hasStrokeAdvantage puede usar modoJuego con seguridad porque está declarada arriba
  const hasStrokeAdvantage = (si: number): boolean => {
    if (modoJuego === 'gross' || jug.length !== 2) return strokesRecibidosEnHoyo(hcpForPlayer, si) > 0
    const myStrokes = strokesRecibidosEnHoyo(hcpForPlayer, si)
    const theirStrokes = strokesRecibidosEnHoyo(rivalHcp, si)
    return myStrokes > theirStrokes
  }
  const strokeAdvantageOnHole = hasStrokeAdvantage(holeData.stroke_index)

  // Net score & Stableford for current hole
  const currentNetScore = score != null ? score - strokesOnHole : null
  const currentNetDiff = currentNetScore != null ? currentNetScore - par : null
  const currentStablefordPts = score != null ? puntosStablefordHoyo(score, par, hcpForPlayer, holeData.stroke_index) : null

  // Total net & stableford across all holes played
  let totalNet = 0, totalNetPar = 0, totalStableford = 0
  let missingStrokeIndex = false
  for (let h = 1; h <= totalHoles; h++) {
    const s = scores[activeJugadorId]?.[h]
    if (s != null) {
      const hd = holeDataMap[h]
      if (!hd?.stroke_index && (ronda.modo_juego === 'neto' || ronda.formato_juego === 'stableford')) missingStrokeIndex = true
      const si = hd?.stroke_index ?? h
      const strk = strokesRecibidosEnHoyo(hcpForPlayer, si)
      totalNet += s - strk
      totalNetPar += parMap[h] ?? 4
      totalStableford += puntosStablefordHoyo(s, parMap[h] ?? 4, hcpForPlayer, si)
    }
  }
  const totalNetOverUnder = totalNet - totalNetPar

  // What to display based on formato_juego + modo_juego
  const modoLabel = formatoJuego === 'match_play' ? 'Match Play Neto'
    : formatoJuego === 'stableford' ? 'Stableford'
    : modoJuego === 'neto' ? 'Stroke Play Neto'
    : 'Stroke Play'
  const showNet = modoJuego === 'neto' && formatoJuego !== 'stableford'
  const showStableford = formatoJuego === 'stableford'
  const displayOverUnder = showNet ? totalNetOverUnder : totalOverUnder
  const displayTotal = showStableford ? totalStableford : totalGross

  // Warning if stroke index is missing for neto/stableford modes
  const showStrokeIndexWarning = missingStrokeIndex && (showNet || showStableford)

  // Double bogey warning
  const isAboveDoubleBogey = score != null && score > par + 2

  return {
    modoJuego,
    formatoJuego,
    modoLabel,
    showNet,
    showStableford,
    par,
    score,
    holeData,
    hcpForPlayer,
    strokesOnHole,
    strokeAdvantageOnHole,
    totalGross,
    totalParPlayed,
    totalOverUnder,
    holesPlayed,
    f9Gross,
    f9Par,
    f9Count,
    b9Gross,
    b9Par,
    b9Count,
    totalNet,
    totalStableford,
    totalNetOverUnder,
    currentNetScore,
    currentNetDiff,
    currentStablefordPts,
    displayOverUnder,
    displayTotal,
    missingCount,
    canFinalize,
    isAboveDoubleBogey,
    showStrokeIndexWarning,
    isLastHole,
    currentHoleIdx,
  }
}
