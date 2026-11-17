// src/lib/data/tournaments/leer-para-iniciar.ts
//
// Lectura compartida por GET y POST de /api/torneos/[slug]/start: el torneo, sus
// aprobados y grupos, por qué no se puede iniciar (`motivo`) y quiénes jugarán
// sin índice (`sinIndice`). El GET la usa para la confirmación del panel; el POST,
// para validar antes de escribir. Una sola lectura = el aviso que ve el
// organizador y el chequeo del servidor no pueden divergir.

import type { SupabaseClient } from '@supabase/supabase-js'
import { captureError } from '@/lib/error-tracking'
import { inscritoAprobado, torneoSinEmpezar } from '@/golf/tournament-status'
import { resolveFormatoJuego } from '@/golf/formats'
import {
  fetchStartGroups,
  START_PLAYER_SELECT,
  type StartGroup,
  type StartPlayer,
} from '@/lib/data/tournaments/startTournament'
import {
  jugadoresSinIndice,
  motivoParaNoIniciar,
  soloAprobados,
  type JugadorSinIndice,
} from '@/lib/data/tournaments/motivo-para-no-iniciar'

export interface TorneoParaIniciar {
  id: string
  slug: string
  organizer_id: string
  status: string
  format: string | null
  formato_juego: string | null
  modo_juego: string | null
  course_id: string | null
  course_name: string | null
  tees: string | null
  hole_count: number | null
  date_start: string | null
  date_end: string | null
  total_rounds: number | null
  courses: { nombre?: string } | null
  team_config: unknown
  hcp_calc_mode: string | null
}

export type LecturaParaIniciar =
  | {
      ok: true
      torneo: TorneoParaIniciar
      aprobados: StartPlayer[]
      /** Ya pasados por `soloAprobados`. */
      grupos: StartGroup[]
      /** Por qué no se puede iniciar (bloquea) o null. */
      motivo: string | null
      /** Aprobados sin índice en ninguna parte (NO bloquea: se avisa). */
      sinIndice: JugadorSinIndice[]
    }
  | { ok: false; status: number; error: string }

export async function leerParaIniciar(
  svc: SupabaseClient,
  slug: string,
  userId: string,
): Promise<LecturaParaIniciar> {
  const { data: tournament, error: tErr } = await svc
    .from('tournaments')
    .select('id, slug, organizer_id, status, format, formato_juego, modo_juego, hcp_pct, course_id, course_name, tees, hole_count, date_start, date_end, total_rounds, team_config, hcp_calc_mode, courses(nombre)')
    .eq('slug', slug)
    .single()

  if (tErr || !tournament) return { ok: false, status: 404, error: 'Torneo no encontrado' }
  const torneo = tournament as unknown as TorneoParaIniciar

  if (torneo.organizer_id !== userId) {
    return { ok: false, status: 403, error: 'Solo el organizador puede iniciar el torneo' }
  }
  if (!torneoSinEmpezar(torneo.status)) {
    return { ok: false, status: 409, error: 'Solo se puede iniciar un torneo en borrador o con inscripciones abiertas' }
  }

  const [{ data: rawPlayers, error: pErr }, { groups: allGroups, error: gErr }] = await Promise.all([
    svc.from('players').select(START_PLAYER_SELECT).eq('tournament_id', torneo.id),
    fetchStartGroups(svc, torneo.id),
  ])
  // Sin esto, un error de lectura se veía como "0 jugadores" o "0 grupos".
  if (pErr || gErr) {
    void captureError(pErr ?? gErr, { context: 'start-tournament.leer', level: 'error', meta: { slug } })
    return { ok: false, status: 500, error: 'No se pudo leer el torneo. Intenta de nuevo.' }
  }

  const players = (rawPlayers || []) as unknown as StartPlayer[]
  const aprobados = players.filter((p) => inscritoAprobado(p.status))
  const grupos = soloAprobados(allGroups, aprobados)

  return {
    ok: true,
    torneo,
    aprobados,
    grupos,
    motivo: motivoParaNoIniciar(resolveFormatoJuego(torneo), aprobados, grupos, torneo.team_config),
    sinIndice: jugadoresSinIndice(aprobados, torneo.hcp_calc_mode),
  }
}
