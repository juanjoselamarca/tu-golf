// src/lib/data/tournaments/leaderboard.ts
//
// Capa de datos para la vista pública `/torneo/[slug]`. Centraliza todas
// las queries que antes vivían inline en page.tsx (917 LOC). Reglas:
// - SOLO acceso a datos: sin lógica de scoring, sin transformaciones de
//   reglas de golf. Eso vive en `src/golf/leaderboard/`.
// - Recibe el cliente Supabase ya creado por page.tsx (no lo importa el
//   módulo para mantenerlo trivialmente testeable en jsdom si hace falta).

import type {
  DBTournament,
  DBTournamentGroupRow,
  DBRondaLibreJugador,
  DBPlayer,
  DBWithdrawnPlayer,
  WithdrawnEntry,
} from '@/app/torneo/[slug]/types'
import type { CourseHole } from '@/golf/leaderboard/types'
import type { createClient } from '@/utils/supabase/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  resolverCourseData,
  resolverCourseHandicap,
  type CourseData,
} from '@/golf/core/course-handicap'

/** Cliente Supabase server-side. Atado al createClient real para que el
 *  tipo coincida 1:1 con lo que devuelve `createClient()` en page.tsx. */
type Client = Awaited<ReturnType<typeof createClient>>

const TOURNAMENT_SELECT =
  'id, name, slug, format, hole_count, total_rounds, modo_juego, formato_juego, ' +
  'date_start, date_end, status, codigo, afecta_estadisticas, es_demo, cover_image_url, ' +
  'courses(id, nombre, ciudad, par_total, slope_rating, course_rating)'

export async function fetchTournamentBySlug(
  supabase: Client,
  slug: string,
): Promise<DBTournament | null> {
  const { data } = await supabase
    .from('tournaments')
    .select(TOURNAMENT_SELECT)
    .eq('slug', slug)
    .single()
  return (data as unknown as DBTournament | null) ?? null
}

export async function fetchCourseHoles(
  supabase: Client,
  courseId: string,
): Promise<CourseHole[]> {
  const { data } = await supabase
    .from('course_holes')
    .select('numero, par, stroke_index')
    .eq('course_id', courseId)
  return (data as CourseHole[] | null) ?? []
}

/** Genera fallback par-4 / SI=índice cuando la cancha no tiene course_holes cargados. */
export function buildFallbackCourseHoles(totalHoyos: number): CourseHole[] {
  const holes: CourseHole[] = []
  for (let i = 1; i <= totalHoyos; i++) {
    holes.push({ numero: i, par: 4, stroke_index: i })
  }
  return holes
}

/**
 * Par total deduplicado por nº de hoyo, para el cálculo de course handicap.
 * Espeja cómo el scorer arma `finalParTotal` (`pm[numero] = par`): si una cancha
 * multi-recorrido (27/36h) trae filas repetidas de `course_holes`, sumarlas todas
 * inflaría el par y desincronizaría el course handicap del board vs la tarjeta.
 */
export function sumParDedupByHole(holes: CourseHole[]): number {
  const parByHole = new Map<number, number>()
  for (const h of holes) parByHole.set(h.numero, h.par)
  return Array.from(parByHole.values()).reduce((s, p) => s + p, 0)
}

export async function fetchTournamentGroups(
  supabase: Client,
  tournamentId: string,
): Promise<DBTournamentGroupRow[]> {
  const { data } = await supabase
    .from('tournament_groups')
    .select('id, ronda_libre_id, name, tee_time, sort_order, tournament_group_players(player_id)')
    .eq('tournament_id', tournamentId)
    .order('sort_order')
  return (data as unknown as DBTournamentGroupRow[] | null) ?? []
}

export async function fetchRondaLibreJugadores(
  supabase: Client,
  rondaIds: string[],
): Promise<DBRondaLibreJugador[]> {
  if (rondaIds.length === 0) return []
  const { data } = await supabase
    .from('ronda_libre_jugadores')
    .select('id, nombre, user_id, scores, handicap, tees, ronda_id')
    .in('ronda_id', rondaIds)
  return (data as unknown as DBRondaLibreJugador[] | null) ?? []
}

