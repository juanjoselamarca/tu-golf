/**
 * ⚠️ ADMIN CLIENT — Bypassa TODAS las RLS
 *
 * Usa SUPABASE_SERVICE_ROLE_KEY — NUNCA exponer al browser.
 * Solo usar en API routes para operaciones que requieren bypass de RLS
 * (auditoría, ops de sistema, crear usuarios, etc.) después de haber
 * validado manualmente los permisos del usuario autenticado.
 *
 * Para nuevos archivos, preferir el barrel:
 *   import { createAdminClient } from '@/lib/supabase'
 */
import { createClient } from '@supabase/supabase-js'

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
