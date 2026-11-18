// src/lib/data/tournaments/siguiente-ronda.ts
//
// "¿La ronda sigue en juego?" y "abrir la ronda siguiente" de un torneo multi-ronda (tabla `rounds`).
//
// Regla única (la repite el SQL de `asegurar_tarjeta_vigente`, migración 20261119100000; lo vigila
// src/__tests__/canary-tarjeta-vigente-estados-sql.test.ts): la ronda sigue en juego mientras quede alguna
// tarjeta ABIERTA de un jugador APROBADO. Retirar (WD) o descalificar (DQ) no cierra la tarjeta (se preserva
// tal cual), así que antes una tarjeta abierta de un retirado dejaba la ronda "sin finalizar" para siempre:
// el organizador no podía abrir la ronda 2. Y la ronda siguiente se abre solo para los aprobados: un WD/DQ o
// un pendiente no juega y su tarjeta vacía ensuciaba la ronda.

import type { SupabaseClient } from '@supabase/supabase-js'
import { CLOSED_ROUND_STATUSES_IN } from '@/golf/tournament-rounds'
import { INSCRITO_APROBADO_STATUS } from '@/golf/tournament-status'

/** Tarjetas abiertas de jugadores aprobados en la ronda `roundNumber`. Lanza si la lectura falla. */
export async function contarTarjetasEnJuego(
  svc: SupabaseClient, tournamentId: string, roundNumber: number,
): Promise<number> {
  const { count, error } = await svc
    .from('rounds')
    .select('id, players!inner(status)', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('round_number', roundNumber)
    .not('status', 'in', CLOSED_ROUND_STATUSES_IN)
    .eq('players.status', INSCRITO_APROBADO_STATUS)
  if (error) throw error
  return count ?? 0
}

export type ResultadoSiguienteRonda =
  | { ok: true; roundNumber: number; playersCount: number }
  | { ok: false; reason: 'todas_completadas' }
  | { ok: false; reason: 'ronda_en_juego'; currentRound: number }
  | { ok: false; reason: 'sin_jugadores' }
  | { ok: false; reason: 'error'; error: unknown }

/**
 * Abre la ronda siguiente: crea una tarjeta `in_progress` por jugador APROBADO. La ronda actual es la mayor
 * con tarjetas (la misma que `asegurar_tarjeta_vigente`); no se abre mientras siga en juego.
 */
export async function abrirSiguienteRonda(svc: SupabaseClient, tournamentId: string): Promise<ResultadoSiguienteRonda> {
  try {
    const { data: tInfo, error: tErr } = await svc.from('tournaments').select('id, total_rounds').eq('id', tournamentId).single()
    if (tErr) throw tErr
    const totalRounds = (tInfo as { total_rounds: number | null } | null)?.total_rounds ?? 1

    const { data: maxRoundData, error: mErr } = await svc
      .from('rounds').select('round_number')
      .eq('tournament_id', tournamentId)
      .order('round_number', { ascending: false })
      .limit(1).maybeSingle()
    if (mErr) throw mErr
    const currentRound = (maxRoundData as { round_number: number } | null)?.round_number ?? 1
    const nextRound = currentRound + 1

    if (nextRound > totalRounds) return { ok: false, reason: 'todas_completadas' }

    if ((await contarTarjetasEnJuego(svc, tournamentId, currentRound)) > 0) {
      return { ok: false, reason: 'ronda_en_juego', currentRound }
    }

    const { data: playersData, error: pErr } = await svc
      .from('players').select('id')
      .eq('tournament_id', tournamentId)
      .eq('status', INSCRITO_APROBADO_STATUS)
    if (pErr) throw pErr
    const jugadores = (playersData as { id: string }[] | null) ?? []
    if (jugadores.length === 0) return { ok: false, reason: 'sin_jugadores' }

    const { error: insertErr } = await svc.from('rounds').insert(jugadores.map((p) => ({
      tournament_id: tournamentId,
      player_id: p.id,
      round_number: nextRound,
      status: 'in_progress',
    })))
    if (insertErr) throw insertErr

    return { ok: true, roundNumber: nextRound, playersCount: jugadores.length }
  } catch (error) {
    return { ok: false, reason: 'error', error }
  }
}
