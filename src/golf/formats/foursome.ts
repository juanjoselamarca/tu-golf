/**
 * Foursome (Alternate Shot) — formato por equipos de 2.
 *
 * Reglas R&A/USGA Rule 22:
 * - Equipos de exactamente 2 jugadores
 * - Comparten una sola bola por hoyo
 * - Alternan tiros: uno tira desde el tee en hoyos impares, el otro en pares
 * - UN solo score por equipo por hoyo
 *
 * Handicap de equipo:
 * - (hcpA + hcpB) / 2, redondeado al entero más cercano
 * - R&A Rule 6.3b: "half the combined handicap"
 *
 * Es similar a Scramble en estructura de datos (un score por equipo por hoyo)
 * pero difiere en:
 * 1. Exactamente 2 jugadores
 * 2. Fórmula de handicap diferente
 * 3. Tracking de quién tira en cada hoyo (para display)
 */

import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '../core/scoring'
import { courseHandicapParaHoyos } from '../core/course-handicap'
import { normalizedStrokeIndexByHole } from '../core/stroke-index'
import { rankTeamsWithCountback } from '../leaderboard/team-tiebreak'
import type { ModoJuego, FormatoJuego } from '../core/rules'

// ─── Types ───

export interface FoursomeTeam {
  id: string
  nombre: string
  /** Handicap index del jugador A */
  handicapA: number
  /** Handicap index del jugador B */
  handicapB: number
  /** Nombre del jugador A (tira en hoyos impares por defecto) */
  nombreA: string
  /** Nombre del jugador B (tira en hoyos pares por defecto) */
  nombreB: string
  /** Scores del equipo (un score por hoyo): {"1": 4, "2": 3, ...} */
  scores: Record<string, number>
  /**
   * Handicap de equipo ya almacenado (ronda_equipos.handicap_equipo). Si está
   * presente, se usa tal cual en vez de recalcular desde handicapA/B, para que
   * el neto del leaderboard coincida con el que el scorer aplicó en cancha
   * (paridad con ScrambleTeam.teamHandicap).
   */
  teamHandicap?: number
  /** Si true, jugador A tira en hoyos pares (invierte el orden default) */
  invertirOrden?: boolean
}

export interface FoursomeHoleDetail {
  numero: number
  par: number
  strokeIndex: number
  /** Quién tira el primer tiro en este hoyo */
  teePlayer: string
  gross: number | null
  strokesRecibidos: number
  neto: number | null
  stableford: number | null
  overUnderGross: number | null
  overUnderNeto: number | null
}

export interface FoursomeTeamResult {
  teamId: string
  teamNombre: string
  teamHandicap: number
  nombreA: string
  nombreB: string
  holes: FoursomeHoleDetail[]
  totalGross: number
  totalNeto: number
  totalStableford: number
  overUnderGross: number
  overUnderNeto: number
  holesPlayed: number
}

// ─── Handicap de equipo ───

/**
 * Calcula el handicap de equipo para foursome.
 * R&A Rule 6.3b: mitad de la suma de ambos handicaps.
 *
 * @returns Handicap redondeado al entero más cercano
 */
export function calcularHandicapFoursome(
  handicapA: number,
  handicapB: number
): number {
  return Math.round((handicapA + handicapB) / 2)
}

/**
 * Determina quién tira desde el tee en un hoyo dado.
 * Por defecto: A en impares, B en pares. Invertible.
 */
export function teePlayerEnHoyo(
  holeNumber: number,
  nombreA: string,
  nombreB: string,
  invertir: boolean = false
): string {
  const esImpar = holeNumber % 2 === 1
  if (invertir) return esImpar ? nombreB : nombreA
  return esImpar ? nombreA : nombreB
}

// ─── Motor principal ───

/**
 * Calcula el resultado de foursome para un equipo.
 *
 * @param team - Equipo con handicaps y scores
 * @param holes - Datos de los hoyos del recorrido
 * @param parTotal - Par total del recorrido
 * @returns Resultado completo del equipo
 */
