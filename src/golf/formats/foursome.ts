/**
 * Foursome (Alternate Shot) — formato por equipos de 2.
 *
 * Reglas R&A/USGA Rule 22:
 * - Equipos de exactamente 2 jugadores
 * - Comparten una sola bola por hoyo
 * - Alternan tiros: uno tira desde el tee en hoyos impares, el otro en pares
 * - UN solo score por equipo por hoyo
 *
 * Handicap de equipo: 50 % de la suma de los dos handicaps de cancha (Rules of
 * Handicapping, Apéndice C). Lo calcula quien crea el equipo (`handicapDeEquipo`,
 * team-handicap.ts) y queda guardado en `ronda_equipos`; este motor solo lo aplica.
 *
 * Es similar a Scramble en estructura de datos (un score por equipo por hoyo)
 * pero difiere en:
 * 1. Exactamente 2 jugadores
 * 2. Asignación de handicap diferente
 * 3. Tracking de quién tira en cada hoyo (para display)
 */

import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '../core/scoring'
import { handicapDeEquipoParaHoyos } from './team-handicap'
import { normalizedStrokeIndexByHole } from '../core/stroke-index'
import { rankTeamsWithCountback } from '../leaderboard/team-tiebreak'
import type { ModoJuego, FormatoJuego } from '../core/rules'

// ─── Types ───

export interface FoursomeTeam {
  id: string
  nombre: string
  /** Nombre del jugador A (tira en hoyos impares por defecto) */
  nombreA: string
  /** Nombre del jugador B (tira en hoyos pares por defecto) */
  nombreB: string
  /** Scores del equipo (un score por hoyo): {"1": 4, "2": 3, ...} */
  scores: Record<string, number>
  /**
   * Handicap COMPLETO del equipo, escala 18 hoyos (`ronda_equipos.handicap_equipo`).
   * Es el que se muestra. null = sin handicap (0).
   */
  teamHandicap: number | null
  /**
   * Handicap que PUNTÚA, ya en la escala de los hoyos de la ronda
   * (`ronda_equipos.handicap_equipo_juego`). null/ausente = fila anterior a la
   * columna: se parte el completo (ver `handicapDeEquipoParaHoyos`).
   */
  teamHandicapJuego?: number | null
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

// ─── Orden de salida ───

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
 * @param team - Equipo con su handicap guardado y scores
 * @param holes - Datos de los hoyos del recorrido
 * @param parTotal - Par total del recorrido
 * @returns Resultado completo del equipo
 */
export function calcularFoursome(
  team: FoursomeTeam,
  holes: Array<{ numero: number; par: number; stroke_index: number }>,
  parTotal: number
): FoursomeTeamResult {
  const teamHandicap = team.teamHandicap ?? 0
  const sortedHoles = [...holes].sort((a, b) => a.numero - b.numero)
  // El que reparte golpes está en la escala de los hoyos jugados; el mostrado
  // (result.teamHandicap) es el completo (18h).
  const roundHoles = sortedHoles.length
  const teamHcpHoyos = handicapDeEquipoParaHoyos(team.teamHandicap, team.teamHandicapJuego, roundHoles)
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
