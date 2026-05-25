/**
 * Helpers de scoring para modo equipos (Best Ball).
 *
 * Best Ball regla R&A:
 * - Cada jugador anota su gross.
 * - El score del equipo en el hoyo = el menor entre los jugadores del equipo.
 * - Modo neto: se aplica handicap por hoyo según SI (stroke_index) antes de comparar.
 *   El jugador con HCP ≥ SI recibe 1 golpe (resta 1 al gross). Si HCP ≥ 18+SI,
 *   recibe 2 golpes. Detalle exacto en `strokesRecibidosEnHoyo` de @/golf/core/scoring.
 * - Empates: no importa, ambos jugadores dan el mismo número.
 *
 * Estos son pure functions — testeables sin React.
 */
import { strokesRecibidosEnHoyo } from '@/golf/core/scoring'

export interface BestBallHoleResult {
  winnerJugadorId: string
  bestGross: number
  bestNet: number
  bestScored: number // gross si modo gross, net si modo neto
}

export interface BestBallTotals {
  total: number
  vsPar: number
  played: number
}

export interface BestBallParams {
  equipoJugadorIds: string[]
  scores: Record<string, Record<number, number>>
  modoJuego: 'gross' | 'neto'
  playerDotHcps: Record<string, number>
  strokeIndexByHole: Record<number, number>
}

/**
 * Calcula el best ball del equipo en UN hoyo dado.
 * Devuelve null si ningún jugador anotó score en ese hoyo.
 */
export function calcBestBallHole(
  params: BestBallParams & { hole: number },
): BestBallHoleResult | null {
  const { equipoJugadorIds, hole, scores, modoJuego, playerDotHcps, strokeIndexByHole } = params
  const si = strokeIndexByHole[hole] ?? hole
  const candidates: Array<{ jid: string; gross: number; net: number }> = []
  for (const jid of equipoJugadorIds) {
    const gross = scores[jid]?.[hole]
    if (gross == null) continue
    const strokes = modoJuego === 'neto'
      ? strokesRecibidosEnHoyo(playerDotHcps[jid] ?? 0, si)
      : 0
    candidates.push({ jid, gross, net: gross - strokes })
  }
  if (candidates.length === 0) return null
  const best = candidates.reduce((a, b) => {
    const aVal = modoJuego === 'neto' ? a.net : a.gross
    const bVal = modoJuego === 'neto' ? b.net : b.gross
    return bVal < aVal ? b : a
  })
  return {
    winnerJugadorId: best.jid,
    bestGross: best.gross,
    bestNet: best.net,
    bestScored: modoJuego === 'neto' ? best.net : best.gross,
  }
}

/**
 * Suma de mejores por hoyo a lo largo de la ronda completa.
 * `played` = hoyos donde al menos un jugador del equipo tiene score.
 */
export function calcBestBallTotals(
  params: BestBallParams & { totalHoles: number; parMap: Record<number, number> },
): BestBallTotals {
  const { totalHoles, parMap } = params
  let total = 0
  let parTotal = 0
  let played = 0
  for (let h = 1; h <= totalHoles; h++) {
    const bb = calcBestBallHole({ ...params, hole: h })
    if (bb == null) continue
    total += bb.bestScored
    parTotal += parMap[h] ?? 4
    played++
  }
  return { total, vsPar: total - parTotal, played }
}