export function calcularFoursome(
  team: FoursomeTeam,
  holes: Array<{ numero: number; par: number; stroke_index: number }>,
  parTotal: number
): FoursomeTeamResult {
  const teamHandicap = team.teamHandicap ?? calcularHandicapFoursome(team.handicapA, team.handicapB)
  const sortedHoles = [...holes].sort((a, b) => a.numero - b.numero)
  // Ajuste 9h: el team handicap está en escala de 18h; en ≤9 hoyos se reparte la
  // mitad (WHS), sobre los `roundHoles` jugados. El mostrado se conserva completo.
  const roundHoles = sortedHoles.length
  const teamHcpHoyos = courseHandicapParaHoyos(teamHandicap, roundHoles)
  // Normalizar el SI a permutación 1..N para repartir EXACTAMENTE el course
  // handicap (SI 18h-impares perdían golpes en 9h). No-op si el SI ya es válido.
  const siAlloc = normalizedStrokeIndexByHole(sortedHoles)
  const invertir = team.invertirOrden ?? false

  let totalGross = 0
  let totalNeto = 0
  let totalStableford = 0
  let holesPlayed = 0
  let parJugado = 0

  const holeDetails: FoursomeHoleDetail[] = sortedHoles.map((hole) => {
    const key = String(hole.numero)
    const gross = team.scores[key]
    const teePlayer = teePlayerEnHoyo(hole.numero, team.nombreA, team.nombreB, invertir)
    const strokes = strokesRecibidosEnHoyo(teamHcpHoyos, siAlloc[hole.numero], roundHoles)

    if (!gross || gross <= 0) {
      return {
        numero: hole.numero,
        par: hole.par,
        strokeIndex: hole.stroke_index,
        teePlayer,
        gross: null,
        strokesRecibidos: strokes,
        neto: null,
        stableford: null,
        overUnderGross: null,
        overUnderNeto: null,
      }
    }

    holesPlayed++
    parJugado += hole.par
    const neto = gross - strokes
    const stableford = puntosStablefordHoyo(gross, hole.par, teamHcpHoyos, siAlloc[hole.numero], roundHoles)

    totalGross += gross
    totalNeto += neto
    totalStableford += stableford

    return {
      numero: hole.numero,
      par: hole.par,
      strokeIndex: hole.stroke_index,
      teePlayer,
      gross,
      strokesRecibidos: strokes,
      neto,
      stableford,
      overUnderGross: gross - hole.par,
      overUnderNeto: neto - hole.par,
    }
  })

  return {
    teamId: team.id,
    teamNombre: team.nombre,
    teamHandicap,
    nombreA: team.nombreA,
    nombreB: team.nombreB,
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
 * Score primario de un equipo foursome según formato y modo de juego.
 */
export function scorePrimarioFoursome(
  result: FoursomeTeamResult,
  formato: FormatoJuego,
  modo: ModoJuego
): number {
  if (formato === 'stableford') return result.totalStableford
  if (modo === 'neto') return result.overUnderNeto
  return result.overUnderGross
}

/**
 * Ordena equipos foursome según formato y modo de juego, con desempate USGA
 * por countback (mismo motor que el path individual — `team-tiebreak.ts`).
 */
export function ordenarEquiposFoursome(
  teams: FoursomeTeamResult[],
  formato: FormatoJuego,
  modo: ModoJuego
): FoursomeTeamResult[] {
  const stableford = formato === 'stableford'
  return rankTeamsWithCountback(teams, {
    mode: stableford ? 'higher_wins' : 'lower_wins',
    primaryScore: (t) => scorePrimarioFoursome(t, formato, modo),
    holeScores: (t) => t.holes.map((h) => (stableford ? h.stableford : modo === 'neto' ? h.neto : h.gross) ?? 0),
  })
}
