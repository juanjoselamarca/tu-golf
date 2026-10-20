// ─── Capa de datos — la tarjeta de torneo al historial del jugador ──────────
//
// Al finalizar una ronda de torneo que afecta estadísticas, la tarjeta del
// jugador pasa a `historical_rounds` y alimenta su Índice Golfers+. Antes vivía
// dentro de la API (`api/game/actions.ts`) y calculaba el diferencial con el
// bruto, sin par por hoyo ni hoyos jugados reales (#545). Ahora:
// - el diferencial sale del Adjusted Gross Score (WHS 3.1, `grossAjustadoDeFila`)
//   de la MISMA fila que se inserta, con los MISMOS ratings;
// - el índice del tope es el registrado en el torneo (`handicap_at_registration`,
//   el del día) SÓLO si el torneo es WHS (en raw/legacy ese número es un course
//   handicap, no un índice); si no, el del perfil (`fetchIndiceParaTope`); nunca
//   un default inventado;
// - la fila guarda `par_per_hole` y `metadata.hoyos` para que cualquier recálculo
//   posterior (corregir un hoyo, recompute, backfill) tope igual.
// - CR/slope salen de `ratingsDeLaRondaDelJugador`, la MISMA función con que el
//   board le reparte los golpes: tee del jugador (asignado → categoría → torneo,
//   en la fila de su género), con la escala de 9 hoyos resuelta igual (CR de 9
//   publicado del tee, cancha de 9 hoyos, cancha de 9 jugada a 18 con el CR de
//   las dos vueltas) y el mismo guardarrail. En 9 hoyos los ratings de 9 quedan
//   en `metadata.ratings_9h` para que un recálculo desde la fila los use. Antes se tomaba la primera fila de la cancha cuyo nombre
//   empezara con el tee del torneo: a una dama le tocaba el rating de varones y
//   en 9 hoyos el CR se partía al medio aunque el tee publicara el de 9 (#525).

import type { SupabaseClient } from '@supabase/supabase-js'
import { isSharedBallFormat, resolveFormatoJuego } from '@/golf/formats'
import { captureError } from '@/lib/error-tracking'
import { diferencialDeTarjeta } from '@/lib/indice-golfers'
import { esTarjetaCompletaOMitad, hoyosConGolpes } from '@/golf/core/hoyos-jugados'
import { esModoHcpWhs, ratingsDeLaRondaDelJugador } from '@/golf/core/compute-player-course-hcp'
import { parDeLaRondaDelTorneo } from '@/golf/core/course-handicap'
import {
  fetchIndiceParaTope,
  grossAjustadoAlGuardar,
  metadataConAjusteWHS,
  type RatingsResueltos,
} from '@/lib/data/ajuste-whs-fila'
import { actualizarNivelDelJugador, recalcularIndiceGolfers } from '@/lib/data/ronda-libre-finalizar'
import { fetchCourseHoles, fetchLegacyHcpContext, type Client } from './leaderboard'
import { fetchRoundPlayConfig } from './rounds'

export interface TarjetaDeTorneo {
  /** Golpes por posición (hoyos 1..N de la ronda); null = hoyo sin score. */
  scores: (number | null)[]
  /** Par por posición ("1".."N"), sólo de los hoyos con par cargado. */
  parPerHole: Record<string, number> | null
  /** Número real de hoyo de cada posición (`metadata.hoyos`). */
  hoyos: number[]
  jugados: number
  totalGross: number
}

/**
 * Tarjeta del jugador desde `hole_scores`. Los hoyos del torneo se numeran
 * 1..N (una cancha de 9 jugada dos vueltas en un torneo de 18 va de 1 a 18).
 */