/**
 * Igual que `fetchRondaLibreJugadores` pero RESUELVE el `handicap` de cada jugador
 * de índice → COURSE HANDICAP por su tee, con los helpers canónicos
 * (`resolverCourseData` + `resolverCourseHandicap`) — los MISMOS que usa el scorer
 * en cancha (`getDotHcp` de score-grupo). Así el neto/stableford de la tabla pública
 * coincide EXACTO con la tarjeta del jugador en canchas reales (slope ≠ 113).
 *
 * Paridad con el scorer (y con `fetchBestBallTeams`, mismo patrón):
 *  - Resuelve por cada ronda su `course_id` / `holes` / `recorridos` (multi-loop
 *    27-36h) y el tee `j.tees || ronda.tees || 'azul'`.
 *  - Índice: `handicap` almacenado primero, luego `profiles.indice` (score-grupo:241).
 *  - `parTotal` = suma del par real de course_holes (lo pasa el caller), no la
 *    columna `courses.par_total`.
 *  - Cache de CourseData por `courseId|tee|holes`.
 *
 * El builder consume `j.handicap` tal cual, así que entregándolo ya como course
 * handicap el board queda correcto sin tocar el motor. Conserva `handicap_index`
 * (índice crudo) para el GWI. Sin cancha → `round(index)` (fallback del scorer).
 */
export async function fetchRondaLibreJugadoresConCourseHcp(
  supabase: Client,
  rondaIds: string[],
  parTotal: number,
): Promise<DBRondaLibreJugador[]> {
  const jugadores = await fetchRondaLibreJugadores(supabase, rondaIds)
  if (jugadores.length === 0) return jugadores

  // Datos por ronda (course_id / holes / recorridos / tee por defecto).
  const { data: rondas } = await supabase
    .from('rondas_libres')
    .select('id, course_id, holes, recorridos, tees')
    .in('id', rondaIds)
  const rondaById = new Map((rondas ?? []).map((r) => [r.id as string, r]))

  // Índice WHS vivo: fallback cuando el handicap almacenado en la ronda es null.
  const userIds = Array.from(new Set(jugadores.map((j) => j.user_id).filter((x): x is string => !!x)))
  const { data: profs } = userIds.length
    ? await supabase.from('profiles').select('id, indice').in('id', userIds)
    : { data: [] as Array<{ id: string; indice: number | null }> }
  const indiceByUser = new Map((profs ?? []).map((p) => [p.id, p.indice ?? 0]))

  const cache = new Map<string, CourseData | null>()
  const out: DBRondaLibreJugador[] = []
  for (const j of jugadores) {
    // Índice crudo: handicap almacenado primero, luego profiles.indice (= scorer).
    const index = j.handicap != null
      ? j.handicap
      : (j.user_id && indiceByUser.has(j.user_id) ? (indiceByUser.get(j.user_id) as number) : 0)

    const ronda = rondaById.get(j.ronda_id)
    const courseId = (ronda?.course_id as string | null) ?? null
    let courseData: CourseData | null = null
    if (courseId) {
      const holesN = (ronda?.holes as number | null) ?? 18
      const recorridos = (ronda?.recorridos as string[] | null) ?? null
      const tee = (j.tees || (ronda?.tees as string | null) || 'azul').toLowerCase()
      const key = `${courseId}|${tee}|${holesN}`
      if (!cache.has(key)) {
        cache.set(
          key,
          await resolverCourseData(supabase as unknown as SupabaseClient, courseId, tee, holesN, parTotal, recorridos),
        )
      }
      courseData = cache.get(key) ?? null
    }
    out.push({ ...j, handicap_index: index, handicap: resolverCourseHandicap(index, courseData) })
  }
  return out
}

const LEGACY_PLAYER_SELECT =
  'id, handicap_at_registration, player_name, ' +
  'profiles(name, indice), categories(name), ' +
  'rounds(id, status, total_gross, total_net, total_points, round_number, ' +
  'hole_scores(hole_number, gross_score))'

export async function fetchLegacyPlayers(
  supabase: Client,
  tournamentId: string,
): Promise<DBPlayer[]> {
  const { data } = await supabase
    .from('players')
    .select(LEGACY_PLAYER_SELECT)
    .eq('tournament_id', tournamentId)
    .in('status', ['pending', 'approved', 'waitlist'])
  return (data as unknown as DBPlayer[] | null) ?? []
}

/**
 * Jugadores en estado withdrawn/disqualified — aparecen en el footer del
 * leaderboard con badge WD/DQ (transparencia USGA: mantienen scores en BD
 * pero no compiten por posición).
 */
export async function fetchWithdrawnPlayers(
  supabase: Client,
  tournamentId: string,
): Promise<WithdrawnEntry[]> {
  const { data } = await supabase
    .from('players')
    .select('status, status_reason, player_name, profiles(name)')
    .eq('tournament_id', tournamentId)
    .in('status', ['withdrawn', 'disqualified'])

  const raw = (data as unknown as DBWithdrawnPlayer[] | null) ?? []
  const out: WithdrawnEntry[] = []
  for (const p of raw) {
    const displayName = p.profiles?.name ?? p.player_name
    if (displayName) {
      out.push({ name: displayName, status: p.status, reason: p.status_reason })
    }
  }
  return out
}
