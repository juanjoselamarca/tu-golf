// ─── Capa de datos — la tarjeta cerrada de un torneo pasa al historial ──────
//
// Antes vivía dentro de `finalize_round` (src/app/api/game/actions.ts) y
// llamaba `calcularDiferencial` sin decirle cuántos hoyos se jugaron ni el
// formato: un torneo de 9 hoyos con bruto > 55 se calculaba con la fórmula de
// 18 (≈ −12 para un 58), una tarjeta de 18 abandonada en el 14 generaba
// diferencial, y un scramble/foursome con `afecta_estadisticas` le escribía un
// diferencial individual a cada jugador (el score es del equipo: WHS 2.1a).
//
// Ahora usa las mismas fuentes que el cierre de ronda libre y la carga manual:
// `fetchRatingsDelTee` (tee del torneo, fallback a la cancha, rating publicado
// de la mitad de 9) y `diferencialDeTarjeta` (bola compartida + WHS 2.2).

import type { SupabaseClient } from '@supabase/supabase-js'
import { diferencialDeTarjeta } from '@/lib/indice-golfers'
import { isSharedBallFormat } from '@/golf/formats'
import { fetchRoundPlayConfig } from './rounds'
import {
  actualizarNivelDelJugador,
  fetchRatingsDelTee,
  recalcularIndiceGolfers,
} from '@/lib/data/ronda-libre-finalizar'

interface TorneoParaHistorial {
  id: string
  afecta_estadisticas: boolean | null
  course_id: string | null
  tees: string | null
  hole_count: number | null
  date_start: string | null
  total_rounds: number | null
  formato_juego: string | null
  modo_juego: string | null
}

/**
 * Copia la tarjeta `roundId` (ya cerrada) al historial del jugador si el torneo
 * afecta estadísticas, y recalcula su índice y nivel sin esperar. Devuelve si
 * insertó. Lecturas o INSERT fallidos se propagan: el caller decide (hoy lo
 * trata como no bloqueante).
 */
export async function guardarRondaDeTorneoEnHistorial(svc: SupabaseClient, roundId: string): Promise<boolean> {
  const { data: round } = await svc
    .from('rounds').select('player_id, round_number, total_gross, tournament_id').eq('id', roundId).single()
  if (!round) return false

  const { data: tourneyData } = await svc
    .from('tournaments')
    .select('id, afecta_estadisticas, course_id, hole_count, date_start, total_rounds, tees, formato_juego, modo_juego')
    .eq('id', round.tournament_id)
    .single()
  const tourney = tourneyData as unknown as TorneoParaHistorial | null
  if (!tourney?.afecta_estadisticas || !(round.total_gross > 0)) return false

  const { data: player } = await svc.from('players').select('user_id').eq('id', round.player_id).single()
  if (!player?.user_id) return false

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

  const ratings = await fetchRatingsDelTee(svc, courseId, tourney.tees, hoyosConScore)
  const diferencial = diferencialDeTarjeta({
    totalGross: round.total_gross,
    holesPlayed: hoyosConScore.length,
    ratings,
    bolaCompartida: isSharedBallFormat(tourney.formato_juego),
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
    formato_juego: tourney.formato_juego ?? 'stroke_play',
    modo_juego: tourney.modo_juego ?? 'gross',
  })
  if (error) throw error

  // Índice y nivel sin esperar (mismos helpers que el cierre de ronda libre).
  void recalcularIndiceGolfers(svc, player.user_id, { context: 'torneo.finalize_round.calcular_indice_golfers' })
  void actualizarNivelDelJugador(svc, player.user_id)
  return true
}
