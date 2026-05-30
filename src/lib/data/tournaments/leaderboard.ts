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

/** Cliente Supabase server-side. Atado al createClient real para que el
 *  tipo coincida 1:1 con lo que devuelve `createClient()` en page.tsx. */
type Client = Awaited<ReturnType<typeof createClient>>

const TOURNAMENT_SELECT =
  'id, name, slug, format, hole_count, total_rounds, modo_juego, formato_juego, ' +
  'date_start, status, codigo, afecta_estadisticas, es_demo, cover_image_url, ' +
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
    .select('id, nombre, user_id, scores, handicap, ronda_id')
    .in('ronda_id', rondaIds)
  return (data as unknown as DBRondaLibreJugador[] | null) ?? []
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
