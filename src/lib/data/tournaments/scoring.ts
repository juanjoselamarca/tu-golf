// src/lib/data/tournaments/scoring.ts
//
// Capa de datos del scorer del organizador (`/organizador/[slug]/scoring`).
// La pantalla es un client component → cliente de NAVEGADOR (mismo patrón que
// `tvBoard.ts`). Reglas:
//  - SOLO acceso a datos. La lógica de golf vive en `src/golf/`.
//  - Los errores se PROPAGAN: "no hay jugadores" y "no pude preguntar" no son
//    lo mismo (misma política que `fetchTournamentBySlug`). Antes la página
//    tragaba el error y mostraba "Sin jugadores inscritos" — mentira con la que
//    ya nos quemamos una vez (embed `categories(default_tee_color)` → 400 →
//    pantalla vacía).

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DBPlayer } from '@/app/torneo/[slug]/types'
import type { CourseHole, LegacyHcpContext, RoundLeaderboardContext } from '@/golf/leaderboard/types'
import type { ModoJuego, FormatoJuego } from '@/golf/core/rules'
import { COURSE_TEE_COLUMNS, type CourseTeeRow } from '@/golf/courses/resolve-player-tee'
import type { CourseVariantRow } from '@/golf/courses/gender-variant'
import { COURSE_VARIANT_COLUMNS, getTeesWithGenderVariants } from '../course-tees'
import {
  fetchLegacyHcpContext,
  fetchRoundContexts,
  LEGACY_PLAYER_SELECT,
  type Client,
  type TournamentForRoundContexts,
} from './leaderboard'

export interface ScoringRound {
  id: string
  status: string
  total_gross: number
  total_net: number
  total_points: number
  round_number: number
}

export interface ScoringPlayer {
  id: string
  handicap_at_registration: number | null
  tee_id: string | null
  /** Eslabón "category" del fallback de tee (`resolvePlayerTee`) + género de la categoría. */
  categories: { default_tee_color: string | null; gender: string | null } | null
  /** user_id del jugador registrado. null para invitados. */
  user_id: string | null
  /** pending_user_id del invitado. null para registrados. */
  pending_user_id: string | null
  /** Nombre directo del invitado (tabla players). null para registrados. */
  player_name: string | null
  /** `genero` ('M'|'F'): elige el tee de la fila VARONES o DAMAS. */
  profiles: { name: string; genero: string | null } | null
  rounds: ScoringRound[]
}

/** Ratings de una cancha como los consume el gate de handicap del scorer. */
export interface ScoringCourse {
  id: string
  nombre: string
  par_total: number
  slope_rating: number
  course_rating: number
}

export interface ScoringTournament {
  id: string
  name: string
  slug: string
  /** Cancha de la RONDA 1. Las rondas 2..N pueden jugarse en otra
   *  (`tournament_rounds`); `useScoringData` resuelve la de la ronda activa. */
  course_id: string | null
  date_start: string | null
  /** Columna legacy — el write-path del scorer la sigue leyendo. */
  format: string
  /** Las columnas que consume el BOARD (`/torneo`). El Resumen las necesita
   *  para armar el MISMO contexto que la vista pública. */
  modo_juego: ModoJuego | null
  formato_juego: FormatoJuego | null
  hole_count: number
  total_rounds: number
  tees: string | null
  hcp_calc_mode: string | null
  /** Los torneos demo son spectator-only: el scorer del jugador redirige al board. */
  es_demo: boolean | null
  courses: ScoringCourse | null
}

export interface HoleScoreRow {
  hole_number: number
  gross_score: number | null
  putts: number | null
  fairway_hit: boolean | null
  gir: boolean | null
}

/** Columnas de `courses` del scorer. Fuente única: la ronda 1 (embed) y las
 *  rondas 2..N (`fetchScoringCourse`) tienen que traer lo mismo. */
const SCORING_COURSE_COLUMNS = 'id, nombre, par_total, slope_rating, course_rating'

