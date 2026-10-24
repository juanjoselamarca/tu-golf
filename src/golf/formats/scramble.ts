/**
 * Scramble — formato por equipos.
 *
 * Reglas:
 * - Equipos de 2-4 jugadores
 * - Todos tiran desde el tee, eligen el mejor tiro
 * - Todos juegan desde ese punto, eligen el mejor, y así sucesivamente
 * - UN solo score por equipo por hoyo
 *
 * Handicap de equipo: lo calcula quien crea el equipo (`handicapDeEquipo`,
 * team-handicap.ts) y queda guardado en `ronda_equipos`. Este motor solo lo aplica.
 *
 * Una vez calculado el handicap de equipo, los strokes se distribuyen
 * por stroke index igual que en juego individual.
 */

import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '../core/scoring'
import { handicapDeEquipoParaHoyos } from './team-handicap'
import { normalizedStrokeIndexByHole } from '../core/stroke-index'
import { rankTeamsWithCountback } from '../leaderboard/team-tiebreak'
import type { ModoJuego, FormatoJuego } from '../core/rules'

// ─── Types ───

export interface ScrambleTeam {
  id: string
  nombre: string
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
}

export interface ScrambleHoleDetail {
  numero: number
  par: number
  strokeIndex: number
  gross: number | null
  strokesRecibidos: number
  neto: number | null
  stableford: number | null
  overUnderGross: number | null
  overUnderNeto: number | null
}

export interface ScrambleTeamResult {
  teamId: string
  teamNombre: string
  teamHandicap: number
  holes: ScrambleHoleDetail[]
  totalGross: number
  totalNeto: number
  totalStableford: number
  overUnderGross: number
  overUnderNeto: number
  holesPlayed: number
}

// ─── Motor principal ───

/**
 * Calcula el resultado de scramble para un equipo.
 *
 * @param team - Equipo con su handicap guardado y scores
 * @param holes - Datos de los hoyos del recorrido
 * @param parTotal - Par total del recorrido
 * @returns Resultado completo del equipo
 */
export function calcularScramble(
  team: ScrambleTeam,
  holes: Array<{ numero: number; par: number; stroke_index: number }>,
  parTotal: number
): ScrambleTeamResult {
  const teamHandicap = team.teamHandicap ?? 0
  const sortedHoles = [...holes].sort((a, b) => a.numero - b.numero)
  // El que reparte golpes está en la escala de los hoyos jugados; el que se
  // MUESTRA (result.teamHandicap) es el COMPLETO (18h).
  const roundHoles = sortedHoles.length
  const teamHcpHoyos = handicapDeEquipoParaHoyos(team.teamHandicap, team.teamHandicapJuego, roundHoles)
  // Normalizar el SI a permutación 1..N para repartir EXACTAMENTE el course
  // handicap (SI 18h-impares perdían golpes en 9h). No-op si el SI ya es válido.
  const siAlloc = normalizedStrokeIndexByHole(sortedHoles)

  let totalGross = 0
  let totalNeto = 0
  let totalStableford = 0
  let holesPlayed = 0
  let parJugado = 0

  const holeDetails: ScrambleHoleDetail[] = sortedHoles.map((hole) => {
    const key = String(hole.numero)
    const gross = team.scores[key]

    if (!gross || gross <= 0) {
      const strokes = strokesRecibidosEnHoyo(teamHcpHoyos, siAlloc[hole.numero], roundHoles)
      return {
        numero: hole.numero,
        par: hole.par,
        strokeIndex: hole.stroke_index,
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
    const strokes = strokesRecibidosEnHoyo(teamHcpHoyos, siAlloc[hole.numero], roundHoles)
    const neto = gross - strokes
    const stableford = puntosStablefordHoyo(gross, hole.par, teamHcpHoyos, siAlloc[hole.numero], roundHoles)

    totalGross += gross
    totalNeto += neto
    totalStableford += stableford

    return {
      numero: hole.numero,
      par: hole.par,
      strokeIndex: hole.stroke_index,
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
 * Score primario de un equipo scramble según formato y modo de juego.
 */
export function scorePrimarioScramble(
  result: ScrambleTeamResult,
  formato: FormatoJuego,
  modo: ModoJuego
): number {
  if (formato === 'stableford') return result.totalStableford
  if (modo === 'neto') return result.overUnderNeto
  return result.overUnderGross
}

/**
 * Ordena equipos scramble según formato y modo de juego, con desempate USGA
 * por countback (mismo motor que el path individual — `team-tiebreak.ts`).
 */
export function ordenarEquiposScramble(
  teams: ScrambleTeamResult[],
  formato: FormatoJuego,
  modo: ModoJuego
): ScrambleTeamResult[] {
  const stableford = formato === 'stableford'
  return rankTeamsWithCountback(teams, {
    mode: stableford ? 'higher_wins' : 'lower_wins',
    primaryScore: (t) => scorePrimarioScramble(t, formato, modo),
    holeScores: (t) => t.holes.map((h) => (stableford ? h.stableford : modo === 'neto' ? h.neto : h.gross) ?? 0),
  })
}
