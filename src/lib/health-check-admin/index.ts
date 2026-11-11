import type { SupabaseClient } from '@supabase/supabase-js'
import type { HealthCheckResult } from './tipos'
import { checkServices } from './servicios'
import { checkDataIntegrity } from './integridad-datos'
import { checkRouteAndRoleIntegrity } from './rutas-y-roles'
import { checkRLSPolicies } from './politicas-rls'
import { checkFlows } from './flujos'
import { checkAntiRegresionP0 } from './anti-regresion-p0'

export type { Check, Category, HealthCheckResult } from './tipos'

/**
 * Corre todas las categorías del health check de admin en paralelo y arma el resumen.
 * La autorización (solo admin) la hace la ruta `/api/admin/health-check`.
 */
export async function correrHealthCheckAdmin(admin: SupabaseClient): Promise<HealthCheckResult> {
  const start = Date.now()

  // Run all categories in parallel.
  // Performance category removida en audit 2026-05-08 (umbral teatro).
  const categories = await Promise.all([
    checkServices(admin),
    checkDataIntegrity(admin),
    checkRouteAndRoleIntegrity(admin),
    checkRLSPolicies(admin),
    checkFlows(admin),
    checkAntiRegresionP0(admin),
  ])

  const duration_ms = Date.now() - start

  // Compute summary
  const allChecks = categories.flatMap((c) => c.checks)
  const summary = {
    total: allChecks.length,
    passed: allChecks.filter((c) => c.status === 'pass').length,
    warnings: allChecks.filter((c) => c.status === 'warn').length,
    failed: allChecks.filter((c) => c.status === 'fail').length,
  }

  const result: HealthCheckResult = {
    timestamp: new Date().toISOString(),
    duration_ms,
    summary,
    categories,
  }

  return result
}
