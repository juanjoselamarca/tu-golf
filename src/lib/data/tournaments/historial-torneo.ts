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
// - CR/slope son los del tee DEL JUGADOR (`resolvePlayerTee`: tee asignado →
//   tee de su categoría → tee del torneo, en la fila de su género), los mismos
//   con que el board le repartió los golpes. Antes se tomaba la primera fila de
//   la cancha cuyo nombre empezara con el tee del torneo: a una dama le tocaba
//   el rating de varones y el diferencial salía corrido (#525).

import type { SupabaseClient } from '@supabase/supabase-js'
import { isSharedBallFormat, resolveFormatoJuego } from '@/golf/formats'
import { playerGenderOf, resolvePlayerTee } from '@/golf/courses/resolve-player-tee'
import { captureError } from '@/lib/error-tracking'
import { diferencialDeTarjeta } from '@/lib/indice-golfers'
import { hoyosConGolpes } from '@/golf/core/hoyos-jugados'
import { esModoHcpWhs } from '@/golf/core/compute-player-course-hcp'
import {
  fetchIndiceParaTope,
  grossAjustadoAlGuardar,
  metadataConAjusteWHS,
} from '@/lib/data/ajuste-whs-fila'
import { actualizarNivelDelJugador, recalcularIndiceGolfers } from '@/lib/data/ronda-libre-finalizar'
import { fetchLegacyHcpContext, type Client } from './leaderboard'
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
  afecta_estadisticas: boolean | null; course_id: string | null; tees: string | null
  hole_count: number | null; date_start: string | null; total_rounds: number | null
  format: string | null; formato_juego: string | null; modo_juego: string | null
  hcp_calc_mode: string | null
}

/**
 * Copia la ronda finalizada al historial del jugador y dispara el recálculo del
 * índice y del nivel. No hace nada si el torneo no afecta estadísticas, el
 * jugador no tiene cuenta o la ronda no tiene golpes. Lanza si una lectura del
 * torneo, del jugador o de su tee falla: una lectura fallida no puede pasar por
 * "no afecta estadísticas" y perder la tarjeta en silencio. Quien llama decide
 * (la finalización no se bloquea por esto).
 */
export async function guardarRondaDeTorneoEnHistorial(svc: SupabaseClient, roundId: string): Promise<void> {
  const { data: round } = await svc.from('rounds').select('player_id, round_number, total_gross, tournament_id').eq('id', roundId).single()
  if (!round) return
  const { data: tourneyData, error: torneoError } = await svc
    .from('tournaments')
    .select('id, afecta_estadisticas, course_id, hole_count, date_start, total_rounds, tees, format, formato_juego, modo_juego, hcp_calc_mode')
    .eq('id', round.tournament_id)
    .single()
  if (torneoError) throw torneoError
  const torneo = tourneyData as unknown as TorneoRow | null
  if (!torneo?.afecta_estadisticas || !(round.total_gross > 0)) return

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
    ? await svc.from('courses').select('nombre, slope_rating, course_rating').eq('id', courseId).maybeSingle()
    : { data: null }
  const cancha = courseRow as { nombre: string; slope_rating: number | null; course_rating: number | null } | null

  const { data: holeScores } = await svc
    .from('hole_scores')
    .select('hole_number, gross_score, par')
    .eq('round_id', roundId)
    .order('hole_number')
  const tarjeta = tarjetaDeTorneo(
    (holeScores ?? []) as Array<{ hole_number: number; gross_score: number | null; par: number | null }>,
    roundHoles,
  )

  // CR/slope: los del tee del jugador en la cancha de esta ronda, resueltos con
  // las mismas fuentes que el board (`fetchLegacyHcpContext` + `resolvePlayerTee`).
  // Sin tee resuelto (o sin rating), los de la cancha, como siempre.
  const ctx = await fetchLegacyHcpContext(svc as unknown as Client, torneo.id, ronda)
  const { tee } = resolvePlayerTee({
    playerTeeId: jugador?.tee_id ?? null,
    categoryDefaultTeeColor: jugador?.categories?.default_tee_color ?? null,
    tournamentTeesGlobal: ctx.tees,
    courseTees: ctx.courseTees,
    playerGender: playerGenderOf({ genero: jugador?.genero, categories: jugador?.categories }),
  })
  // El par CR/slope sale entero de UNA fuente: un CR de tee con el slope de la
  // cancha no corresponde a ningún tee real.
  const fuente = [
    { cr: tee?.rating, slope: tee?.slope },
    { cr: cancha?.course_rating, slope: cancha?.slope_rating },
  ].find(f => f.cr && f.slope)
  const courseRating = fuente?.cr ?? null
  const slopeRating = fuente?.slope ?? null
  const ratings = courseRating && slopeRating ? { cr: courseRating, slope: slopeRating, nineHoleRatings: null } : null

  const formato = resolveFormatoJuego(torneo)
  const metadataBase = { hoyos: tarjeta.hoyos }
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
        ratings: { slope: ratings.slope, cr: ratings.cr, nineHole: null },
        bolaCompartida: isSharedBallFormat(formato),
      })
    : null

  const { error } = await svc.from('historical_rounds').insert({
    user_id: userId,
    course_name: cancha?.nombre ?? 'Torneo',
    course_id: courseId,
    played_at: new Date().toISOString().split('T')[0],
    total_gross: round.total_gross,
    adjusted_gross: ajuste?.grossAjustado ?? null,
    scores: tarjeta.scores,
    par_per_hole: tarjeta.parPerHole,
    // holes_played es NOT NULL: hoyos con score real (torneos de 9 también).
    holes_played: tarjeta.jugados || roundHoles,
    privacy: 'private',
    slope_rating: slopeRating,
    course_rating: courseRating,
    diferencial,
    metadata: metadataConAjusteWHS(metadataBase, ajuste),
    import_source: 'tournament',
    formato_juego: formato,
    modo_juego: torneo.modo_juego ?? 'gross',
  })
  if (error) {
    void captureError(error, { context: 'torneo.historial-insert', meta: { roundId, userId } })
    return
  }

  // Índice y nivel sin bloquear la finalización.
  void recalcularIndiceGolfers(svc, userId, { context: 'torneo.calcular_indice', level: 'warning' })
  void actualizarNivelDelJugador(svc, userId).catch((e: unknown) => {
    void captureError(e, { context: 'torneo.nivel', level: 'warning', meta: { userId } })
  })
}
