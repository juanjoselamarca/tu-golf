/**
 * Golfers+ — Clientes de Supabase
 * ================================
 *
 * Exporta los 3 clientes con nombres claros para evitar confusión.
 * Cuándo usar cada uno:
 *
 * 1. `createBrowserClient()` — En Client Components ('use client')
 *    ✅ Respeta RLS del usuario autenticado
 *    ✅ Usa la ANON_KEY (segura para el browser)
 *    ❌ NO usar para operaciones que deben bypass RLS
 *
 * 2. `createServerClient()` — En API routes y Server Components
 *    ✅ Respeta RLS del usuario autenticado (via cookies)
 *    ✅ Usa la ANON_KEY (segura)
 *    ❌ NO usar en Edge Runtime (requiere cookies())
 *
 * 3. `createAdminClient()` — SOLO para operaciones de sistema
 *    ⚠️ Bypassa TODAS las RLS — poder total sobre la BD
 *    ⚠️ Usa SERVICE_ROLE_KEY (NUNCA exponer al browser)
 *    ✅ Usar solo cuando el usuario autenticado no tiene permisos suficientes
 *       y la operación está pre-validada (ej: logs de auditoría, admin ops)
 *
 * Ejemplos:
 * ```ts
 * // Client Component
 * import { createBrowserClient } from '@/lib/supabase'
 * const supabase = createBrowserClient()
 *
 * // API Route o Server Component
 * import { createServerClient } from '@/lib/supabase'
 * const supabase = await createServerClient()
 *
 * // Admin operation (con cuidado)
 * import { createAdminClient } from '@/lib/supabase'
 * const admin = createAdminClient()
 * ```
 */

export { createClient as createBrowserClient } from '@/lib/supabase'
export { createClient as createServerClient } from '@/utils/supabase/server'
export { createAdminClient } from '@/lib/supabaseAdmin'

// Re-exportar types del dominio (definidos en @/lib/supabase)
export type {
  UserRole,
  TournamentFormat,
  TournamentStatus,
  PlayerStatus,
  RoundStatus,
  ScoreSource,
  ScoreStatus,
  Profile,
  Tournament,
  Category,
  Flight,
  Player,
  Round,
  HoleScore,
  ScoreAuditLog,
} from '@/lib/supabase'
