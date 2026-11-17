// ─── Quién puede crear una Timba libre (formato `personalizado`) ──────────────
//
// Fuente única en la APP del permiso de crear: admin O probador de la Timba (tabla privada `timba_probadores`,
// migración 20261117020000; decisión de Juanjo 17-nov: abierta solo a él, sin hacerlo admin). Su espejo en la base
// es `usuario_puede_crear_timba()`, que usan las guardas RESTRICTIVE de rondas_libres: si uno cambia, cambia el otro.
// En la UI, además, manda el interruptor `TIMBA_LIBRE_ABIERTA` (`./timba-libre-abierta.ts`).
// Agregar un probador = una migración nueva con su INSERT en `timba_probadores`.
//
// Lee con el cliente de servicio, acotado al usuario de la sesión: en un route handler el cliente autenticado no
// puede leer profiles (permission denied) ni la tabla privada. Falla CERRADO: si una lectura falla (o la tabla aún
// no existe en ese entorno), esa vía dice que no.
import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import { isAdmin } from '@/lib/admin'
import { captureError } from '@/lib/error-tracking'
import { createAdminClient } from '@/lib/supabaseAdmin'

async function esProbadorDeLaTimba(userId: string, supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.from('timba_probadores').select('user_id').eq('user_id', userId).maybeSingle()
  // Un error queda registrado (no se confunde con un "no"); el 42P01 antes de aplicar la migración es esperado.
  if (error) { void captureError(error, { context: 'timba.probadores', level: 'warning', userId }); return false }
  return data != null
}

export async function puedeCrearJuegoPersonalizado(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  try {
    const supabase = createAdminClient()
    if (await isAdmin(userId, supabase)) return true
    return await esProbadorDeLaTimba(userId, supabase)
  } catch {
    return false
  }
}
