/**
 * Best Ball (Four-Ball) — formato por equipos.
 *
 * Reglas R&A/USGA Rule 23:
 * - Equipos de 2-4 jugadores, cada uno juega su propia bola
 * - Score del equipo por hoyo = MEJOR score individual
 * - Cada jugador usa su propio handicap (sin ajuste de equipo)
 * - Puede jugarse en gross, neto, o stableford
 *
 * En neto: teamNeto(h) = min(jugadorA_neto(h), jugadorB_neto(h), ...)
 * En stableford: teamStableford(h) = max(jugadorA_stableford(h), jugadorB_stableford(h), ...)
 * (max porque más puntos = mejor en stableford)
 */

import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '../core/scoring'
import type { ModoJuego, FormatoJuego } from '../core/rules'

// ─── Types ───

export interface BestBallPlayer {
  id: string
  nombre: string
  handicapIndex: number
  scores: Record<string, number> // {"1": 4, "2": 5, ...}
}

export interface BestBallTeam {
  id: string
  nombre: string
  jugadores: BestBallPlayer[]
}

export interface BestBallHoleDetail {
  numero: number
  par: number
  strokeIndex: number
  /** Score de cada jugador en este hoyo */
  playerScores: Array<{
    playerId: string
    nombre: string
    gross: number | null
    neto: number | null
    stableford: number | null
    isBest: boolean // true si este es el score que cuenta para el equipo
  }>
  /** Score del equipo en este hoyo (el mejor) */
  teamGross: number | null
  teamNeto: number | null
  teamStableford: number | null
}

export interface BestBallTeamResult {
  teamId: string
  teamNombre: string
  holes: BestBallHoleDetail[]
  totalGross: number
  totalNeto: number
  totalStableford: number
  overUnderGross: number
  overUnderNeto: number
  holesPlayed: number
}

// ─── Motor principal ───

/**
 * Calcula el resultado de best ball para un equipo.
 *
 * @param team - Equipo con jugadores y sus scores
 * @param holes - Datos de los hoyos del recorrido
 * @param parTotal - Par total del recorrido
 * @returns Resultado completo del equipo
 */
export function calcularBestBall(
  team: BestBallTeam,
  holes: Array<{ numero: number; par: number; stroke_index: number }>,
  parTotal: number
): BestBallTeamResult {
  const sortedHoles = [...holes].sort((a, b) => a.numero - b.numero)

  let totalGross = 0
  let totalNeto = 0
  let totalStableford = 0
  let holesPlayed = 0
  let parJugado = 0

  const holeDetails: BestBallHoleDetail[] = sortedHoles.map((hole) => {
    const key = String(hole.numero)

    // Calcular score de cada jugador en este hoyo
    const playerScores = team.jugadores.map((player) => {
      const gross = player.scores[key]
      if (!gross || gross <= 0) {
        return {
          playerId: player.id,
          nombre: player.nombre,
          gross: null,
          neto: null,
          stableford: null,
          isBest: false,
        }
      }

      const strokes = strokesRecibidosEnHoyo(player.handicapIndex, hole.stroke_index)
      const neto = gross - strokes
      const stableford = puntosStablefordHoyo(gross, hole.par, player.handicapIndex, hole.stroke_index)

      return {
        playerId: player.id,
        nombre: player.nombre,
        gross,
        neto,
        stableford,
        isBest: false,
      }
    })

    // Filtrar jugadores que tienen score
    const withScores = playerScores.filter((p) => p.gross !== null)

    if (withScores.length === 0) {
      return {
        numero: hole.numero,
        par: hole.par,
        strokeIndex: hole.stroke_index,
        playerScores,
        teamGross: null,
        teamNeto: null,
        teamStableford: null,
      }
    }

    holesPlayed++
    parJugado += hole.par

    // Best Ball: menor gross, menor neto, mayor stableford
    const bestGrossPlayer = withScores.reduce((best, p) =>
      (p.gross! < best.gross!) ? p : best
    )
    const bestNetoPlayer = withScores.reduce((best, p) =>
      (p.neto! < best.neto!) ? p : best
    )
    const bestStablefordPlayer = withScores.reduce((best, p) =>
      (p.stableford! > best.stableford!) ? p : best
    )

    // Marcar isBest (puede ser diferente jugador para gross vs neto vs stableford)
    // Para simplificar, marcamos al que tiene mejor neto (más versátil)
    const bestId = bestNetoPlayer.playerId
    playerScores.forEach((p) => {
      if (p.playerId === bestId) p.isBest = true
    })

    const teamGross = bestGrossPlayer.gross!
    const teamNeto = bestNetoPlayer.neto!
    const teamStableford = bestStablefordPlayer.stableford!

    totalGross += teamGross
    totalNeto += teamNeto
    totalStableford += teamStableford

    return {
      numero: hole.numero,
      par: hole.par,
      strokeIndex: hole.stroke_index,
      playerScores,
      teamGross,
      teamNeto,
      teamStableford,
    }
  })

  return {
    teamId: team.id,
    teamNombre: team.nombre,
    holes: holeDetails,
    totalGross,
    totalNeto,
    totalStableford,
    overUnderGross: totalGross - parJugado,
    overUnderNeto: totalNeto - parJugado,
    holesPlayed,
  }
}

/**
 * Score primario de un equipo best ball según formato y modo de juego.
 */
export function scorePrimarioBestBall(
  result: BestBallTeamResult,
  formato: FormatoJuego,
  modo: ModoJuego
): number {
  if (formato === 'stableford') return result.totalStableford
  if (modo === 'neto') return result.overUnderNeto
  return result.overUnderGross
}

/**
 * Ordena equipos best ball según formato y modo de juego.
 * Stableford: mayor puntaje primero. Gross/Neto: menor over/under primero.
 */
export function ordenarEquiposBestBall(
  teams: BestBallTeamResult[],
  formato: FormatoJuego,
  modo: ModoJuego
): BestBallTeamResult[] {
  return [...teams].sort((a, b) => {
    const sa = scorePrimarioBestBall(a, formato, modo)
    const sb = scorePrimarioBestBall(b, formato, modo)
    if (formato === 'stableford') return sb - sa // DESC
    return sa - sb // ASC
  })
}