const SCORING_TOURNAMENT_SELECT =
  'id, name, slug, format, modo_juego, formato_juego, hole_count, total_rounds, ' +
  `course_id, date_start, tees, hcp_calc_mode, es_demo, courses(${SCORING_COURSE_COLUMNS})`

// `categories(default_tee_color)`: eslabón "category" del fallback de tee.
// Hasta la migración 20260925 la columna no existía en prod y este embed
// devolvía 400 (pantalla vacía) — por eso estuvo fuera del SELECT.
const SCORING_ROSTER_SELECT =
  'id, handicap_at_registration, tee_id, user_id, pending_user_id, player_name, profiles(name, genero), ' +
  'categories(default_tee_color, gender), ' +
  'rounds(id, status, total_gross, total_net, total_points, round_number)'

export async function fetchScoringTournament(
  supabase: SupabaseClient,
  slug: string,
): Promise<ScoringTournament | null> {
  const { data, error } = await supabase
    .from('tournaments')
    .select(SCORING_TOURNAMENT_SELECT)
    .eq('slug', slug)
    .single()

  // PGRST116 = 0 filas → null legítimo. Cualquier otro error se propaga: un blip
  // de red durante un torneo en vivo no puede volverse "Torneo no encontrado".
  if (error && error.code !== 'PGRST116') throw error
  return (data as unknown as ScoringTournament | null) ?? null
}

/** Roster COMPLETO del scorer (todos los status, orden de inscripción). Es la
 *  lista operativa del organizador; el board del Resumen usa su propio fetch
 *  (`fetchResumenBoardInputs`) con el MISMO filtro que la vista pública. */
export async function fetchScoringRoster(
  supabase: SupabaseClient,
  tournamentId: string,
): Promise<ScoringPlayer[]> {
  const { data, error } = await supabase
    .from('players')
    .select(SCORING_ROSTER_SELECT)
    .eq('tournament_id', tournamentId)
    .order('created_at')
  if (error) throw error
  return (data as unknown as ScoringPlayer[] | null) ?? []
}

/** Catálogo de la cancha: hoyos + tees, en paralelo. Las columnas de tee salen
 *  de `COURSE_TEE_COLUMNS` — si el scorer y el board pidieran listas distintas,
 *  calcularían el course handicap con datos distintos. Los tees traen además
 *  los de la variante de género de la cancha (fila DAMAS/VARONES hermana),
 *  igual que el board: es lo que permite elegir el tee del género del jugador. */
export async function fetchScoringCourseContext(
  supabase: SupabaseClient,
  courseId: string,
): Promise<{ holes: CourseHole[]; tees: CourseTeeRow[] }> {
  const [holesRes, teesRes, courseRes] = await Promise.all([
    supabase
      .from('course_holes')
      .select('numero, par, stroke_index')
      .eq('course_id', courseId)
      .order('numero'),
    supabase.from('course_tees').select(COURSE_TEE_COLUMNS).eq('course_id', courseId),
    supabase.from('courses').select(COURSE_VARIANT_COLUMNS).eq('id', courseId).maybeSingle(),
  ])
  if (holesRes.error) throw holesRes.error
  if (teesRes.error) throw teesRes.error
  if (courseRes.error) throw courseRes.error
  const own = (teesRes.data as unknown as CourseTeeRow[] | null) ?? []
  const course = courseRes.data as unknown as CourseVariantRow | null
  return {
    holes: (holesRes.data as CourseHole[] | null) ?? [],
    tees: course ? await getTeesWithGenderVariants(supabase, course, own) : own,
  }
}

/**
 * Ratings de una cancha que NO es la de la ronda 1 (rondas 2..N en otra
 * cancha). Mismas columnas que el embed del torneo. `null` si no existe.
 */
export async function fetchScoringCourse(
  supabase: SupabaseClient,
  courseId: string,
): Promise<ScoringCourse | null> {
  const { data, error } = await supabase
    .from('courses')
    .select(SCORING_COURSE_COLUMNS)
    .eq('id', courseId)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as ScoringCourse | null) ?? null
}

