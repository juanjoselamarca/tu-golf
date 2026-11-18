/**
 * Game actions — fin de tarjeta y apertura de la ronda siguiente (índice en actions.ts). Partido de actions.ts
 * sin cambio de conducta ("el que toca, ordena").
 */

import { NextResponse } from 'next/server'
import { guardarRondaDeTorneoEnHistorial } from '@/lib/data/tournaments/historial-torneo'
import { CLOSED_ROUND_STATUSES_IN, esTarjetaCerrada } from '@/golf/tournament-rounds'
import { captureGameError, type Svc } from './game-errors'

// ═══════════════════════════════════════════════════════════
// FINALIZE ROUND
// ═══════════════════════════════════════════════════════════

export async function finalizeRound(
  svc: Svc, tournamentId: string, body: Record<string, unknown>
): Promise<NextResponse> {
  const { round_id } = body
  const { data: currentRound } = await svc.from('rounds').select('status').eq('id', round_id).single()
  if (esTarjetaCerrada(currentRound?.status)) {
    // `code`: el scorer del organizador reconcilia (la cerró otro dispositivo o
    // se perdió la respuesta del primer cierre) en vez de pedir que reintente.
    return NextResponse.json({ error: 'La ronda ya está finalizada', code: 'round_closed' }, { status: 409 })
  }

  const { error } = await svc
    .from('rounds')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .eq('id', round_id)

  if (error) return NextResponse.json({ error: 'No se pudo finalizar la ronda. Intenta de nuevo.' }, { status: 500 })

  // La tarjeta al historial del jugador (índice + nivel). No bloquea la
  // finalización: si falla, se reporta y la ronda queda cerrada igual.
  try {
    await guardarRondaDeTorneoEnHistorial(svc, round_id as string)
  } catch (err) {
    captureGameError('finalizeRound.historial', err, { round_id })
  }

  // Check next round availability
  let nextRoundInfo: { ready: boolean; currentRound: number; totalRounds: number } | null = null
  try {
    const { data: roundInfo } = await svc.from('rounds').select('round_number').eq('id', round_id).single()
    const { data: tInfo } = await svc.from('tournaments').select('id, total_rounds').eq('id', tournamentId).single()
    const currentRoundNum = (roundInfo as { round_number: number } | null)?.round_number ?? 1
    const totalRounds = (tInfo as { id: string; total_rounds: number } | null)?.total_rounds ?? 1
    if (totalRounds > 1) {
      const { count: openCount } = await svc
        .from('rounds')
        .select('*', { count: 'exact', head: true })
        .eq('tournament_id', tournamentId)
        .eq('round_number', currentRoundNum)
        .not('status', 'in', CLOSED_ROUND_STATUSES_IN)
      nextRoundInfo = { ready: (openCount ?? 0) === 0 && currentRoundNum < totalRounds, currentRound: currentRoundNum, totalRounds }
    }
  } catch { /* non-blocking */ }

  return NextResponse.json({ success: true, nextRoundInfo })
}

// ═══════════════════════════════════════════════════════════
// START NEXT ROUND
// ═══════════════════════════════════════════════════════════

export async function startNextRound(
  svc: Svc, userId: string, tournamentId: string,
  organizerId: string
): Promise<NextResponse> {
  if (organizerId !== userId) {
    return NextResponse.json({ error: 'Solo el organizador puede iniciar la siguiente ronda' }, { status: 403 })
  }

  const { data: tInfo } = await svc.from('tournaments').select('id, total_rounds').eq('id', tournamentId).single()
  const totalRounds = (tInfo as { id: string; total_rounds: number } | null)?.total_rounds ?? 1

  const { data: maxRoundData } = await svc
    .from('rounds').select('round_number')
    .eq('tournament_id', tournamentId)
    .order('round_number', { ascending: false })
    .limit(1).single()

  const currentRound = (maxRoundData as { round_number: number } | null)?.round_number ?? 1
  const nextRound = currentRound + 1

  if (nextRound > totalRounds) {
    return NextResponse.json({ error: 'Ya se completaron todas las rondas del torneo' }, { status: 409 })
  }

  const { count: openCount } = await svc
    .from('rounds')
    .select('*', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('round_number', currentRound)
    .not('status', 'in', CLOSED_ROUND_STATUSES_IN)

  if ((openCount ?? 0) > 0) {
    return NextResponse.json({ error: `Hay rondas de la ronda ${currentRound} sin finalizar` }, { status: 409 })
  }

  const { data: playersData } = await svc.from('players').select('id').eq('tournament_id', tournamentId)
  if (!playersData || playersData.length === 0) {
    return NextResponse.json({ error: 'No hay jugadores en el torneo' }, { status: 400 })
  }

  const newRounds = playersData.map((p: { id: string }) => ({
    tournament_id: tournamentId,
    player_id: p.id,
    round_number: nextRound,
    status: 'in_progress',
  }))

  const { error: insertErr } = await svc.from('rounds').insert(newRounds)
  if (insertErr) return NextResponse.json({ error: 'No se pudieron crear las rondas. Intenta de nuevo.' }, { status: 500 })

  return NextResponse.json({ success: true, roundNumber: nextRound, playersCount: playersData.length })
}
