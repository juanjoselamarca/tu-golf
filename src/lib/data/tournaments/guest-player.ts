/**
 * El jugador de un invitado de torneo, a partir de su `guestId` (players.pending_user_id).
 *
 * Por qué existe (16-oct-2026): el `guestId` es la credencial del invitado — quien lo
 * conoce obtiene su token (`/guest-join`) y anota golpes por él o lo reclama para su
 * cuenta (`/guest-claim`). Hasta hoy la tabla `players` lo exponía a cualquiera con la
 * anon key. La migración que lo oculta deja la columna legible sólo por el servidor, y el
 * scorer del invitado deja de buscarse en el roster por `pending_user_id`: pregunta acá,
 * probando con su token que el `guestId` es suyo.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/** Servidor (service role): id del jugador invitado `guestId` en el torneo `slug`, o null. Lanza si la BD falla. */
export async function buscarJugadorInvitado(
  admin: SupabaseClient,
  slug: string,
  guestId: string,
): Promise<string | null> {
  const { data: torneo, error: errTorneo } = await admin
    .from('tournaments')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (errTorneo) throw errTorneo
  if (!torneo) return null
  const { data: jugador, error } = await admin
    .from('players')
    .select('id')
    .eq('tournament_id', (torneo as { id: string }).id)
    .eq('pending_user_id', guestId)
    .maybeSingle()
  if (error) throw error
  return (jugador as { id: string } | null)?.id ?? null
}

/**
 * Cliente: id del jugador de ESTE dispositivo invitado en el torneo, o null si no está
 * inscrito. Lanza si la red o el servidor fallan (quien llama decide; el scorer sigue sin
 * auto-seleccionar).
 */
export async function fetchMiJugadorInvitado(slug: string, guestId: string, guestToken: string): Promise<string | null> {
  const res = await fetch(`/api/torneos/${encodeURIComponent(slug)}/guest-player`, {
    headers: { 'x-guest-id': guestId, 'x-guest-token': guestToken },
    cache: 'no-store',
  })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`guest-player respondió ${res.status}`)
  const body = (await res.json()) as { playerId?: string }
  return body.playerId ?? null
}
