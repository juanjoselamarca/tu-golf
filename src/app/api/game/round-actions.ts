/**
 * Game actions — fin de tarjeta y apertura de la ronda siguiente (índice en actions.ts). La regla de
 * "ronda en juego" y quién recibe tarjeta vive en src/lib/data/tournaments/siguiente-ronda.ts.
 */

import { NextResponse } from 'next/server'
import { guardarRondaDeTorneoEnHistorial } from '@/lib/data/tournaments/historial-torneo'
import { esTarjetaCerrada } from '@/golf/tournament-rounds'
import { abrirSiguienteRonda, contarTarjetasEnJuego } from '@/lib/data/tournaments/siguiente-ronda'
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

  // ¿Se puede abrir la ronda siguiente? Misma regla que startNextRound (contarTarjetasEnJuego): solo cuentan
  // las tarjetas abiertas de jugadores aprobados. Si una lectura falla, sin aviso (no bloquea el cierre).
  let nextRoundInfo: { ready: boolean; currentRound: number; totalRounds: number } | null = null
  try {
    const { data: roundInfo } = await svc.from('rounds').select('round_number').eq('id', round_id).single()
    const { data: tInfo } = await svc.from('tournaments').select('id, total_rounds').eq('id', tournamentId).single()
    const currentRoundNum = (roundInfo as { round_number: number } | null)?.round_number ?? 1
    const totalRounds = (tInfo as { id: string; total_rounds: number } | null)?.total_rounds ?? 1
    if (totalRounds > 1) {
      const enJuego = await contarTarjetasEnJuego(svc, tournamentId, currentRoundNum)
      nextRoundInfo = { ready: enJuego === 0 && currentRoundNum < totalRounds, currentRound: currentRoundNum, totalRounds }
    }
  } catch { /* non-blocking */ }

  return NextResponse.json({ success: true, nextRoundInfo })
}

// ═══════════════════════════════════════════════════════════
// START NEXT ROUND
// ═══════════════════════════════════════════════════════════

/** Abre la ronda siguiente para los jugadores aprobados (regla en lib/data/tournaments/siguiente-ronda.ts). */
export async function startNextRound(
  svc: Svc, userId: string, tournamentId: string,
  organizerId: string
): Promise<NextResponse> {
  if (organizerId !== userId) {
    return NextResponse.json({ error: 'Solo el organizador puede iniciar la siguiente ronda' }, { status: 403 })
  }

  const r = await abrirSiguienteRonda(svc, tournamentId)
  if (r.ok) return NextResponse.json({ success: true, roundNumber: r.roundNumber, playersCount: r.playersCount })
  switch (r.reason) {
    case 'todas_completadas':
      return NextResponse.json({ error: 'Ya se completaron todas las rondas del torneo' }, { status: 409 })
    case 'ronda_en_juego':
      return NextResponse.json({ error: `Hay rondas de la ronda ${r.currentRound} sin finalizar` }, { status: 409 })
    case 'sin_jugadores':
      return NextResponse.json({ error: 'No hay jugadores en el torneo' }, { status: 400 })
    case 'error':
      captureGameError('startNextRound', r.error, { tournamentId })
      return NextResponse.json({ error: 'No se pudieron crear las rondas. Intenta de nuevo.' }, { status: 500 })
  }
}
