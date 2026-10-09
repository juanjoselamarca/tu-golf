// ─── Capa de datos — la tarjeta cerrada de un torneo pasa al historial ──────
//
// Antes vivía dentro de `finalize_round` (src/app/api/game/actions.ts) y
// llamaba `calcularDiferencial` sin decirle cuántos hoyos se jugaron ni el
// formato: un torneo de 9 hoyos con bruto > 55 se calculaba con la fórmula de
// 18 (≈ −12 para un 58), una tarjeta de 18 abandonada en el 14 generaba
// diferencial, y un scramble/foursome con `afecta_estadisticas` le escribía un
// diferencial individual a cada jugador (el score es del equipo: WHS 2.1a).
//
// Ahora el diferencial sale con el MISMO tee con que el motor puntúa al
// jugador (`resolvePlayerTee` sobre `fetchLegacyHcpContext`: tee asignado →
// categoría → tee del torneo, con el rating de su género; antes era la primera
// fila 'Blanco%' de la cancha, la de varones aunque jugara una dama) y con
// `diferencialDeTarjeta` (bola compartida + WHS 2.2), la regla del cierre de
// ronda libre y de la carga manual.

import type { SupabaseClient } from '@supabase/supabase-js'
import { diferencialDeTarjeta } from '@/lib/indice-golfers'
import { isSharedBallFormat, resolveFormatoJuego } from '@/golf/formats'
import { mitadJugada } from '@/golf/core/hoyos-jugados'
import { ratingsPublicadosDe9, type TeeRatings } from '@/golf/core/course-handicap'
import { playerGenderOf, resolvePlayerTee } from '@/golf/courses/resolve-player-tee'
import type { RatingsDelTee } from '@/golf/ronda-libre/tarjeta-historica'
import type { LegacyHcpContext } from '@/golf/leaderboard/types'
import { fetchRoundPlayConfig } from './rounds'
import { fetchLegacyHcpContext, type Client as LeaderboardClient } from './leaderboard'
import { actualizarNivelDelJugador, recalcularIndiceGolfers } from '@/lib/data/ronda-libre-finalizar'

interface TorneoParaHistorial {
  id: string
  afecta_estadisticas: boolean | null
  course_id: string | null
  tees: string | null
  hole_count: number | null
  date_start: string | null
  total_rounds: number | null
  formato_juego: string | null
  /** Columna vieja del formato: `resolveFormatoJuego` cae a ella si `formato_juego` es null. */
  format: string | null
  modo_juego: string | null
}

interface JugadorParaTee {
  user_id: string | null
  tee_id: string | null
  genero: string | null
  categories: { default_tee_color: string | null; gender: string | null } | null
}

/**
 * CR/slope del tee con que el torneo puntúa a este jugador (+ rating publicado
 * de la mitad si jugó exactamente 9). Sin tee resuelto: los de la cancha.
 */
export function ratingsDelJugadorDeTorneo(
  ctx: LegacyHcpContext,
  jugador: JugadorParaTee,
  hoyosConScore: readonly number[],
): RatingsDelTee {
  const { tee } = ctx.courseTees.length > 0
    ? resolvePlayerTee({
        playerTeeId: jugador.tee_id,
        categoryDefaultTeeColor: jugador.categories?.default_tee_color ?? null,
        tournamentTeesGlobal: ctx.tees,
        courseTees: ctx.courseTees,
        playerGender: playerGenderOf(jugador),
      })
    : { tee: null }
  if (tee?.rating && tee?.slope) {
    const mitad = mitadJugada(hoyosConScore)
    return { cr: tee.rating, slope: tee.slope, nineHole: mitad ? ratingsPublicadosDe9(tee as TeeRatings, mitad) : null }
  }
  return { cr: ctx.course?.course_rating || null, slope: ctx.course?.slope_rating || null, nineHole: null }
}

