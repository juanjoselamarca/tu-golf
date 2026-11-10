// src/lib/data/ronda-libre-estado.ts
//
// Estado de una ronda libre. Módulo liviano (sin el motor de golf): lo usan el cierre de los
// scorers (re-exportado por `ronda-libre-finalizar`) y el conciliador del banner "Sincronizando…",
// que va en todas las páginas.

import type { SupabaseClient } from '@supabase/supabase-js'

type Client = Pick<SupabaseClient, 'from'>

/** `estado` de una ronda que ya no existe (el creador la descartó: se borra). */
export const RONDA_NO_EXISTE = 'no_existe'

/**
 * Estado actual de la ronda (guard contra un cierre desde otro dispositivo). `null` =
 * la lectura falló (red); una ronda borrada vuelve como `RONDA_NO_EXISTE`, para no
 * decirle "sin conexión" a quien tiene señal perfecta.
 */
export async function fetchEstadoRondaLibre(supabase: Client, codigo: string): Promise<string | null> {
  const { data, error } = await supabase.from('rondas_libres').select('estado').eq('codigo', codigo).single()
  if (error?.code === 'PGRST116') return RONDA_NO_EXISTE
  return (data?.estado as string | undefined) ?? null
}
