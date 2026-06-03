import {
  calcularScramble, ordenarEquiposScramble,
  calcularFoursome, ordenarEquiposFoursome,
} from '@/golf/formats'
import type { ScrambleTeam, ScrambleTeamResult, FoursomeTeamResult } from '@/golf/formats'
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
      },
      holes,
      parTotal,
    )
  })
  return ordenarEquiposFoursome(results, formato, modo)
}
