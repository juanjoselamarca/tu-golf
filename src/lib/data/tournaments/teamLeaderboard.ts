import type { SupabaseClient } from '@supabase/supabase-js'
import type { ScrambleTeam } from '@/golf/formats'

export interface ScrambleTeamsResult {
  teams: ScrambleTeam[]
  /** Nombres de los jugadores por teamId (columna "Jugadores" del leaderboard). */
  memberNames: Record<string, string[]>
}

/**
 * Devuelve los equipos (grupo=equipo) de un torneo listos para
 * computeScrambleStandings. Lee el score compartido desde `ronda_equipos`.
 * Omite grupos sin ronda iniciada. Defensivo: si no hay equipos, devuelve vacío.
 *
 * Path: tournament_groups → ronda_libre_id → ronda_equipos (+ miembros) +
 * índices de los jugadores (profiles.indice, fallback ronda_libre_jugadores.handicap).
 */
export async function fetchScrambleTeams(
  supabase: SupabaseClient,
  tournamentId: string,
): Promise<ScrambleTeamsResult> {
  const empty: ScrambleTeamsResult = { teams: [], memberNames: {} }

  // 1) Grupos del torneo con su ronda_libre.
  const { data: groups, error: gErr } = await supabase
    .from('tournament_groups')
    .select('id, name, ronda_libre_id')
    .eq('tournament_id', tournamentId)
  if (gErr || !groups) return empty

  const rondaIds = groups.map((g) => g.ronda_libre_id).filter((x): x is string => !!x)
  if (rondaIds.length === 0) return empty

  // 2) Equipos (ronda_equipos) de esas rondas + miembros.
  const { data: eqRows, error: eErr } = await supabase
    .from('ronda_equipos')
    .select('id, nombre, handicap_equipo, scores, ronda_id, ronda_equipo_jugadores(jugador_id, orden)')
    .in('ronda_id', rondaIds)
  if (eErr || !eqRows || eqRows.length === 0) return empty

  // 3) Jugadores de la ronda (nombre + índice).
  const { data: rlj } = await supabase
    .from('ronda_libre_jugadores')
    .select('id, user_id, handicap, nombre')
    .in('ronda_id', rondaIds)
  const rljById = new Map((rlj ?? []).map((j) => [j.id as string, j]))

  const userIds = Array.from(
    new Set((rlj ?? []).map((j) => j.user_id).filter((x): x is string => !!x)),
  )
  const { data: profs } = userIds.length
    ? await supabase.from('profiles').select('id, indice').in('id', userIds)
    : { data: [] as Array<{ id: string; indice: number | null }> }
  const indiceByUser = new Map((profs ?? []).map((p) => [p.id, p.indice ?? 0]))

  // 4) Map a ScrambleTeam + nombres.
  const teams: ScrambleTeam[] = []
  const memberNames: Record<string, string[]> = {}

  for (const eq of eqRows) {
    const members = ((eq.ronda_equipo_jugadores ?? []) as Array<{ jugador_id: string; orden: number }>)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
    const handicaps = members.map((m) => {
      const j = rljById.get(m.jugador_id)
      if (!j) return 0
      if (j.user_id && indiceByUser.has(j.user_id)) return indiceByUser.get(j.user_id) as number
      return (j.handicap as number | null) ?? 0
    })
    const id = eq.id as string
    teams.push({
      id,
      nombre: eq.nombre as string,
      handicaps,
      scores: (eq.scores as Record<string, number>) ?? {},
    })
    memberNames[id] = members.map((m) => {
      const j = rljById.get(m.jugador_id)
      return (j?.nombre as string | undefined) || '?'
    })
  }

  return { teams, memberNames }
}
