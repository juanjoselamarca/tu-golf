// ─── GWI de un torneo (servidor) ────────────────────────────────────────────
// Extraído de `/api/gwi/torneo/[slug]` (handler delgado). Arma los inputs del
// GWI — incluidos los privados (historial, patrones) cuando quien pregunta
// participa — calcula el GWI aquí y devuelve SOLO la respuesta pública.

import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import { courseHandicapDeScoring, grossPorHoyo } from '@/golf/core/hole-scoring'
import { parDeLaRondaDelTorneo } from '@/golf/core/course-handicap'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import { activeRoundOf } from '@/golf/tournament-rounds'
import { resolveFormatoJuego } from '@/golf/formats'
import { hoyosDeLaVuelta } from '@/golf/courses/vueltas'
import type { RoundLeaderboardContext } from '@/golf/leaderboard/types'
import {
  construirRespuestaGWI,
  filasDelVisorGWI,
  marcadorEnCursoGWI,
  redactarGWIParaPublico,
  SIN_FILAS_DEL_VISOR,
  type GWIResponse,
  type JugadorGWIInput,
} from '@/golf/stats/gwi'
import { historialGWI, patronesGWI } from '@/golf/stats/gwi-historial'
import { fetchCourseHoles, fetchLegacyHcpContext, fetchRoundContexts } from './tournaments/leaderboard'
import { fetchDatosPrivadosGWI } from './gwi'

interface DBHScore { hole_number: number; gross_score: number | null }

interface DBTorneo {
  id: string; name: string; hole_count: number; total_rounds: number | null; date_start: string | null
  course_id: string | null; tees: string | null; hcp_calc_mode: string | null; modo_juego: string | null
  formato_juego: string | null; format: string | null
  organizer_id: string | null
  courses: { id: string; par_total: number } | null
}

interface DBPlayer {
  id: string
  /** null: inscrito sin cuenta (no tiene historial ni es "mi tarjeta" de nadie). */
  user_id: string | null
  handicap_at_registration: number | null
  tee_id: string | null
  genero: string | null
  profiles: { name: string; indice: number | null } | null
  categories: { default_tee_color: string | null; gender: string | null } | null
  rounds: { id: string; status: string; round_number: number | null; total_gross: number; hole_scores: DBHScore[] }[]
}

/** Ventana del historial que mira el GWI del torneo (más reciente primero). */
const VENTANA_HISTORIAL = { revisadas: 40, usadas: 20 } as const

/**
 * GWI del torneo `slug` para quien pregunta. `null` = el torneo no existe.
 * Historial y patrones de cada jugador sólo entran al cálculo si quien pregunta
 * participa (organizador o jugador inscrito); igual nunca salen del servidor,
 * y de cada fila que no es suya `viewerUserId` ve la versión enmascarada.
 */