/**
 * Copia la tarjeta `roundId` (ya cerrada) al historial del jugador si el torneo
 * afecta estadísticas, y recalcula su índice y nivel sin esperar. Devuelve si
 * insertó. Lecturas o INSERT fallidos se propagan: el caller decide (hoy lo
 * trata como no bloqueante y lo reporta).
 */
export async function guardarRondaDeTorneoEnHistorial(svc: SupabaseClient, roundId: string): Promise<boolean> {
  const { data: round } = await svc
    .from('rounds').select('player_id, round_number, total_gross, tournament_id').eq('id', roundId).single()
  if (!round) return false

  const { data: tourneyData, error: tourneyErr } = await svc
    .from('tournaments')
    .select('id, afecta_estadisticas, course_id, hole_count, date_start, total_rounds, tees, formato_juego, format, modo_juego')
    .eq('id', round.tournament_id)
    .single()
  if (tourneyErr) throw tourneyErr
  const tourney = tourneyData as unknown as TorneoParaHistorial | null
  if (!tourney?.afecta_estadisticas || !(round.total_gross > 0)) return false

  const { data: playerData, error: playerErr } = await svc
    .from('players')
    .select('user_id, tee_id, genero, categories(default_tee_color, gender)')
    .eq('id', round.player_id)
    .single()
  // Una lectura fallida no puede perder la tarjeta en silencio: el caller la reporta.
  if (playerErr) throw playerErr
  const player = playerData as unknown as JugadorParaTee | null
  if (!player?.user_id) return false
  const formato = resolveFormatoJuego(tourney)

  // La cancha de ESTA ronda (multi-ronda: puede no ser la del torneo). Es la
  // que va al historial del jugador y de la que salen slope/CR.
  const ronda = await fetchRoundPlayConfig(svc, tourney, round.round_number ?? 1)
  const courseId = ronda?.courseId ?? null
  const { data: courseRow } = courseId
    ? await svc.from('courses').select('nombre').eq('id', courseId).maybeSingle()
    : { data: null }

  const { data: holeScores } = await svc
    .from('hole_scores')
    .select('hole_number, gross_score')
    .eq('round_id', roundId)
    .order('hole_number')

  const scoresArray: (number | null)[] = Array.from({ length: 18 }, (_, i) => {
    const hs = holeScores?.find((h: { hole_number: number }) => h.hole_number === i + 1)
    return (hs?.gross_score as number | null | undefined) ?? null
  })
  // Número de hoyo de cada casilla con score real (torneos de 9 hoyos también
  // pasan por acá; pueden ser los 9 de atrás).
  const hoyosConScore = scoresArray.flatMap((s, i) => (s != null ? [i + 1] : []))

  const hcpCtx = await fetchLegacyHcpContext(svc as unknown as LeaderboardClient, tourney.id, ronda)
  const ratings = ratingsDelJugadorDeTorneo(hcpCtx, player, hoyosConScore)
  const diferencial = diferencialDeTarjeta({
    totalGross: round.total_gross,
    holesPlayed: hoyosConScore.length,
    ratings,
    bolaCompartida: isSharedBallFormat(formato),
  })

  const { error } = await svc.from('historical_rounds').insert({
    user_id: player.user_id,
    course_name: (courseRow as { nombre?: string } | null)?.nombre ?? 'Torneo',
    course_id: courseId,
    played_at: new Date().toISOString().split('T')[0],
    total_gross: round.total_gross,
    scores: scoresArray,
    // holes_played es NOT NULL — hoyos con score real.
    holes_played: hoyosConScore.length || 18,
    privacy: 'private',
    slope_rating: ratings.slope,
    course_rating: ratings.cr,
    diferencial,
    import_source: 'tournament',
    formato_juego: formato,
    modo_juego: tourney.modo_juego ?? 'gross',
  })
  if (error) throw error

  // Índice y nivel sin esperar (mismos helpers que el cierre de ronda libre).
  void recalcularIndiceGolfers(svc, player.user_id, { context: 'torneo.finalize_round.calcular_indice_golfers' })
  void actualizarNivelDelJugador(svc, player.user_id)
  return true
}