export async function fetchRoundHoleScores(
  supabase: SupabaseClient,
  roundId: string,
): Promise<HoleScoreRow[]> {
  const { data, error } = await supabase
    .from('hole_scores')
    .select('hole_number, gross_score, putts, fairway_hit, gir')
    .eq('round_id', roundId)
    .not('gross_score', 'is', null)
  if (error) throw error
  return (data as HoleScoreRow[] | null) ?? []
}

/** Cuenta de hoyos con score para múltiples rondas (batch).
 *  Devuelve Map<round_id, filledHoleCount>. Una sola query. */
export async function fetchBulkRoundHoleCounts(
  supabase: SupabaseClient,
  roundIds: string[],
): Promise<Map<string, number>> {
  if (roundIds.length === 0) return new Map()
  const { data, error } = await supabase
    .from('hole_scores')
    .select('round_id, hole_number')
    .in('round_id', roundIds)
    .not('gross_score', 'is', null)
  if (error) throw error
  const counts = new Map<string, number>()
  for (const row of data ?? []) {
    counts.set(row.round_id, (counts.get(row.round_id) ?? 0) + 1)
  }
  return counts
}

/** Totales denormalizados de la ronda (para refrescar la ficha tras un save).
 *  Sólo UI del scorer: el Resumen NO los consume — deriva del motor. */
export async function fetchRoundTotals(
  supabase: SupabaseClient,
  roundId: string,
): Promise<Pick<ScoringRound, 'total_gross' | 'total_net' | 'total_points'> | null> {
  const { data, error } = await supabase
    .from('rounds')
    .select('total_gross, total_net, total_points')
    .eq('id', roundId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  return (data as Pick<ScoringRound, 'total_gross' | 'total_net' | 'total_points'> | null) ?? null
}

export async function updatePlayerHandicap(
  supabase: SupabaseClient,
  playerId: string,
  value: number,
): Promise<void> {
  const { error } = await supabase
    .from('players')
    .update({ handicap_at_registration: value })
    .eq('id', playerId)
  if (error) throw error
}

/**
 * Inputs del board del Resumen — los MISMOS que consume la vista pública.
 *
 * `LEGACY_PLAYER_SELECT` (incluye `hole_scores`) + el filtro de status del board
 * + `fetchLegacyHcpContext`: idéntico a lo que arman `/torneo`, `/tv` y
 * `/en-vivo` antes de llamar a `buildLeaderboardFromLegacy`. Si el Resumen
 * armara su propia query, volveríamos al bug que este módulo cierra: el
 * organizador viendo números distintos a los del board público del MISMO torneo.
 *
 * El cast a `Client` es sólo de tipos (mismo patrón que `tvBoard.ts`):
 * `fetchLegacyHcpContext` está tipado contra el cliente de servidor, pero la
 * query es idéntica desde el navegador.
 */
export async function fetchResumenBoardInputs(
  supabase: SupabaseClient,
  tournament: TournamentForRoundContexts,
): Promise<{ dbPlayers: DBPlayer[]; hcp: LegacyHcpContext; rounds: Map<number, RoundLeaderboardContext> }> {
  const [playersRes, hcp, rounds] = await Promise.all([
    supabase
      .from('players')
      .select(LEGACY_PLAYER_SELECT)
      .eq('tournament_id', tournament.id)
      .in('status', ['pending', 'approved', 'waitlist']),
    fetchLegacyHcpContext(supabase as unknown as Client, tournament.id),
    // Rondas en otra cancha que la 1: el Resumen puntúa cada ronda con SU
    // cancha, igual que el board público.
    fetchRoundContexts(supabase as unknown as Client, tournament),
  ])
  if (playersRes.error) throw playersRes.error
  return {
    dbPlayers: ((playersRes.data ?? []) as unknown) as DBPlayer[],
    hcp,
    rounds,
  }
}