export async function gwiDeTorneo(
  supabase: SupabaseClient,
  slug: string,
  viewerUserId: string | null,
): Promise<GWIResponse | null> {
  const { data: rawT } = await supabase
    .from('tournaments')
    .select('id, name, hole_count, total_rounds, date_start, course_id, tees, hcp_calc_mode, modo_juego, formato_juego, format, organizer_id, courses(id, par_total)')
    .eq('slug', slug)
    .single()

  if (!rawT) return null
  const t = rawT as unknown as DBTorneo

  const modo = (t.modo_juego as ModoJuego | null) || 'gross'
  // Predicado canónico del formato — el mismo que usan el scorer y el board.
  // El GWI decide con esto qué carrera modela (`currentScore` abajo).
  const formato = resolveFormatoJuego(t) as FormatoJuego
  const totalHoyos = t.hole_count ?? 18
  const meta = { totalHoyos, modoJuego: modo, formatoJuego: formato }

  // ── Contexto de la ronda 1 (base) + el de las rondas en otra cancha. ──
  // EXACTAMENTE lo mismo que arma /torneo: `fetchCourseHoles` +
  // `fetchLegacyHcpContext` + `fetchRoundContexts`.
  const [catalogo, hcpCtx, roundContexts] = await Promise.all([
    t.course_id ? fetchCourseHoles(supabase, t.course_id) : Promise.resolve([]),
    fetchLegacyHcpContext(supabase, t.id),
    fetchRoundContexts(supabase, t),
  ])
  const base: RoundLeaderboardContext = {
    totalHoyos,
    courseHoles: hoyosDeLaVuelta(catalogo, totalHoyos),
    parTotal: parDeLaRondaDelTorneo(catalogo, totalHoyos, t.courses?.par_total),
    hcp: hcpCtx,
  }
  // SI normalizado por contexto, calculado una vez por ronda distinta.
  const siPorCtx = new Map<RoundLeaderboardContext, Record<number, number>>()
  const siDe = (ctx: RoundLeaderboardContext) => {
    let si = siPorCtx.get(ctx)
    if (!si) {
      si = normalizedStrokeIndexByHole(ctx.courseHoles, ctx.totalHoyos)
      siPorCtx.set(ctx, si)
    }
    return si
  }

  const { data: rawPlayers } = await supabase
    .from('players')
    .select(`
      id, user_id, handicap_at_registration, tee_id, genero,
      profiles(name, indice),
      categories(default_tee_color, gender),
      rounds(id, status, round_number, total_gross, total_net, total_points,
        hole_scores(hole_number, gross_score))
    `)
    .eq('tournament_id', t.id)

  if (!rawPlayers || rawPlayers.length === 0) return construirRespuestaGWI([], meta, SIN_FILAS_DEL_VISOR)
  const players = rawPlayers as unknown as DBPlayer[]

  const participa = !!viewerUserId && (
    t.organizer_id === viewerUserId ||
    players.some(p => p.user_id === viewerUserId)
  )

  // Al espectador ni siquiera se le consulta: su GWI se calcula "sin historia".
  const privados = await fetchDatosPrivadosGWI(supabase, participa ? players.flatMap(p => (p.user_id ? [p.user_id] : [])) : [], VENTANA_HISTORIAL.revisadas)

  const inputs: JugadorGWIInput[] = players.map((p) => {
    // La ronda ACTIVA del jugador (no `rounds[0]`: orden de llegada) y el
    // contexto de la cancha en que se juega — par, SI y course handicap de
    // ESA ronda. Las rondas que repiten cancha usan el base.
    const round = activeRoundOf(p.rounds)
    const ctx = roundContexts.get(round?.round_number ?? 1) ?? base
    const holes = ctx.courseHoles
    const hoyosDeLaRonda = ctx.totalHoyos
    const siAlloc = siDe(ctx)

    // Dos números distintos, a propósito (misma separación que el board):
    // · `courseHcp` REPARTE los golpes — sale del gate por torneo.
    // · `hcp` es el ÍNDICE de skill, y el GWI lo usa para modelar la varianza
    //   del jugador. Ese sigue siendo el índice crudo.
    const hcp = p.handicap_at_registration ?? (p.profiles?.indice ?? 18)
    const courseHcp = courseHandicapDeScoring({
      mode: ctx.hcp?.mode ?? null,
      player: {
        handicap_at_registration: p.handicap_at_registration ?? hcp,
        tee_id: p.tee_id ?? null,
        categories: p.categories,
        genero: p.genero,
      },
      tournament: { tees: ctx.hcp?.tees ?? null, courses: ctx.hcp?.course ?? null },
      courseTees: ctx.hcp?.courseTees ?? [],
      courseHoles: holes,
      holeCount: hoyosDeLaRonda,
    })

    // Marcador con la fuente canónica (la misma que la ronda libre): los golpes
    // se reparten con `courseHcp`, nunca con el índice `hcp`.
    const { overUnderGross, overUnderNeto, totalStableford, hoyosCompletados } = marcadorEnCursoGWI({
      scores: grossPorHoyo(round?.hole_scores ?? []),
      hoyos: holes,
      siAlloc,
      courseHcp,
      totalHoyos: hoyosDeLaRonda,
    })

    const currentScore = formato === 'stableford' ? totalStableford
      : modo === 'neto' ? overUnderNeto
      : overUnderGross

    // Historial contra el par de LA RONDA (`parDeLaRondaDelTorneo`): en 9 hoyos,
    // 36 y no 72. El torneo no usa promedio por cancha.
    const { historicalAvg, historicalRoundsCount } = historialGWI(
      (p.user_id ? privados.historialPorUsuario.get(p.user_id) : undefined) ?? [],
      { totalHoyos: hoyosDeLaRonda, parTotal: ctx.parTotal, ventana: VENTANA_HISTORIAL },
    )

    return {
      id: p.id,
      nombre: p.profiles?.name ?? 'Jugador',
      handicapIndex: hcp,
      currentScore,
      hoyosCompletados,
      modoJuego: modo,
      formatoJuego: formato,
      historicalAvg,
      historicalRoundsCount,
      courseAvg: null,
      courseRoundsCount: 0,
      // El torneo sólo modela el colapso del back 9 (comportamiento histórico).
      patterns: p.user_id ? patronesGWI(privados.patronesPorUsuario.get(p.user_id) ?? [], ['back_nine_collapse']) : null,
    }
  })

  return construirRespuestaGWI(participa ? inputs : redactarGWIParaPublico(inputs), meta, filasDelVisorGWI(players, viewerUserId))
}
