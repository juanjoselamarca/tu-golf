// ─── Quién puede crear una Timba libre (formato `personalizado`) ──────────────
//
// FUENTE ÚNICA. Etapa 1: solo admins (prompt de Timba libre, decisión de Juanjo). Cuando se abra a más
// usuarios cambia SOLO esto (y la guarda RESTRICTIVE de rondas_libres, migración 20261027180000).
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
