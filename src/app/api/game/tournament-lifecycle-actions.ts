/**
 * Game actions — ciclo de vida del torneo (inscripciones, cierre, reapertura, cancelación) (índice en actions.ts). Partido de actions.ts
 * sin cambio de conducta ("el que toca, ordena").
 */

import { NextResponse } from 'next/server'
import { openTournament, revertToDraft, closeTournament, reopenTournament } from '@/lib/data/tournaments/lifecycle'
import { captureGameError, type Svc } from './game-errors'

// ═══════════════════════════════════════════════════════════
// ABRIR INSCRIPCIONES (draft → open) / VOLVER A BORRADOR (open → draft)
// ═══════════════════════════════════════════════════════════

/**
 * Abre las inscripciones de un torneo: draft → open. Es la única vía para que
 * un torneo alcance 'open', el estado que habilita la auto-inscripción en
 * `/torneo/[slug]/unirse`. Sólo el organizador, sólo desde 'draft'.
 * La validación de organizador del route ya corrió (no está en selfAuthActions),
 * pero re-chequeamos acá por defensa en profundidad.
 */
export async function openInscriptions(
  svc: Svc, userId: string, tournamentId: string,
  organizerId: string, status: string
): Promise<NextResponse> {
  if (organizerId !== userId) {
    return NextResponse.json({ error: 'Solo el organizador puede abrir las inscripciones' }, { status: 403 })
  }
  if (status !== 'draft') {
    return NextResponse.json({ error: 'Solo se pueden abrir inscripciones desde un torneo en borrador' }, { status: 409 })
  }
  try {
    await openTournament(svc, tournamentId)
  } catch (e) {
    captureGameError('open_inscriptions', e, { tournamentId })
    return NextResponse.json({ error: 'No se pudieron abrir las inscripciones' }, { status: 500 })
  }
  return NextResponse.json({ success: true, status: 'open' })
}

/**
 * Vuelve un torneo a borrador: open → draft. Conserva los jugadores ya
 * inscritos (no borra `players`). Sirve para pausar inscripciones sin destruir.
 */
export async function revertInscriptions(
  svc: Svc, userId: string, tournamentId: string,
  organizerId: string, status: string
): Promise<NextResponse> {
  if (organizerId !== userId) {
    return NextResponse.json({ error: 'Solo el organizador puede cerrar las inscripciones' }, { status: 403 })
  }
  if (status !== 'open') {
    return NextResponse.json({ error: 'Solo se puede volver a borrador un torneo con inscripciones abiertas' }, { status: 409 })
  }
  try {
    await revertToDraft(svc, tournamentId)
  } catch (e) {
    captureGameError('revert_to_draft', e, { tournamentId })
    return NextResponse.json({ error: 'No se pudo volver a borrador' }, { status: 500 })
  }
  return NextResponse.json({ success: true, status: 'draft' })
}

/**
 * Cierra el torneo (in_progress → closed) y CONGELA sus rondas para que no se
 * puedan editar scores tras el cierre. Server-side + service client: valida
 * organizador acá (defensa en profundidad; el route ya lo exige) y evita depender
 * del RLS del cliente para las escrituras de freeze (a diferencia del update
 * directo que hacía el hook antes). Ver `closeTournament` en data/lifecycle.
 */
export async function closeTournamentAction(
  svc: Svc, userId: string, tournamentId: string,
  organizerId: string, status: string
): Promise<NextResponse> {
  if (organizerId !== userId) {
    return NextResponse.json({ error: 'Solo el organizador puede cerrar el torneo' }, { status: 403 })
  }
  if (status !== 'in_progress') {
    return NextResponse.json({ error: 'Solo se puede cerrar un torneo en curso' }, { status: 409 })
  }
  try {
    await closeTournament(svc, tournamentId)
  } catch (e) {
    captureGameError('close_tournament', e, { tournamentId })
    return NextResponse.json({ error: 'No se pudo cerrar el torneo' }, { status: 500 })
  }
  return NextResponse.json({ success: true, status: 'closed' })
}

/**
 * Reabre un torneo cerrado (closed → in_progress). Descongela rondas y
 * rondas_libres para que los scores puedan volver a editarse.
 */
export async function reopenTournamentAction(
  svc: Svc, userId: string, tournamentId: string,
  organizerId: string, status: string
): Promise<NextResponse> {
  if (organizerId !== userId) {
    return NextResponse.json({ error: 'Solo el organizador puede reabrir el torneo' }, { status: 403 })
  }
  if (status !== 'closed') {
    return NextResponse.json({ error: 'Solo se puede reabrir un torneo cerrado' }, { status: 409 })
  }
  try {
    await reopenTournament(svc, tournamentId)
  } catch (e) {
    captureGameError('reopen_tournament', e, { tournamentId })
    return NextResponse.json({ error: 'No se pudo reabrir el torneo' }, { status: 500 })
  }
  return NextResponse.json({ success: true, status: 'in_progress' })
}

export async function cancelTournament(
  svc: Svc, userId: string, tournamentId: string,
  organizerId: string, status: string
): Promise<NextResponse> {
  if (organizerId !== userId) {
    return NextResponse.json({ error: 'Solo el organizador puede cancelar el torneo' }, { status: 403 })
  }
  // Se puede eliminar un torneo mientras esté en borrador o con inscripciones
  // abiertas (ambos pre-inicio). Una vez 'in_progress'/'closed' no se borra.
  if (status !== 'draft' && status !== 'open') {
    return NextResponse.json({ error: 'Solo se puede eliminar un torneo antes de iniciarlo' }, { status: 409 })
  }

  const { data: rounds } = await svc.from('rounds').select('id').eq('tournament_id', tournamentId)
  if (rounds && rounds.length > 0) {
    const roundIds = rounds.map((r: { id: string }) => r.id)
    await svc.from('hole_scores').delete().in('round_id', roundIds)
    await svc.from('rounds').delete().eq('tournament_id', tournamentId)
  }

  const { data: grps } = await svc.from('tournament_groups').select('id').eq('tournament_id', tournamentId)
  if (grps && grps.length > 0) {
    const grpIds = grps.map((g: { id: string }) => g.id)
    await svc.from('tournament_group_players').delete().in('group_id', grpIds)
    await svc.from('tournament_groups').delete().eq('tournament_id', tournamentId)
  }

  await svc.from('players').delete().eq('tournament_id', tournamentId)
  await svc.from('categories').delete().eq('tournament_id', tournamentId)
  await svc.from('tournaments').delete().eq('id', tournamentId)

  return NextResponse.json({ success: true })
}
