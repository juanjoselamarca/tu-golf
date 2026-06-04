import {
  calcularScramble, ordenarEquiposScramble,
  calcularFoursome, ordenarEquiposFoursome,
  calcularBestBall, ordenarEquiposBestBall,
} from '@/golf/formats'
import type {
  ScrambleTeam, ScrambleTeamResult, FoursomeTeamResult,
  BestBallTeam, BestBallTeamResult,
} from '@/golf/formats'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'

/**
 * Compone el motor de scramble en standings ordenados de equipos.
 * Pura y defensiva: un equipo sin scores devuelve holesPlayed 0 sin crashear.
 */
export function computeScrambleStandings(
  teams: ScrambleTeam[],
  holes: Array<{ numero: number; par: number; stroke_index: number }>,
  parTotal: number,
  formato: FormatoJuego,
  modo: ModoJuego,
): ScrambleTeamResult[] {
  const results = teams.map((t) => calcularScramble(t, holes, parTotal))
  return ordenarEquiposScramble(results, formato, modo)
}

/**
 * Compone el motor de foursome en standings ordenados de equipos.
 *
 * Reusa los `ScrambleTeam` genéricos que devuelve `fetchScrambleTeams`
 * (id/nombre/handicaps/scores) y los mapea a `FoursomeTeam`: handicapA/B son los
 * dos primeros índices del equipo, nombreA/B salen de `memberNames` (sólo
 * afectan el detalle de quién sale en cada hoyo, no el total del board). El
 * handicap de equipo lo recalcula `calcularFoursome` ((A+B)/2), idéntico al
 * `handicap_equipo` almacenado (mismo helper canónico tras el de-dup del create
 * route / productor), así que el neto del board cuadra con la tarjeta en cancha.
 *
 * Pura y defensiva: un equipo sin scores devuelve holesPlayed 0 sin crashear.
 */
export function computeFoursomeStandings(
  teams: ScrambleTeam[],
  memberNames: Record<string, string[]>,
  holes: Array<{ numero: number; par: number; stroke_index: number }>,
  parTotal: number,
  formato: FormatoJuego,
  modo: ModoJuego,
): FoursomeTeamResult[] {
  const results = teams.map((t) => {
    const names = memberNames[t.id] ?? []
    return calcularFoursome(
      {
        id: t.id,
        nombre: t.nombre,
        handicapA: t.handicaps[0] ?? 0,
        handicapB: t.handicaps[1] ?? 0,
        nombreA: names[0] ?? '',
        nombreB: names[1] ?? '',
        scores: t.scores,
        // Override con el handicap almacenado (paridad con scramble): el board
        // usa el mismo valor congelado que aplicó la tarjeta en cancha, así no
        // divergen si el índice de un jugador cambia mid-torneo.
        teamHandicap: t.teamHandicap,
      },
      holes,
      parTotal,
    )
  })
  return ordenarEquiposFoursome(results, formato, modo)
}

/**
 * Compone el motor de best_ball en standings ordenados de equipos.
 *
 * A diferencia de scramble/foursome (un score COMPARTIDO por equipo), best_ball
 * recibe `BestBallTeam` con los scores INDIVIDUALES de cada jugador y su course
 * handicap (ver `fetchBestBallTeams`). El motor toma la mejor bola neta (o gross)
 * por hoyo y suma. El neto coincide con la tarjeta en cancha (`calcBestBallTotals`)
 * porque ambos usan `strokesRecibidosEnHoyo` con el mismo course handicap.
 *
 * `formato` enruta el desempate en `scorePrimarioBestBall`: como el scorer de
 * best_ball sólo hace gross/neto (no stableford), pasamos el formato del torneo
 * (`'best_ball'`, ≠ `'stableford'`) y el orden cae a overUnder por `modo`.
 *
 * Pura y defensiva: un equipo sin scores devuelve holesPlayed 0 sin crashear.
 */
export function computeBestBallStandings(
  teams: BestBallTeam[],
  holes: Array<{ numero: number; par: number; stroke_index: number }>,
  parTotal: number,
  formato: FormatoJuego,
  modo: ModoJuego,
): BestBallTeamResult[] {
  const results = teams.map((t) => calcularBestBall(t, holes, parTotal))
  return ordenarEquiposBestBall(results, formato, modo)
}
