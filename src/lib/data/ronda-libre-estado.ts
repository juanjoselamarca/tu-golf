// src/lib/data/ronda-libre-estado.ts
//
// Estado de una ronda libre. Módulo liviano (sin el motor de golf): lo usan el cierre de los
// scorers (re-exportado por `ronda-libre-finalizar`) y el conciliador del banner "Sincronizando…",
// que va en todas las páginas.

import type { SupabaseClient } from '@supabase/supabase-js'
import { conTimeout } from '@/lib/red/con-timeout'

type Client = Pick<SupabaseClient, 'from'>

/** Plazo de una lectura de estado que decide si se borra algo: sin respuesta, no se borra. */
export const TIMEOUT_ESTADO_RONDA_MS = 10_000

/** `estado` de una ronda que ya no existe (el creador la descartó: se borra). */
export const RONDA_NO_EXISTE = 'no_existe'

/**
 * Estado actual de la ronda (guard contra un cierre desde otro dispositivo). `null` =
 * la lectura falló (red); una ronda borrada vuelve como `RONDA_NO_EXISTE`, para no
 * decirle "sin conexión" a quien tiene señal perfecta.
 */
export async function fetchEstadoRondaLibre(supabase: Client, codigo: string): Promise<string | null> {
  const { data, error } = await supabase.from('rondas_libres').select('estado').eq('codigo', codigo).single()
  // 0 filas = no existe SÓLO porque la RLS deja ver toda fila (`ver_rondas`: USING (true), sin RESTRICTIVE de
  // lectura). Con eso se borran golpes sin subir: si una policy empezara a esconder rondas, una viva se leería
  // como borrada. Lo cuida src/__tests__/canary-rondas-libres-lectura-total.test.ts (en `npm run verify`).
  if (error?.code === 'PGRST116') return RONDA_NO_EXISTE
  return (data?.estado as string | undefined) ?? null
}

/**
 * Qué significa un P0001 (RONDA_NOT_FOUND) del guardado. El RPC lo lanza cuando el JOIN
 * ronda+jugador (o ronda+equipo) no encuentra fila: con la ronda borrada, pero también con la
 * ronda viva si falta ese jugador o equipo. Antes de limpiar nada se pregunta por la ronda:
 *  - 'ronda_borrada': el servidor confirma que no existe (PGRST116) → limpiar y salir;
 *  - 'ronda_cerrada': existe pero no está 'en_curso' → igual que un P0002. El RPC busca la fila
 *                     ANTES de mirar el estado: en una ronda cerrada a la que le falta ese jugador
 *                     el P0001 llega primero, y una ronda cerrada siempre se trata como cerrada
 *                     (lo pendiente se guarda: se puede reabrir);
 *  - 'ronda_viva':    en curso → rechazo definitivo de ESA tarjeta, nada se limpia;
 *  - 'sin_senal':     no se pudo confirmar (red, timeout, sesión) → no limpiar, se reintenta.
 */
export type VeredictoRondaNoEncontrada = 'ronda_borrada' | 'ronda_cerrada' | 'ronda_viva' | 'sin_senal'

export async function confirmarRondaBorrada(supabase: Client, codigo: string): Promise<VeredictoRondaNoEncontrada> {
  let estado: string | null
  try {
    estado = await conTimeout(fetchEstadoRondaLibre(supabase, codigo), TIMEOUT_ESTADO_RONDA_MS)
  } catch {
    return 'sin_senal'
  }
  if (estado === RONDA_NO_EXISTE) return 'ronda_borrada'
  if (estado == null) return 'sin_senal'
  return estado === 'en_curso' ? 'ronda_viva' : 'ronda_cerrada'
}
