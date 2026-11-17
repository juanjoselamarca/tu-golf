// Filtros del torneo en vivo (categoría, grupo de salida, "Solo mi grupo") y las
// posiciones dentro de la competencia. Extraído de LiveView para testearlo.

import type { LivePlayer, LiveTeam, LiveMatch } from './types'
import { posicionesDeEquipos, posicionesDeJugadores, type PosicionesPorId } from './posiciones-en-vivo'

export type ExtendedPlayer = LivePlayer & {
  group_id?: string | null
  category_id?: string | null
}
export type ExtendedTeam = LiveTeam & {
  group_id?: string | null
  category_id?: string | null
}
export type ExtendedMatch = LiveMatch & {
  category_id?: string | null
}

export interface PlayerFilters {
  categoryFilter: string | null
  groupFilter: string | null
  myViewEnabled: boolean
  userId?: string
}

export function applyFilters(players: ExtendedPlayer[], f: PlayerFilters): ExtendedPlayer[] {
  let out = players
  if (f.categoryFilter) {
    out = out.filter((p) => p.category_id === f.categoryFilter)
  }
  if (f.groupFilter) {
    out = out.filter((p) => p.group_id === f.groupFilter)
  }
  if (f.myViewEnabled && f.userId) {
    const me = players.find((p) => p.id === f.userId)
    if (me?.group_id) {
      out = out.filter((p) => p.group_id === me.group_id)
    }
  }
  return out
}

export function applyFiltersTeams(
  teams: ExtendedTeam[],
  f: { categoryFilter: string | null; groupFilter: string | null }
): ExtendedTeam[] {
  let out = teams
  if (f.categoryFilter) out = out.filter((t) => t.category_id === f.categoryFilter)
  if (f.groupFilter) out = out.filter((t) => t.group_id === f.groupFilter)
  return out
}

export function applyFiltersMatches(
  matches: ExtendedMatch[],
  f: { categoryFilter: string | null }
): ExtendedMatch[] {
  if (!f.categoryFilter) return matches
  return matches.filter((m) => m.category_id === f.categoryFilter)
}


/**
 * Posiciones de jugadores dentro de la competencia: solo la categoría cambia el field.
 * El grupo de salida y "Solo mi grupo" son filtros de vista: mi compañero T12 sigue T12.
 */
export function posicionesDeLaCompetencia(
  players: ExtendedPlayer[],
  categoryFilter: string | null,
  stableford: boolean,
): PosicionesPorId {
  return posicionesDeJugadores(applyFilters(players, { categoryFilter, groupFilter: null, myViewEnabled: false }), stableford)
}

/** Igual que `posicionesDeLaCompetencia`, para equipos. */
export function posicionesDeEquiposEnLaCompetencia(teams: ExtendedTeam[], categoryFilter: string | null): PosicionesPorId {
  return posicionesDeEquipos(applyFiltersTeams(teams, { categoryFilter, groupFilter: null }))
}

/**
 * El pie (WD/DQ, #813) con los MISMOS filtros que la tabla: con un filtro de
 * grupo o "Solo mi grupo" se ve sólo el pie de ese grupo. Con un filtro activo,
 * la fila cuyo grupo no se conoce (legacy, equipos) no se muestra: la tabla de
 * arriba es sólo ese subconjunto. `players` es la tabla SIN filtrar (para ubicar
 * el grupo del visor, como `applyFilters`).
 */
export function applyFiltersFuera<T extends { group_id?: string | null }>(
  fuera: T[],
  players: ExtendedPlayer[],
  f: PlayerFilters,
): T[] {
  let out = fuera
  if (f.categoryFilter) out = []
  if (f.groupFilter) out = out.filter((w) => w.group_id === f.groupFilter)
  if (f.myViewEnabled && f.userId) {
    const me = players.find((p) => p.id === f.userId)
    if (me?.group_id) out = out.filter((w) => w.group_id === me.group_id)
  }
  return out
}