export function tarjetaDeTorneo(
  holeScores: ReadonlyArray<{ hole_number: number; gross_score: number | null; par?: number | null }>,
  roundHoles: number,
): TarjetaDeTorneo {
  const hoyos = Array.from({ length: roundHoles }, (_, i) => i + 1)
  const porHoyo = new Map(holeScores.map(h => [h.hole_number, h]))
  const scores = hoyos.map(n => {
    const g = porHoyo.get(n)?.gross_score
    return typeof g === 'number' && g >= 1 ? g : null
  })
  const par: Record<string, number> = {}
  hoyos.forEach((n, i) => {
    const p = porHoyo.get(n)?.par
    if (typeof p === 'number' && p > 0) par[String(i + 1)] = p
  })
  const jugadas = scores.filter((s): s is number => s != null)
  return {
    scores,
    parPerHole: Object.keys(par).length > 0 ? par : null,
    hoyos,
    jugados: jugadas.length,
    totalGross: jugadas.reduce((a, b) => a + b, 0),
  }
}

type JugadorRow = {
  user_id: string | null
  handicap_at_registration: number | string | null
  tee_id: string | null
  genero: string | null
  categories: { default_tee_color: string | null; gender: string | null } | null
}

type TorneoRow = {
  id: string
  afecta_estadisticas: boolean | null; course_id: string | null
  hole_count: number | null; date_start: string | null; total_rounds: number | null
  format: string | null; formato_juego: string | null; modo_juego: string | null
  hcp_calc_mode: string | null
}

/**
 * Copia la ronda finalizada al historial del jugador y dispara el recálculo del
 * índice y del nivel. Si el torneo no afecta estadísticas o la ronda no tiene
 * golpes, borra la fila que haya dejado una finalización anterior; si el jugador
 * no tiene cuenta, no hace nada. Una ronda que el jugador nunca finalizó (la
 * cerró el cierre del torneo, `closed_at` null) entra sólo completa o con la ida o
 * la vuelta exacta; si no, no entra y la fila que tenga queda como está. Lanza si
 * una lectura del torneo, del jugador, de su tee o de sus golpes falla: una lectura fallida no puede pasar por
 * "no afecta estadísticas" y perder la tarjeta en silencio. Quien llama decide
 * (la finalización no se bloquea por esto).
 */
