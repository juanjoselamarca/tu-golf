/**
 * Game actions — retiro (WD) y descalificación (DQ) de un jugador (índice en actions.ts). Partido de actions.ts
 * sin cambio de conducta ("el que toca, ordena").
 */

import { NextResponse } from 'next/server'
import type { Svc } from './game-errors'

// ═══════════════════════════════════════════════════════════
// WITHDRAW PLAYER
// ═══════════════════════════════════════════════════════════

/**
 * Marca un jugador como retirado (WD) o descalificado (DQ).
 * NUNCA borra scores, rondas, ni el registro del jugador — el reglamento
 * USGA requiere preservar el historial. El leaderboard filtra por status.
 *
 * - WD (withdrawn): retiro voluntario. Puede solicitarlo el jugador o el organizador.
 * - DQ (disqualified): descalificación. Solo organizador.
 */
async function setPlayerStatus(
  svc: Svc, userId: string, tournamentId: string,
  organizerId: string, tournamentStatus: string, body: Record<string, unknown>,
  newStatus: 'withdrawn' | 'disqualified'
): Promise<NextResponse> {
  const { player_id, reason } = body
  if (!player_id) return NextResponse.json({ error: 'player_id requerido' }, { status: 400 })

  const { data: playerData } = await svc
    .from('players')
    .select('id, user_id, status')
    .eq('id', player_id)
    .eq('tournament_id', tournamentId)
    .single()

  if (!playerData) return NextResponse.json({ error: 'Jugador no encontrado en este torneo' }, { status: 404 })

  const isOrganizer = organizerId === userId
  const isSelf = playerData.user_id === userId

  // DQ solo lo puede aplicar el organizador
  if (newStatus === 'disqualified' && !isOrganizer) {
    return NextResponse.json({ error: 'Solo el organizador puede descalificar jugadores' }, { status: 403 })
  }
  // WD: jugador a sí mismo o el organizador
  if (newStatus === 'withdrawn' && !isOrganizer && !isSelf) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  if (tournamentStatus === 'closed') {
    return NextResponse.json({ error: 'No se puede modificar jugadores de un torneo cerrado' }, { status: 409 })
  }

  const { error } = await svc
    .from('players')
    .update({
      status: newStatus,
      status_reason: typeof reason === 'string' ? reason : null,
      status_changed_at: new Date().toISOString(),
    })
    .eq('id', player_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ success: true, status: newStatus })
}

export async function withdrawPlayer(
  svc: Svc, userId: string, tournamentId: string,
  organizerId: string, tournamentStatus: string, body: Record<string, unknown>
): Promise<NextResponse> {
  return setPlayerStatus(svc, userId, tournamentId, organizerId, tournamentStatus, body, 'withdrawn')
}

export async function disqualifyPlayer(
  svc: Svc, userId: string, tournamentId: string,
  organizerId: string, tournamentStatus: string, body: Record<string, unknown>
): Promise<NextResponse> {
  return setPlayerStatus(svc, userId, tournamentId, organizerId, tournamentStatus, body, 'disqualified')
}
