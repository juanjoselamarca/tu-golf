import type { SupabaseClient } from '@supabase/supabase-js'
import type { ScrambleTeam, BestBallTeam } from '@/golf/formats'
import {
  resolverCourseData,
  resolverCourseHandicap,
  type CourseData,
} from '@/golf/core/course-handicap'

export interface ScrambleTeamsResult {
  teams: ScrambleTeam[]
  /** Nombres de los jugadores por teamId (columna "Jugadores" del leaderboard). */
  memberNames: Record<string, string[]>
}

export interface BestBallTeamsResult {
  teams: BestBallTeam[]
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
    const storedHcp = eq.handicap_equipo as number | null
    teams.push({
      id,
      nombre: eq.nombre as string,
      handicaps,
      scores: (eq.scores as Record<string, number>) ?? {},
      // Usa el handicap de equipo que aplicó el scorer (consistencia con la
      // tarjeta en cancha). Si no está almacenado, el motor recalcula.
      teamHandicap: storedHcp ?? undefined,
    })
    memberNames[id] = members.map((m) => {
      const j = rljById.get(m.jugador_id)
      return (j?.nombre as string | undefined) || '?'
    })
  }

  return { teams, memberNames }
}

/**
 * Devuelve los equipos best_ball de un torneo listos para
 * computeBestBallStandings. A diferencia de scramble/foursome (score COMPARTIDO
 * en `ronda_equipos.scores`), best_ball lee los scores INDIVIDUALES de cada
 * jugador desde `ronda_libre_jugadores.scores`; el motor toma la mejor bola neta
 * por hoyo.
 *
 * PARIDAD CON EL SCORER (CERO FALLOS): el neto del leaderboard debe coincidir
 * exacto con la tarjeta en cancha (BestBallTeamCard). Para lograrlo:
 *  - El handicap que alimenta `strokesRecibidosEnHoyo` es el COURSE HANDICAP por
 *    jugador (no el índice), vía `resolverCourseData` + `resolverCourseHandicap`
 *    — la MISMA función que usa el scorer (`getDotHcp` → cargarCourseData).
 *  - La precedencia del índice es idéntica a score-grupo:241 → `ronda_libre_jugadores.handicap`
 *    (snapshot al iniciar) PRIMERO, `profiles.indice` como fallback. Así un cambio
 *    de índice WHS a mitad de torneo no desincroniza tarjeta vs board.
 *  - `parTotal` es la suma del par real de `course_holes` (lo que usa el scorer),
 *    no `courses.par_total`.
 *
 * @param parTotal - par total derivado de course_holes (sum), para el course handicap.
 */
export async function fetchBestBallTeams(
  supabase: SupabaseClient,
  tournamentId: string,
  parTotal: number,
): Promise<BestBallTeamsResult> {
  const empty: BestBallTeamsResult = { teams: [], memberNames: {} }

  // 1) Grupos del torneo con su ronda_libre.
  const { data: groups, error: gErr } = await supabase
    .from('tournament_groups')
    .select('id, name, ronda_libre_id')
    .eq('tournament_id', tournamentId)
  if (gErr || !groups) return empty

  const rondaIds = groups.map((g) => g.ronda_libre_id).filter((x): x is string => !!x)
  if (rondaIds.length === 0) return empty

  // 2) Rondas: course_id / holes / recorridos / tee por defecto (para el course handicap).
  const { data: rondas } = await supabase
    .from('rondas_libres')
    .select('id, course_id, holes, recorridos, tees')
    .in('id', rondaIds)
  const rondaById = new Map((rondas ?? []).map((r) => [r.id as string, r]))

  // 3) Equipos (ronda_equipos) → membresía. En best_ball `scores`/`handicap_equipo` no se usan.
  const { data: eqRows, error: eErr } = await supabase
    .from('ronda_equipos')
    .select('id, nombre, ronda_id, ronda_equipo_jugadores(jugador_id, orden)')
    .in('ronda_id', rondaIds)
  if (eErr || !eqRows || eqRows.length === 0) return empty

  // 4) Jugadores de la ronda: scores individuales + tee + índice almacenado.
  const { data: rlj } = await supabase
    .from('ronda_libre_jugadores')
    .select('id, user_id, handicap, nombre, scores, tees, ronda_id')
    .in('ronda_id', rondaIds)
  const rljById = new Map((rlj ?? []).map((j) => [j.id as string, j]))

  // 5) Índice WHS vivo (fallback cuando no hay handicap almacenado en la ronda).
  const userIds = Array.from(
    new Set((rlj ?? []).map((j) => j.user_id).filter((x): x is string => !!x)),
  )
  const { data: profs } = userIds.length
    ? await supabase.from('profiles').select('id, indice').in('id', userIds)
    : { data: [] as Array<{ id: string; indice: number | null }> }
  const indiceByUser = new Map((profs ?? []).map((p) => [p.id, p.indice ?? 0]))

  // 6) Course handicap por jugador, cacheado por (course_id|tee|holes) — mismas
  //    claves que el scorer, mismo resolverCourseData → mismo resultado.
  const courseDataCache = new Map<string, CourseData | null>()
  async function courseHandicapFor(
    rondaId: string,
    playerTee: string | null,
    index: number,
  ): Promise<number> {
    const ronda = rondaById.get(rondaId)
    const courseId = (ronda?.course_id as string | null) ?? null
    const holesN = (ronda?.holes as number | null) ?? 18
    const recorridos = (ronda?.recorridos as string[] | null) ?? null
    const teeNorm = (playerTee || (ronda?.tees as string | null) || 'azul').toLowerCase()
    const key = `${courseId}|${teeNorm}|${holesN}`
    if (!courseDataCache.has(key)) {
      courseDataCache.set(
        key,
        await resolverCourseData(supabase, courseId, teeNorm, holesN, parTotal, recorridos),
      )
    }
    return resolverCourseHandicap(index, courseDataCache.get(key) ?? null)
  }

  const teams: BestBallTeam[] = []
  const memberNames: Record<string, string[]> = {}

  for (const eq of eqRows) {
    const members = ((eq.ronda_equipo_jugadores ?? []) as Array<{ jugador_id: string; orden: number }>)
      .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))

    const jugadores: BestBallTeam['jugadores'] = []
    for (const m of members) {
      const j = rljById.get(m.jugador_id)
      if (!j) continue
      // Precedencia idéntica al scorer (score-grupo:241): handicap almacenado primero.
      const stored = j.handicap as number | null
      const index = stored != null
        ? stored
        : (j.user_id && indiceByUser.has(j.user_id) ? (indiceByUser.get(j.user_id) as number) : 0)
      const courseHcp = await courseHandicapFor(
        j.ronda_id as string,
        (j.tees as string | null) ?? null,
        index,
      )
      jugadores.push({
        id: j.id as string,
        nombre: (j.nombre as string | undefined) || '?',
        // El motor pasa este valor a strokesRecibidosEnHoyo → debe ser el course
        // handicap (golpes que recibe), NO el índice. Ver BestBallPlayer.handicapIndex.
        handicapIndex: courseHcp,
        scores: (j.scores as Record<string, number>) ?? {},
      })
    }
    if (jugadores.length === 0) continue

    const id = eq.id as string
    teams.push({ id, nombre: eq.nombre as string, jugadores })
    memberNames[id] = jugadores.map((p) => p.nombre)
  }

  return { teams, memberNames }
}
