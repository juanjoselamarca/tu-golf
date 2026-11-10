// src/lib/data/ronda-libre-cierre.ts
//
// Descartar una ronda libre y los errcodes de los RPCs de ronda libre.
// Única puerta: el RPC `descartar_ronda_libre` (migración 20260929b), que
// decide quién puede hacerlo. Finalizar vive en `ronda-libre-scores.ts`
// (`finalizarRondaLibre`), junto al push a los seguidores.
// Nunca UPDATE/DELETE directo desde el cliente: con RLS, una fila que no te
// pertenece devuelve 0 filas SIN error, y la UI decía "listo" sin que nada
// pasara (o, antes del 29-sep-2026, pasaba por el hueco de las policies
// permisivas).

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'

/** Errcodes de los RPCs de ronda libre (ver migración 20260929b). */
export const RONDA_ERRCODE = {
  NOT_FOUND: 'P0001',
  FINALIZED: 'P0002',
  FORBIDDEN: 'P0003',
  INVALID_DELTA: 'P0004',
} as const

/**
 * Respuesta firme de `finalizar_ronda_libre`: el servidor decidió (ya estaba cerrada, sin permiso, no existe).
 * Cualquier otro error deja sin saber si cerró (sin red: `{ code: '' }`; plazo vencido; 5xx; sesión caída), y
 * quien finaliza tiene que poder reintentar. No es `esNoReintentable`: esa considera reintentable a P0003.
 */
export function esRechazoDelCierre(error: { code?: string | null } | null | undefined): boolean {
  return !!error?.code && (Object.values(RONDA_ERRCODE) as string[]).includes(error.code)
}

/** Errcode de Postgres de un parámetro inválido (p. ej. un punto especial que no está en las reglas de la Timba). */
const PARAMETRO_INVALIDO = '22023'

/**
 * Respuestas de las RPC de escritura de ronda libre (golpes, puntos especiales, retiros) con las que reintentar
 * NO sirve. Ojo: no reintentar no es descartar (ver `esRechazoQueDescarta`): P0002 (ronda finalizada) para los
 * envíos, pero lo que no subió se guarda, porque la ronda se puede reabrir (reabrir un torneo devuelve sus rondas
 * a 'en_curso') y esos golpes son lo único que hay.
 *
 * Todo lo demás se reintenta, en particular:
 *  - sin red: postgrest-js NO lanza, devuelve `{ code: '', status: 0 }` (y `SIN_RESPUESTA` si venció el plazo);
 *  - 5xx / caída del servidor;
 *  - P0003 (FORBIDDEN): lo típico es una sesión vencida, y al volver a entrar el mismo envío pasa.
 */
const RECHAZOS_DEFINITIVOS: readonly string[] = [
  RONDA_ERRCODE.NOT_FOUND,
  RONDA_ERRCODE.FINALIZED,
  RONDA_ERRCODE.INVALID_DELTA,
  PARAMETRO_INVALIDO,
]

export function esNoReintentable(error: { code?: string | null } | null | undefined): boolean {
  return !!error?.code && RECHAZOS_DEFINITIVOS.includes(error.code)
}

/**
 * Rechazo con el que el cambio sale de pendientes y se pierde: el servidor no lo va a aceptar nunca (la ronda o
 * el jugador ya no están, el valor es inválido). Es `esNoReintentable` menos P0002: una ronda finalizada se
 * puede reabrir, así que lo pendiente se guarda en el teléfono (sin reintentar) y sube al reabrirse.
 */
export function esRechazoQueDescarta(error: { code?: string | null } | null | undefined): boolean {
  return esNoReintentable(error) && error?.code !== RONDA_ERRCODE.FINALIZED
}

/**
 * Rechazo con el que una marca de la Timba (puntos especiales y retiros) sale de la cola. Igual que
 * `esRechazoQueDescarta` (P0002 la deja pendiente: la ronda se puede reabrir) más P0003: en golpes P0003 puede ser una sesión vencida porque el upsert de golpes tiene grant para anon (sin sesión
 * llega a la función y ella rechaza). Las RPC de la Timba NO tienen grant para anon: una sesión caída llega antes,
 * como 42501 o PGRST301/303, y se reintenta. Acá P0003 es permanente (ronda demo, o sin permiso sobre un jugador
 * con cuenta): reintentarlo dejaría la marca trabando la cola para siempre.
 */
export function esRechazoDefinitivoDeTimba(error: { code?: string | null } | null | undefined): boolean {
  return esRechazoQueDescarta(error) || error?.code === RONDA_ERRCODE.FORBIDDEN
}

type RpcClient = Pick<SupabaseClient, 'rpc'>

/** Mensaje para el usuario según el error del RPC de descarte. */
export function mensajeErrorDescartar(error: Pick<PostgrestError, 'code' | 'details' | 'message'>): string {
  if (error.code === RONDA_ERRCODE.FORBIDDEN) {
    if (error.details === 'ronda de torneo') return 'Las rondas de un torneo no se pueden descartar.'
    if (error.details === 'ronda con datos asociados') return 'Esta ronda tiene datos asociados y no se puede descartar.'
    return 'Solo quien creó la ronda puede descartarla.'
  }
  if (error.code === RONDA_ERRCODE.NOT_FOUND) return 'Esta ronda ya no existe.'
  return 'No se pudo descartar la ronda. Intenta de nuevo.'
}

/**
 * Borra la ronda con sus jugadores y equipos, en una sola transacción.
 * Solo el creador; nunca una ronda de torneo.
 *
 * `noExiste`: el servidor respondió P0001, la ronda ya no está. Pasa cuando un intento anterior
 * la borró y la respuesta se perdió (mala señal): para quien descarta es un descarte hecho, y los
 * dos scorers siguen por el camino de éxito (limpiar las copias locales y salir). Sólo P0001:
 * sin red, 5xx o sin permiso la ronda puede seguir viva y no se limpia nada.
 */
export async function descartarRondaLibre(
  supabase: RpcClient,
  codigo: string,
): Promise<{ error: string | null; noExiste: boolean }> {
  const { error } = await supabase.rpc('descartar_ronda_libre', { p_codigo: codigo })
  if (!error) return { error: null, noExiste: false }
  return { error: mensajeErrorDescartar(error), noExiste: error.code === RONDA_ERRCODE.NOT_FOUND }
}