export async function guardarRondaDeTorneoEnHistorial(
  svc: SupabaseClient,
  roundId: string,
): Promise<void> {
  const { data: round } = await svc.from('rounds').select('player_id, round_number, total_gross, tournament_id, closed_at').eq('id', roundId).single()
  if (!round) return
  const { data: tourneyData, error: torneoError } = await svc
    .from('tournaments')
    .select('id, afecta_estadisticas, course_id, hole_count, date_start, total_rounds, format, formato_juego, modo_juego, hcp_calc_mode')
    .eq('id', round.tournament_id)
    .single()
  if (torneoError) throw torneoError
  const torneo = tourneyData as unknown as TorneoRow | null
  if (!torneo?.afecta_estadisticas || !(round.total_gross > 0)) return sacarDelHistorial(svc, roundId)

  const { data: player, error: jugadorError } = await svc
    .from('players')
    .select('user_id, handicap_at_registration, tee_id, genero, categories(default_tee_color, gender)')
    .eq('id', round.player_id)
    .single()
  if (jugadorError) throw jugadorError
  const jugador = player as unknown as JugadorRow | null
  const userId = jugador?.user_id
  if (!userId) return
  // El índice con que se jugó: el registrado al inscribirse (el que usó el scorer
  // para su handicap de juego), pero sólo en torneos WHS: en raw/legacy/null ese
  // número es un course handicap ya convertido, no un índice. Sin él, el del
  // perfil (`fetchIndiceParaTope`).
  const indiceDelTorneo = esModoHcpWhs(torneo.hcp_calc_mode) && jugador?.handicap_at_registration != null
    ? Number(jugador.handicap_at_registration)
    : null

  // La cancha de ESTA ronda (multi-ronda: puede no ser la del torneo). Es la que
  // va al historial del jugador y de la que salen slope/CR.
  const ronda = await fetchRoundPlayConfig(svc, torneo, round.round_number ?? 1)
  const courseId = ronda.courseId ?? null
  const roundHoles = ronda.holeCount
  const { data: courseRow } = courseId
    ? await svc.from('courses').select('nombre').eq('id', courseId).maybeSingle()
    : { data: null }
  const cancha = courseRow as { nombre: string } | null

  const { data: holeScores, error: golpesError } = await svc
    .from('hole_scores')
    .select('hole_number, gross_score, par')
    .eq('round_id', roundId)
    .order('hole_number')
  if (golpesError) throw golpesError
  const tarjeta = tarjetaDeTorneo(
    (holeScores ?? []) as Array<{ hole_number: number; gross_score: number | null; par: number | null }>,
    roundHoles,
  )
  if (round.closed_at == null && !esTarjetaCompletaOMitad(hoyosConGolpes(tarjeta.scores, tarjeta.hoyos), roundHoles)) return

  // CR/slope: los del tee del jugador en la cancha de esta ronda, resueltos por
  // la misma función que usa el board (`ratingsDeLaRondaDelJugador`) sobre el
  // mismo contexto (`fetchLegacyHcpContext`) y el mismo par de la ronda.
  const svcLb = svc as unknown as Client
  const [ctx, catalogo] = await Promise.all([
    fetchLegacyHcpContext(svcLb, torneo.id, ronda),
    courseId ? fetchCourseHoles(svcLb, courseId) : Promise.resolve([]),
  ])
  const r = ratingsDeLaRondaDelJugador(
    { tee_id: jugador?.tee_id ?? null, categories: jugador?.categories ?? null, genero: jugador?.genero ?? null },
    { tees: ctx.tees, courses: ctx.course },
    ctx.courseTees,
    parDeLaRondaDelTorneo(catalogo, roundHoles, ctx.course?.par_total),
    roundHoles,
  )
  // 18 hoyos: los ratings YA resueltos de la ronda (en una cancha de 9 jugada a
  // 18, el CR de las dos vueltas sumado; si no, el publicado). Así la fila guarda
  // lo que cualquier recálculo posterior lee como "CR de 18".
  // 9 hoyos: la fila guarda el publicado (escala de la ficha) y los de 9 ya
  // resueltos van al diferencial y a `metadata.ratings_9h`, para que un recálculo
  // desde la fila (`ratingsGuardadosDeLaFila`) no parta el CR al medio.
  const ratings: RatingsResueltos | null = r
    ? r.escala === 9
      ? { cr: r.publicado.courseRating, slope: r.publicado.slope, nineHoleRatings: { cr9h: r.courseRating, slope9h: r.slope } }
      : { cr: r.courseRating, slope: r.slope, nineHoleRatings: null }
    : null
  const slopeRating = ratings?.slope ?? null
  const courseRating = ratings?.cr ?? null

  const formato = resolveFormatoJuego(torneo)
  const metadataBase = ratings?.nineHoleRatings
    ? { hoyos: tarjeta.hoyos, ratings_9h: ratings.nineHoleRatings }
    : { hoyos: tarjeta.hoyos }
  const ajuste = await grossAjustadoAlGuardar(svc, {
    course_id: courseId,
    tee_color: null,
    holes_played: tarjeta.jugados,
    scores: tarjeta.scores,
    par_per_hole: tarjeta.parPerHole,
    metadata: metadataBase,
    formato_juego: formato,
    import_source: 'tournament',
  }, {
    indice: () => fetchIndiceParaTope(svc, userId, indiceDelTorneo),
    ratings: ratings ?? undefined,
  }, { context: 'torneo.tope-whs', meta: { roundId } })

  // Tarjeta a medias (retiro) o 9 hoyos que no son una mitad: sin diferencial. La
  // regla vive en `diferencialDeTarjeta`, la misma de cualquier recálculo posterior.
  const diferencial = ratings
    ? diferencialDeTarjeta({
        grossAjustado: ajuste?.grossAjustado ?? round.total_gross,
        holesPlayed: tarjeta.jugados,
        hoyosJugados: hoyosConGolpes(tarjeta.scores, tarjeta.hoyos),
        ratings: { slope: ratings.slope, cr: ratings.cr, nineHole: ratings.nineHoleRatings },
        bolaCompartida: isSharedBallFormat(formato),
      })
    : null

  const fila = {
    user_id: userId,
    course_name: cancha?.nombre ?? 'Torneo',
    course_id: courseId,
    total_gross: round.total_gross,
    adjusted_gross: ajuste?.grossAjustado ?? null,
    scores: tarjeta.scores,
    par_per_hole: tarjeta.parPerHole,
    // holes_played es NOT NULL: hoyos con score real (torneos de 9 también).
    holes_played: tarjeta.jugados || roundHoles,
    slope_rating: slopeRating,
    course_rating: courseRating,
    diferencial,
    // La clave de la fila (ux_historical_rounds_tournament_round): dos rondas del mismo día, cancha y total son dos filas.
    metadata: { ...metadataConAjusteWHS(metadataBase, ajuste), tournament_round_id: roundId },
    import_source: 'tournament',
    formato_juego: formato,
    modo_juego: torneo.modo_juego ?? 'gross',
  }
  // Reabrir el torneo y volver a finalizar la ronda corrige su fila, sin tocar la fecha ni la privacidad que eligió el jugador.
  // Se busca sólo por la ronda: la misma clave del índice único y del borrado.
  const { data: previa, error: errorPrevia } = await svc
    .from('historical_rounds')
    .select('id, user_id')
    .eq('metadata->>tournament_round_id', roundId)
    .maybeSingle()
  if (errorPrevia) {
    void captureError(errorPrevia, { context: 'torneo.historial-previa', meta: { roundId, userId } })
    return
  }
  // Si la fila era de otra cuenta, lo que eligió su dueño anterior no pasa a la nueva.
  const { error } = previa
    ? await svc.from('historical_rounds')
        .update(previa.user_id === userId ? fila : { ...fila, privacy: 'private', notes: null, excluded_from_handicap: false })
        .eq('id', previa.id)
    : await svc.from('historical_rounds').insert({ ...fila, played_at: new Date().toISOString().split('T')[0], privacy: 'private' })
  // Otra finalización simultánea de la misma ronda ya guardó la fila y recalcula el índice.
  if (error?.code === '23505' && error.message?.includes('ux_historical_rounds_tournament_round')) return
  if (error) {
    void captureError(error, { context: 'torneo.historial-insert', meta: { roundId, userId } })
    return
  }

  recalcularIndiceYNivel(svc, userId)
  // El jugador quedó vinculado a otra cuenta: la fila pasó a la nueva y el dueño anterior la pierde.
  if (previa && previa.user_id !== userId) recalcularIndiceYNivel(svc, previa.user_id)
}

/** Índice y nivel sin bloquear la finalización. */
function recalcularIndiceYNivel(svc: SupabaseClient, userId: string): void {
  void recalcularIndiceGolfers(svc, userId, { context: 'torneo.calcular_indice', level: 'warning' })
  void actualizarNivelDelJugador(svc, userId).catch((e: unknown) => {
    void captureError(e, { context: 'torneo.nivel', level: 'warning', meta: { userId } })
  })
}

/** Reabrir el torneo y volver a finalizar la ronda sin golpes la saca del historial. */
async function sacarDelHistorial(svc: SupabaseClient, roundId: string): Promise<void> {
  const { data, error } = await svc
    .from('historical_rounds').delete().eq('metadata->>tournament_round_id', roundId).select('user_id')
  if (error) {
    void captureError(error, { context: 'torneo.historial-borrar', meta: { roundId } })
    return
  }
  for (const { user_id } of (data ?? []) as Array<{ user_id: string }>) recalcularIndiceYNivel(svc, user_id)
}
