// ─── Quién puede crear una Timba libre (formato `personalizado`) ──────────────
//
// Fuente única en la APP del permiso de crear. Etapa 1: solo admins (prompt de Timba libre, decisión de Juanjo).
// Abrirla a más usuarios NO es cambiar solo esto: también, en una migración nueva, las dos guardas RESTRICTIVE de
// rondas_libres (`rondas_libres_personalizado_solo_admin_*`, que llaman a `usuario_es_admin()`), y decidir si
// pasa por el paywall (hoy no). Sin la migración, la API diría que sí y la base rechazaría con 42501.
//
// Lee `profiles.role` con el cliente de servicio, acotado al usuario de la sesión: en un route handler el
// cliente autenticado no puede leer profiles (permission denied). Falla CERRADO: si la lectura falla, no.
import 'server-only'

import { isAdmin } from '@/lib/admin'
import { createAdminClient } from '@/lib/supabaseAdmin'

export async function puedeCrearJuegoPersonalizado(userId: string | null | undefined): Promise<boolean> {
  if (!userId) return false
  try {
    return await isAdmin(userId, createAdminClient())
  } catch {
    return false
  }
}
