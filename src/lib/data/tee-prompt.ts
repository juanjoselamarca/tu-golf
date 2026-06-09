/**
 * Estado del prompt de "tee por defecto".
 *
 * Red de seguridad del Punto 3 (#138): si el jugador importó tarjetas SIN tee
 * de salida (frecuente en archivos Garmin) y todavía no fijó su tee habitual,
 * esas rondas entran SIN CR/slope → no alimentan el índice. La celebración de
 * import pregunta el tee, pero el usuario la puede saltar (CTA siempre activo).
 * Este estado alimenta un banner persistente en /coach · /perfil para que nadie
 * quede sin índice por saltarse esa pantalla.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export interface TeePromptStatus {
  /** Mostrar el banner: hay rondas recuperables y aún no fijó su tee. */
  show: boolean
  /** Cuántas rondas sin tee se recalcularían al elegir (course_id resuelto). */
  recoverableRounds: number
}

const NONE: TeePromptStatus = { show: false, recoverableRounds: 0 }

/**
 * `show` es true cuando: (1) el perfil NO tiene `default_tee_color`, y (2) existe
 * al menos una ronda con `tee_color IS NULL` y `course_id` vinculado (las que
 * `applyDefaultTeeToRounds` puede recuperar). Si el usuario ya fijó su tee, o no
 * tiene rondas recuperables, no se muestra nada.
 */
export async function getTeePromptStatus(
  supabase: SupabaseClient,
  userId: string,
): Promise<TeePromptStatus> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('default_tee_color')
    .eq('id', userId)
    .maybeSingle()

  // Ya fijó su tee → nada que pedir.
  if (profile?.default_tee_color) return NONE

  const { count } = await supabase
    .from('historical_rounds')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('tee_color', null)
    .not('course_id', 'is', null)

  const recoverableRounds = count ?? 0
  return { show: recoverableRounds > 0, recoverableRounds }
}
