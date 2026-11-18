/**
 * La tarjeta (`rounds`) de la ronda vigente de un jugador de torneo: el servidor la asegura y el
 * scorer la pide cuando el jugador abre su tarjeta y no está.
 *
 * Por qué existe (17-nov-2026): un jugador inscrito con el torneo ya en juego podía quedar sin
 * tarjeta (o con la de la ronda 1 en un torneo que ya va en la 2). El scorer le decía "anota en
 * papel" sin forma de arreglarlo desde el teléfono. La función SQL `asegurar_tarjeta_vigente`
 * (migración 20261118150000) la crea si falta, idempotente; esta capa la llama y la pide.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchJsonConPlazo } from '@/lib/red/fetch-json-con-plazo'
import { PLAZO_TARJETA_VIGENTE_MS } from '@/lib/red/plazos'
import { CODIGO_TARJETA_SIN_SOPORTE } from '@/lib/api/codigos-game'

/** Por qué la función no dio tarjeta (los `reason` que devuelve `asegurar_tarjeta_vigente`). */
export type MotivoSinTarjetaVigente =
  | 'tournament_not_found'
  | 'player_not_found'
  | 'player_not_active'
  | 'tournament_closed'
  | 'round_not_in_play'

export type ResultadoTarjetaVigente =
  | { tipo: 'ok'; roundId: string; roundNumber: number; creada: boolean }
  | { tipo: 'rechazo'; motivo: MotivoSinTarjetaVigente }
  /** La función aún no existe en esta base (deploy antes de aplicar la migración). */
  | { tipo: 'sin_soporte' }

/**
 * ¿El error de `rpc()` es "esa función no existe"? PostgREST responde `PGRST202` (no la encuentra
 * en su caché de esquema); Postgres directo, `42883`. Entre el deploy y la aprobación de la
 * migración en `migraciones-prod` la ruta corre sin la función: eso no es una caída.
 */
export function esFuncionInexistente(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code
  return code === 'PGRST202' || code === '42883'
}

/**
 * Servidor (service role). Asegura la tarjeta de la ronda vigente; idempotente (reintentar no
 * crea otra). Lanza si la base falla (quien llama responde 503).
 */
export async function asegurarTarjetaVigente(
  admin: SupabaseClient,
  tournamentId: string,
  playerId: string,
): Promise<ResultadoTarjetaVigente> {
  const { data, error } = await admin.rpc('asegurar_tarjeta_vigente', {
    p_tournament_id: tournamentId,
    p_player_id: playerId,
  })
  if (error) {
    if (esFuncionInexistente(error)) return { tipo: 'sin_soporte' }
    throw error
  }
  const r = data as { ok?: unknown; round_id?: unknown; round_number?: unknown; creada?: unknown; reason?: unknown } | null
  if (r?.ok === true && typeof r.round_id === 'string') {
    return { tipo: 'ok', roundId: r.round_id, roundNumber: Number(r.round_number), creada: r.creada === true }
  }
  if (r?.ok === false && typeof r.reason === 'string') {
    return { tipo: 'rechazo', motivo: r.reason as MotivoSinTarjetaVigente }
  }
  throw new Error(`asegurar_tarjeta_vigente devolvió una forma inesperada: ${JSON.stringify(data)}`)
}

/**
 * Qué contestó el servidor a "pedir la tarjeta" (el scorer decide mirando el roster recargado, que es
 * la verdad de si la tarjeta está):
 * - `respondio`: 2xx/403/409/429, o 503 `sin_soporte` (la función aún no está en la base). El
 *   scorer sigue con el flujo de papel.
 * - `sin_sesion`: 401. La sesión se cerró: el scorer ofrece iniciar sesión y volver a esta tarjeta.
 * - `sin_conexion`: corte de red, plazo vencido o 5xx sin `sin_soporte`.
 */
export type RespuestaPedirTarjeta = 'respondio' | 'sin_sesion' | 'sin_conexion'

/** Cliente: pide al servidor que asegure la tarjeta vigente del jugador. Nunca lanza. */
export async function pedirTarjetaVigente(args: {
  slug: string
  playerId: string
  guestId?: string | null
  guestToken?: string | null
}): Promise<RespuestaPedirTarjeta> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (args.guestId && args.guestToken) {
    headers['x-guest-id'] = args.guestId
    headers['x-guest-token'] = args.guestToken
  }
  try {
    const { res, json } = await fetchJsonConPlazo(
      `/api/torneos/${encodeURIComponent(args.slug)}/tarjeta`,
      { method: 'POST', headers, body: JSON.stringify({ player_id: args.playerId }), cache: 'no-store' },
      PLAZO_TARJETA_VIGENTE_MS,
      { leerCuerpoSiNoOk: true },
    )
    if (res.status === 401) return 'sin_sesion'
    if (res.status < 500) return 'respondio'
    return (json as { code?: unknown } | null)?.code === CODIGO_TARJETA_SIN_SOPORTE ? 'respondio' : 'sin_conexion'
  } catch {
    return 'sin_conexion'
  }
}
