// src/lib/data/tournaments/tvBoard.ts
//
// Capa de datos del modo TV (`/torneo/[slug]/tv`). La pantalla es un client
// component que repolea cada 30s, así que necesita un cliente de navegador —
// por eso no puede reusar los helpers de `leaderboard.ts`, tipados contra el
// cliente de servidor. Lo que SÍ comparte es el motor: el TV no calcula nada,
// sólo pinta lo que devuelve `buildLeaderboardFromLegacy`.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { DBPlayer } from '@/app/torneo/[slug]/types'
import type { CourseHole, LegacyHcpContext } from '@/golf/leaderboard/types'
import type { ModoJuego, FormatoJuego } from '@/golf/core/rules'
import { captureError } from '@/lib/error-tracking'
import { fetchLegacyHcpContext, type Client } from './leaderboard'

export interface TVWithdrawnEntry {
  name: string
  status: 'withdrawn' | 'disqualified'
  reason: string | null
}

export interface TVTournamentInfo {
  id: string
  name: string
  course_name: string
  par_total: number
  date_start: string | null
  total_rounds: number
  hole_count: number
  modo_juego: ModoJuego
  formato_juego: FormatoJuego
}

export interface TVBoardData {
  tournament: TVTournamentInfo
  dbPlayers: DBPlayer[]
  courseHoles: CourseHole[]
  withdrawn: TVWithdrawnEntry[]
  /** Contexto para el course handicap por jugador — el TV pinta el MISMO neto
   *  que /torneo y que la tarjeta en cancha, no uno propio. */
  hcp: LegacyHcpContext
}

const TV_PLAYER_SELECT =
  'id, handicap_at_registration, player_name, category_id, tee_id, ' +
  'profiles(name, indice), categories(name), ' +
  'rounds(id, status, total_gross, total_net, total_points, round_number, ' +
  'hole_scores(hole_number, gross_score))'

interface TVTournamentRow {
  id: string
  name: string
  date_start: string | null
  total_rounds: number | null
  hole_count: number | null
  course_id: string | null
  modo_juego: string | null
  formato_juego: string | null
  format: string | null
  courses: { nombre: string | null; par_total: number | null } | null
}

interface TVWithdrawnRow {
  status: 'withdrawn' | 'disqualified'
  status_reason: string | null
  player_name: string | null
  profiles: { name: string } | null
}

/** Devuelve todo lo que el TV necesita, o null si el torneo no existe. */
export async function fetchTVBoardData(
  supabase: SupabaseClient,
  slug: string,
): Promise<TVBoardData | null> {
  const { data: rawT } = await supabase
    .from('tournaments')
    .select(
      'id, name, date_start, total_rounds, hole_count, course_id, modo_juego, formato_juego, format, ' +
        'courses(nombre, par_total)',
    )
    .eq('slug', slug)
    .single()

  if (!rawT) return null
  const t = rawT as unknown as TVTournamentRow

  const [playersRes, withdrawnRes, holesRes, hcp] = await Promise.all([
    supabase
      .from('players')
      .select(TV_PLAYER_SELECT)
      .eq('tournament_id', t.id)
      .in('status', ['pending', 'approved', 'waitlist']),
    supabase
      .from('players')
      .select('status, status_reason, player_name, profiles(name)')
      .eq('tournament_id', t.id)
      .in('status', ['withdrawn', 'disqualified']),
    t.course_id
      ? supabase.from('course_holes').select('numero, par, stroke_index').eq('course_id', t.course_id)
      : Promise.resolve({ data: [] as CourseHole[], error: null }),
    // Mismo helper que usan /torneo y /en-vivo (un concepto, una fuente). El cast
    // es sólo de tipos: `fetchLegacyHcpContext` está tipado contra el cliente de
    // servidor, pero la query es idéntica desde el navegador.
    fetchLegacyHcpContext(supabase as unknown as Client, t.id),
  ])

  // Si los hoyos no cargan, el board cae a par-4 plano con SI = nº de hoyo: el
  // neto y el "a par" salen mal en una pantalla pública sin ninguna señal. No
  // se puede arreglar acá, pero sí dejar rastro para verlo en Sentry.
  if (t.course_id && holesRes.error) {
    void captureError(holesRes.error, {
      context: 'tvBoard.fetchTVBoardData.courseHoles',
      meta: { slug, courseId: t.course_id },
    })
  }

  const withdrawn: TVWithdrawnEntry[] = (((withdrawnRes.data ?? []) as unknown) as TVWithdrawnRow[])
    .map((p) => ({ name: p.profiles?.name ?? p.player_name ?? '', status: p.status, reason: p.status_reason }))
    .filter((p) => p.name.length > 0)

  return {
    tournament: {
      id: t.id,
      name: t.name,
      course_name: t.courses?.nombre ?? '',
      par_total: t.courses?.par_total ?? 72,
      date_start: t.date_start,
      total_rounds: t.total_rounds ?? 1,
      hole_count: t.hole_count ?? 18,
      modo_juego: (t.modo_juego === 'neto' ? 'neto' : 'gross') as ModoJuego,
      formato_juego: ((t.formato_juego ?? t.format ?? 'stroke_play') as FormatoJuego),
    },
    dbPlayers: ((playersRes.data ?? []) as unknown) as DBPlayer[],
    courseHoles: ((holesRes.data ?? []) as unknown) as CourseHole[],
    withdrawn,
    hcp,
  }
}
