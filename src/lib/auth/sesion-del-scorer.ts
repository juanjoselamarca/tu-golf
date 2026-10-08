import type { SupabaseClient } from '@supabase/supabase-js'
import { conTimeout } from '@/lib/red/con-timeout'

/**
 * Quién está anotando, leído de la sesión guardada EN EL TELÉFONO (`getSession`),
 * no del servidor de login (`getUser`).
 *
 * Caída del 04-oct-2026: el scorer de grupo hacía `getUser()`, ignoraba el error
 * y, sin usuario, mandaba al login; con Auth respondiendo 5xx, el marcador quedó
 * fuera de su ronda ~1 h. Para ANOTAR basta saber quién es: los permisos reales
 * los decide el servidor en cada guardado (RPC + RLS).
 *
 * - `ok`           → hay sesión local.
 * - `sin_sesion`   → no hay sesión y no hubo error: de verdad no inició sesión.
 * - `sin_conexion` → la sesión venció y renovarla falló (red / 5xx / timeout):
 *                    el scorer sigue con su copia local y reintenta.
 */
export type SesionDelScorer =
  | { estado: 'ok'; userId: string; email: string | null }
  | { estado: 'sin_sesion' }
  | { estado: 'sin_conexion' }

/** Plazo: renovar una sesión vencida es una llamada de red. */
export const PLAZO_SESION_MS = 8_000

export async function sesionDelScorer(supabase: Pick<SupabaseClient, 'auth'>): Promise<SesionDelScorer> {
  try {
    const { data, error } = await conTimeout(supabase.auth.getSession(), PLAZO_SESION_MS)
    const user = data?.session?.user
    if (user) return { estado: 'ok', userId: user.id, email: user.email ?? null }
    return error ? { estado: 'sin_conexion' } : { estado: 'sin_sesion' }
  } catch {
    return { estado: 'sin_conexion' }
  }
}
