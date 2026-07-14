/**
 * Inscripción canónica de un jugador a un torneo — FUENTE ÚNICA.
 *
 * Regla "un concepto, una fuente": antes había 3 caminos que insertaban en
 * `players` + `rounds` reimplementando la lógica por su cuenta, y el CUPO
 * (`max_players`) se validaba en UNO solo (self-service). Esta función es la
 * única puerta de escritura: valida el gate de status, valida el cupo y crea
 * el jugador + su ronda. Los 3 caminos (self-service, alta registrado del
 * organizador, alta invitado del organizador) la usan.
 *
 * Política de cupo (decisión PM 2026-07-09, "bloquear + ampliar"):
 *   - Toda alta que supere `max_players` se RECHAZA (server-side), venga del
 *     público o del organizador. No hay override silencioso por-jugador.
 *   - El organizador amplía el cupo editando `max_players` del torneo
 *     (ver src/lib/data/tournaments/cupo.ts) y recién ahí entran más.
 *
 * Corre siempre con el admin client (bypass RLS) detrás de un route handler
 * que ya autenticó al usuario. NUNCA llamar desde el cliente con la anon key.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { captureError } from '@/lib/error-tracking'

/**
 * Estados de torneo que aceptan auto-inscripción (self-service). FUENTE ÚNICA
 * del predicado "¿es inscribible?" — `joinFlow.esInscribible` (que gobierna el
 * botón de la UI `/torneo/[slug]/unirse`) delega acá para que backend y UI nunca
 * se contradigan.
 */
export const INSCRIBIBLE_STATUSES = ['open'] as const

export function isInscribibleStatus(status: string): boolean {
  return (INSCRIBIBLE_STATUSES as readonly string[]).includes(status)
}

export type EnrollResult =
  | { ok: true; playerId: string }
  | {
      ok: false
      reason:
        | 'already_registered'
        | 'not_inscribible'
        | 'forbidden'
        | 'invalid_data'
        | 'tournament_full'
        | 'unknown'
      message: string
    }

export type EnrollIdentity =
  | { kind: 'registered'; userId: string }
  | { kind: 'guest'; guestName: string }

export interface EnrollArgs {
  tournamentId: string
  tournamentStatus: string
  identity: EnrollIdentity
  /**
   * Valor a guardar en `players.handicap_at_registration`:
   *   - registrado → course handicap YA resuelto con `resolverCourseHandicap`
   *     (fuente única de course handicap 9h/18h — NO recalcular acá).
   *   - invitado   → índice crudo tipeado por el organizador (el leaderboard lo
   *     convierte a course handicap con el tee del jugador).
   */
  handicapAtRegistration: number | null
  categoryId?: string | null
  /**
   * true en self-service (sólo 'open' acepta inscripción); false en el alta del
   * organizador, que gestiona el torneo y puede agregar jugadores en 'draft'.
   * Default true (fail-safe).
   */
  enforceStatusGate?: boolean
}

export interface CapacityInfo {
  full: boolean
  /** Cupo configurado. null = sin tope. */
  maxPlayers: number | null
  /** Inscritos que ocupan cupo (status='approved'). */
  approved: number
}

/**
 * ¿El torneo llegó a su cupo? Cuenta SÓLO inscritos activos ('approved');
 * 'waitlist'/'withdrawn'/'disqualified' no ocupan cupo. Chequeo no-atómico:
 * bajo concurrencia extrema podría colarse 1 de más (despreciable a la cadencia
 * de inscripción de un torneo). Fix atómico real = constraint/trigger en DB
 * (follow-up rastreado). Fuente ÚNICA del predicado "¿hay cupo?".
 */
export async function tournamentCapacity(
  admin: SupabaseClient,
  tournamentId: string
): Promise<CapacityInfo> {
  const { data: tRow } = await admin
    .from('tournaments')
    .select('max_players')
    .eq('id', tournamentId)
    .single()
  const maxPlayers = (tRow as { max_players: number | null } | null)?.max_players ?? null
  // Contamos SIEMPRE los inscritos activos, aunque no haya tope: `updateMaxPlayers`
  // usa `approved` para impedir fijar el cupo por debajo de los ya inscritos, y ese
  // caso ocurre justamente cuando el torneo hoy no tiene tope (max_players null).
  const { count } = await admin
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('tournament_id', tournamentId)
    .eq('status', 'approved')
  const approved = count ?? 0
  const full = maxPlayers != null && maxPlayers > 0 && approved >= maxPlayers
  return { full, maxPlayers, approved }
}

/** Forma cruda del jsonb que devuelve el RPC `enroll_player`. */
type EnrollRpcResult = {
  ok: boolean
  player_id?: string
  reason?: 'tournament_full' | 'already_registered' | 'invalid_data'
  message?: string
}

/**
 * Inscribe un jugador (registrado o invitado) al torneo. Fuente única del
 * gate de status + cupo + INSERT players + INSERT rounds.
 *
 * El gate de status vive acá (predicado `isInscribibleStatus`, compartido con la
 * UI). El cupo + los dos INSERT viven en el RPC `enroll_player`
 * (migrations/20260713_enroll_player_rpc.sql): una sola transacción con lock de
 * fila del torneo → cupo atómico y CERO orphan-rounds (si la ronda falla, el
 * jugador se revierte con ella).
 */
export async function enrollPlayer(admin: SupabaseClient, args: EnrollArgs): Promise<EnrollResult> {
  // (a) Gate de status (self-service: sólo 'open'). Fuente única del predicado:
  // `isInscribibleStatus` — la UI (joinFlow.esInscribible) delega en el mismo.
  if ((args.enforceStatusGate ?? true) && !isInscribibleStatus(args.tournamentStatus)) {
    return {
      ok: false,
      reason: 'not_inscribible',
      message:
        args.tournamentStatus === 'draft'
          ? 'Este torneo todavía no está disponible para inscripciones.'
          : 'Este torneo ya no admite nuevas inscripciones.',
    }
  }

  // (b) Cupo + INSERT players + INSERT rounds — ATÓMICO en el RPC.
  const { data, error } = await admin.rpc('enroll_player', {
    p_tournament_id: args.tournamentId,
    p_kind: args.identity.kind,
    p_user_id: args.identity.kind === 'registered' ? args.identity.userId : null,
    p_guest_name: args.identity.kind === 'guest' ? args.identity.guestName : null,
    p_handicap: args.handicapAtRegistration,
    p_category_id: args.categoryId ?? null,
  })

  if (error) {
    void captureError(error, { context: 'enrollPlayer.rpc', level: 'error' })
    return {
      ok: false,
      reason: 'unknown',
      message: `No se pudo completar la inscripción: ${error.message}. Intenta nuevamente.`,
    }
  }

  const res = data as EnrollRpcResult | null
  if (res?.ok && res.player_id) {
    return { ok: true, playerId: res.player_id }
  }
  return {
    ok: false,
    reason: res?.reason ?? 'unknown',
    message: res?.message ?? 'No se pudo completar la inscripción. Intenta nuevamente.',
  }
}
