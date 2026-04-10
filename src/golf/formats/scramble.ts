/**
 * Scramble — formato por equipos.
 *
 * Reglas:
 * - Equipos de 2-4 jugadores
 * - Todos tiran desde el tee, eligen el mejor tiro
 * - Todos juegan desde ese punto, eligen el mejor, y así sucesivamente
 * - UN solo score por equipo por hoyo
 *
 * Handicap de equipo (fórmula USGA recomendada):
 * - 2 jugadores: 35% del menor + 15% del mayor
 * - 3 jugadores: 20% del menor + 15% del medio + 10% del mayor
 * - 4 jugadores: 25% del 1ro + 20% del 2do + 15% del 3ro + 10% del 4to
 *
 * Una vez calculado el handicap de equipo, los strokes se distribuyen
 * por stroke index igual que en juego individual.
 */

import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '../core/scoring'
import type { ModoJuego, FormatoJuego } from '../core/rules'

// ─── Types ───

export interface ScrambleTeam {
  id: string
  nombre: string
  /** Handicap index de cada jugador (para calcular handicap de equipo) */
  handicaps: number[]
  /** Scores del equipo (un score por hoyo): {"1": 4, "2": 3, ...} */
  scores: Record<string, number>
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

// ─── Handicap de equipo ───

/**
 * Calcula el handicap de equipo para scramble según fórmula USGA.
 *
 * @param handicaps - Handicap index de cada jugador (2-4 jugadores)
 * @returns Handicap de equipo redondeado a 1 decimal
 */
export function calcularHandicapScramble(handicaps: number[]): number {
  if (handicaps.length === 0) return 0

  // Ordenar de menor a mayor
  const sorted = [...handicaps].sort((a, b) => a - b)

  let teamHcp: number

  switch (sorted.length) {
    case 1:
      // Un solo jugador: handicap completo (no es scramble real, pero soportamos)
      teamHcp = sorted[0]
      break
    case 2:
      // 2 jugadores: 35% menor + 15% mayor
      teamHcp = 0.35 * sorted[0] + 0.15 * sorted[1]
      break
    case 3:
      // 3 jugadores: 20% menor + 15% medio + 10% mayor
      teamHcp = 0.20 * sorted[0] + 0.15 * sorted[1] + 0.10 * sorted[2]
      break
    default:
      // 4+ jugadores: 25% 1ro + 20% 2do + 15% 3ro + 10% 4to
      teamHcp = 0.25 * sorted[0] + 0.20 * sorted[1] + 0.15 * sorted[2] + 0.10 * sorted[3]
      break
  }

  return Math.round(teamHcp * 10) / 10
}

// ─── Motor principal ───

/**
 * Calcula el resultado de scramble para un equipo.
 *
 * @param team - Equipo con handicaps y scores
 * @param holes - Datos de los hoyos del recorrido
 * @param parTotal - Par total del recorrido
 * @returns Resultado completo del equipo
 */
export function calcularScramble(
  team: ScrambleTeam,
  holes: Array<{ numero: number; par: number; stroke_index: number }>,
  parTotal: number
): ScrambleTeamResult {
  const teamHandicap = calcularHandicapScramble(team.handicaps)
  const sortedHoles = [...holes].sort((a, b) => a.numero - b.numero)

  let totalGross = 0
  let totalNeto = 0
  let totalStableford = 0
  let holesPlayed = 0

  const holeDetails: ScrambleHoleDetail[] = sortedHoles.map((hole) => {
    const key = String(hole.numero)
    const gross = team.scores[key]

    if (!gross || gross <= 0) {
      const strokes = strokesRecibidosEnHoyo(teamHandicap, hole.stroke_index)
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
    const strokes = strokesRecibidosEnHoyo(teamHandicap, hole.stroke_index)
    const neto = gross - strokes
    const stableford = puntosStablefordHoyo(gross, hole.par, teamHandicap, hole.stroke_index)

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
    overUnderGross: holesPlayed > 0 ? totalGross - parTotal : 0,
    overUnderNeto: holesPlayed > 0 ? totalNeto - parTotal : 0,
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
 * Ordena equipos scramble según formato y modo de juego.
 */
export function ordenarEquiposScramble(
  teams: ScrambleTeamResult[],
  formato: FormatoJuego,
  modo: ModoJuego
): ScrambleTeamResult[] {
  return [...teams].sort((a, b) => {
    const sa = scorePrimarioScramble(a, formato, modo)
    const sb = scorePrimarioScramble(b, formato, modo)
    if (formato === 'stableford') return sb - sa
    return sa - sb
  })
}
